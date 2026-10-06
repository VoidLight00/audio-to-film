"""Music analysis of the run's input -> <run>/audio.json (100 fps envelopes, beats, downbeats,
sections, drum / vocal onsets, vocal f0, instrumental spans, tail).

Signal helpers (band filters, envelopes, band onsets, drum and vocal onsets) are from
mexicat/pdoom-video analysis/analyze.py (MIT). pdoom's beat grid assumed one constant tempo and its
sections were a hand-written bar table; here the beat grid comes from librosa's dynamic-programming
tracker (local tempo), the downbeat phase from kick strength + harmony change (4/4 assumed), and
sections from a bar-level self-similarity novelty curve. All times are on the input.wav timeline.
Run:  ATF_RUN=<run dir> uv run python analyze.py
"""
import json
import math

import numpy as np
import librosa
from scipy.ndimage import maximum_filter1d, median_filter, uniform_filter1d
from scipy.signal import butter, find_peaks, sosfiltfilt

import common
import vocal_feats
from refine import activity, load_feats, runs

SR = common.SR
FPS = 100
HOP = 512


def band_sos(lo, hi, sr):
    if lo and hi:
        return butter(4, [lo, hi], btype="band", fs=sr, output="sos")
    if hi:
        return butter(4, hi, btype="low", fs=sr, output="sos")
    return butter(4, lo, btype="high", fs=sr, output="sos")


def frame_rms(x, sr, fps=FPS, win=2048):
    hop = sr / fps
    n = int(math.ceil(len(x) / sr * fps))
    pad = np.pad(x, (win // 2, win // 2 + int(hop) + 2))
    idx = (np.arange(n) * hop).astype(int)
    c = np.concatenate([[0.0], np.cumsum(pad.astype(np.float64) ** 2)])
    e = (c[idx + win] - c[idx]) / win
    return np.sqrt(np.maximum(e, 0))


def smooth_env(x, fps=FPS, attack=0.010, release=0.090):
    """One-pole follower: fast attack, slower release (visual friendly)."""
    aa = math.exp(-1 / (attack * fps))
    ar = math.exp(-1 / (release * fps))
    y = np.empty_like(x)
    s = 0.0
    for i, v in enumerate(x):
        a = aa if v > s else ar
        s = a * s + (1 - a) * v
        y[i] = s
    return y


def norm01(x, pct=99.0):
    ref = np.percentile(x, pct)
    return np.clip(x / (ref + 1e-12), 0, 1)


# ---------------------------------------------------------------------------
def band_onsets(x, sr, lo, hi, win=0.010, hop_s=0.002, min_gap=0.08, rel_db=10.0,
                decay_win=None):
    """Onsets in a frequency band: steepest rise of the band's log-energy
    envelope; strength = peak dB rise.  Returns (times, rise_db[, decay_db])."""
    xb = sosfiltfilt(band_sos(lo, hi, sr), x)
    h = int(hop_s * sr)
    w = int(win * sr)
    e = np.convolve(xb.astype(np.float64) ** 2, np.ones(w) / w, mode="same")[::h]
    db = 10 * np.log10(e + 1e-10)
    fps = sr / h  # exact frame rate (h is an integer number of samples)
    d = np.diff(db, prepend=db[0])
    d = uniform_filter1d(d, 3)
    # rise over ~20 ms
    lag = int(0.02 * fps)
    rise = db - np.concatenate([np.full(lag, db[0]), db[:-lag]])
    floor = median_filter(db, int(1.0 * fps) | 1)
    pk, _ = find_peaks(rise, height=rel_db, distance=int(min_gap * fps))
    times, strength = [], []
    for p in pk:
        a = max(0, p - lag)
        # attack time: steepest slope within the rise window
        q = a + int(np.argmax(d[a:p + 1]))
        peak_db = db[p:p + int(0.03 * fps)].max()
        if peak_db < floor[p] + 3:
            continue
        times.append(q / fps)
        strength.append(peak_db)
    return np.array(times), np.array(strength)


def drum_onsets(d, sr, grid_P, grid_off):
    """Kick / snare / hat onsets from the drums stem."""
    # KICK: <120 Hz
    kt, kdb = band_onsets(d, sr, None, 120, win=0.012, min_gap=0.15, rel_db=12)
    # SNARE (and the clap-like snare of the quiet chorus): candidates are
    # 1.5-5 kHz attacks; a snare has a long noisy 0.5-5 kHz tail 40-120 ms after
    # the attack.  Keep candidates whose tail is within 8 dB of the loudest tail
    # in +-2.5 s and within 25 dB of the song-wide level (rejects stem bleed).
    # Kick-only beats / hats have tails 12-30 dB lower.
    st, sdb = band_onsets(d, sr, 1500, 5000, win=0.010, min_gap=0.15, rel_db=10)
    xb = sosfiltfilt(band_sos(500, 5000, sr), d)
    e = np.sqrt(np.convolve(xb.astype(np.float64) ** 2, np.ones(441) / 441, mode="same"))
    tail = np.array([20 * np.log10(e[int((t + 0.04) * sr):int((t + 0.12) * sr)].mean() + 1e-9) for t in st])
    rel = np.array([tail[i] - tail[np.abs(st - st[i]) < 2.5].max() for i in range(len(st))])
    thr = np.percentile(tail, 95) - 25
    keep = (rel > -8) & (tail > thr)
    st, sdb, stail = st[keep], sdb[keep], tail[keep]
    # HAT: >7 kHz, short; drop those coinciding with snares (snare noise also
    # reaches 7k+)
    ht, hdb = band_onsets(d, sr, 7000, None, win=0.006, min_gap=0.06, rel_db=9)
    # (and those within 30 ms of a kick: the kick's beater click reaches 10 kHz)
    for other, gap in ((st, 0.04), (kt, 0.03)):
        if len(other) and len(ht):
            dist = np.min(np.abs(ht[:, None] - other[None, :]), axis=1)
            keep = dist > gap
            ht, hdb = ht[keep], hdb[keep]
    return (kt, kdb), (st, stail), (ht, hdb), thr


def strength01(db_vals, lo_pct=5, hi_pct=95):
    if len(db_vals) == 0:
        return db_vals
    lo, hi = np.percentile(db_vals, lo_pct), np.percentile(db_vals, hi_pct)
    return np.clip((db_vals - lo) / (hi - lo + 1e-9) * 0.8 + 0.2, 0, 1)


def vocal_onsets(v, sr):
    """Vocal note onsets: log-mel spectral flux peaks (5 ms hop) plus pitch
    jumps > 0.8 semitone while voiced, restricted to active vocal frames."""
    f = dict(np.load(common.WORK / "vocal_feats.npz"))
    hop = float(f["hop_s"])
    on = f["onset"]
    rms = f["rms_db"]
    loc = maximum_filter1d(rms, int(2.0 / hop))
    active = (rms > -45) & (rms > loc - 25)
    thr = uniform_filter1d(on, int(0.4 / hop)) * 1.5 + 0.15 * np.percentile(on, 99)
    pk, _ = find_peaks(on, height=0, distance=int(0.09 / hop))
    pk = [p for p in pk if on[p] > thr[p] and active[min(len(active) - 1, p + int(0.03 / hop))]]
    t_flux = np.array(pk) * hop
    s_flux = np.array([on[p] for p in pk])
    # pitch jumps (legato note changes that have little spectral flux)
    f0 = f["f0"]
    midi = librosa.hz_to_midi(np.where(f["voiced"] > 0, f0, np.nan))
    med = median_filter(np.nan_to_num(midi, nan=0), 9)
    jumps = []
    w = int(0.04 / hop)
    for i in range(w, len(med) - w):
        a, b = med[i - w], med[i + w]
        if a > 0 and b > 0 and abs(b - a) > 0.8 and active[i]:
            jumps.append(i)
    # collapse runs
    t_pitch, last = [], -1e9
    for i in jumps:
        if i - last > int(0.1 / hop):
            t_pitch.append(i * hop)
        last = i
    t_pitch = np.array(t_pitch)
    ts = list(zip(t_flux, s_flux / (np.percentile(s_flux, 95) + 1e-9)))
    for t in t_pitch:
        if len(t_flux) == 0 or np.min(np.abs(t_flux - t)) > 0.08:
            ts.append((t, 0.35))
    ts.sort()
    return [(float(t), float(min(1.0, max(0.1, s)))) for t, s in ts]



# ---------------------------------------------------------------------------
def beat_grid(mix, drums, sr):
    """Beats from the DP tracker on drums+mix onset strength; downbeat phase (4/4) by kick + harmony change."""
    oe = librosa.onset.onset_strength(y=drums, sr=sr, hop_length=HOP) + 0.5 * librosa.onset.onset_strength(y=mix, sr=sr, hop_length=HOP)
    tempo, bf = librosa.beat.beat_track(onset_envelope=oe, sr=sr, hop_length=HOP, units="frames", tightness=100)
    beats = librosa.frames_to_time(bf, sr=sr, hop_length=HOP)
    if len(beats) < 8:
        return float(np.atleast_1d(tempo)[0]), beats, beats[::4]
    low = frame_rms(sosfiltfilt(band_sos(None, 120, sr), drums), sr)
    kick = np.array([low[min(int(t * FPS), len(low) - 1):int(t * FPS) + 8].max() for t in beats])
    chroma = librosa.feature.chroma_cqt(y=librosa.effects.harmonic(mix), sr=sr, hop_length=HOP)
    cb = librosa.util.sync(chroma, bf, aggregate=np.median)[:, :len(beats)]
    cb = cb / (np.linalg.norm(cb, axis=0, keepdims=True) + 1e-9)
    nov = np.concatenate([[0.0], 1 - np.sum(cb[:, 1:] * cb[:, :-1], axis=0)])[:len(beats)]
    z = lambda x: (x - x.mean()) / (x.std() + 1e-9)
    score = [z(kick)[p::4].mean() + z(nov)[p::4].mean() for p in range(4)]
    return float(60.0 / np.median(np.diff(beats))), beats, beats[int(np.argmax(score))::4]


def bar_features(mix, sr, downbeats, duration):
    """Per-bar chroma + MFCC + loudness (z-scored), the input of segmentation and repetition labels."""
    chroma = librosa.feature.chroma_cqt(y=mix, sr=sr, hop_length=HOP)
    mfcc = librosa.feature.mfcc(y=mix, sr=sr, n_mfcc=13, hop_length=HOP)
    rms = librosa.feature.rms(y=mix, hop_length=HOP)
    edges = np.concatenate([[0.0], downbeats, [duration]])
    fr = np.unique(librosa.time_to_frames(edges, sr=sr, hop_length=HOP).clip(0, chroma.shape[1]))
    X = np.vstack([chroma, mfcc, 4 * rms])
    B = librosa.util.sync(X, fr, aggregate=np.mean)
    B = (B - B.mean(1, keepdims=True)) / (B.std(1, keepdims=True) + 1e-9)
    return B, librosa.frames_to_time(fr, sr=sr, hop_length=HOP)


def segment(B, bar_t, duration, k):
    """Foote novelty on the bar self-similarity matrix -> up to k-1 boundaries, >= 4 bars apart."""
    n = B.shape[1]
    U = B / (np.linalg.norm(B, axis=0, keepdims=True) + 1e-9)
    S = U.T @ U
    L = 4
    a = np.r_[-np.ones(L), np.ones(L)]
    g = np.outer(a, a)  # +1 within-segment blocks, -1 across: high where the past and future bars differ
    nov = np.zeros(n)
    for i in range(L, n - L):
        nov[i] = np.sum(S[i - L:i + L, i - L:i + L] * g)
    pk, _ = find_peaks(nov, distance=4)
    pk = sorted(pk[np.argsort(nov[pk])[::-1][:k - 1]])
    bounds = [0.0] + [float(bar_t[p]) for p in pk] + [duration]
    return [(bounds[i], bounds[i + 1]) for i in range(len(bounds) - 1)], U


def label_sections(spans, U, bar_t, env_rms, vocal_mask, hop_v):
    """Repetition labels (A, B, ...), energy, vocal share, and a coarse kind per section."""
    out, protos = [], []
    for s, e in spans:
        bars = [i for i in range(U.shape[1]) if s <= bar_t[i] < e] or [0]
        v = U[:, bars].mean(1)
        v /= np.linalg.norm(v) + 1e-9
        sim = [float(v @ p) for _, p in protos]
        if sim and max(sim) > 0.85:
            lab = protos[int(np.argmax(sim))][0]
        else:
            lab = chr(ord("A") + len(set(l for l, _ in protos)) % 26)
            protos.append((lab, v))
        a, b = int(s * FPS), max(int(s * FPS) + 1, int(e * FPS))
        va, vb = int(s / hop_v), max(int(s / hop_v) + 1, int(e / hop_v))
        out.append(dict(start=round(s, 3), end=round(e, 3), label=lab,
                        energy=round(float(env_rms[a:b].mean()), 3),
                        vocal=round(float(vocal_mask[va:vb].mean()), 3)))
    en = np.array([x["energy"] for x in out])
    reps = {l for l in (x["label"] for x in out) if sum(y["label"] == l for y in out) > 1}
    for i, x in enumerate(out):
        if x["vocal"] < 0.15 and x["end"] - x["start"] >= 8:
            kind = "instrumental"
        elif i == 0 and x["energy"] < np.percentile(en, 50):
            kind = "intro"
        elif i == len(out) - 1 and x["energy"] < np.percentile(en, 60):
            kind = "outro"
        elif x["label"] in reps and x["energy"] >= np.percentile(en, 60):
            kind = "chorus"
        else:
            kind = "verse"
        x["kind"] = kind
        x["name"] = f"{kind}{i}"
    return out


def main():
    mix, sr = common.load_wav(common.INPUT)
    duration = len(mix) / sr
    drums, _ = common.load_stem("drums")
    stems = {k: common.load_stem(k)[0] for k in ("bass", "other")}
    lead, _ = common.load_stem("lead")
    if not (common.WORK / "vocal_feats.npz").exists():
        vocal_feats.compute()
    vf = load_feats()

    env = {
        "rms": frame_rms(mix, sr),
        "low": frame_rms(sosfiltfilt(band_sos(None, 150, sr), mix), sr),
        "mid": frame_rms(sosfiltfilt(band_sos(150, 2000, sr), mix), sr),
        "high": frame_rms(sosfiltfilt(band_sos(4000, None, sr), mix), sr),
        "vocal": frame_rms(lead, sr), "drums": frame_rms(drums, sr),
        "bass": frame_rms(stems["bass"], sr), "other": frame_rms(stems["other"], sr),
    }
    n = int(math.ceil(duration * FPS))
    feats = {k: np.round(smooth_env(norm01(v[:n]))[:n], 4).tolist() for k, v in env.items()}

    bpm, beats, downbeats = beat_grid(mix, drums, sr)
    (kt, kdb), (st, stail), (ht, hdb), _ = drum_onsets(drums, sr, None, None)
    onsets = {
        "kick": [[round(float(t), 4), round(float(s), 3)] for t, s in zip(kt, strength01(kdb))],
        "snare": [[round(float(t), 4), round(float(s), 3)] for t, s in zip(st, strength01(stail))],
        "hat": [[round(float(t), 4), round(float(s), 3)] for t, s in zip(ht, strength01(hdb))],
        "vocal": [[round(t, 4), round(s, 3)] for t, s in vocal_onsets(lead, sr)],
    }

    act, _ = activity(vf)
    hop_v = vf["hop"]
    # instrumental spans: no lead vocal for >= 8 s (gaps < 0.5 s bridged)
    gaps = [(a * hop_v, b * hop_v) for a, b in runs(~act)]
    instrumental = [[round(a, 3), round(b, 3)] for a, b in gaps if b - a >= 8.0]

    B, bar_t = bar_features(mix, sr, downbeats, duration)
    spans, U = segment(B, bar_t, duration, k=int(np.clip(round(duration / 22), 4, 12)))
    sections = label_sections(spans, U, bar_t, np.array(feats["rms"]), act.astype(float), hop_v)

    # f0 of the lead vocal at 100 fps (MIDI, null when unvoiced)
    # index by time, not by a rounded stride (5 ms hops are 4.99 ms: a stride drifts ~0.45 s over 3 min)
    idx = np.minimum((np.arange(n) / FPS / hop_v).round().astype(int), len(vf["f0"]) - 1)
    f0 = vf["f0"][idx]
    midi = [None if not (v > 0) else round(float(librosa.hz_to_midi(v)), 2) for v in f0]

    db = 20 * np.log10(env["rms"] + 1e-9)
    loud = np.where(db > -50)[0]
    tail_end = float(loud[-1] / FPS) if len(loud) else duration

    out = dict(duration=round(duration, 4), bpm=round(bpm, 3), fps=FPS,
               beats=[round(float(b), 4) for b in beats], downbeats=[round(float(b), 4) for b in downbeats],
               sections=sections, features=feats, onsets=onsets, f0=midi, instrumental=instrumental,
               tail_end=round(tail_end, 3),
               notes="beats: librosa DP tracker; downbeats: 4/4 phase by kick+chroma change; "
                     "sections: bar SSM novelty; envelopes normalized to the 99th percentile; "
                     "tail_end: last frame above -50 dBFS (the film still runs to `duration`).")
    (common.RUN / "audio.json").write_text(json.dumps(out))
    print(f"audio.json: {duration:.1f}s, {bpm:.1f} bpm, {len(beats)} beats, {len(downbeats)} downbeats, "
          f"{len(sections)} sections {[s['name'] for s in sections]}, kicks {len(kt)}, snares {len(st)}, "
          f"instrumental {instrumental}, tail_end {tail_end:.2f}")


if __name__ == "__main__":
    main()
