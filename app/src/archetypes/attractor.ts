// Chaos archetype: two Lorenz trajectories (σ=10, ρ=28, β=8/3, RK4) that start 1e-5 apart ride the
// attractor together and visibly part — sensitivity to initial conditions as a picture. Their heads
// advance with time plus the integral of the song's loudness (louder = faster), the camera orbits
// with the integral of the highs, and kicks send a pulse of light back along the trails.
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { FSPass, Layer2D, W, H } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { LIN, rgba } from '../engine/palette';
import { F, font } from '../engine/type';
import { sparkHead } from '../scenes/_motifs';
import { activeLine, camera, drawKaraoke, endFade, hitPost, handoff, compositeHot, sparkAt, handoffState, sparkFlare } from './_kit';
import { lorenz } from './_physics';
import { clamp, pulse } from '../engine/util';

const N = 40000, TRAIL = 2400, STEP = 2;
const BG = /* glsl */ `
uniform float uTime, uBg;
void main() {
  vec2 p = vec2(FRAG_PX.x, 1080.0 - FRAG_PX.y);
  float v = 1.0 - 0.55 * length((p - vec2(960.0, 540.0)) / vec2(1100.0, 800.0));
  float dust = smoothstep(0.55, 0.9, snoise(vec3(p * 0.006, uTime * 0.05)));
  fragColor = vec4(C_INK * (0.35 + 0.35 * v) * uBg, 1.0);   // no dust blobs (they read as grey bokeh)
}`;

export default class Attractor extends Scene {
  private bg = new FSPass(BG, { uTime: { value: 0 }, uBg: { value: 1 } });
  private text = new Layer2D();
  private lb3 = new LineBatch(TRAIL, { screen2D: false, blend: 'add' });
  private lb2 = new LineBatch(400, { blend: 'add' });
  private cam3 = new THREE.PerspectiveCamera(30, W / H, 0.5, 1e6);   // the hand-off pull backs the camera far away
  private a = new Float32Array(0);
  private b = new Float32Array(0);

  override init() {
    const s = this.ctx.params.seed ?? 1;
    const p0: [number, number, number] = [1 + (s % 7) * 0.1, 1, 1.05];
    this.a = lorenz(N, 0.004, p0);
    this.b = lorenz(N, 0.004, [p0[0], p0[1], p0[2] + 1e-4]);   // parts within a shot, not only near its end
  }

  private head(t: number) {
    const au = this.ctx.audio, s0 = this.ctx.start;
    return clamp(2500 + 380 * (t - s0) + 900 * (au.integral('rms', t) - au.integral('rms', s0)), TRAIL, N - 2);
  }

  private trail(P: Float32Array, h: number, hot: [number, number, number], cold: [number, number, number], width: number, kick: { age: number; s: number } | null) {
    const i1 = Math.floor(h);
    for (let i = i1; i > i1 - TRAIL; i -= STEP) {
      const j = Math.max(0, i - STEP), age = (i1 - i) / TRAIL, k = (1 - age) ** 1.6;
      const wave = kick ? kick.s * Math.exp(-((((i1 - i) - kick.age * 4000) / 180) ** 2)) * Math.exp(-kick.age * 2.5) : 0;
      const g = k * 1.4 + wave * 2.5;
      this.lb3.seg(P[j * 3]!, P[j * 3 + 1]!, P[j * 3 + 2]!, P[i * 3]!, P[i * 3 + 1]!, P[i * 3 + 2]!, width * (0.4 + 0.8 * k),
        (cold[0] + (hot[0] - cold[0]) * k) * g, (cold[1] + (hot[1] - cold[1]) * k) * g, (cold[2] + (hot[2] - cold[2]) * k) * g, Math.min(1, 0.25 + k));
    }
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { audio: au, lyrics, renderer, params } = this.ctx;
    const seed = params.seed ?? 1, energy = params.energy ?? 0.5;
    const cam = camera(f, au, seed, energy, params);
    const hs = handoffState(f, params);
    this.bg.u.uTime!.value = f.t;
    this.bg.u.uBg!.value = hs.bg;
    this.bg.render(renderer, out);

    // orbit: azimuth from time and the integral of the highs; the 2D camera's dive and roll carry over
    const az = 0.2 * f.t + 0.8 * au.integral('high', f.t) + seed, el = 0.32 + 0.22 * Math.sin(0.09 * f.t + seed);
    const dist = 118 / cam.zoom;
    this.cam3.position.set(Math.cos(az) * Math.cos(el) * dist, Math.sin(az) * Math.cos(el) * dist, 25 + Math.sin(el) * dist);
    this.cam3.up.set(0, 0, 1);
    this.cam3.lookAt(0, 0, 25);
    this.cam3.rotateZ(cam.roll);
    this.cam3.updateMatrixWorld();

    const h = this.head(f.t);
    const kk = au.lastOnset('kick', f.t);
    const kick = kk ? { age: f.t - kk[0], s: kk[1] } : null;
    this.lb3.clear();
    this.trail(this.b, h, [LIN.bone[0] * 1.3, LIN.bone[1] * 1.3, LIN.bone[2] * 1.3], LIN.graphite, 1.4, null);
    this.trail(this.a, h, [LIN.ember[0] * 2.2, LIN.ember[1] * 2.2, LIN.ember[2] * 2.2], LIN.blood, 2.2, kick);
    this.lb3.render(renderer, out, this.cam3);

    // the spark is trajectory A's head
    const i = Math.floor(h);
    const p = new THREE.Vector3(this.a[i * 3]!, this.a[i * 3 + 1]!, this.a[i * 3 + 2]!).project(this.cam3);
    this.lb2.clear();
    // always drawn (a head behind the camera falls back to the hand-off pixel): a missing spark read as a black frame
    const q = sparkAt(f, f.t, p.z < 1 ? { x: (p.x * 0.5 + 0.5) * W, y: (0.5 - p.y * 0.5) * H } : { x: 960, y: 540 });
    sparkHead(this.lb2, q.x, q.y, f.t, (0.9 + 0.5 * f.a.kick) * sparkFlare(f, params));
    this.lb2.render(renderer, out);

    const c = this.text.ctx;
    this.text.clear();
    const line = activeLine(lyrics, f.t);
    if (line) drawKaraoke(c, line, f.t, au, { x: 250, y: 940, size: 80, maxWidth: 1300 });
    compositeHot(renderer, this.text.upload(), out, 2.2, hs.style === 'spark' ? 1 - 0.985 * hs.k : 1);
    return { ...hitPost(f, au, energy, { fade: endFade(f.t, au) }), ...handoff(f, out, params, renderer, this.ctx.comp) };
  }
}
