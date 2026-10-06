"""engineer_brief — the Graphics Engineer prompt for one plate, generated from plan.json and the resolved edit.

  python3 src/engineer_brief.py <run dir> <plate id> [--lessons <file>]     # song from <run>/song.json

Every engineer gets the same contract (ownership, inputs, rules, verification, report) plus the plate's own row,
window, lyrics, neighbours and hand-off geometry. --lessons appends what critics found in earlier rounds, so later
waves start from the bar the vertical slice established (docs/v3/DESIGN.md §3 E–F).
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main():
    a = sys.argv[1:]
    if len(a) < 2:
        print(__doc__)
        return 2
    run, pid = Path(a[0]).resolve(), a[1]
    slug = json.loads((run / "song.json").read_text())["slug"]
    song = f"app/src/songs/{slug}"
    plan = json.loads((ROOT / song / "plan.json").read_text())
    if not plan.get("approved"):  # SKILL.md step C2: plates cost the most tokens, so they wait for the user's OK
        print(f"REFUSED[brief]: {song}/plan.json has no \"approved\" field. Show the user BRIEF.md and the "
              "TREATMENT.md plate table first, then record their approval in plan.json.", file=sys.stderr)
        return 2
    tl = json.loads((run / "timeline.json").read_text())["entries"]
    ids = [e["id"] for e in tl]
    i = ids.index(pid)
    e, row = tl[i], next(p for p in plan["plates"] if p["id"] == pid)
    prev, nxt = (ids[i - 1] if i else None), (ids[i + 1] if i + 1 < len(ids) else None)
    bar = 240 / json.loads((run / "audio.json").read_text())["bpm"]
    lyrics = [l for l in json.loads((run / "lyrics.json").read_text())["lines"]
              if e["start"] - 0.06 <= l["words"][0]["start"] < e["end"] - 0.06]
    mod = row["module"]
    others = [p["id"] for p in plan["plates"] if p["module"] == mod and p["id"] != pid]
    s, t = e["start"], e["end"]
    n = 10
    times = ",".join(f"{s + (t - s) * k / (n - 1) - (0.01 if k == n - 1 else -0.01 if k == 0 else 0):.2f}" for k in range(n))
    only = ",".join(x for x in (prev, pid, nxt) if x)
    lessons = Path(a[a.index("--lessons") + 1]).read_text() if "--lessons" in a else ""
    scratch = f"outputs/{run.name}/engineer/{pid}"
    lines_txt = "\n".join(f"  - \"{l['text']}\" — " + ", ".join(f"{w['w']}@{w['start']:.2f}" for w in l["words"]) for l in lyrics) or "  - (no displayed lyrics: instrumental or gated lines; scene text only)"
    hero = "\nThis is a HERO plate: its `hero` notes in the row are binding." if row.get("hero") else ""
    shared = f"\nThe module `{mod}` also plays {others} with other params (a repeated-lyric template): handle `ctx.params` so each entry escalates as the treatment says." if others else ""
    print(f"""You are a Graphics Engineer on audio-to-film v3. You own ONE plate of an authored, code-rendered music video and must
bring it to the craft level of the reference video (pdoom-video) or above. Read the whole brief before writing code.

## Your plate
- Song `{slug}`. Plate `{pid}`, module `{mod}`, window {s:.2f}–{t:.2f} s ({(t - s) / bar:.1f} bars). Neighbours: before `{prev}`, after `{nxt}`.
- Lyrics in this window (word starts):
{lines_txt}
- Write ONLY `{song}/scenes/{mod}.ts` (helpers: `{song}/scenes/{mod}-*.ts`). Never edit any other file. If you need a shared change
  (style.ts, songs/edit.ts, engine, plan.json), stop and state exactly what and why in your report.
- Contract = your plan row (below) and your paragraph in `{song}/TREATMENT.md`. Implement every event at its named anchor, the
  integration method for each line, the hand-off geometry exactly, the counter cameo, the motif role and the gag.{hero}{shared}

```json
{json.dumps(row, indent=1, ensure_ascii=False)}
```

## Read first
1. `{song}/TREATMENT.md` (idea, Tone, Palette, Typography, Karaoke rules, Motifs, your plate's paragraph) and `{song}/BRIEF.md`.
2. `{song}/style.ts` — use it for palette (HEX/LIN/rgba/mix), the motif (`drawLamp` or the song's motif helper), the counter
   (`drawReadout`, `speedOf('{pid}')`), karaoke colours (`wordColor`, never ahead of the voice) and bloom (`compositeAmber` only).
3. `app/src/songs/edit.ts` — anchors by lyric content and beat grid; wrap EVERY prog()/keys() window in `span(label, a, b)` inside
   `init()` (render.ts fails on inverted spans).
4. Playbooks: `playbooks/04-lyric-typography.md`, `05-idioms-and-techniques.md`, `06-camera.md`, `07-handoffs.md`,
   `08-scene-engineering.md` (Scene contract, determinism, performance, v2 lessons, kit inventory). Skim `03-edit-and-anchors.md`.
5. LOOK at the bar with the Read tool: `docs/research/frames/ref_cuts.png`, `ref_lyric_midpoints.png`, `detail_crops_100pct.png`;
   and the failure we are replacing: `ours_cuts.png`.
6. Working reference code (MIT; learn patterns, never copy content or look): `~/.cache/audio-to-film/pdoom-video/app/src/scenes/`.
   Playbooks 04–07 name the example file for each technique.

## Rules (gates check most of them)
- Deterministic: no Math.random, Date.now, performance.now, no bitmap images or textures from files; seeded hash/noise from
  `engine/util.ts`; the same t renders the same pixels in any order.
- Scored, not reactive: big events on named anchors (word/syllable starts, beats, downbeats via edit.ts); audio envelopes only for
  micro texture. Something visibly changes on every beat while a voice sings.
- Lyrics are part of the exhibit (the row's integration method), at display size where the treatment asks (≥ 80 px advance per
  character at 1080p), title-safe 96 px, never flipped or smeared while sung.
- Dense, documentary finish: in-scene text (labels, units, legends, forms) in most frames; fine detail at 100 %; the accent colour
  ≤ 8 % of painted pixels; paper plates stay crisp (type never blooms).
- Hand-offs: match the neighbours' geometry exactly (1920×1080 layout px); hold the last 3 frames still before a match cut.
- ≤ 25 ms/frame at 1080p (`render.ts perf`).

## Verify — do it, LOOK at the PNGs, fix, repeat (at least 3 look-fix rounds)
- Types: `cd ~/projects/audio-to-film/app && bunx tsc --noEmit -p tsconfig.json`
- Stills: `cd ~/projects/audio-to-film/app && ATF_RUN=$HOME/projects/audio-to-film/outputs/{run.name} bun scripts/render.ts stills --t {times} --only {only} --samples auto --shutter 0.2 --out $HOME/projects/audio-to-film/{scratch}`
  Add frames 1/60 s apart around beats and word starts to check motion, sync and continuity; check the first and last 3 frames.
- Perf: `... bun scripts/render.ts perf --from {s + 0.05:.2f} --to {t - 0.05:.2f} --only {pid}`
- Compare side by side with the reference sheets and fix whatever is weaker: concept legibility, composition, density, typography,
  motion, finish.
{('## Lessons from earlier critic rounds (apply them)' + chr(10) + lessons) if lessons else ''}
## Report (final message)
Files and line counts; each plan event → the anchor expression used and what happens; hand-off geometry as implemented; perf;
the 3 weakest points versus the reference, honestly. Do not claim parity: a fresh independent critic will judge.""")
    return 0


if __name__ == "__main__":
    sys.exit(main())
