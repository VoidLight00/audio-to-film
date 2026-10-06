// The autonomous director's decisions, as a pure function of the analysis (audio.json, lyrics.json):
// sections -> shots of <= 8 bars cut on downbeats -> one physical archetype per shot, chosen from the
// shot's measured features. No Vite/browser APIs here, so tests can run it directly.
import type { Lyrics } from './engine/lyrics';
import type { AudioData, Section } from './engine/audio';
import { hash } from './engine/util';

export const ARCHETYPES = ['lens', 'curl', 'dbm', 'attractor', 'string', 'kinetic', 'instrumental'] as const;
export type Archetype = (typeof ARCHETYPES)[number];

interface Shot { start: number; end: number; sec: Section }
export interface ShotFeatures { energy: number; kickRate: number; pitchVar: number; vocal: number; lyricShare: number }

/** Sections split into shots of at most `maxBars` bars, every cut on a downbeat; short tails merge back. */
export function shots(au: AudioData, maxBars = 8): Shot[] {
  const out: Shot[] = [];
  const secs = au.sections.length ? au.sections : [{ name: 'all', start: 0, end: au.duration }];
  for (const sec of secs) {
    const inner = au.downbeats.filter((d) => d > sec.start + 0.05 && d < sec.end - 0.05);
    let s = sec.start;
    for (let i = maxBars - 1; i < inner.length; i += maxBars) {
      if (au.downbeats.filter((d) => d > inner[i]! && d < sec.end).length < 4) break; // leave >= 4 bars
      out.push({ start: s, end: inner[i]!, sec });
      s = inner[i]!;
    }
    out.push({ start: s, end: sec.end, sec });
  }
  out[0]!.start = 0;
  out[out.length - 1]!.end = au.duration; // the film runs to the end of the file: reverb tails are never cut
  return out.filter((x) => x.end - x.start > 0.05);
}

export function features(au: AudioData, ly: Lyrics, s: number, e: number): ShotFeatures {
  const dur = Math.max(0.1, e - s);
  const pitches: number[] = [];
  let voiced = 0, n = 0, rms = 0, lyr = 0;
  for (let t = s; t < e; t += 0.05, n++) {
    const p = au.pitch(t);
    if (p != null) { pitches.push(p); voiced++; }
    rms += au.env('rms', t);
    if (ly.lines.some((l) => t >= l.start && t < l.end)) lyr++;
  }
  const mean = pitches.reduce((a, b) => a + b, 0) / Math.max(1, pitches.length);
  const sd = Math.sqrt(pitches.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, pitches.length));
  return {
    energy: rms / Math.max(1, n),
    kickRate: au.events('kick', s, e).length / dur,
    pitchVar: pitches.length > 20 ? sd : 0,
    vocal: voiced / Math.max(1, n),
    lyricShare: lyr / Math.max(1, n),
  };
}

/** Features of a shot relative to the other shots of the same song (z-scores). */
export type Rel = Record<keyof ShotFeatures, number>;

function zscores(fs: ShotFeatures[]): Rel[] {
  const keys = Object.keys(fs[0] ?? {}) as (keyof ShotFeatures)[];
  const stat = Object.fromEntries(keys.map((k) => {
    const v = fs.map((f) => f[k]), m = v.reduce((a, b) => a + b, 0) / v.length;
    return [k, [m, Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length) || 1]];
  })) as Record<keyof ShotFeatures, [number, number]>;
  return fs.map((f) => Object.fromEntries(keys.map((k) => [k, (f[k] - stat[k][0]) / stat[k][1]])) as Rel);
}

/**
 * Candidate archetypes for a shot, best first. Structural roles decide first (bookends, chorus,
 * instrumental); verses are scored on features RELATIVE to the rest of the song, minus a penalty for
 * every earlier use, so a steady four-on-the-floor song does not get the same plate every verse.
 */
export function candidates(sec: Section, f: ShotFeatures, z: Rel, i: number, n: number, uses: Record<string, number>): Archetype[] {
  // no line passed the lyric gate here: a typographic plate would show nothing (or a bar counter)
  if (f.lyricShare < 0.1) return sec.kind === 'chorus' ? ['dbm', 'instrumental', 'attractor'] : ['instrumental', 'attractor', 'dbm'];
  if (i === 0 || sec.kind === 'intro') return ['lens', 'curl'];
  if (i === n - 1 || sec.kind === 'outro') return ['lens', 'attractor'];
  // the kinetic plate fills the frame with the sung word: only where words fill the shot
  if (sec.kind === 'chorus') return f.lyricShare >= 0.35 ? ['kinetic', 'dbm'] : ['dbm', 'instrumental', 'attractor'];
  const score: [Archetype, number][] = [
    ['dbm', z.kickRate + z.energy],
    ['string', z.pitchVar + z.vocal],
    ['curl', 0.4 + 0.5 * z.lyricShare - 0.5 * z.energy],
    ['attractor', 0.5 * z.energy - z.vocal],
  ];
  return score.map(([a, v]) => [a, v - 1.2 * (uses[a] ?? 0)] as [Archetype, number]).sort((a, b) => b[1] - a[1]).map(([a]) => a);
}

const CUTS = ['spark', 'flat'] as const;
/** Hand-off state of the cut that starts shot i: spark absorption and CRT flatline, alternating. */
export const cutStyle = (i: number) => CUTS[i % CUTS.length]!;

export interface PlanEntry { archetype: Archetype; start: number; end: number; section: string; features: ShotFeatures; params: Record<string, any> }

export function plan(ly: Lyrics, au: AudioData): PlanEntry[] {
  const sh = shots(au);
  const fs = sh.map((x) => features(au, ly, x.start, x.end));
  const zs = zscores(fs);
  const uses: Record<string, number> = {};
  const out: PlanEntry[] = [];
  sh.forEach((x, i) => {
    const prev = out[out.length - 1]?.archetype;
    const cand = candidates(x.sec, fs[i]!, zs[i]!, i, sh.length, uses);
    // no archetype twice in a row, except a chorus that keeps its slam (as a different variant)
    const a = cand.find((c) => c !== prev || c === 'kinetic') ?? cand[0]!;
    const k = (uses[a] = (uses[a] ?? 0) + 1) - 1;
    out.push({
      archetype: a, start: x.start, end: x.end, section: x.sec.name, features: fs[i]!,
      params: {
        seed: Math.floor(hash(i, 991) * 1e6), energy: Math.min(1, fs[i]!.energy * 1.4), n: k, variant: k % 2,
        bookend: i === 0 ? 'in' : i === sh.length - 1 ? 'out' : '',
        // the hand-off state of the cut before / after this shot (both sides of a cut share it)
        in: i > 0 ? cutStyle(i) : undefined, out: i < sh.length - 1 ? cutStyle(i + 1) : undefined,
      },
    });
  });
  return out;
}
