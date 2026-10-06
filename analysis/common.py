"""Shared paths / cache setup for the analysis scripts.

Adapted from mexicat/pdoom-video analysis/common.py (MIT). Import FIRST (before torch /
huggingface / mlx) so every model download lands in analysis/.cache/.

Per-run layout: ATF_RUN=<run dir> holds `input.wav` (the one gapless decode of the user's file,
44.1 kHz stereo, written by run.py) and receives stems/, work/, audio.json, lyrics.json.
Because Demucs separates that same WAV, stems share its timeline by construction: pdoom's
hard-coded LAME encoder-delay shift (1015 samples) is not needed. stems.py measures the
residual offset by cross-correlation and fails if it exceeds 1 ms.
"""
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent          # analysis/
CACHE = ROOT / ".cache"
for var, sub in [("TORCH_HOME", "torch"), ("HF_HOME", "hf"), ("HF_HUB_CACHE", "hf/hub"),
                 ("XDG_CACHE_HOME", "xdg"), ("HUGGINGFACE_HUB_CACHE", "hf/hub"),
                 ("TRANSFORMERS_CACHE", "hf/transformers"), ("MPLCONFIGDIR", "mpl"),
                 ("NUMBA_CACHE_DIR", "numba")]:
    os.environ.setdefault(var, str(CACHE / sub))
    (CACHE / sub).mkdir(parents=True, exist_ok=True)

SR = 44100
RUN = Path(os.environ.get("ATF_RUN", ROOT / "work" / "default")).resolve()
INPUT = RUN / "input.wav"
STEMS = RUN / "stems"
WORK = RUN / "work"
LYRICS_TXT = RUN / "lyrics.txt"   # optional user lyrics (one line per sung line)
for d in (STEMS, WORK):
    d.mkdir(parents=True, exist_ok=True)


def load_wav(path, sr=None, mono=True):
    import numpy as np
    import soundfile as sf
    y, s = sf.read(path, dtype="float32", always_2d=True)
    y = y.mean(axis=1) if mono else y.T
    if sr and sr != s:
        import soxr
        y = soxr.resample(y, s, sr) if mono else np.stack([soxr.resample(c, s, sr) for c in y])
        s = sr
    return y, s


def load_stem(name, sr=None, mono=True):
    """Demucs stem (drums/bass/other/vocals) or 'lead' (karaoke lead vocal)."""
    return load_wav(STEMS / f"{name}.wav", sr, mono)


def load_vocal_source(source="vocals", sr=None):
    """'vocals' = Demucs vocal stem (mono), 'lead' = karaoke lead vocal (mono)."""
    return load_stem(source, sr)
