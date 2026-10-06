// Pure audio-reactive archetype for stretches without lead vocal. A lattice of points is pushed by
// closed-form responses to the drum onsets instead of simulated particles:
//  - kick: an expanding ring wave A·exp(−|r − v·τ|/w)·e^{−λτ} from a seeded centre (the ring wave
//    particula defined but never called), plus the impulse response of its damped push
//    (be *= 0.95, v *= 0.98 per frame -> a two-exponential kernel)
//  - snare: a rotation impulse of the lattice, same kernel
//  - hat: seeded points flash (a stem gate)
// Summing the kernels over recent onsets makes every frame a function of t.
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { FSPass } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { LIN } from '../engine/palette';
import { sparkHead, sparkParticles } from '../scenes/_motifs';
import { camera, camFwd, endFade, hitPost, handoff, sparkAt, handoffState, sparkFlare } from './_kit';
import { clamp, ease, hash } from '../engine/util';

const GX = 41, GY = 24, SP = 48;   // bone dots on a 48 px grid (a dense dash grid moiréd and read as a visualiser)
const BG = /* glsl */ `
uniform float uTime, uBass, uBg;
uniform vec3 uRing;   // centre xy (px), age (s)
void main() {
  vec2 p = vec2(FRAG_PX.x, 1080.0 - FRAG_PX.y);
  // plain ink: the shockwave is shown by the dots it moves, not by concentric bands
  vec2 q = vUv - 0.5;
  vec3 col = C_GRAPHITE * 0.03 * uBass * (1.0 - dot(q, q)) * uBg;   // true black ground (critic: an 11-12 grey floor)
  fragColor = vec4(col, 1.0);
}`;

/** Response of the damped radial push to a unit kick at τ = 0 (per-frame 0.95 / 0.98 decays at 60 fps). */
const K = (tau: number) => {
  if (tau <= 0) return 0;
  const a = 3.08, b = 1.21; // -60 ln 0.95, -60 ln 0.98
  return ((1 - Math.exp(-a * tau)) / a - (1 - Math.exp(-b * tau)) / b) / (b - a) * 6;
};

export default class Instrumental extends Scene {
  private bg = new FSPass(BG, { uTime: { value: 0 }, uBass: { value: 0 }, uBg: { value: 1 }, uRing: { value: new THREE.Vector3() } });
  private lb = new LineBatch(GX * GY + 2000, { blend: 'add' });

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { audio: au, renderer, params } = this.ctx;
    const seed = params.seed ?? 1, energy = params.energy ?? 0.6;
    const cam = camera(f, au, seed, energy, params);
    const hs = handoffState(f, params);
    // kick origins alternate between the left and right thirds
    const centre = (k: number) => ({ x: (k % 2 ? 1280 : 640) + 160 * (hash(k, seed) - 0.5), y: 540 + 300 * (hash(k, seed + 1) - 0.5) });
    const kicks = au.events('kick', f.t - 2.5, f.t + 1e-6).map(([t0, s]) => ({ t0, s, k: au.onsetIndex('kick', t0), c: { x: 0, y: 0 } }));
    for (const kk of kicks) kk.c = centre(kk.k);
    const snares = au.events('snare', f.t - 3, f.t + 1e-6);
    let rot = 0;
    for (const [t0, s] of snares) rot += 0.35 * s * K(f.t - t0) * (au.onsetIndex('snare', t0) % 2 ? 1 : -1);
    const breathe = 1 + 0.04 * au.env('bass', f.t);
    const last = kicks[kicks.length - 1];
    const tilt = params.variant === 1;

    this.bg.u.uTime!.value = f.t;
    this.bg.u.uBass!.value = au.env('bass', f.t);
    this.bg.u.uBg!.value = hs.bg;
    const lc = last ? camFwd(cam, last.c.x, last.c.y) : { x: 960, y: 540 };
    (this.bg.u.uRing!.value as THREE.Vector3).set(lc.x, lc.y, last ? f.t - last.t0 : 9);
    this.bg.render(renderer, out);

    this.lb.clear();
    const hats = au.events('hat', f.t - 0.15, f.t + 1e-6).map(([t0, s]) => ({ t0, s, h: au.onsetIndex('hat', t0) }));
    const cr = Math.cos(rot), sr = Math.sin(rot);
    // the tilted plane runs past the frame edges and fades to black with depth (it used to end on screen)
    const rows = tilt ? GY + 18 : GY;
    for (let j = 0; j < rows; j++) for (let i = 0; i < GX; i++) {
      let x = 0 + i * SP, y = (tilt ? -420 : -12) + j * SP;
      let dx = 0, dy = 0, crest = 0;
      for (const kk of kicks) {
        const ex = x - kk.c.x, ey = y - kk.c.y, r = Math.hypot(ex, ey) + 1e-3, tau = f.t - kk.t0;
        const ring = Math.exp(-Math.abs(r - 900 * tau) / 50) * Math.exp(-1.6 * tau);
        // a 2-frame attack: at τ = 0 the ring sits on its centre and an instant push jumped the dots there
        const push = 40 * kk.s * clamp(tau / 0.033) * (ring + K(tau) * Math.exp(-r / 600));
        dx += (ex / r) * push; dy += (ey / r) * push; crest = Math.max(crest, ring * kk.s);
      }
      // a slow travelling swell runs through the lattice between kicks (it was nearly still for 33 s)
      const swell = Math.sin(0.011 * x - 1.7 * f.t + seed);
      dy += 12 * swell * (0.5 + au.env('bass', f.t));   // ~25 % of the grid spacing: visible between kicks
      dx += 4 * Math.sin(0.013 * y + 1.3 * f.t);
      const ox = (x - 960) * breathe, oy = (y - 540) * breathe;
      x = 960 + cr * ox - sr * oy + dx; y = 540 + sr * ox + cr * oy + dy;
      // the second instrumental block is shot down a 35° tilted plane (perspective), not head-on
      const proj = (X: number, Y: number) => {
        if (!tilt) return camFwd(cam, X, Y);
        const yy = (Y - 540) * Math.cos(0.61), z = -(Y - 540) * Math.sin(0.61), s = 1400 / Math.max(300, 1400 + z);
        return camFwd(cam, 960 + (X - 960) * s, 470 + yy * s);
      };
      // round dots at rest; only a dot the wave is pushing streaks (dashes everywhere read as a warp field)
      const p = proj(x, y), q = crest > 0.08 ? proj(x - dx * 0.25, y - dy * 0.25) : { x: p.x - 0.01, y: p.y };
      let gate = 0;
      for (const h of hats) if (hash(h.h, i * 97 + j) < 0.04) gate = Math.max(gate, h.s * clamp(1 - (f.t - h.t0) / 0.12));
      // resting dots are ground and leave first; dots the wave is pushing are figures and are pulled into the spark
      const depth = (tilt ? clamp(1 - Math.max(0, -(y - 540) * Math.sin(0.61)) / 700) : 1) * Math.max(hs.bg, clamp(crest * 4));
      const g = (0.32 + 0.35 * Math.max(0, swell) ** 4 + 1.8 * crest + 2.5 * gate) * depth;   // the swell's crest glows
      const col: [number, number, number] = [LIN.bone[0] * g, LIN.bone[1] * g, LIN.bone[2] * g];   // orange stays the spark's
      if (depth > 0.01) this.lb.seg2(q.x, q.y, p.x + 0.01, p.y, 3.4 + 2 * crest, col, clamp(0.5 + crest + gate) * depth);
    }
    // the spark leaps to each kick's centre, trailing sparks
    // the spark sets off 15 frames before each kick and lands exactly on it: its arrival IS the shockwave
    const kicksAll = au.onsets.kick ?? [];
    const at = (t: number) => {
      const k = au.onsetIndex('kick', t), next = kicksAll[k + 1];
      const c0 = k >= 0 ? centre(k) : { x: 960, y: 540 };
      if (!next || t < next[0] - 0.25) return sparkAt(f, t, camFwd(cam, c0.x, c0.y));
      const c1 = centre(k + 1), u = ease.inOutCubic(clamp((t - (next[0] - 0.25)) / 0.25));
      return sparkAt(f, t, camFwd(cam, c0.x + (c1.x - c0.x) * u, c0.y + (c1.y - c0.y) * u));
    };
    sparkParticles(this.lb, f.t, at, { rate: 70, seed, intensity: 0.9 });
    sparkHead(this.lb, at(f.t).x, at(f.t).y, f.t, (1 + 0.6 * f.a.kick) * sparkFlare(f, params));
    this.lb.render(renderer, out);
    return { ...hitPost(f, au, energy, { fade: endFade(f.t, au) }), ...handoff(f, out, params, renderer, this.ctx.comp) };
  }
}
