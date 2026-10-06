// Pitch archetype: five strings fixed at both ends. The sung pitch (lead-vocal f0) picks the standing
// mode sin(mπx) the strings vibrate in — higher notes, more nodes — with amplitude from the vocal
// envelope; every vocal onset plucks the middle string at the word's position and the pulse travels
// and reflects with d'Alembert's solution (_physics.pluck). The lyric words ride the middle string.
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { FSPass, Layer2D } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { LIN, rgba } from '../engine/palette';
import { F, font } from '../engine/type';
import { sparkHead, sparkParticles } from '../scenes/_motifs';
import { activeLine, camera, camFwd, endFade, hitPost, morphText, morphWidth, sung, wordStyle, handoff, compositeHot, drawWord, sparkAt, morphGlyph, handoffState, sparkFlare } from './_kit';
import { curveAt, modeCurves, pluck } from './_physics';
import { clamp, ease, TAU } from '../engine/util';

const X0 = 140, X1 = 1780, L = X1 - X0, YS = [240, 390, 540, 690, 840], MID = 2, PTS = 260;   // 14 % of the height apart: the strings fill the frame
const BG = /* glsl */ `
uniform float uTime, uMode, uBg;
void main() {
  vec2 p = vec2(FRAG_PX.x, 1080.0 - FRAG_PX.y);
  float x = clamp((p.x - 140.0) / 1640.0, 0.0, 1.0);
  // faint nodal planes of the current mode, and paper-dark ground
  float node = abs(sin(uMode * 3.14159265 * x));
  float w = fwidth(node) * 1.5;
  float inside = step(150.0, p.x) * step(p.x, 1770.0);  // nodes only between the fixed ends
  float mark = inside * (1.0 - smoothstep(0.0, w + 0.004, node)) * smoothstep(160.0, 220.0, p.y) * (1.0 - smoothstep(860.0, 920.0, p.y));
  vec3 col = (C_INK * 0.5 + C_GRAPHITE * 0.28 * mark) * uBg;   // no grey noise: it blocked up under compression
  fragColor = vec4(col, 1.0);
}`;

export default class StringPlate extends Scene {
  private bg = new FSPass(BG, { uTime: { value: 0 }, uMode: { value: 1 }, uBg: { value: 1 } });
  private text = new Layer2D();
  private lb = new LineBatch(PTS * YS.length + 3000, { blend: 'add' });

  private curves = modeCurves(() => null, 0, 1);

  /** Mode and phase curves for this shot (see _physics.modeCurves: continuous, phase integrated). */
  override init() { this.curves = modeCurves((t) => this.ctx.audio.pitch(t), this.ctx.start - 1, this.ctx.end + 1); }

  private mode(t: number) { return curveAt(this.curves, this.curves.mode, t); }
  private phase(t: number) { return curveAt(this.curves, this.curves.phase, t); }

  /** Displacement (px) of string s at x in 0..1. */
  private y(s: number, x: number, t: number, plucks: { x0: number; t0: number; a: number }[]) {
    const au = this.ctx.audio;
    const m = this.mode(t), mi = Math.floor(m), mf = m - mi;
    const A = (7 + 30 * au.env('vocal', t)) * (s === MID ? 1 : 0.5 + 0.12 * Math.abs(s - MID)); // never quite still
    const ph = s * 1.3;
    // blend neighbouring modes so a gliding pitch morphs the shape instead of snapping
    const shape = (1 - mf) * Math.sin(mi * Math.PI * x) + mf * Math.sin((mi + 1) * Math.PI * x);
    // plus a travelling ripple driven by the bass, so the strings are never quite at rest between phrases
    let y = A * shape * Math.cos(this.phase(t) + ph) + (6 + 10 * au.env('bass', t)) * Math.sin(TAU * (2.5 * x - 0.9 * t) + ph) * Math.sin(Math.PI * x);
    for (const p of plucks) y += p.a * (s === MID ? 1 : 0.35) * pluck(x, t - p.t0, p.x0, 0.7, 0.085);
    return y;
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { audio: au, lyrics, renderer, params } = this.ctx;
    const seed = params.seed ?? 1, energy = params.energy ?? 0.5;
    // a slow push-in on the staff over the shot (the camera read as locked off)
    const cam0 = camera(f, au, seed, energy, params), cam = { ...cam0, zoom: cam0.zoom * (1 + 0.2 * ease.inOutCubic(clamp(f.p))) };
    this.bg.u.uTime!.value = f.t;
    this.bg.u.uMode!.value = this.mode(f.t);
    this.bg.u.uBg!.value = handoffState(f, params).bg;
    this.bg.render(renderer, out);

    // word layout along the middle string; plucks happen where (and when) each word starts
    const line = activeLine(lyrics, f.t);
    const size = 84;
    const words = line ? line.words.map((w) => ({ w, st: wordStyle(w, f.t, au) })) : [];
    const widths = words.map(({ w, st }) => morphWidth(w.w, st.width, st.weight, size));
    const total = widths.reduce((a, b) => a + b, 0) + 26 * Math.max(0, words.length - 1);
    const k = Math.min(1, 1180 / Math.max(1, total));   // 250 px margins even at the end of the 1.2x push-in
    let wx = 960 - (total * k) / 2;
    const placed = words.map(({ w, st }, i) => { const r = { w, st, x: wx, width: widths[i]! * k }; wx += (widths[i]! + 26) * k; return r; });
    // include onsets up to 60 ms ahead: the string is pulled before it is released (no jump at the onset)
    const plucks = placed.filter((p) => f.t >= p.w.start - 0.06 && f.t - p.w.start < 3)
      .map((p) => ({ x0: clamp((p.x + p.width / 2 - X0) / L, 0.05, 0.95), t0: p.w.start, a: 42 }));
    for (const [t0, s] of au.events('vocal', f.t - 3, f.t + 0.06))
      if (!plucks.some((p) => Math.abs(p.t0 - t0) < 0.08)) plucks.push({ x0: 0.2 + 0.6 * ((t0 * 7.13) % 1), t0, a: 28 * s });

    this.lb.clear();
    for (let s = 0; s < YS.length; s++) {
      const pts = [];
      for (let i = 0; i <= PTS; i++) {
        const x = i / PTS, p = camFwd(cam, X0 + x * L, YS[s]! + this.y(s, x, f.t, plucks));
        pts.push(p);
      }
      const hot = s === MID ? clamp(au.env('vocal', f.t) * 1.5) : 0;
      const col: [number, number, number] = [LIN.bone[0] * (0.95 + 1.6 * hot), LIN.bone[1] * (0.9 + 0.4 * hot), LIN.bone[2] * (0.85 + 0.1 * hot)];
      this.lb.polyline(pts, s === MID ? 2.6 : 1.7, col, s === MID ? 1 : 0.85);
    }
    // the spark is the karaoke cursor: the sung edge of the current word, on the string
    const cur = line ? placed.find((p) => f.t < p.w.end + 0.05) ?? placed[placed.length - 1] : undefined;
    const at = (t: number) => {
      const x = cur ? cur.x + cur.width * sung(cur.w, t) : 960 + 600 * Math.sin(0.3 * t + seed);
      const xm = clamp((x - X0) / L, 0, 1);
      return sparkAt(f, t, camFwd(cam, x, YS[MID]! + this.y(MID, xm, t, plucks) - 6));
    };
    sparkParticles(this.lb, f.t, at, { rate: 60, seed, intensity: 0.8 });
    const sp = at(f.t);
    sparkHead(this.lb, sp.x, sp.y, f.t, (0.8 + 0.4 * f.a.kick) * sparkFlare(f, params));
    this.lb.render(renderer, out);

    // every glyph sits on the middle string: its baseline is the string's curve and it tilts with the local
    // slope; an ink knockout under each glyph keeps the string from cutting through the letter
    const c = this.text.ctx;
    this.text.clear();
    const yAt = (xm: number) => YS[MID]! - 14 + this.y(MID, clamp(xm, 0, 1), f.t, plucks);
    const appear = line ? clamp((f.t - (line.start - 0.3)) / 0.3) : 0;
    for (const p of placed) {
      const chars = Array.from(p.w.w), n = chars.length, dur = Math.max(0.05, p.w.end - p.w.start);
      let gx = p.x;
      chars.forEach((ch, i) => {
        const adv = morphGlyph(ch, p.st.width, p.st.weight).adv * size * k;
        const xm = (gx + adv / 2 - X0) / L;
        const slope = (yAt(xm + 0.004) - yAt(xm - 0.004)) / (0.008 * L);
        const q = camFwd(cam, gx, yAt(xm));
        c.save();
        c.translate(q.x, q.y);
        c.rotate(cam.roll + Math.atan(slope));
        c.scale(cam.zoom, cam.zoom);
        const { path } = morphText(ch, p.st.width, p.st.weight, size * k, 0, 0);
        c.lineJoin = 'round';
        c.lineWidth = 12;
        c.strokeStyle = rgba('ink', 0.92 * appear);
        c.stroke(path);
        drawWord(c, { ...p.w, w: ch, start: p.w.start + (dur * i) / n, end: p.w.start + (dur * (i + 1)) / n }, f.t, line!.start, 0, 0, size * k, p.st);
        c.restore();
        gx += adv;
      });
    }
    compositeHot(renderer, this.text.upload(), out);
    // no chromatic aberration on the hairline strings (it fringed them blue)
    return { ...hitPost(f, au, energy, { fade: endFade(f.t, au), ca: 0 }), ...handoff(f, out, params, renderer, this.ctx.comp) };
  }
}
