import { expect, test } from 'bun:test';
import { dbmTree, lorenz, pluck } from '../src/archetypes/_physics';

test('DBM: deterministic per seed, grows from A and reaches the target electrode', () => {
  const a = dbmTree(7), b = dbmTree(7), c = dbmTree(8);
  expect(Array.from(a.segs)).toEqual(Array.from(b.segs));
  expect(Array.from(a.segs)).not.toEqual(Array.from(c.segs));
  const n = a.main.length;
  expect(n).toBeGreaterThan(40);
  const mainIdx = [...a.main.keys()].filter((i) => a.main[i]);
  expect(mainIdx.length).toBeGreaterThan(20);
  const reach = Math.max(...mainIdx.map((i) => a.segs[i * 4 + 2]!));
  expect(reach).toBeGreaterThanOrEqual(a.b[0] - 4); // the main channel spans the gap to B
  // every segment joins 8-neighbours
  for (let i = 0; i < n; i++) expect(Math.max(Math.abs(a.segs[i * 4 + 2]! - a.segs[i * 4]!), Math.abs(a.segs[i * 4 + 3]! - a.segs[i * 4 + 1]!))).toBe(1);
});

test('Lorenz: bounded on the attractor and sensitive to initial conditions', () => {
  const p = lorenz(20000), q = lorenz(20000, 0.004, [1, 1, 1.05 + 1e-6]);
  for (let i = 0; i < 20000; i++) { expect(Math.abs(p[i * 3]!)).toBeLessThan(30); expect(p[i * 3 + 2]!).toBeLessThan(60); }
  const d = (i: number) => Math.hypot(p[i * 3]! - q[i * 3]!, p[i * 3 + 1]! - q[i * 3 + 1]!, p[i * 3 + 2]! - q[i * 3 + 2]!);
  expect(d(100)).toBeLessThan(1e-3);
  expect(d(19999)).toBeGreaterThan(1);
});

test('pluck: fixed ends stay at rest, the pulse travels and decays', () => {
  for (const tau of [0, 0.3, 1.1, 2.9]) { expect(Math.abs(pluck(0, tau, 0.3))).toBeLessThan(1e-6); expect(Math.abs(pluck(1, tau, 0.3))).toBeLessThan(1e-3); }
  expect(pluck(0.3, 0, 0.3)).toBeGreaterThan(0.9);
  expect(Math.abs(pluck(0.3, 0.3, 0.3))).toBeLessThan(0.2);        // left the pluck point
  expect(pluck(0.3 + 0.7 * 0.3, 0.3, 0.3)).toBeGreaterThan(0.2);   // ... travelling at c
  expect(pluck(0.5, -1, 0.3)).toBe(0);
  for (const x of [0.25, 0.3, 0.4]) expect(Math.abs(pluck(x, -1e-5, 0.3) - pluck(x, 1e-5, 0.3))).toBeLessThan(1e-3); // continuous at the release
});

test('string phase is an integral: instantaneous frequency stays within the visual band', async () => {
  const { modeCurves, curveAt } = await import('../src/archetypes/_physics');
  // a pitch that jumps an octave and drops out (voicing edges): the worst case for the mode curve
  const pitch = (t: number) => (Math.floor(t * 3) % 4 === 3 ? null : 50 + 12 * (Math.floor(t * 3) % 2));
  const c = modeCurves(pitch, 40, 60);
  for (let t = 41; t < 59; t += 0.0137) {
    const f = (curveAt(c, c.phase, t + 1e-3) - curveAt(c, c.phase, t)) / 1e-3 / (2 * Math.PI);
    expect(f).toBeGreaterThan(1.4 - 1e-6);
    expect(f).toBeLessThan(2.9 + 1e-3);   // 1.4 + 0.25·6 Hz
  }
  // the old form cos(2π·f(t)·t) would chirp far outside the band at t ≈ 47 s
  const old = (t: number) => (1.4 + 0.25 * curveAt(c, c.mode, t)) * t;
  const worst = Math.max(...Array.from({ length: 2000 }, (_, i) => 41 + i * 0.009).map((t) => Math.abs(old(t + 1e-3) - old(t)) / 1e-3));
  expect(worst).toBeGreaterThan(10);
});
