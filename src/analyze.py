"""Conservative, deterministic audio measurements; no speech claims without ASR."""
import json
import subprocess
from pathlib import Path

import numpy as np
from scipy.ndimage import gaussian_filter1d
from scipy.signal import find_peaks


def command(args, log=None):
    result = subprocess.run(args, capture_output=True)
    if log is not None:
        Path(log).write_bytes(result.stderr[-65536:])
    if result.returncode:
        raise RuntimeError(f"{args[0]} failed ({result.returncode}); see {log or 'stderr'}")
    return result.stdout


def analyze(path, output):
    probe = json.loads(command(['ffprobe', '-v', 'error', '-show_streams', '-show_format',
                                '-of', 'json', str(path)], output / 'probe.log'))
    streams = [s for s in probe['streams'] if s['codec_type'] == 'audio']
    if not streams:
        raise ValueError('Input contains no audio stream')
    stream = streams[0]
    duration = float(probe['format'].get('duration') or stream.get('duration') or 0)
    if not 0 < duration <= 7200:
        raise ValueError('Audio duration must be between 0 and 7200 seconds')
    rate = 11025
    raw = command(['ffmpeg', '-nostdin', '-v', 'error', '-i', str(path), '-vn', '-ac', '1',
                   '-ar', str(rate), '-f', 'f32le', '-'], output / 'decode.log')
    samples = np.frombuffer(raw, dtype='<f4')
    if not len(samples):
        raise ValueError('No decoded samples')
    hop = 512
    frames = np.pad(samples, (0, (-len(samples)) % hop)).reshape(-1, hop)
    rms = np.sqrt(np.mean(frames.astype(np.float64) ** 2, axis=1))
    energy = gaussian_filter1d(rms, 3)
    times = np.arange(len(rms)) * hop / rate
    novelty = np.maximum(0, np.diff(energy, prepend=energy[0]))
    prominence = max(float(np.percentile(novelty, 85)), 0.0004)
    peaks, _ = find_peaks(novelty, distance=max(1, int(.28 * rate / hop)), prominence=prominence)
    beats = [round(float(times[i]), 3) for i in peaks if times[i] < duration]
    intervals = np.diff(beats)
    consistent = intervals[(intervals >= .28) & (intervals <= 1.5)]
    tempo = round(60 / float(np.median(consistent)), 1) if len(consistent) >= 3 else None
    section_length = max(2., min(12., duration / 5))
    boundaries = np.arange(0, duration, section_length)
    sections = []
    for index, start in enumerate(boundaries):
        end = min(duration, float(start + section_length))
        region = energy[(times >= start) & (times < end)]
        sections.append({'start': round(float(start), 3), 'end': round(end, 3),
                         'energy': round(float(np.mean(region)) if len(region) else 0., 5),
                         'label': ['opening', 'pressure', 'convergence', 'threshold', 'aftermath'][min(index, 4)]})
    analysis = {'format': stream['codec_name'], 'duration': round(duration, 3),
                'channels': stream.get('channels'), 'sample_rate': stream.get('sample_rate'),
                'peak_dbfs': round(20 * np.log10(max(float(np.max(np.abs(samples))), 1e-9)), 2),
                'rms_dbfs': round(20 * np.log10(max(float(np.sqrt(np.mean(samples.astype(np.float64)**2))), 1e-9)), 2),
                'clipped_fraction': round(float(np.mean(np.abs(samples) >= .999)), 6),
                'beats': beats, 'tempo_bpm_estimate': tempo,
                'downbeats': [], 'downbeat_confidence': 0,
                'sections': sections, 'transitions': [s['start'] for s in sections[1:]],
                'events': [{'time': t, 'type': 'onset'} for t in beats],
                'vocals': {'status': 'unknown', 'reason': 'No validated local speech recognizer or source-separation model installed',
                           'words': [], 'confidence': 0}}
    (output / 'analysis.json').write_text(json.dumps(analysis, indent=2), encoding='utf-8')
    return analysis
