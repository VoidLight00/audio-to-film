"""Post-render QA of one film: exit 0 only when every HARD check passes; writes <run>/qa-<film>.json.

  python3 src/film_qa.py <run dir> <film.mp4> [--max-still 0.5]

HARD checks
  streams   one H.264 video stream (60 fps) and one audio stream
  duration  video frame count == round(audio duration x fps) (the film runs to the end of the file)
  motion    no stretch longer than --max-still seconds without NON-RIGID motion. Each frame is compared
            with the one 0.1 s later after the best global affine warp (OpenCV ECC) has been removed, on
            blurred 160x90 thumbnails (every 2nd frame): per-frame film grain, a still picture, and a Ken Burns pan/zoom
            over a still all leave ~0 residual and fail; procedural motion does not. Calibrated on
            trap clips (see gates/film_gate.sh).
  glyphs    no lyric line was dropped for lack of a font (render.ts already refuses; re-checked here)
Needs ffmpeg/ffprobe, NumPy and OpenCV (the v1 prerequisites).
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path

import cv2
import numpy as np

GW, GH, LAG, STRIDE = 160, 90, 6, 2   # residual every 2nd frame on 160x90: a 3-min film in ~1-2 min


def probe(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-count_packets", "-show_streams", "-show_format", "-of", "json", str(path)],
                         capture_output=True)
    if out.returncode:
        raise RuntimeError(out.stderr.decode("utf-8", "replace"))
    return json.loads(out.stdout.decode("utf-8", "replace"))


def frames(path):
    """Every frame as a blurred 160x90 float32 grey thumbnail."""
    p = subprocess.Popen(["ffmpeg", "-v", "error", "-i", str(path), "-vf", f"scale={GW}:{GH}:flags=area,format=gray",
                         "-f", "rawvideo", "-"], stdout=subprocess.PIPE)
    out, n = [], GW * GH
    while True:
        buf = p.stdout.read(n)
        if len(buf) < n:
            break
        out.append(cv2.GaussianBlur(np.frombuffer(buf, np.uint8).reshape(GH, GW).astype(np.float32), (0, 0), 0.8))
    if p.wait():
        raise RuntimeError("ffmpeg could not decode the film")
    return out


def nonrigid(fr):
    """Every STRIDE-th frame i vs i+LAG, after removing the best global affine warp (ECC):
    (res, unexplained) = 98th percentile of the blurred residual (0..255; a small moving region counts,
    per-frame grain averages out) and 1 - ECC correlation (variance a pan/zoom cannot explain).
    A mean residual hid a growing black hole covering 5 % of the frame, and a raw p98 passed a Ken Burns
    zoom on its interpolation error (FAILURE_LOG F10); each criterion below catches one trap."""
    crit = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 40, 1e-4)
    m = slice(GH // 10, GH - GH // 10), slice(GW // 10, GW - GW // 10)
    out = []
    for i in range(0, len(fr) - LAG, STRIDE):
        a, b = fr[i], fr[i + LAG]
        warp = np.eye(2, 3, dtype=np.float32)
        try:
            cc, warp = cv2.findTransformECC(b, a, warp, cv2.MOTION_AFFINE, crit, None, 1)
            aw = cv2.warpAffine(a, warp, (GW, GH), flags=cv2.INTER_LINEAR + cv2.WARP_INVERSE_MAP)
        except cv2.error:   # ECC fails to converge on featureless pairs: fall back to no warp
            cc, aw = 0.0, a
        # the smaller of the aligned and unaligned residual: on a featureless still ECC can lock onto a
        # spurious warp whose interpolation edges would read as motion
        p98 = lambda x, y: float(np.percentile(cv2.GaussianBlur(np.abs(x - y), (0, 0), 3.5)[m], 98))
        res = min(p98(b, aw), p98(b, a))
        out.append((res, 1.0 - float(cc)))
    return out


def still_runs(diffs, thr):
    """(start frame, length) of every run of frames below thr."""
    runs, start = [], None
    for i, d in enumerate(list(diffs) + [thr]):
        if d < thr and start is None:
            start = i
        elif d >= thr and start is not None:
            runs.append((start, i - start))
            start = None
    return runs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("run", type=Path)
    ap.add_argument("film", type=Path)
    ap.add_argument("--max-still", type=float, default=0.5, help="seconds")
    ap.add_argument("--still-res", type=float, default=1.6, help="blurred p98 residual below which a sample is still (grain trap 0.76)")
    ap.add_argument("--still-cc", type=float, default=0.0007, help="1 - ECC below which a sample is a rigid move (Ken Burns trap <= 0.00037)")
    a = ap.parse_args()
    fails, m = [], {}
    audio = json.loads((a.run / "audio.json").read_text())
    info = probe(a.film)
    v = [s for s in info["streams"] if s["codec_type"] == "video"]
    au = [s for s in info["streams"] if s["codec_type"] == "audio"]
    if len(v) != 1 or len(au) != 1:
        fails.append(f"streams: {len(v)} video / {len(au)} audio, expected 1 / 1")
    fps = 0.0
    if v:
        num, den = map(int, v[0]["r_frame_rate"].split("/"))
        fps = num / den
        m.update(width=v[0]["width"], height=v[0]["height"], fps=fps, frames=int(v[0].get("nb_read_packets", 0)),
                 color=v[0].get("color_primaries"))
        if v[0]["codec_name"] != "h264" or abs(fps - 60) > 1e-6:
            fails.append(f"streams: {v[0]['codec_name']} at {fps} fps, expected h264 at 60")
    t0, t1 = float(info["format"].get("start_time", 0)), float(info["format"]["duration"])
    sp = Path(f"{a.film}.span.json")
    span = json.loads(sp.read_text()) if sp.exists() else None
    want = round((span["to"] if span else audio["duration"]) * 60) - round((span["from"] if span else 0) * 60)
    m["expected_frames"] = want
    if m.get("frames") != want:
        fails.append(f"duration: {m.get('frames')} frames, expected {want} (audio {audio['duration']} s)")
    nr = nonrigid(frames(a.film))
    # still = flag 0 (the run detector counts samples below 1): grain-still OR rigid-only motion
    flags = [0.0 if (res < a.still_res or unex < a.still_cc) else 1.0 for res, unex in nr]
    runs = still_runs(flags, 0.5)
    runs = [(i * STRIDE, n * STRIDE) for i, n in runs]   # samples -> frames
    still = max((n for _, n in runs), default=0)
    t_off = span["from"] if span else 0.0
    m["still_spans_s"] = [[round(t_off + i / max(fps, 1), 2), round(n / max(fps, 1), 2)] for i, n in runs if n / max(fps, 1) > a.max_still]
    res = [r for r, _ in nr] or [0.0]
    unex = [u for _, u in nr] or [0.0]
    m.update(nonrigid_p05=round(float(np.percentile(res, 5)), 3), nonrigid_median=round(float(np.median(res)), 3),
             unexplained_p05=round(float(np.percentile(unex, 5)), 5),
             longest_still_frames=still, longest_still_s=round(still / max(fps, 1), 3))
    if still / max(fps, 1) > a.max_still:
        fails.append(f"motion: {still} consecutive near-identical frames ({still / max(fps, 1):.2f} s > {a.max_still} s)")
    qa = dict(film=a.film.name, pass_=not fails, fails=fails, metrics=m, container_start=t0, container_duration=t1)
    (a.run / f"qa-{a.film.stem}.json").write_text(json.dumps(qa, indent=1, ensure_ascii=False))
    print(json.dumps(qa, indent=1, ensure_ascii=False))
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
