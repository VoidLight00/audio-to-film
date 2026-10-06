// Chorus archetype: kinetic type over a ray-marched field. The background is an infinite lattice of
// rounded boxes (SDF domain repetition) the camera crash-dollies through — depth from time plus the
// integral of loudness, rim light on kicks. In front, the word being sung slams in full-screen with
// continuous width/weight morphing (held notes stretch, loud notes thicken); kicks duplicate it into a
// lattice of ghost copies that spreads and rolls. Variant 1 inverts to bone paper with ink.
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { FSPass, Layer2D, SS_TAP, SS_TAP_GLSL } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { HEX, rgba } from '../engine/palette';
import { F, font } from '../engine/type';
import { sparkHead, sparkParticles } from '../scenes/_motifs';
import { activeLine, camera, drawKaraoke, endFade, hitPost, morphText, sung, wordStyle, handoff, compositeHot, mixCss, sparkAt, handoffState, sparkFlare } from './_kit';
import { clamp, ease, springStep } from '../engine/util';

const BG = /* glsl */ `
uniform float uZ, uRoll, uKick, uInvert, uTime, uBg;
${SS_TAP_GLSL}
float map(vec3 p) {
  vec3 q = mod(p + 3.0, 6.0) - 3.0;
  return sdBox3(q, vec3(0.9, 0.9, 1.6)) - 0.18;
}
vec3 shade(vec2 P) {
  vec2 uv = (P - vec2(960.0, 540.0)) / 540.0;
  uv = rot2(uRoll) * uv;
  vec3 ro = vec3(1.5 + 0.6 * sin(uTime * 0.21), 1.5 + 0.5 * cos(uTime * 0.17), uZ);
  vec3 rd = normalize(vec3(uv, 1.6));
  float t = 0.0, d = 0.0;
  int i;
  for (i = 0; i < 64; i++) {
    d = map(ro + rd * t);
    if (d < 0.002 * t || t > 60.0) break;
    t += d;
  }
  vec3 base = mix(C_INK * 0.5, C_BONE * 0.8, uInvert);
  if (t > 60.0) return base;
  vec3 p = ro + rd * t;
  vec2 e = vec2(0.002 * t, 0.0);
  vec3 n = normalize(vec3(map(p + e.xyy) - map(p - e.xyy), map(p + e.yxy) - map(p - e.yxy), map(p + e.yyx) - map(p - e.yyx)));
  float dif = 0.25 + 0.75 * max(dot(n, normalize(vec3(-0.4, 0.6, -0.7))), 0.0);
  float rim = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);
  vec3 surf = mix(C_INK2 * 1.6, C_GRAPHITE * 0.9, uInvert) * dif + C_SIGNAL * 2.2 * rim * uKick;
  float fog = 1.0 - exp(-t * 0.055);
  return mix(surf, base, fog);
}
void main() {
  vec2 P = vec2(FRAG_PX.x, 1080.0 - FRAG_PX.y);
  vec3 c = vec3(0.0);
  for (int k = ssK0(); k < ssK1(); k++) c += shade(P + rgss(k));
  fragColor = vec4(c * ssWeight() * uBg, 1.0);
}`;

export default class Kinetic extends Scene {
  private bg = new FSPass(BG, { uZ: { value: 0 }, uRoll: { value: 0 }, uKick: { value: 0 }, uInvert: { value: 0 }, uTime: { value: 0 }, uBg: { value: 1 }, ssTap: SS_TAP });
  private text = new Layer2D();
  private lb = new LineBatch(3000, { blend: 'add' });

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { audio: au, lyrics, renderer, params } = this.ctx;
    const seed = params.seed ?? 1, energy = params.energy ?? 0.8, inv = params.variant === 1 ? 1 : 0;
    const esc = 1 + 0.35 * Math.min(3, params.n ?? 0); // later choruses hit harder
    const cam = camera(f, au, seed, energy * Math.min(1.3, esc), params);
    const u = this.bg.u;
    u.uZ!.value = 4.5 * (f.t - f.start) * (0.6 + energy) + 10 * (au.integral('rms', f.t) - au.integral('rms', f.start)) + seed % 13;
    u.uRoll!.value = cam.roll;
    u.uKick!.value = f.a.kick;
    u.uInvert!.value = inv;
    u.uTime!.value = f.t;
    u.uBg!.value = handoffState(f, params).bg;
    this.bg.render(renderer, out);

    const c = this.text.ctx;
    this.text.clear();
    const ink = inv ? 'ink' : 'bone';
    const line = activeLine(lyrics, f.t, 0.2, 0.3);
    const word = line ? line.words.find((w) => f.t < w.end + 0.12) ?? line.words[line.words.length - 1]! : null;
    let anchor = { x: 960, y: 560 };
    if (line && word) {
      const st = wordStyle(word, f.t, au);
      const width = st.width + 20 * clamp((word.end - word.start - 0.4) / 1.2) * (esc - 1);
      const unit = morphText(word.w, width, st.weight, 100);
      const size = Math.min(520, (1640 / Math.max(1, unit.width)) * 100);
      const slam = 1 + 0.32 * (1 - springStep(Math.max(0, f.t - word.start + 0.06), 3.2, 0.42));
      const { path, width: ww } = morphText(word.w, width, st.weight, size, 0, 0);
      const draw = (dx: number, dy: number, sc: number, style: string, rot = 0) => {
        c.save();
        c.translate(960 + cam.x + dx, 540 + cam.y + dy + size * 0.33);
        c.rotate(cam.roll * 0.15 + rot);
        c.scale(sc * cam.zoom, sc * cam.zoom);
        c.translate(-ww / 2, 0);
        c.fillStyle = style;
        c.fill(path);
        c.restore();
      };
      // the lattice: ghost copies spread on kicks, more of them each chorus
      const spread = (1 + 0.5 * f.a.kick) * size * 1.05;
      const R = Math.round(1 + esc);
      for (let gy = -R; gy <= R; gy++) for (let gx = -R; gx <= R; gx++) {
        if (!gx && !gy) continue;
        const fall = 1 / (1 + Math.hypot(gx, gy));
        draw(gx * ww * 0.55 * (1 + 0.3 * f.a.kick), gy * spread, 0.5, rgba(ink, 0.07 * fall * (0.5 + f.a.kick)), cam.roll * (gx + gy) * 0.2);
      }
      const p = sung(word, f.t);
      // the hero word lives the glyph lifecycle too: white-hot on the onset, cooling to signal
      draw(0, 0, slam, p > 0 ? mixCss(HEX.signal, '#FFE2C2', Math.exp(-(f.t - word.start) / 0.28)) : rgba(ink, 0.9));
      anchor = { x: 960 + cam.x - (ww * slam * cam.zoom) / 2 + ww * slam * cam.zoom * p, y: 540 + cam.y - size * 0.45 };
      // the whole line, small, as the karaoke reference
      drawKaraoke(c, line, f.t, au, { x: 120, y: 1000, size: 40, maxWidth: 1500, cold: inv ? 'graphite' : 'ash', done: inv ? HEX.ink : HEX.bone });
    } else {
      // between lines the lattice and the dolly carry the shot (a mono bar counter read as debug output)
    }
    compositeHot(renderer, this.text.upload(), out);

    this.lb.clear();
    const at = (t: number) => sparkAt(f, t, anchor);
    sparkParticles(this.lb, f.t, at, { rate: 90, seed, intensity: inv ? 0.6 : 1 });
    const sp = at(f.t);
    sparkHead(this.lb, sp.x, sp.y, f.t, (1 + 0.5 * f.a.kick) * sparkFlare(f, params), inv ? 0.7 : 1);
    this.lb.render(renderer, out);
    return { ...hitPost(f, au, energy * Math.min(1.2, esc), { bloom: inv ? 0.35 : 0.7, fade: endFade(f.t, au) }), ...handoff(f, out, params, renderer, this.ctx.comp) };
  }
}
