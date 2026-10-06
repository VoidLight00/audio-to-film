"""critic_pack — builds the evidence a fresh critic judges (docs/v3/DESIGN.md §3, playbooks/09-critique.md).

  python3 src/critic_pack.py <run dir> <plate id | film> <round>     # song from <run>/song.json; rounds numbered per song

Plate scope: final-look stills (adaptive motion blur, shutter 0.2) at the cut in/out (±2 frames), every word start
of the plate's lines (+60 ms) and a 0.1 s motion strip from the middle, montaged into sheets, plus three full-size
stills for 100 % detail. Film scope: one frame every 2 s and every plate boundary. Writes outputs/<run>/critic/
round-NN-<scope>/ with brief.md: the plate's plan row, its lyrics, the reference frames, the rubric and the exact
verdict schema critic_gate.py enforces.
"""
import json
import subprocess
import sys
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from critic_gate import DIMS, GATE10  # noqa: E402

REFS = ["docs/research/frames/ref_cuts.png", "docs/research/frames/ref_lyric_midpoints.png",
        "docs/research/frames/detail_crops_100pct.png"]


def render(run, times, only, out):
    cmd = ["bun", "scripts/render.ts", "stills", "--t", ",".join(f"{t:.4f}" for t in times), "--samples", "auto",
           "--shutter", "0.2", "--out", str(out)]
    if only:
        cmd += ["--only", ",".join(only)]
    p = subprocess.run(cmd, cwd=ROOT / "app", env={**__import__("os").environ, "ATF_RUN": str(run)}, capture_output=True)
    if p.returncode:
        raise SystemExit(f"render failed:\n{p.stdout.decode('utf-8', 'replace')[-2000:]}{p.stderr.decode('utf-8', 'replace')[-2000:]}")


def still_path(out, t):
    return out / f"f_{f'{t:.2f}'.zfill(7)}.png"


def montage(files, labels, cols, out, w=640):
    tiles = []
    for f, lab in zip(files, labels):
        im = cv2.imread(str(f))
        im = cv2.resize(im, (w, w * 9 // 16), interpolation=cv2.INTER_AREA)
        bar = np.full((26, w, 3), 24, np.uint8)
        cv2.putText(bar, lab, (6, 19), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (220, 220, 220), 1, cv2.LINE_AA)
        tiles.append(np.vstack([bar, im]))
    while len(tiles) % cols:
        tiles.append(np.zeros_like(tiles[0]))
    rows = [np.hstack(tiles[i:i + cols]) for i in range(0, len(tiles), cols)]
    cv2.imwrite(str(out), np.vstack(rows))


def main():
    if len(sys.argv) != 4:
        print(__doc__)
        return 2
    run, scope, rnd = Path(sys.argv[1]).resolve(), sys.argv[2], int(sys.argv[3])
    slug = json.loads((run / "song.json").read_text())["slug"]
    song = ROOT / "app" / "src" / "songs" / slug
    plan = json.loads((song / "plan.json").read_text())
    tl = json.loads((run / "timeline.json").read_text())["entries"]
    lyrics = json.loads((run / "lyrics.json").read_text())["lines"]
    bar = 240 / json.loads((run / "audio.json").read_text())["bpm"]
    pack = run / "critic" / f"round-{rnd:03d}-{scope}"
    raw = pack / "raw"
    pack.mkdir(parents=True, exist_ok=True)
    sheets, notes = [], ""
    if scope == "film":
        dur = tl[-1]["end"]
        times = sorted({round(x, 2) for x in np.arange(1.0, dur - 0.5, 2.0)} | {round(e["start"] + 0.05, 2) for e in tl[1:]})
        render(run, times, None, raw)
        files = [still_path(raw, t) for t in times]
        for i in range(0, len(files), 24):
            o = pack / f"film_{i // 24:02d}.png"
            montage(files[i:i + 24], [f"{t:.2f}s" for t in times[i:i + 24]], 6, o, 480)
            sheets.append(o)
        notes = "Whole film: one frame every 2 s plus the first frame of every plate."
    else:
        idx = [e["id"] for e in tl].index(scope)
        e, row = tl[idx], next(p for p in plan["plates"] if p["id"] == scope)
        s, end = e["start"], e["end"]
        only = [x["id"] for x in tl[max(0, idx - 1):idx + 2]]
        mine = [l for l in lyrics if s - 0.06 <= l["words"][0]["start"] < end - 0.06]
        cut = ([s - 2 / 60, s + 2 / 60] if idx else []) + ([end - 2 / 60, end + 2 / 60] if idx + 1 < len(tl) else [])
        words = [w["start"] + 0.06 for l in mine for w in l["words"]]
        pre = [w["start"] - 0.05 for l in mine for w in l["words"]]  # B1: nothing may light before the voice
        mid = (s + end) / 2
        strip = [mid + k * 0.1 for k in range(8)]
        full = [s + 0.25 * (end - s), mid, s + 0.8 * (end - s)]
        times = sorted({round(t, 2) for t in cut + words + pre + strip + full if 0 <= t < tl[-1]["end"]})
        render(run, times, only, raw)
        P = lambda ts: [still_path(raw, round(t, 2)) for t in ts]
        if cut:
            montage(P(cut), [f"{t:.2f}s {'out' if t > mid else 'in'}" for t in cut], 4, pack / "cuts.png"); sheets.append(pack / "cuts.png")
        if words:
            labs = [f"{w['start']:.2f}s {w['w']}" for l in mine for w in l["words"]]
            montage(P(words), labs, 4, pack / "words.png"); sheets.append(pack / "words.png")
            montage(P(pre), [f"{w['start'] - 0.05:.2f}s 50 ms BEFORE {w['w']}" for l in mine for w in l["words"]], 4, pack / "words_before.png")
            sheets.append(pack / "words_before.png")
        montage(P(strip), [f"{t:.2f}s" for t in strip], 4, pack / "motion.png"); sheets.append(pack / "motion.png")
        for i, t in enumerate(full):
            dst = pack / f"full_{i}_{t:.2f}s.png"
            dst.write_bytes(still_path(raw, round(t, 2)).read_bytes()); sheets.append(dst)
        notes = (f"Plate `{scope}` [{s:.2f}, {end:.2f}) s, {(end - s) / bar:.1f} bars. Neighbours loaded: {only}.\n\n"
                 f"Plan row (what the plate must achieve):\n```json\n{json.dumps(row, indent=1, ensure_ascii=False)}\n```\n\n"
                 "Lyrics in this plate (word starts):\n" + "\n".join(
                     f"- {l['text']}  — " + ", ".join(f"{w['w']}@{w['start']:.2f}" for w in l["words"]) for l in mine))
    rel = lambda p: str(p.relative_to(ROOT)) if str(p).startswith(str(ROOT)) else str(p)
    brief = f"""# Critic evidence — round {rnd}, scope `{scope}`, song `{slug}`

You are a fresh, independent critic (title-sequence director standard). You did not make this. Judge only from the
frames. Concept and plan: `app/src/songs/{slug}/TREATMENT.md` (read the Tone, Palette, Typography, Karaoke rules and
this plate's paragraph) and the plan row below.

{notes}

## Evidence (read every PNG with the Read tool)
{chr(10).join('- ' + rel(p) for p in sheets)}

## Reference baseline (the user's MINIMUM bar: pdoom-video, judge craft level, not its content)
{chr(10).join('- ' + r for r in REFS)}

## Judge
1. Pairwise against the reference, each one of `worse | par | better`: {', '.join(DIMS)}.
   concept = does the image interpret the lyric's meaning as a visual pun/transformation (not literal, not decoration)?
2. Ten questions, each `yes | no` with a one-line why: {', '.join(GATE10)}.
3. Defects: 5–12 concrete ones, each {{severity: high|medium|low, t: seconds, what, fix}} — a fix is one specific change.
4. verdict: `pass` only if nothing is worse than the reference, all ten answers are yes and no defect is high.

## Write exactly this JSON to `app/src/songs/{slug}/critique/round-{rnd:03d}.json`
{{"round": {rnd}, "critic_id": "<your agent id or a fresh unique string>", "scope": "{'film' if scope == 'film' else 'plate:' + scope}",
 "reference_frames": {json.dumps(REFS)},
 "evidence": {json.dumps([rel(p) for p in sheets])},
 "pairwise": {{{', '.join(f'"{d}": "..."' for d in DIMS)}}},
 "gate10": {{{', '.join(f'"{q}": {{"answer": "...", "why": "..."}}' for q in GATE10)}}},
 "defects": [{{"severity": "...", "t": 0.0, "what": "...", "fix": "..."}}],
 "verdict": "pass|revise"}}
"""
    (pack / "brief.md").write_text(brief)
    print(pack / "brief.md")
    return 0


if __name__ == "__main__":
    sys.exit(main())
