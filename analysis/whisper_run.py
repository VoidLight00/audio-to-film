"""Run mlx-whisper (word timestamps, language auto-detect) on the lead vocal -> work/whisper.json.

From mexicat/pdoom-video analysis/whisper_run.py (MIT), without the song-specific prompt. It is
the lyric source when the user gives no lyrics.txt, and an independent timing cross-check always.
Run:  ATF_RUN=<run dir> uv run python whisper_run.py
"""
import common
import json

from fetch_models import WHISPER_REPO


def lead16k():
    import soundfile as sf
    out = common.WORK / "lead16k.wav"
    if not out.exists():
        y, sr = common.load_vocal_source("lead", sr=16000)
        sf.write(out, y, sr)
    return out


GENERIC = {"source", "audio", "track", "song", "untitled", "input", "master", "final", "mix"}


def title_prompt():
    """Convert a descriptive filename into a title. Ignore generic or numeric names."""
    import re
    src = common.RUN / "source.json"
    if not src.exists():
        return None
    meta = json.loads(src.read_text())
    stem = re.sub(r"[_\-.]+", " ", meta.get("title") or meta["file"].rsplit(".", 1)[0]).strip()
    if not stem or stem.lower() in GENERIC or stem.replace(" ", "").isdigit():
        return None
    return f"{stem}."


def run(prompt=None):
    out = common.WORK / "whisper.json"
    if out.exists():
        return json.loads(out.read_text())
    import mlx_whisper
    res = mlx_whisper.transcribe(
        str(lead16k()), path_or_hf_repo=WHISPER_REPO, language=None,
        word_timestamps=True, condition_on_previous_text=False, initial_prompt=prompt or title_prompt(),
        temperature=0.0, no_speech_threshold=None, hallucination_silence_threshold=2.0,
    )
    out.write_text(json.dumps(res, ensure_ascii=False, indent=1, default=float))
    return res


if __name__ == "__main__":
    r = run()
    print("language", r.get("language"))
    for seg in r["segments"]:
        print(f"{seg['start']:7.2f} {seg['end']:7.2f} {seg['text']}")
