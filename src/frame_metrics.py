"""frame_metrics — HARD, measured on the rendered film. The reference-derived acceptance criteria of
docs/research/REFERENCE_VS_OURS.md §5, with the exact measurement definitions of that study.

  python3 src/frame_metrics.py <film.mp4> <run dir> [--accent '#RRGGBB'] [--json out.json]
  python3 src/frame_metrics.py --calibrate     # pdoom-video's YouTube render must PASS, our v2 film must FAIL

M1 hard changes (cut, sub-cut, slam, whip, punch-in) >= 25/min, median gap <= 1 bar          (ref 37.9/min, 0.5 bar)
M2 runtime inside > 4-bar stretches without a hard change <= 10 %                            (ref 6 %)
M3 hard changes on the beat >= 50 %, beat-locked motion peak/median >= 1.5, beats with an accent >= 35 %
                                                                                             (ref 59 %, 1.70, 44 %)
M4 bright frames (mean luma > 0.45) >= 8 %, std of mean luma over time >= 0.15               (ref 9.8 %, 0.217)
M5 near-empty frames (< 3 % painted) <= 10 %, median share of 4x4 cells with detail >= 0.5   (ref 7.7 %, 0.56)
M6 the accent colour is <= 8 % of painted pixels                                             (ref 6.5 %)
M7 OCR: scene text in >= 50 % of frames without singing; display-size lyric text in >= 25 %
   of frames that show lyric text                                                            (ref 84 %, 31 %)
Exit 0 PASS, 1 FAIL (FAIL[frames:<M>] lines), 2 usage.
"""
import json
import re
import subprocess
import sys

from pathlib import Path

import cv2
import numpy as np
from scipy.ndimage import median_filter

ROOT = Path(__file__).resolve().parents[1]
CACHE = Path.home() / ".cache" / "audio-to-film"
STOP = set("the and you your are was its our not but now all with for that this just like then one there".split())


def features(video):
    """Per-frame features at 160x90 (area), as in the reference study."""
    W, H = 160, 90
    p = subprocess.Popen(["ffmpeg", "-v", "error", "-i", str(video), "-vf", f"scale={W}:{H}:flags=area",
                          "-pix_fmt", "rgb24", "-f", "rawvideo", "-"], stdout=subprocess.PIPE)
    gray, meanY = [], []
    fs = W * H * 3
    while True:
        b = p.stdout.read(fs)
        if len(b) < fs:
            break
        g = cv2.cvtColor(np.frombuffer(b, np.uint8).reshape(H, W, 3), cv2.COLOR_RGB2GRAY)
        gray.append(cv2.resize(g, (96, 54), interpolation=cv2.INTER_AREA))
        meanY.append(g.mean() / 255)
    if p.wait() != 0 or not gray:
        raise RuntimeError(f"ffmpeg could not decode {video}")
    return np.array(gray, np.float32), np.array(meanY)


def hard_changes(g):
    n = len(g)
    dp = np.zeros(n)
    dp[1:] = np.abs(g[1:] - g[:-1]).mean(axis=(1, 2))
    med = median_filter(dp, size=31, mode="nearest")
    cand = [t for t in range(1, n - 1) if dp[t] >= 6 and dp[t] >= 4 * max(med[t], 0.5) and dp[t] >= dp[t - 1] and dp[t] >= dp[t + 1]]
    groups = []
    for t in cand:
        if groups and t - groups[-1][-1] <= 6:
            groups[-1].append(t)
        else:
            groups.append([t])
    hard = []
    for grp in groups:
        a, b = max(0, grp[0] - 2), min(n - 1, grp[-1] + 6)
        per = float(np.abs(g[b] - g[a]).mean())
        x, y = g[a] - g[a].mean(), g[b] - g[b].mean()
        d = np.sqrt((x * x).sum() * (y * y).sum())
        corr = float((x * y).sum() / d) if d > 1e-6 else 1.0
        if (per >= 12 and corr < 0.6) or per >= 25:
            hard.append(max(grp, key=lambda t: dp[t]) / 60)
    return np.array(hard), dp


def rhythm(g, audio):
    hard, dp = hard_changes(g)
    n, dur = len(dp), len(dp) / 60
    bar = 240 / audio["bpm"]
    gaps = np.diff(np.concatenate([[0], hard, [dur]]))
    static = sum(x for x in gaps if x > 4 * bar) / dur
    bf = np.array(audio["beats"]) * 60
    bf = bf[bf < n]  # a partial render (draft) is judged on its own beats, not the whole song's
    near = lambda f: np.min(np.abs(bf - f)) <= 3
    med = median_filter(dp, size=31, mode="nearest")
    acc = np.where((dp >= 3.0) & (dp >= 2.5 * np.maximum(med, 0.3)))[0]
    on = np.array([t for i, t in enumerate(acc) if i == 0 or t - acc[i - 1] > 3])
    prof = np.array([dp[int(b) - 10:int(b) + 20] for b in bf if b - 10 >= 0 and b + 20 < n]).mean(0)
    return {
        "hard_per_min": len(hard) / dur * 60,
        "hard_gap_median_bars": float(np.median(gaps)) / bar,
        "long_static_frac": static,
        "hard_on_beat_frac": float(np.mean([near(t * 60) for t in hard])) if len(hard) else 0.0,
        "beatlock_ratio": float(prof[8:15].mean() / np.median(prof)),
        "beats_with_accent_frac": float(np.mean([np.any(np.abs(on - b) <= 3) for b in bf])) if len(on) else 0.0,
    }


def hue_of(hexcol):
    rgb = np.uint8([[[int(hexcol[i:i + 2], 16) for i in (5, 3, 1)]]])  # BGR
    return int(cv2.cvtColor(rgb, cv2.COLOR_BGR2HSV)[0, 0, 0])


def sample_frames(video, out, fps=2):
    subprocess.run(["ffmpeg", "-v", "error", "-i", str(video), "-vf", f"fps={fps},scale=1280:720", "-q:v", "3",
                    str(out / "%04d.jpg")], check=True)
    return sorted(out.glob("*.jpg"))


def composition(files, accent):
    h0 = hue_of(accent)
    rows = []
    for f in files:
        im = cv2.imread(str(f))
        g = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255
        hsv = cv2.cvtColor(im, cv2.COLOR_BGR2HSV)
        ink = g > 0.12
        e = cv2.Canny((g * 255).astype(np.uint8), 60, 150) > 0
        h, w = g.shape
        cells = np.mean([e[i * h // 4:(i + 1) * h // 4, j * w // 4:(j + 1) * w // 4].mean() > 0.02 for i in range(4) for j in range(4)])
        dh = np.abs(hsv[..., 0].astype(int) - h0)
        acc = (np.minimum(dh, 180 - dh) <= 6) & (hsv[..., 1] > 120) & (hsv[..., 2] > 100)
        rows.append((ink.mean(), cells, acc.sum() / max(1, ink.sum()), g.mean()))
    A = np.array(rows)
    return {"near_empty_frac": float((A[:, 0] < 0.03).mean()), "detail_cells_median": float(np.median(A[:, 1])),
            "accent_share_median": float(np.median(A[:, 2])), "meanY_std_2fps": float(A[:, 3].std())}


def ocr(files, lyrics):
    binp = CACHE / "ocrbin"
    if not binp.exists():
        CACHE.mkdir(parents=True, exist_ok=True)
        subprocess.run(["swiftc", "-O", str(ROOT / "src" / "ocr.swift"), "-o", str(binp)], check=True,
                       capture_output=True)
    out = files[0].parent / "ocr.json"
    langs = "ko-KR,en-US" if any(re.search(r"[\uac00-\ud7a3]", l["text"]) for l in lyrics.get("lines", [])) else "en-US"
    subprocess.run([str(binp), str(files[0].parent), str(out), langs], check=True, capture_output=True)
    frames = json.loads(out.read_text())
    # words of any script; Hangul words count from 2 syllables, Latin from 3 letters
    toks = lambda s: [w for w in re.findall(r"[^\W\d_]+", s.lower()) if (len(w) >= 3 or re.search(r"[\uac00-\ud7a3]", w) and len(w) >= 2) and w not in STOP]
    L = lyrics.get("lines", [])
    allw = {w for l in L for w in toks(l["text"])}
    unsung_text, unsung, ly_frames, ly_big = 0, 0, 0, 0
    for i, fr in enumerate(frames):
        t = i / 2
        items = [it for it in fr["items"] if it["c"] >= 0.3 and len(re.sub(r"[^A-Za-z0-9]", "", it["t"])) >= 3]
        sung = any(l["start"] - 0.3 <= t <= l["end"] + 0.3 for l in L)
        ly = [it for it in items if set(toks(it["t"])) & allw]
        if not sung:
            unsung += 1
            unsung_text += bool(items)
        if ly:
            ly_frames += 1
            # display size = advance per character >= 80 px at 1080p (box width x 1920 / characters)
            ly_big += max(it["w"] * 1920 / max(1, len(it["t"])) for it in ly) >= 80
    return {"text_frames_unsung_frac": unsung_text / max(1, unsung),
            "display_lyric_frac": ly_big / max(1, ly_frames) if ly_frames else 0.0}


LIMITS = [  # (metric, op, threshold, criterion)
    ("hard_per_min", ">=", 25, "M1"), ("hard_gap_median_bars", "<=", 1.0, "M1"), ("long_static_frac", "<=", 0.10, "M2"),
    ("hard_on_beat_frac", ">=", 0.5, "M3"), ("beatlock_ratio", ">=", 1.5, "M3"), ("beats_with_accent_frac", ">=", 0.35, "M3"),
    ("light_frames_frac", ">=", 0.08, "M4"), ("meanY_std", ">=", 0.15, "M4"),
    ("near_empty_frac", "<=", 0.10, "M5"), ("detail_cells_median", ">=", 0.5, "M5"), ("accent_share_median", "<=", 0.08, "M6"),
    ("text_frames_unsung_frac", ">=", 0.5, "M7"), ("display_lyric_frac", ">=", 0.25, "M7"),
]


def measure(video, run, accent):
    audio = json.loads((Path(run) / "audio.json").read_text())
    lp = Path(run) / "lyrics.json"
    lyrics = json.loads(lp.read_text()) if lp.exists() else {"lines": []}
    # decoded features and sampled frames are cached per film file (path + size + mtime): re-judging is quick
    st = Path(video).stat()
    key = re.sub(r"[^A-Za-z0-9]+", "_", f"{Path(video).resolve()}_{st.st_size}_{int(st.st_mtime)}")[-120:]
    cdir = CACHE / "metrics" / key
    if not (cdir / "feat.npz").exists():
        cdir.mkdir(parents=True, exist_ok=True)
        g, meanY = features(video)
        np.savez_compressed(cdir / "feat.npz", g=g, meanY=meanY)
        sample_frames(video, cdir)
    z = np.load(cdir / "feat.npz")
    g, meanY = z["g"], z["meanY"]
    m = rhythm(g, audio)
    m["light_frames_frac"] = float((meanY > 0.45).mean())
    m["meanY_std"] = float(meanY.std())
    files = sorted(cdir.glob("*.jpg"))
    m.update(composition(files, accent))
    m.update(ocr(files, lyrics))
    return m


def song_accent(run):
    """The accent of the authored song played by this run (plan.json style.accent); refuse to guess."""
    sj = run / "song.json"
    if not sj.exists():
        raise SystemExit("no --accent and no song.json in the run: pass --accent '#RRGGBB'")
    slug = json.loads(sj.read_text())["slug"]
    return json.loads((ROOT / "app" / "src" / "songs" / slug / "plan.json").read_text())["style"]["accent"]


def judge(m):
    fails = []
    for k, op, th, crit in LIMITS:
        ok = m[k] >= th if op == ">=" else m[k] <= th
        if not ok:
            fails.append(f"FAIL[frames:{crit}]: {k} = {m[k]:.3f} (needs {op} {th})")
    return fails


def calibrate():
    ref = CACHE / "ref"
    ours = ROOT / "outputs" / "source-v2-20261001-211409-75d61fcf81"
    mr = measure(ref / "ref1080.mp4", ref, "#FF4D12")
    mo = measure(ours / "film-draft.mp4", ours, "#FF4D12")
    print(f"{'metric':26s} {'ref':>8s} {'ours v2':>8s}  limit")
    for k, op, th, crit in LIMITS:
        print(f"{k:26s} {mr[k]:8.3f} {mo[k]:8.3f}  {op} {th} ({crit})")
    fr, fo = judge(mr), judge(mo)
    assert not fr, f"the reference fails its own criteria: {fr}"
    assert len(fo) >= 6, f"our v2 film passes too much ({len(fo)} fails): the gate is blind"
    print(f"frame_metrics calibration: reference PASS, v2 film FAIL on {len(fo)} of {len(LIMITS)} limits")


def main():
    a = sys.argv[1:]
    if a == ["--calibrate"]:
        calibrate()
        return 0
    if len(a) < 2:
        print(__doc__)
        return 2
    accent = a[a.index("--accent") + 1] if "--accent" in a else song_accent(Path(a[1]))
    m = measure(Path(a[0]), Path(a[1]), accent)
    if "--json" in a:
        Path(a[a.index("--json") + 1]).write_text(json.dumps(m, indent=1))
    fails = judge(m)
    for k, op, th, crit in LIMITS:
        print(f"  {crit} {k:26s} {m[k]:8.3f}  ({op} {th})")
    for f in fails:
        print(f)
    if not fails:
        print("PASS[frames]: every reference-derived limit met")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
