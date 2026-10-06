"""Stem separation of the run's input.wav -> stems/{drums,bass,other,vocals,lead}.wav (44.1 kHz).

htdemucs_ft gives the four stems; the mel-band-roformer karaoke model (audio-separator) gives the
lead vocal without backing vocals. Both separate the same gapless decode, so stems need no
encoder-delay shift; the residual offset is measured by cross-correlation and must be < 1 ms.
Cached: an existing complete stems/ folder is reused.
Run:  ATF_RUN=<run dir> uv run python stems.py
"""
import common
import shutil
import sys

import numpy as np

from fetch_models import KARAOKE_MODEL

NAMES = ("drums", "bass", "other", "vocals")


def demucs_stems():
    if all((common.STEMS / f"{n}.wav").exists() for n in NAMES):
        return
    import torch
    from demucs.apply import apply_model
    from demucs.pretrained import get_model
    import soundfile as sf
    model = get_model("htdemucs_ft").eval()
    y, sr = common.load_wav(common.INPUT, mono=False)
    assert sr == model.samplerate == common.SR, (sr, model.samplerate)
    wav = torch.from_numpy(y).float()
    ref = wav.mean(0)
    wav = (wav - ref.mean()) / (ref.std() + 1e-8)
    dev = "mps" if torch.backends.mps.is_available() else "cpu"
    with torch.inference_mode():
        out = apply_model(model, wav[None], device=dev, shifts=1, split=True, overlap=0.25, progress=False)[0]
    out = out * (ref.std() + 1e-8) + ref.mean()
    for name, src in zip(model.sources, out):
        sf.write(common.STEMS / f"{name}.wav", src.cpu().numpy().T, sr, subtype="FLOAT")


def lead_vocal():
    if (common.STEMS / "lead.wav").exists():
        return
    from audio_separator.separator import Separator
    tmp = common.WORK / "karaoke"
    tmp.mkdir(exist_ok=True)
    sep = Separator(model_file_dir=str(common.CACHE / "separator"), output_dir=str(tmp), sample_rate=common.SR)
    sep.load_model(KARAOKE_MODEL)
    files = sep.separate(str(common.INPUT))
    voc = [f for f in files if "(Vocals)" in f]
    if not voc:
        raise RuntimeError(f"karaoke model wrote no vocals stem: {files}")
    shutil.move(str(tmp / voc[0]) if not voc[0].startswith("/") else voc[0], common.STEMS / "lead.wav")


def offset_ms(seconds=30.0, max_lag_ms=50.0):
    """Lag (ms) of the stem sum against the input, by FFT cross-correlation over the first loud window."""
    from scipy.signal import correlate
    x, sr = common.load_wav(common.INPUT)
    s = sum(common.load_stem(n)[0] for n in NAMES)
    n = min(len(x), len(s))
    a0 = int(np.argmax(np.convolve(np.abs(x[:n]), np.ones(sr), "valid")))  # loudest second
    a, b = max(0, a0 - int(seconds * sr / 2)), min(n, a0 + int(seconds * sr / 2))
    c = correlate(x[a:b], s[a:b], mode="full", method="fft")
    lags = np.arange(-(b - a) + 1, b - a)
    m = np.abs(lags) <= int(max_lag_ms * sr / 1000)
    return 1000.0 * lags[m][np.argmax(c[m])] / sr


def main():
    if not common.INPUT.exists():
        sys.exit(f"missing {common.INPUT}")
    demucs_stems()
    lead_vocal()
    off = offset_ms()
    print(f"stems ok, stem/input offset {off:+.2f} ms")
    if abs(off) > 1.0:
        sys.exit(f"stem timeline offset {off:+.2f} ms exceeds 1 ms")


if __name__ == "__main__":
    main()
