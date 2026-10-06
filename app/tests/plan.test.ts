import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { AudioData } from '../src/engine/audio';
import { Lyrics } from '../src/engine/lyrics';
import { plan, ARCHETYPES } from '../src/plan';
import { sung } from '../src/archetypes/_kit';

const dir = `${import.meta.dir}/../../tests/fixture-run`;
const au = new AudioData(JSON.parse(readFileSync(`${dir}/audio.json`, 'utf8')));
const ly = new Lyrics(JSON.parse(readFileSync(`${dir}/lyrics.json`, 'utf8')));

test('director: covers 0..duration gaplessly, cuts only on downbeats', () => {
  const p = plan(ly, au);
  expect(p[0]!.start).toBe(0);
  expect(p[p.length - 1]!.end).toBe(au.duration); // the reverb tail is never cut
  for (let i = 1; i < p.length; i++) {
    expect(p[i]!.start).toBe(p[i - 1]!.end);
    expect(au.downbeats.some((d) => Math.abs(d - p[i]!.start) < 1e-6)).toBe(true);
  }
});

test('director: deterministic, varied, no archetype twice in a row (except chorus slams)', () => {
  const a = plan(ly, au), b = plan(ly, au);
  expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  for (let i = 1; i < a.length; i++) if (a[i]!.archetype !== 'kinetic') expect(a[i]!.archetype).not.toBe(a[i - 1]!.archetype);
  const used = new Set(a.map((x) => x.archetype));
  expect([...used].sort()).toEqual([...ARCHETYPES].sort()); // the fixture is laid out to need all seven
  for (const u of used) expect(ARCHETYPES).toContain(u);
  expect(a.find((x) => x.section.startsWith('instrumental'))?.archetype).toBe('instrumental');
  expect(a.filter((x) => x.section.startsWith('chorus')).every((x) => x.archetype === 'kinetic')).toBe(true);
});

test('karaoke never runs ahead of the voice', () => {
  for (const w of ly.words) {
    expect(sung(w, w.start - 1e-3)).toBe(0);
    expect(sung(w, w.end)).toBe(1);
  }
});

test('camera rolls always end upright (lyrics never left upside down)', async () => {
  const { camera } = await import('../src/archetypes/_kit');
  const a = { rms: 0, low: 0, mid: 0, high: 0, vocal: 0, drums: 0, bass: 0, other: 0, kick: 0, snare: 0, hat: 0, vonset: 0 };
  for (const p of plan(ly, au)) {
    const f = (t: number) => ({ t, dt: 1 / 60, lt: t - p.start, p: 0, start: p.start, end: p.end, seeked: false, preroll: false,
      beat: 0, bar: 0, beatPhase: 0, barPhase: 0, a, under: null, tin: 1, tout: 0 });
    // the drift adds at most 0.035 rad; anything beyond that at the shot's end is a leftover roll
    expect(Math.cos(camera(f(p.end - 0.01), au, p.params.seed, p.params.energy).roll)).toBeGreaterThan(0.99);
  }
});

test('every cut has one hand-off state, shared by both sides', () => {
  const p = plan(ly, au);
  expect(p[0]!.params.in).toBeUndefined();
  expect(p[p.length - 1]!.params.out).toBeUndefined();
  for (let i = 1; i < p.length; i++) {
    expect(['flat', 'spark']).toContain(p[i]!.params.in);
    if (i > 1) expect(p[i]!.params.in).not.toBe(p[i - 1]!.params.in);   // no template: never the same hand-off twice running
    expect(p[i - 1]!.params.out).toBe(p[i]!.params.in);
  }
});

test('camera is continuous through every kick and downbeat (no doubled copies inside a shutter)', async () => {
  const { camera } = await import('../src/archetypes/_kit');
  const a = { rms: 0, low: 0, mid: 0, high: 0, vocal: 0, drums: 0, bass: 0, other: 0, kick: 0, snare: 0, hat: 0, vonset: 0 };
  for (const p of plan(ly, au)) {
    const fr = (t: number) => ({ t, dt: 1 / 60, lt: t - p.start, p: (t - p.start) / (p.end - p.start), start: p.start, end: p.end,
      seeked: false, preroll: false, beat: 0, bar: 0, beatPhase: 0, barPhase: 0, a, under: null, tin: 1, tout: 0 });
    const hits = [...au.downbeats, ...au.onsets.kick!.map((k) => k[0])].filter((t) => t > p.start + 0.3 && t < p.end - 0.3);
    const probes = [...hits.flatMap((t) => [t - 5e-5, t + 5e-5, t + 0.016]), ...Array.from({ length: 40 }, (_, i) => p.start + 0.3 + i * 0.0731).filter((t) => t < p.end - 0.3)];
    for (const t of probes) {
      const c0 = camera(fr(t), au, p.params.seed, p.params.energy, p.params), c1 = camera(fr(t + 1e-4), au, p.params.seed, p.params.energy, p.params);
      expect(Math.abs(c1.zoom - c0.zoom)).toBeLessThan(0.002);
      expect(Math.hypot(c1.x - c0.x, c1.y - c0.y)).toBeLessThan(0.5);
      expect(Math.abs(c1.roll - c0.roll)).toBeLessThan(0.003);
    }
  }
});
