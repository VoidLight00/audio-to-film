// Precomputed physics, pure functions of a seed: computed once in a scene's init(), then only indexed
// by song time while rendering (so every frame stays a function of t).
import { mulberry32 } from '../engine/util';

export interface DBMTree {
  /** segments in grid units: [x0, y0, x1, y1] per node (parent -> node), in growth order */
  segs: Float32Array;
  /** per segment: 1 on the main channel (root -> the node that reached the target), else 0 */
  main: Uint8Array;
  nx: number; ny: number;
  /** electrode A (root) and B (target centre) in grid units */
  a: [number, number]; b: [number, number];
}

/**
 * Dielectric breakdown model (Niemeyer–Pietronero–Wiesmann): solve ∇²φ = 0 on a grid with φ = 0 on
 * the discharge and φ = 1 on the target electrode, then grow one perimeter site with probability
 * ∝ φ^η; repeat until the discharge touches the target. Neumann (mirror) outer boundary.
 * A warm-started SOR sweep per step is enough because the field changes locally.
 */
export function dbmTree(seed: number, nx = 72, ny = 40, eta = 2.4, maxSteps = 900): DBMTree {
  const rnd = mulberry32(seed);
  const N = nx * ny, id = (x: number, y: number) => y * nx + x;
  const phi = new Float32Array(N), state = new Uint8Array(N); // 0 free, 1 discharge, 2 target
  const parent = new Int32Array(N).fill(-1);
  const a: [number, number] = [2, ny >> 1], b: [number, number] = [nx - 4, ny >> 1];
  for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
    const i = id(x, y);
    phi[i] = x / (nx - 1);
    if ((x - b[0]) ** 2 + (y - b[1]) ** 2 <= 4) { state[i] = 2; phi[i] = 1; }
  }
  state[id(a[0], a[1])] = 1; phi[id(a[0], a[1])] = 0;
  const order: number[] = [id(a[0], a[1])];
  const relax = (iters: number) => {
    for (let it = 0; it < iters; it++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
      const i = id(x, y);
      if (state[i]) continue;
      const l = phi[id(x > 0 ? x - 1 : 1, y)]!, r = phi[id(x < nx - 1 ? x + 1 : nx - 2, y)]!;
      const u = phi[id(x, y > 0 ? y - 1 : 1)]!, d = phi[id(x, y < ny - 1 ? y + 1 : ny - 2)]!;
      phi[i] = phi[i]! + 1.85 * ((l + r + u + d) * 0.25 - phi[i]!);
    }
  };
  relax(120);
  let hit = -1;
  for (let step = 0; step < maxSteps && hit < 0; step++) {
    relax(6);
    const cand: number[] = [], par: number[] = [], w: number[] = [];
    let sum = 0;
    for (const c of order) {
      const cx = c % nx, cy = (c / nx) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const x = cx + dx, y = cy + dy;
        if ((!dx && !dy) || x < 0 || y < 0 || x >= nx || y >= ny) continue;
        const j = id(x, y);
        if (state[j] === 1) continue;
        const p = Math.pow(Math.max(phi[j]!, 0), eta) * (dx && dy ? 0.7 : 1);
        cand.push(j); par.push(c); w.push(p); sum += p;
      }
    }
    if (!(sum > 0)) break;
    let r = rnd() * sum, k = 0;
    while (k < w.length - 1 && (r -= w[k]!) > 0) k++;
    const j = cand[k]!;
    if (state[j] === 2) { hit = par[k]!; break; }
    state[j] = 1; phi[j] = 0; parent[j] = par[k]!;
    order.push(j);
  }
  const onMain = new Set<number>();
  for (let c = hit >= 0 ? hit : order[order.length - 1]!; c >= 0; c = parent[c]!) onMain.add(c);
  const segs = new Float32Array((order.length - 1) * 4), main = new Uint8Array(order.length - 1);
  for (let k = 1; k < order.length; k++) {
    const c = order[k]!, p = parent[c]!;
    segs.set([p % nx, (p / nx) | 0, c % nx, (c / nx) | 0], (k - 1) * 4);
    main[k - 1] = onMain.has(c) && onMain.has(p) ? 1 : 0;
  }
  return { segs, main, nx, ny, a, b };
}

/** Lorenz system (σ, ρ, β) integrated with classical RK4 from `p0`: n points as x,y,z triples. */
export function lorenz(n: number, dt = 0.004, p0: [number, number, number] = [1, 1, 1.05], sigma = 10, rho = 28, beta = 8 / 3) {
  const out = new Float32Array(n * 3);
  let [x, y, z] = p0;
  const f = (x: number, y: number, z: number): [number, number, number] => [sigma * (y - x), x * (rho - z) - y, x * y - beta * z];
  for (let i = 0; i < n; i++) {
    out[i * 3] = x; out[i * 3 + 1] = y; out[i * 3 + 2] = z;
    const k1 = f(x, y, z);
    const k2 = f(x + 0.5 * dt * k1[0], y + 0.5 * dt * k1[1], z + 0.5 * dt * k1[2]);
    const k3 = f(x + 0.5 * dt * k2[0], y + 0.5 * dt * k2[1], z + 0.5 * dt * k2[2]);
    const k4 = f(x + dt * k3[0], y + dt * k3[1], z + dt * k3[2]);
    x += (dt / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
    y += (dt / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
    z += (dt / 6) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]);
  }
  return out;
}

/**
 * Plucked string with fixed ends (d'Alembert): y(x,τ) = ½[G(x − cτ) + G(x + cτ)] e^{−λτ}, where G is
 * the odd 2-periodic extension of the initial pluck shape (a narrow bump at x0). x in 0..1.
 */
export function pluck(x: number, tau: number, x0: number, c = 0.7, width = 0.045, lambda = 1.6) {
  const g = (u: number) => Math.exp(-(((u - x0) / width) ** 2)) - Math.exp(-(((u + x0) / width) ** 2));
  // the finger pulls the string over the 60 ms before the release, so y(x, t) has no jump at the onset
  // (an instant pluck drew two copies of the string inside one motion-blurred frame)
  if (tau < 0) { const k = Math.min(1, Math.max(0, (tau + 0.06) / 0.06)); return g(x) * k * k * (3 - 2 * k); }
  const G = (u: number) => { const v = ((u % 2) + 2) % 2; return v <= 1 ? g(v) : -g(2 - v); };
  return 0.5 * (G(x - c * tau) + G(x + c * tau)) * Math.exp(-lambda * tau);
}

/**
 * Vibration mode and phase curves for the pitch archetype at 100 fps over [t0, t1]: the mode follows the sung
 * pitch (one node per 5 semitones above A3, 1..6), unvoiced frames hold the last voiced pitch, smoothed over
 * 0.15 s; the phase is the running integral of the visual frequency 1.4 + 0.25·mode Hz (never f(t)·t, which
 * chirps at t·df/dt). Sample both with `curveAt`.
 */
export function modeCurves(pitch: (t: number) => number | null, t0: number, t1: number, fps = 100) {
  const n = Math.ceil((t1 - t0) * fps) + 2;
  const raw = new Float32Array(n);
  let held = 57;
  for (let i = 0; i < n; i++) {
    const p = pitch(t0 + i / fps);
    if (p != null) held = p;
    raw[i] = Math.min(6, Math.max(1, 1 + (held - 57) / 5));
  }
  const w = 15, mode = new Float32Array(n), phase = new Float64Array(n);
  let acc = 0;
  for (let i = 0; i < n; i++) {
    acc += raw[i]!;
    if (i >= w) acc -= raw[i - w]!;
    mode[i] = acc / Math.min(i + 1, w);
    if (i > 0) phase[i] = phase[i - 1]! + (2 * Math.PI * (1.4 + 0.25 * mode[i]!)) / fps;
  }
  return { t0, fps, mode, phase };
}

/** Linear interpolation of a curve from modeCurves at time t (clamped to its span). */
export function curveAt(c: { t0: number; fps: number }, arr: ArrayLike<number>, t: number) {
  const x = (t - c.t0) * c.fps, i = Math.max(0, Math.min(arr.length - 2, Math.floor(x))), k = Math.min(1, Math.max(0, x - i));
  return arr[i]! * (1 - k) + arr[i + 1]! * k;
}
