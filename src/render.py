"""Timestamp-addressed procedural frames; no render-order state."""
import hashlib
import math
import subprocess
from pathlib import Path

import cv2
import numpy as np

PALETTE = {'dark': (7, 8, 13), 'warm': (67, 122, 229), 'cool': (163, 140, 96)}


def noise(shape, seed, t, layer):
    fields = []
    for phase in (0, 1):
        key = f'{seed}:{layer}:{phase}'.encode()
        rng = np.random.default_rng(int.from_bytes(hashlib.sha256(key).digest()[:8], 'big'))
        small = rng.random((max(2, shape[0] // 48), max(2, shape[1] // 48)), dtype=np.float32)
        fields.append(cv2.resize(small, (shape[1], shape[0]), interpolation=cv2.INTER_CUBIC))
    blend = .5 + .5 * math.sin(t * .6 + layer)
    return fields[0] * blend + fields[1] * (1 - blend)


def frame(t, duration, size, seed=24, beats=()):
    w, h = size
    yy, xx = np.mgrid[:h, :w].astype(np.float32)
    x = (xx - w * (.53 + .025 * math.sin(t * .22))) / h
    y = (yy - h * (.51 + .02 * math.cos(t * .18))) / h
    radius = np.sqrt(x * x + y * y) + 1e-5
    angle = np.arctan2(y, x)
    progress = min(1, t / max(duration, .001))
    beat_distance = min((abs(t - b) for b in beats), default=10)
    pulse = max(0, 1 - beat_distance / .2)
    horizon = .145 + .012 * math.sin(t * .33) + pulse * .006
    ring = np.exp(-((radius - horizon * 1.16) / .013) ** 2)
    warped = angle + 1.8 / (radius + .12) + .16 * t
    disk_plane = abs(np.sin(warped) * radius) / (.035 + .05 * radius)
    disk = np.exp(-(disk_plane ** 2)) * np.exp(-((radius - .32) / .25) ** 2)
    disk *= (radius > horizon * 1.03)
    lens_arc = np.exp(-((radius - horizon * 1.48) / .065) ** 2) * (.4 + .6 * np.maximum(0, -np.sin(angle)))
    turbulence = np.clip(noise((h, w), seed, t, 1), 0, 1)
    grain = noise((h, w), seed, t, 2)
    glow = ring * 1.3 + disk * (.5 + .5 * turbulence) * 1.8 + lens_arc * .42
    vignette = np.clip(1.2 - .6 * np.sqrt(x * x + y * y), .35, 1)
    image = np.empty((h, w, 3), np.float32)
    for c in range(3):
        image[:, :, c] = PALETTE['dark'][c] + glow * PALETTE['warm'][c] * (1 if c == 2 else .65)
        image[:, :, c] += lens_arc * PALETTE['cool'][c] * .35
    image *= vignette[:, :, None]
    image[radius < horizon] *= .015
    # Stateless celestial pinpoints with lens displacement and cinematic parallax.
    rng = np.random.default_rng(seed)
    for sx, sy, intensity in rng.uniform(size=(115, 3)):
        px = int((sx * w + 14 * math.sin(t * .08 + sy * 12)) % w)
        py = int(sy * h)
        if radius[py, px] > horizon * 2:
            image[py, px] += intensity * np.array([110, 135, 180])
    image += (grain[:, :, None] - .5) * 2.5
    image = np.clip(image, 0, 255).astype(np.uint8)
    if progress > .08 and progress < .86:
        # Type remains sharp and outside the event horizon, not a presumed lyric.
        caption = 'WHAT REMAINS IN TEN YEARS?' if progress > .55 else 'A QUESTION, NOT A FORECAST'
        scale = min(w / 1100, h / 620)
        cv2.putText(image, caption, (int(.065 * w), int(.87 * h)), cv2.FONT_HERSHEY_SIMPLEX,
                    scale, (219, 216, 203), max(1, round(scale * 2)), cv2.LINE_AA)
    return image


def render(path, analysis, size=(960, 540), fps=24, duration=None, seed=24, offset=0):
    duration = duration or analysis['duration']
    count = max(1, math.ceil(duration * fps))
    w, h = size
    args = ['ffmpeg', '-y', '-nostdin', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'bgr24',
            '-s', f'{w}x{h}', '-r', str(fps), '-i', '-', '-an', '-c:v', 'libx264',
            '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', str(path)]
    with Path(str(path) + '.log').open('wb') as log:
        process = subprocess.Popen(args, stdin=subprocess.PIPE, stderr=log)
        try:
            for i in range(count):
                process.stdin.write(frame(offset + i / fps, analysis['duration'], size, seed, analysis['beats']).tobytes())
        except BrokenPipeError as exc:
            raise RuntimeError(f'Render encoder stopped; see {path}.log') from exc
        finally:
            process.stdin.close()
        if process.wait():
            raise RuntimeError(f'Render failed; see {path}.log')
    return count
