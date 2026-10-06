#!/usr/bin/env bun
// Synthetic run folder for engine tests and gates: 88 s at 120 bpm laid out so the director uses all
// seven archetypes; every section kind, English
// and Korean lyric lines, drum onsets, a vocal melody, and a click track as input.wav.
//   bun scripts/fixture.ts <dir>
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const dir = path.resolve(process.argv[2] ?? '../tests/fixture-run');
mkdirSync(dir, { recursive: true });
const DUR = 88, FPS = 100, BEAT = 0.5;
const beats = Array.from({ length: DUR / BEAT }, (_, i) => i * BEAT);
const downbeats = beats.filter((_, i) => i % 4 === 0);
const sections = [
  { name: 'intro0', start: 0, end: 8, kind: 'intro', label: 'A', energy: 0.3, vocal: 0.3 },
  { name: 'verse1', start: 8, end: 24, kind: 'verse', label: 'B', energy: 0.5, vocal: 0.9 },
  { name: 'chorus2', start: 24, end: 40, kind: 'chorus', label: 'C', energy: 0.9, vocal: 0.9 },
  { name: 'instrumental3', start: 40, end: 52, kind: 'instrumental', label: 'D', energy: 0.7, vocal: 0 },
  { name: 'instrumental4', start: 52, end: 60, kind: 'instrumental', label: 'E', energy: 0.8, vocal: 0 },
  { name: 'verse5', start: 60, end: 72, kind: 'verse', label: 'B', energy: 0.3, vocal: 0.8 },
  { name: 'verse6', start: 72, end: 80, kind: 'verse', label: 'F', energy: 0.8, vocal: 0.6 },
  { name: 'outro7', start: 80, end: 88, kind: 'outro', label: 'A', energy: 0.25, vocal: 0.2 },
];
const n = DUR * FPS;
const env = (fn: (t: number) => number) => Array.from({ length: n }, (_, i) => +Math.max(0, Math.min(1, fn(i / FPS))).toFixed(4));
const secAt = (t: number) => sections.find((s) => t >= s.start && t < s.end) ?? sections[sections.length - 1]!;
const lines: { text: string; start: number; end: number; words: { w: string; start: number; end: number; conf: number }[] }[] = [];
const say = (text: string, start: number, step = 0.5) => {
  const ws = text.split(' ').map((w, i) => ({ w, start: start + i * step, end: start + i * step + step * 0.9, conf: 0.9 }));
  lines.push({ text, start: ws[0]!.start, end: ws[ws.length - 1]!.end, words: ws });
};
say('The signal bends before it breaks', 2.0);
say('Every light we followed fell in', 9.0);
say('사랑은 다시 빛을 삼킨다', 13.0, 0.75);
say('Hold the line until the sparks run out', 17.5);
say('WE ARE THE STORM', 24.5, 1.0);
say('GPU hearts at the speed of light', 29.0);
say('번개처럼 다시 너를 부른다', 33.5, 0.7);
say('Quiet words dissolve like smoke', 61.0, 0.7);
say('끝없이 흔들리는 목소리', 66.0, 0.8);
say('Strike the wire and let it burn', 72.5, 0.6);
say('Into the dark it goes', 81.0, 0.7);
const vocalOn = (t: number) => lines.some((l) => t >= l.start && t < l.end);
const audio = {
  duration: DUR, bpm: 120, fps: FPS, beats, downbeats, sections,
  features: {
    rms: env((t) => secAt(t).energy * (0.8 + 0.2 * Math.sin(t * 3))),
    low: env((t) => 0.5 + 0.5 * Math.cos(t * Math.PI * 4) ** 8),
    mid: env((t) => secAt(t).energy * 0.8),
    high: env((t) => 0.3 + 0.3 * Math.sin(t * 7)),
    vocal: env((t) => (vocalOn(t) ? 0.7 + 0.3 * Math.sin(t * 9) : 0)),
    drums: env((t) => secAt(t).energy),
    bass: env((t) => 0.4 + 0.4 * Math.sin(t * 1.3)),
    other: env((t) => 0.5),
  },
  onsets: {
    kick: beats.filter((b) => (b >= 8 && b < 60) || (b >= 72 && b < 80)).map((b) => [b, 0.9]),
    snare: beats.filter((b, i) => ((b >= 8 && b < 60) || (b >= 72 && b < 80)) && i % 2 === 1).map((b) => [b, 0.8]),
    hat: beats.filter((b) => (b >= 8 && b < 60) || (b >= 72 && b < 80)).map((b) => [b + 0.25, 0.5]),
    vocal: lines.flatMap((l) => l.words.map((w) => [w.start, 0.8])),
  },
  f0: Array.from({ length: n }, (_, i) => (vocalOn(i / FPS) ? +(60 + 7 * Math.sin(i / FPS * 1.7) + 3 * Math.sin(i / FPS * 5.1)).toFixed(2) : null)),
  instrumental: [[40, 60]], tail_end: 86.5,
};
writeFileSync(path.join(dir, 'audio.json'), JSON.stringify(audio));
writeFileSync(path.join(dir, 'lyrics.json'), JSON.stringify({ lines, language: 'mixed', source: 'fixture', gate: {} }));
const ff = Bun.spawnSync(['ffmpeg', '-y', '-v', 'error', '-f', 'lavfi', '-i', `sine=frequency=880:beep_factor=4:duration=${DUR}:sample_rate=44100`,
  '-ac', '2', '-c:a', 'pcm_f32le', path.join(dir, 'input.wav')]);
if (ff.exitCode !== 0) throw new Error(ff.stderr.toString());
console.log(dir);
