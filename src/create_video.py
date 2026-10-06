"""One-file offline entry point. Usage: bun run create-video -- /path/song.wav"""
import argparse
import hashlib
import json
import math
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path

from analyze import analyze, command
from render import frame, render
import cv2

ROOT = Path(__file__).resolve().parents[1]


def make_run(input_path):
    hasher = hashlib.sha256()
    with input_path.open('rb') as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            hasher.update(chunk)
    digest = hasher.hexdigest()[:10]
    stamp = datetime.now().strftime('%Y%m%d-%H%M%S-%f')
    run = ROOT / 'outputs' / f'{input_path.stem[:40]}-{stamp}-{digest}'
    run.mkdir(parents=True, exist_ok=False)
    return run, digest


def treatment(analysis):
    scenes = []
    modes = ['signal', 'competition', 'event-horizon', 'ten-year-question', 'open-ending']
    for i, section in enumerate(analysis['sections']):
        scenes.append({'start': section['start'], 'end': section['end'],
                       'mode': modes[min(i, 4)], 'cue': 'section energy and nearby onset',
                       'method': 'timestamp-indexed procedural lens/disk and authored vector text',
                       'purpose': 'A race narrows our view; future is left an open question',
                       'accept': 'legible focal point, no flash, no copied assets'})
    return {'premise': 'A speculative question about frontier AI competition and catastrophic risk; no intent or prediction asserted',
            'style': 'Obsidian field, restrained copper photon traces, cool numerical distance; no borrowed footage',
            'hero': {'narrative_purpose': 'Attention and warning collapse toward one center',
                     'visual_metaphor': 'An event horizon bends a field of signals, not a literal prediction',
                     'method': '2D analytic lens approximation and accretion field; no costly ray march',
                     'camera': 'Slow offset drift, concentric radius breathes at onsets',
                     'audio_cues': 'onset distance and section energy',
                     'cost': 'CPU raster per frame; 960x540 draft then tier-selected final',
                     'accept': 'inspect three frames, short motion clip, temporal difference and contact sheet'},
            'scenes': scenes, 'lyrics_policy': 'No words rendered until verified word-level ASR is available'}


def mux(video, audio, target, log):
    command(['ffmpeg', '-y', '-nostdin', '-v', 'error', '-i', str(video), '-i', str(audio),
             '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac',
             '-b:a', '192k', '-shortest', str(target)], log)


def evidence(run, analysis):
    times = [min(analysis['duration'] * fraction, analysis['duration'] - .01) for fraction in (.12, .36, .64, .86)]
    frames = [frame(t, analysis['duration'], (960, 540), beats=analysis['beats']) for t in times]
    for index, image in enumerate(frames):
        cv2.imwrite(str(run / f'frame-{index:02d}.png'), image)
    sheet = cv2.resize(cv2.hconcat([cv2.resize(im, (480, 270)) for im in frames]), (960, 540))
    cv2.imwrite(str(run / 'contact-sheet.png'), sheet)
    render(run / 'motion-review.mp4', analysis, (480, 270), 24,
           duration=min(3, analysis['duration']))
    return {'frame_times': [round(t, 3) for t in times], 'contact_sheet': 'contact-sheet.png',
            'clip': 'motion-review.mp4'}


def main():
    parser = argparse.ArgumentParser(description='Create a deterministic motion-graphics video from one audio file')
    parser.add_argument('audio', type=Path)
    args = parser.parse_args()
    audio = args.audio.expanduser().resolve()
    if not audio.is_file() or not audio.stat().st_size:
        parser.error('Supply one nonempty, readable audio file')
    run, digest = make_run(audio)
    try:
        local = run / ('source' + audio.suffix.lower())
        shutil.copyfile(audio, local)
        analysis = analyze(local, run)
        plan = treatment(analysis)
        (run / 'treatment.json').write_text(json.dumps(plan, indent=2), encoding='utf-8')
        (run / 'timeline.json').write_text(json.dumps(plan['scenes'], indent=2), encoding='utf-8')
        # Sample duration is kept exact; do not pretend a render at different duration is full.
        quality = {'size': [960, 540], 'fps': 24, 'tier': 'safe-cpu'}
        (run / 'quality.json').write_text(json.dumps(quality, indent=2), encoding='utf-8')
        render(run / 'draft.mp4', analysis, (640, 360), 24)
        proof = evidence(run, analysis)
        render(run / 'master-video.mp4', analysis, tuple(quality['size']), quality['fps'])
        mux(run / 'master-video.mp4', local, run / 'final.mp4', run / 'mux.log')
        result = json.loads(command(['ffprobe', '-v', 'error', '-show_format', '-show_streams',
                                     '-of', 'json', str(run / 'final.mp4')], run / 'final-probe.log'))
        streams = [s['codec_type'] for s in result['streams']]
        if not {'audio', 'video'} <= set(streams):
            raise RuntimeError('Final output missing audio or video')
        (run / 'report.md').write_text(
            f'# Run report\n\nInput SHA-256 prefix: `{digest}`. Duration: {analysis["duration"]}s. '
            f'Video/audio streams: {streams}.\n\nVerified artifacts: draft.mp4, master-video.mp4, '
            f'final.mp4, contact-sheet.png, motion-review.mp4. Evidence times: {proof["frame_times"]}.\n\n'
            'Unverified: vocal presence, lyrics, downbeats, subjective visual quality. '
            'Tempo is an onset-derived estimate, not a validated meter.\n\n'
            'Blockers: no validated local ASR or voice separation; no independent human visual approval.\n',
            encoding='utf-8')
        print(run)
    except Exception as exc:
        (run / 'FAILED.txt').write_text(str(exc) + '\n', encoding='utf-8')
        print(f'Failed; diagnostics in {run}: {exc}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
