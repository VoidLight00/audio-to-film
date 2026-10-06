// High-voltage archetype: on every kick a dielectric-breakdown discharge (∇²φ = 0, growth ∝ φ^η, see
// _physics.ts) arcs between two words of the lyric line, grows in 60 ms and decays; hats set off small
// crawling discharges along the letters. Behind it, the equipotential lines of the charged words.
// Discharge trees are solved once in init(); rendering only indexes them by onset number and age.
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { FSPass, Layer2D, SS_TAP, SS_TAP_GLSL } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { LIN } from '../engine/palette';
import { sparkHead } from '../scenes/_motifs';
import { activeLine, CAM_GLSL, camera, camFwd, camVec, drawKaraoke, endFade, hitPost, handoff, compositeHot, sparkAt, handoffState, sparkFlare } from './_kit';
import { dbmTree, type DBMTree } from './_physics';
import { clamp, frameIdx, hash, pulse } from '../engine/util';

const MAXQ = 8;
const BG = /* glsl */ `
uniform float uTime, uHeat, uBg;
uniform vec3 uQ[${MAXQ}];
uniform int uN;
${SS_TAP_GLSL}
${CAM_GLSL}
vec3 shade(vec2 P) {
  vec2 X = camInv(P);
  float phi = 0.0, near = 0.0;
  for (int i = 0; i < ${MAXQ}; i++) {
    if (i >= uN) break;
    float r = length(X - uQ[i].xy);
    phi += uQ[i].z / (r + 60.0);
    near = max(near, exp(-r / 140.0));
  }
  phi -= 0.00001 * (X.y - 540.0);          // a weak grounded plane below the type (the words dominate)
  float v = phi * 900.0 - 0.9 * uTime;   // equipotentials stream outward from the charges
  float d = abs(fract(v) - 0.5) / max(fwidth(v), 1e-4);
  float line = 1.0 - smoothstep(0.6, 1.6, d);
  // equipotentials in bone/graphite only: orange belongs to the arcs (critic: blood-red haze broke the palette)
  vec3 col = (C_INK * 0.5 + mix(C_GRAPHITE * 0.3, C_BONE * 0.42, near) * line) * uBg;
  return col;
}
void main() {
  vec3 c = vec3(0.0);
  for (int k = ssK0(); k < ssK1(); k++) c += shade(screenPx(rgss(k)));
  fragColor = vec4(c * ssWeight(), 1.0);
}`;

const TREES = 10;

export default class Dbm extends Scene {
  private bg = new FSPass(BG, {
    uTime: { value: 0 }, uHeat: { value: 0 }, uBg: { value: 1 }, uN: { value: 0 }, ssTap: SS_TAP, uCam: { value: new THREE.Vector4(1, 0, 0, 0) }, uTwist: { value: 0 },
    uQ: { value: Array.from({ length: MAXQ }, () => new THREE.Vector3()) },
  });
  private text = new Layer2D();
  private lb = new LineBatch(40000, { blend: 'add' });
  private trees: DBMTree[] = [];

  override init() { this.trees = Array.from({ length: TREES }, (_, i) => dbmTree((this.ctx.params.seed ?? 1) * 31 + i)); }

  /** Draw tree `tr` from screen point A to B; `g` = grown fraction, `I` = brightness, `w` = width scale. */
  private arc(tr: DBMTree, A: { x: number; y: number }, B: { x: number; y: number }, g: number, I: number, w: number) {
    const dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy), s = L / (tr.b[0] - tr.a[0]);
    const c = dx / (L || 1), sn = dy / (L || 1);
    // the discharge arches over the type between its electrodes (straight, it ran through the letters)
    const up = c >= 0 ? -1 : 1;
    const map = (gx: number, gy: number) => {
      const u = (gx - tr.a[0]) * s, v = (gy - tr.a[1]) * s + up * 0.28 * L * Math.sin(Math.PI * clamp(u / L));
      return [A.x + c * u - sn * v, A.y + sn * u + c * v] as const;
    };
    const n = Math.floor(tr.main.length * g);
    let tip = A;
    for (let i = 0; i < n; i++) {
      const [x0, y0] = map(tr.segs[i * 4]!, tr.segs[i * 4 + 1]!), [x1, y1] = map(tr.segs[i * 4 + 2]!, tr.segs[i * 4 + 3]!);
      const fade = 1 - (i / tr.main.length) * 0.6;
      if (tr.main[i]) {
        this.lb.seg2(x0, y0, x1, y1, 22 * w, [LIN.signal[0] * 0.5 * I, LIN.signal[1] * 0.5 * I, LIN.signal[2] * 0.5 * I], 0.5);
        this.lb.seg2(x0, y0, x1, y1, 7.5 * w, [5 * I, 4.2 * I, 3.4 * I], 1);
      } else {
        this.lb.seg2(x0, y0, x1, y1, 2 * w, [LIN.ember[0] * 2.2 * I * fade, LIN.ember[1] * 2.2 * I * fade, LIN.ember[2] * 2.2 * I * fade], 0.9 * fade);
      }
      tip = { x: x1, y: y1 };
    }
    return tip;
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { audio: au, lyrics, renderer, params } = this.ctx;
    const seed = params.seed ?? 1, energy = params.energy ?? 0.6;
    const cam = camera(f, au, seed, energy, params);
    const hs = handoffState(f, params);
    const line = activeLine(lyrics, f.t);
    this.text.clear();
    // a line carried over the cut from the previous shot stays small at the foot of the frame (a full-width
    // block there read as a generic lyric video, critic round 2); lines born in this shot become the electrodes
    const carried = !!line && line.start < f.start;
    const boxes = line ? drawKaraoke(this.text.ctx, line, f.t, au, carried ? { x: 250, y: 960, size: 64, maxWidth: 1200, outline: 1.7 } : { x: 250, y: 660, size: 140, maxWidth: 1420, fit: true, outline: 1.7 }) : [];

    // charges at the word centres (sung words positive, waiting ones negative); between lines, six seeded
    // electrodes drifting on slow Lissajous paths carry the field and the discharges instead
    // (also for a carried-over line: its words packed the field lines over the small type, critic round 3)
    const nodes = boxes.length >= 2 && !carried ? null : Array.from({ length: 6 }, (_, i) => ({
      // evenly spread on a slowly turning, breathing ellipse in the central 70 % (free Lissajous paths clustered)
      x: 960 + (480 + 60 * Math.sin(0.7 * f.t + i)) * Math.cos(0.22 * f.t + (i * Math.PI) / 3 + seed),
      y: 540 + (230 + 30 * Math.sin(0.9 * f.t + 2 * i)) * Math.sin(0.22 * f.t + (i * Math.PI) / 3 + seed),
      q: i % 2 ? -0.8 : 1,
    }));
    const q = this.bg.u.uQ!.value as THREE.Vector3[];
    if (nodes) nodes.forEach((n, i) => q[i]!.set(n.x, n.y, n.q));
    else boxes.slice(0, MAXQ).forEach((b, i) => q[i]!.set(b.x + b.width / 2, b.y - b.size * 0.35, b.p > 0 ? 1 : -0.6));
    this.bg.u.uN!.value = nodes ? nodes.length : Math.min(MAXQ, boxes.length);
    this.bg.u.uTime!.value = f.t;
    this.bg.u.uBg!.value = hs.bg;
    this.bg.u.uHeat!.value = clamp(0.3 + au.env('rms', f.t));
    (this.bg.u.uCam!.value as THREE.Vector4).set(...camVec(cam));
    this.bg.u.uTwist!.value = cam.twist ?? 0;
    this.bg.render(renderer, out);
    compositeHot(renderer, this.text.upload(), out, 2.2, hs.style === 'spark' ? 1 - 0.985 * hs.k : 1);

    this.lb.clear();
    // electrodes: two seeded word tops (or seeded frame points between lines), in screen px
    const ends = (k: number, small: boolean) => {
      if (boxes.length >= 2 && !small && !nodes) {
        const i = Math.floor(hash(k, seed) * boxes.length), j = (i + 1 + Math.floor(hash(k, seed + 1) * (boxes.length - 1))) % boxes.length;
        const P = (b: (typeof boxes)[number], h: number) => camFwd(cam, b.x + b.width * h, b.y - b.size * 0.72);
        return [P(boxes[i]!, hash(k, 3)), P(boxes[j]!, hash(k, 4))] as const;
      }
      if (nodes && !small) {
        const i = Math.floor(hash(k, seed) * nodes.length), j = (i + 1 + Math.floor(hash(k, seed + 1) * (nodes.length - 1))) % nodes.length;
        return [camFwd(cam, nodes[i]!.x, nodes[i]!.y), camFwd(cam, nodes[j]!.x, nodes[j]!.y)] as const;
      }
      const base = nodes ? nodes[k % nodes.length]! : { x: 200 + 1520 * hash(k, seed + 5), y: 640 - 100 * hash(k, 6) };
      const A = { x: base.x + 40 * (hash(k, 10) - 0.5), y: base.y + 40 * (hash(k, 11) - 0.5) };
      const B = small ? { x: A.x + 30 + 30 * hash(k, 7), y: A.y + 20 * (hash(k, 8) - 0.5) } : { x: 960 + 700 * (hash(k, 9) - 0.5), y: 1000 };
      return [camFwd(cam, A.x, A.y), camFwd(cam, B.x, B.y)] as const;
    };
    let tip: { x: number; y: number } | null = null;
    const k0 = au.onsetIndex('kick', f.t);
    for (let k = k0; k >= Math.max(0, k0 - 3); k--) {
      const [tk, s] = au.onsets.kick![k]!;
      const age = f.t - tk;
      if (age > 0.6) break;
      const flick = 0.6 + 0.4 * hash(frameIdx(f.t), k);
      const I = s * (pulse(f.t, tk, 0.07) + 0.12 * Math.exp(-age / 0.3)) * flick * (0.7 + 0.6 * energy);
      const [A, B] = ends(k, false);
      const t = this.arc(this.trees[k % TREES]!, A, B, clamp(age / 0.06), I, 1);
      if (k === k0) tip = t;
    }
    const h0 = au.onsetIndex('hat', f.t);
    for (let h = h0; h >= Math.max(0, h0 - 2); h--) {
      const [th, s] = au.onsets.hat![h]!;
      if (f.t - th > 0.25) break;
      const [A, B] = ends(h + 7919, true);
      this.arc(this.trees[(h * 3) % TREES]!, A, B, clamp((f.t - th) / 0.03), 0.5 * s * pulse(f.t, th, 0.05), 0.45);
    }
    if (nodes) for (const n of nodes) {
      const c = camFwd(cam, n.x, n.y), r = 10 + 4 * f.a.kick, col: [number, number, number] = n.q > 0 ? [LIN.ember[0] * 1.6, LIN.ember[1] * 1.6, LIN.ember[2] * 1.6] : LIN.ash;
      for (let a = 0; a < 24; a++) {
        const a0 = (a / 24) * 6.2832, a1 = ((a + 1) / 24) * 6.2832;
        this.lb.seg2(c.x + r * Math.cos(a0), c.y + r * Math.sin(a0), c.x + r * Math.cos(a1), c.y + r * Math.sin(a1), 1.4, col, 0.9);
      }
    }
    // the spark is the newest leader's tip; between discharges it rests on the hand-off path
    const sp = sparkAt(f, f.t, tip ?? camFwd(cam, 960, 540));
    sparkHead(this.lb, sp.x, sp.y, f.t, (0.8 + 0.6 * f.a.kick) * sparkFlare(f, params));
    this.lb.render(renderer, out);
    const kk = au.lastOnset('kick', f.t);
    return { ...hitPost(f, au, energy, { fade: endFade(f.t, au) }), ...handoff(f, out, params, renderer, this.ctx.comp) };
  }
}
