// Relativistic archetype: a point mass bends everything behind it. Every pixel is traced back through
// the thin-lens equation of a Schwarzschild point lens, b = d (1 - θE²/|d|²): an engraved ground,
// the tilted accretion ring and the lyric line all sit in the source plane and arrive bent
// along their geodesics. The spark orbits the photon ring, one revolution per bar.
// Bookends: the opening shot grows the hole out of nothing; the closing one lets it swallow the frame.
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { FSPass, Layer2D, SS_TAP, SS_TAP_GLSL } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { sparkHead, sparkParticles } from '../scenes/_motifs';
import { activeLine, CAM_GLSL, camera, camFwd, camVec, drawKaraoke, endFade, hitPost, handoff, mixCss, sparkAt, handoffState, sparkFlare } from './_kit';
import { clamp, ease, prog, TAU } from '../engine/util';
import { HEX } from '../engine/palette';
import { F, font } from '../engine/type';

const FRAG = /* glsl */ `
uniform sampler2D uText;
uniform float uTime, uRs, uThE, uHeat, uKick, uTilt, uBg;
uniform vec2 uC;
${SS_TAP_GLSL}
${CAM_GLSL}

vec3 shade(vec2 P) {
  vec2 X = camInv(P);
  // gravitational-wave ripple spreading from the mass: keeps the whole frame alive, not just the hole
  vec2 d0 = X - uC;
  float r0 = max(length(d0), 1.0);
  X += d0 / r0 * 5.0 * sin(r0 * 0.024 - uTime * 3.1) * exp(-r0 / 1200.0) * (0.5 + uHeat);
  vec2 d = X - uC;
  float r = max(length(d), 1e-3);
  vec2 b = d * (1.0 - uThE * uThE / (r * r));   // thin point-mass lens: image plane -> source plane
  vec2 S = uC + b;
  // an engraved ground in the source plane (pdoom's hatch idiom, not a stock star field): its lines run
  // through the lens, so the bending is visible everywhere; a light pool around the mass reveals it
  vec2 Sr = rot2(0.52) * S;
  float pool = exp(-dot(S - uC, S - uC) / (680.0 * 680.0));
  float lines = hatch(Sr.y / 11.0 + fbm(S * 0.0016 + vec2(uTime * 0.035, -uTime * 0.015), 3) * 1.6, 0.1 + 0.28 * pool);
  // no hatching where the lens compresses it below ~6 px (it crawled as moiré around the hole)
  lines *= smoothstep(uRs * 1.7, uRs * 3.4, r);
  vec3 col = (C_INK * 0.5 + C_GRAPHITE * lines * (0.07 + 0.22 * pool)) * uBg;   // quieter hatch (it shimmered); leaves first at a hand-off
  // the lyric layer lives in the source plane too
  vec4 tx = texture(uText, vec2(S.x / 1920.0, 1.0 - S.y / 1080.0));
  tx.rgb *= 1.0 + 2.2 * smoothstep(0.25, 0.7, tx.r - 1.3 * tx.g);   // only signal type blooms
  col = mix(col, tx.rgb, tx.a);
  // accretion ring: a tilted annulus around the mass, brighter on its approaching side
  vec2 q = vec2(b.x, b.y / uTilt);
  float rq = length(q), R = uThE * 2.2;
  float disk = exp(-pow((rq - R) / (uThE * 0.55), 2.0));
  float dop = 1.0 + 0.75 * q.x / max(rq, 1.0);
  float swirl = 0.6 + 0.4 * snoise(vec3(atan(q.y, q.x) * 3.0 - uTime * 1.4, rq * 0.03 - uTime * 0.5, uTime * 0.7));
  col += mix(C_GRAPHITE * 0.5, C_EMBER * 1.5, disk) * disk * dop * swirl * (0.5 + 0.9 * uHeat);   // one orange, no blood red
  // shadow and photon ring
  col *= smoothstep(uRs - 1.2, uRs + 1.2, r);
  float x = r - uRs * 1.03;
  col += (C_EMBER * 2.4 + C_BONE * 2.0 * uKick) * exp(-x * x / (1.5 + uRs * 0.03)) * (0.55 + 0.9 * uHeat);
  return col;
}

void main() {
  vec3 c = vec3(0.0);
  for (int k = ssK0(); k < ssK1(); k++) c += shade(screenPx(rgss(k)));
  fragColor = vec4(c * ssWeight(), 1.0);
}`;

export default class Lens extends Scene {
  private field = new FSPass(FRAG, {
    uText: { value: null }, uTime: { value: 0 }, uRs: { value: 0 }, uThE: { value: 0 }, uHeat: { value: 0 },
    uKick: { value: 0 }, uTilt: { value: 0.24 }, uBg: { value: 1 }, uC: { value: new THREE.Vector2() }, uCam: { value: new THREE.Vector4(1, 0, 0, 0) }, uTwist: { value: 0 }, ssTap: SS_TAP,
  });
  private text = new Layer2D();
  private lb = new LineBatch(4000, { blend: 'add' });

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { audio: au, lyrics, renderer, params } = this.ctx;
    const seed = params.seed ?? 1, energy = params.energy ?? 0.5;
    const cam = camera(f, au, seed, energy, params);
    const hs = handoffState(f, params);
    // the mass: grows in from nothing in the opening, swallows the frame in the closing shot
    let thE = (78 + 70 * energy) * (1 + 0.22 * au.env('bass', f.t)) + 10 * f.a.kick;
    if (params.bookend === 'in') thE *= 0.35 + 0.65 * ease.outCubic(prog(f.t, f.start, f.start + Math.min(6, (f.end - f.start) * 0.4)));
    if (params.bookend === 'out') thE *= 1 + 2.2 * ease.inCubic(prog(f.t, f.end - Math.min(8, (f.end - f.start) * 0.5), f.end));
    const cyAt = (lt: number) => 410 + 90 * Math.sin(0.14 * lt + seed * 1.7);
    const cx = 960 + 300 * Math.sin(0.19 * f.lt + seed), cy = cyAt(f.lt);

    const c = this.text.ctx;
    this.text.clear();
    const line = activeLine(lyrics, f.t);
    if (line) {
      drawKaraoke(c, line, f.t, au, { x: 250, y: 880, size: 84, maxWidth: 1300, outline: 1.7 });
      // the word being sung, set on a source-plane circle at 1.32 θE around the mass: the lens bends it into
      // an Einstein ring hugging the photon ring (pdoom spacetime.ts), with a flipped ghost inside
      const w = line.words.find((x) => f.t >= x.start - 0.05 && f.t < x.end + 0.15);
      if (w && thE > 20) {
        const R = 1.32 * thE, chars = Array.from(w.w.toUpperCase().replace(/[^\p{L}\p{N}'’]/gu, '')), sz = Math.max(14, thE * 0.42);
        c.font = font(F.archivo(110, 800), sz);
        // glyphs placed by their real advances plus uniform 0.12 em tracking along one continuous arc
        const adv = chars.map((ch) => c.measureText(ch).width + sz * 0.12);
        const arc = adv.reduce((x, y) => x + y, 0);
        let s0 = -arc / 2;
        // top arc, unless it would leave the frame: then the word wraps the underside of the ring
        // decided once per word (at its onset, against the largest the ring can get), never flipping mid-word
        const thMax = (78 + 70 * energy) * 1.22 + 10;
        const up = cyAt(w.start - f.start) - 1.32 * thMax - Math.max(14, thMax * 0.42) * 1.2 > 90;
        const mid = up ? -Math.PI / 2 : Math.PI / 2, dir = up ? 1 : -1;
        chars.forEach((ch, i) => {
          const a = mid + (dir * (s0 + adv[i]! / 2)) / R;
          s0 += adv[i]!;
          c.save();
          c.translate(cx + R * Math.cos(a), cy + R * Math.sin(a));
          c.rotate(a + (up ? Math.PI / 2 : -Math.PI / 2));
          c.fillStyle = mixCss(HEX.signal, '#FFE2C2', Math.exp(-(f.t - w.start) / 0.28));
          c.fillText(ch, -(adv[i]! - sz * 0.12) / 2, 0);
          c.restore();
        });
      }
    }
    const u = this.field.u;
    u.uText!.value = this.text.upload();
    u.uTime!.value = f.t;
    u.uThE!.value = thE;
    u.uRs!.value = thE * 0.56;
    u.uHeat!.value = clamp(0.35 + au.env('rms', f.t));
    u.uKick!.value = f.a.kick;
    u.uBg!.value = hs.bg;
    u.uTilt!.value = 0.2 + 0.08 * Math.sin(0.03 * f.lt + seed);
    (u.uC!.value as THREE.Vector2).set(cx, cy);
    (u.uCam!.value as THREE.Vector4).set(...camVec(cam));
    u.uTwist!.value = cam.twist ?? 0;
    this.field.render(renderer, out);

    // the spark rides the photon ring: one revolution per bar
    this.lb.clear();
    const at = (t: number) => {
      const a = TAU * (au.barAt(t) % 1) + seed;
      const r = thE * 0.56 * 1.03;
      return sparkAt(f, t, camFwd(cam, cx + r * Math.cos(a), cy + r * Math.sin(a) * 0.98));
    };
    if (thE > 8) {
      sparkParticles(this.lb, f.t, at, { rate: 70, seed, intensity: 0.9 });
      const p = at(f.t);
      sparkHead(this.lb, p.x, p.y, f.t, (0.9 + 0.4 * f.a.kick) * sparkFlare(f, params));
    }
    this.lb.render(renderer, out);
    return { ...hitPost(f, au, energy, { halation: 0.32, fade: endFade(f.t, au) }), ...handoff(f, out, params, renderer, this.ctx.comp) };
  }
}
