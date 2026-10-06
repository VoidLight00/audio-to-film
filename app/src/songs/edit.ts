// Anchor helpers for authored songs (timeline.ts and plates). Every big event is a *named* time: a lyric
// word/syllable start or a beat/downbeat, never an audio-feature threshold and never a hard-coded second
// (pdoom-video timeline.ts and its scene helpers; docs/research/PDOOM_CRAFT_CATALOG.md §5.3).
// Lines are found by content (Lyrics.get throws when a line is missing: fail loudly while authoring).
import type { Lyrics, Line, Word } from '../engine/lyrics';
import type { AudioData } from '../engine/audio';

/** Inverted anchor spans found while building plates (pdoom fuse.ts:521 shipped one). Gate E5 reads this. */
export const anchorIssues: string[] = [];

/** A [a, b] window used for prog()/keys(); records an issue instead of silently clamping when b <= a. */
export function span(label: string, a: number, b: number): [number, number] {
  if (!(b > a)) anchorIssues.push(`${label}: [${a.toFixed(3)}, ${b.toFixed(3)}] is empty or inverted`);
  return [a, b];
}

export function edit(ly: Lyrics, au: AudioData) {
  const beatBefore = (t: number) => au.timeOfBeat(Math.floor(au.beatAt(t) + 1e-6));
  const beatAfter = (t: number) => au.timeOfBeat(Math.ceil(au.beatAt(t) - 1e-6));
  const downAfter = (t: number) => au.downbeats.find((d) => d >= t - 1e-6) ?? beatAfter(t);
  const downBefore = (t: number) => au.lastDownbeat(t + 1e-6);
  const nearestDown = (t: number) =>
    au.downbeats.reduce((b, d) => (Math.abs(d - t) < Math.abs(b - t) ? d : b), au.downbeats[0] ?? t);
  const line = (q: string, nth = 0): Line => ly.get(q, nth);
  const word = (q: string, i: number, nth = 0): Word => {
    const w = line(q, nth).words[i < 0 ? line(q, nth).words.length + i : i];
    if (!w) throw new Error(`word ${i} not in line "${q}"`);
    return w;
  };
  return {
    beatBefore, beatAfter, downAfter, downBefore, nearestDown, line, word,
    /** Plate boundary: the last beat at/before the first word of the line (never after the word). */
    cut: (q: string, nth = 0, tol = 0.02) => beatBefore(line(q, nth).words[0]!.start + tol),
    /** Nearest downbeat to the end of a line. */
    after: (q: string, nth = 0) => nearestDown(line(q, nth).end),
    /** Snap to the nearest beat when within tol seconds, else keep t. */
    snap: (t: number, tol = 0.1) => (Math.abs(au.nearestBeat(t) - t) < tol ? au.nearestBeat(t) : t),
    /** Big reframe: the downbeat inside [lo, hi] nearest to t, else the nearest beat inside, else t. */
    pick: (t: number, lo: number, hi: number) => {
      const inside = (x: number) => x >= lo && x <= hi;
      const d = au.downbeats.filter(inside).sort((a, b) => Math.abs(a - t) - Math.abs(b - t))[0];
      if (d !== undefined) return d;
      const b = au.nearestBeat(t);
      return inside(b) ? b : t;
    },
    /** Beat i (fractional allowed: +0.5 = the next eighth) counted from the beat at/before t. */
    beatFrom: (t: number, i: number) => au.timeOfBeat(Math.floor(au.beatAt(t) + 1e-6) + i),
    /** Beat times strictly inside (a, b): to hit every beat of a held note or a plate. */
    beatsIn: (a: number, b: number) => {
      const out: number[] = [];
      for (let i = Math.ceil(au.beatAt(a) + 1e-6); au.timeOfBeat(i) < b - 1e-6; i++) out.push(au.timeOfBeat(i));
      return out;
    },
    /** Syllable starts of a word (its own start when unsyllabified). */
    syllables: (w: Word) => (w.syl && w.syl.length ? w.syl.map((s) => s[0]) : [w.start]),
    section: (name: string) => {
      const s = au.sections.find((x) => x.name === name);
      if (!s) throw new Error(`section ${name} not in audio.json`);
      return s;
    },
  };
}

export type Edit = ReturnType<typeof edit>;
