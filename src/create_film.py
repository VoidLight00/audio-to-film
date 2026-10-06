"""v2 entry point: one song file -> analysed, directed, GPU-rendered film in a fresh run folder.

  bun run create-film -- /path/song.mp3 [--lyrics lyrics.txt] [--scale 2] [--samples auto] [--draft]
  bun run create-film -- --resume outputs/<run>      # finish an interrupted run (segments resume)

Stages (each skipped when its output already exists, so --resume continues where a crash stopped):
  decode   ffmpeg -> input.wav (the one gapless 44.1 kHz decode every later stage shares)
  stems    analysis/stems.py   (htdemucs_ft + karaoke lead, offset < 1 ms check)
  music    analysis/analyze.py -> audio.json
  lyrics   analysis/align.py   -> lyrics.json (confidence-gated; instrumental when nothing passes)
  render   app/scripts/render.ts video (segmented, resumable) -> film.mp4, plus contact sheet
  qa       src/film_qa.py      -> qa-<film>.json (streams, frame count, non-rigid motion); nonzero exit on failure
Stdlib only; the model stages run in analysis/'s uv environment, the renderer under bun.
"""
import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ANALYSIS, APP = ROOT / "analysis", ROOT / "app"


def make_run(src: Path):
    h = hashlib.sha256()
    with src.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    digest = h.hexdigest()[:10]
    run = ROOT / "outputs" / f"{src.stem[:40]}-v2-{datetime.now():%Y%m%d-%H%M%S}-{digest}"
    run.mkdir(parents=True, exist_ok=False)
    return run


def step(name, cmd, run, cwd, done: Path | None = None):
    """Run one stage with its log in the run folder; a finished stage (its output exists) is skipped."""
    if done is not None and done.exists():
        print(f"[{name}] done, skipped")
        return
    print(f"[{name}] {' '.join(map(str, cmd))}", flush=True)
    env = {**os.environ, "ATF_RUN": str(run)}
    with (run / f"{name}.log").open("ab") as log:
        p = subprocess.run(cmd, cwd=cwd, env=env, stdout=log, stderr=subprocess.STDOUT)
    if p.returncode:
        raise RuntimeError(f"stage {name} failed (exit {p.returncode}); see {run / f'{name}.log'}")


def invalidate_if_stale(run: Path, out: Path):
    """A film or segments older than the renderer code would be reused by --resume (F9): delete them instead."""
    code = [p for p in (APP / "src").rglob("*") if p.suffix in (".ts", ".json", ".glsl")] + list((APP / "public" / "fonts").glob("*.ttf"))
    newest = max((p.stat().st_mtime for p in code), default=0)
    segs = out.with_name(out.name + ".segments")
    built = [p.stat().st_mtime for p in [out, *segs.glob("*.mp4")] if p.exists()]
    if built and min(built) < newest:
        print(f"[render] code changed after {out.name} was rendered: discarding it and its segments")
        out.unlink(missing_ok=True)
        shutil.rmtree(segs, ignore_errors=True)
        for p in (run / "contact-sheet.png", run / f"qa-{out.stem}.json"):
            p.unlink(missing_ok=True)


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("audio", nargs="?", type=Path)
    ap.add_argument("--resume", type=Path)
    ap.add_argument("--lyrics", type=Path, help="optional lyric text, one sung line per line")
    ap.add_argument("--scale", type=int, default=1, choices=(1, 2), help="2 = true 3840x2160")
    ap.add_argument("--samples", default="auto", help="motion-blur sub-frames: auto (4..324) or a fixed N")
    ap.add_argument("--draft", action="store_true", help="fast structural pass: 4 sub-frames, preset veryfast")
    ap.add_argument("--from", dest="t0", type=float)
    ap.add_argument("--to", dest="t1", type=float)
    ap.add_argument("--analysis-only", action="store_true", help="stop after lyrics.json (inspect the analysis first)")
    a = ap.parse_args()
    if bool(a.audio) == bool(a.resume):
        ap.error("give one audio file, or --resume <run dir>")

    if a.resume:
        run = a.resume.expanduser().resolve()
        if not (run / "input.wav").exists():
            ap.error(f"{run} is not a v2 run folder (no input.wav)")
    else:
        src = a.audio.expanduser().resolve()
        if not src.is_file() or not src.stat().st_size:
            ap.error("supply one nonempty, readable audio or video file")
        run = make_run(src)
        if a.lyrics:
            shutil.copyfile(a.lyrics.expanduser(), run / "lyrics.txt")
        (run / "source.json").write_text(json.dumps({"file": src.name, "bytes": src.stat().st_size}))
    try:
        if not a.resume:
            step("decode", ["ffmpeg", "-nostdin", "-v", "error", "-i", str(src), "-vn", "-ac", "2", "-ar", "44100",
                            "-c:a", "pcm_f32le", str(run / "input.wav")], run, ROOT, run / "input.wav")
        uv = ["uv", "run", "--project", str(ANALYSIS), "python"]
        step("stems", uv + ["stems.py"], run, ANALYSIS, run / "stems" / "lead.wav")
        step("music", uv + ["analyze.py"], run, ANALYSIS, run / "audio.json")
        step("lyrics", uv + ["align.py"], run, ANALYSIS, run / "lyrics.json")
        if a.analysis_only:
            print(run)
            return 0
        out = run / ("film-draft.mp4" if a.draft else f"film{'-4k' if a.scale == 2 else ''}.mp4")
        r = ["bun", "scripts/render.ts", "video", "--scale", str(a.scale), "--samples", "4" if a.draft else a.samples,
             "--shutter", "0.2", "--out", str(out)]
        if a.draft:
            r += ["--preset", "veryfast", "--crf", "20"]
        if a.t0 is not None:
            r += ["--from", str(a.t0)]
        if a.t1 is not None:
            r += ["--to", str(a.t1)]
        invalidate_if_stale(run, out)
        step("render", r, run, APP, out)
        dur = json.loads((run / "audio.json").read_text())["duration"]
        lo, hi = (a.t0 or 0.0), (a.t1 or dur)
        step("sheet", ["bun", "scripts/render.ts", "sheet", "--from", f"{lo + 0.5:.2f}", "--to", f"{hi - 0.5:.2f}", "--n", "24", "--cols", "6",
                       "--out", str(run / "contact-sheet.png")], run, APP, run / "contact-sheet.png")
        step("qa", [sys.executable, str(ROOT / "src" / "film_qa.py"), str(run), str(out)], run, ROOT)
        print(run)
        return 0
    except Exception as exc:  # keep the run folder and its logs; --resume continues from here
        (run / "FAILED.txt").write_text(f"{exc}\n", encoding="utf-8")
        print(f"failed: {exc}\nresume: bun run create-film -- --resume {run}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
