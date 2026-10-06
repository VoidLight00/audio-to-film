// Fluid archetype: a 2D incompressible flow, v = ∇×ψ = (∂ψ/∂y, −∂ψ/∂x) with ψ a moving simplex field
// (divergence-free by construction). The lyric line is made of atoms; each word assembles out of the
// flow just before it is sung and is swept away into the vortices after it ends. Atoms follow the
// streamlines by a fixed number of Euler steps from their glyph position, scaled by how dissolved the
// word is: a pure function of t (no particle state). The background is a line-integral view of the
// same flow. The spark ignites each word at the sung edge.
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { FSPass, SCALE, SS_TAP, SS_TAP_GLSL } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import type { Line } from '../engine/lyrics';
import { F, layout, textPoints } from '../engine/type';
import { sparkHead, sparkParticles } from '../scenes/_motifs';
import { CAM_GLSL, camera, camFwd, camVec, endFade, hitPost, NOISE_GLSL, sung, handoff, sparkAt, handoffState, sparkFlare } from './_kit';
import { clamp } from '../engine/util';
import { LIN } from '../engine/palette';

// the curl field plus a uniform wind to the right (still divergence-free): dissolved atoms cross the frame
const FLOW = /* glsl */ `vec2 flow(vec2 p, float t) { return curl2(p * 0.0021, t * 0.22) + vec2(0.9, -0.1); }`;

// the ground is plain ink: the flow is shown only by matter moving in it (critic: a smeared noise ground
// read as a stock marble shader)
const BG = /* glsl */ `uniform float uBg; void main() { vec2 q = vUv - 0.5; fragColor = vec4(C_INK * (0.42 + 0.12 * (1.0 - dot(q, q))) * uBg, 1.0); }`;

const VERT = /* glsl */ `precision highp float;
in vec3 position;   // glyph atom (logical px)
in vec2 aWin;       // word start, end (s)
in float aLine;     // line start (s): the whole line assembles together
in vec3 aGlyph;     // glyph centre (px) and a per-glyph seed: dissolving glyphs tumble apart one by one
in float aSeed;
uniform float uTime, uFlow, uPx, uKick, uTwist;
uniform vec4 uCam;
out float vA; out float vHot;
${NOISE_GLSL}
${FLOW}
vec2 camFwd(vec2 X) {
  vec2 c = vec2(960.0, 540.0), d = X - c;
  float s = sin(uCam.y), k = cos(uCam.y);
  vec2 p = uCam.zw + uCam.x * vec2(k * d.x - s * d.y, s * d.x + k * d.y);
  float a = uTwist * pow(max(0.0, 1.0 - length(p) / 1100.0), 2.0);
  return c + vec2(cos(a) * p.x - sin(a) * p.y, sin(a) * p.x + cos(a) * p.y);
}
void main() {
  float hot = smoothstep(aWin.x, aWin.x + 0.06, uTime);
  float gone = smoothstep(aWin.y + 0.15, aWin.y + 2.6, uTime);
  float pre = 1.0 - smoothstep(aLine - 0.9, aLine - 0.25, uTime);
  // a waiting line stands upright and only fades in (scattering it through the flow showed inverted ribbons);
  // the sung word barely breathes on kicks (a stronger kick term bloated it into its neighbours)
  float D = gone * gone + 0.015 * uKick * hot;
  // each glyph first tumbles about its own centre (>= 30°, seeded direction), so no half-dissolved word reads
  // as a misspelling, then the flow carries the atoms off
  // per-glyph delay (up to 0.3 s) and a fast tumble of 35-70°, alternating direction from glyph to glyph
  float gG = smoothstep(aWin.y + 0.12 + 0.3 * fract(aGlyph.z * 11.7), aWin.y + 0.5 + 0.3 * fract(aGlyph.z * 11.7), uTime);
  float tumble = (mod(floor(aGlyph.z * 97.0), 2.0) < 0.5 ? -1.0 : 1.0) * (0.6 + 0.6 * fract(aGlyph.z * 3.17)) * gG;
  vec2 r0 = position.xy - aGlyph.xy;
  vec2 p = aGlyph.xy + vec2(cos(tumble) * r0.x - sin(tumble) * r0.y, sin(tumble) * r0.x + cos(tumble) * r0.y) + vec2(0.0, -40.0) * gone * fract(aGlyph.z * 5.3);
  for (int i = 0; i < 8; i++) p += flow(p, uTime + aSeed * 0.05) * D * 56.0 * uFlow;   // dissolved atoms cross the frame
  vec2 S = camFwd(p);
  gl_Position = vec4(S.x / 960.0 - 1.0, 1.0 - S.y / 540.0, 0.0, 1.0);
  gl_PointSize = (1.3 + 1.7 * (1.0 - D)) * uPx;
  vA = (1.0 - 0.65 * gone) * (1.0 - 0.75 * pre);
  vHot = hot * (1.0 - 0.55 * gone);   // dissolving atoms stay orange as they cross the frame, then dim
}`;

const FRAG = /* glsl */ `precision highp float;
in float vA; in float vHot;
out vec4 fragColor;
uniform vec3 uBone, uSignal;
void main() {
  vec2 q = gl_PointCoord - 0.5;
  float a = smoothstep(0.5, 0.2, length(q)) * vA;
  if (a <= 0.003) discard;
  vec3 c = mix(uBone * 0.55, uSignal * 1.9, vHot);
  fragColor = vec4(c * a, a);
}`;

/** One line of lyric atoms: a Points object built once per line. */
function lineAtoms(line: Line, seed: number) {
  const size = 150, fam = F.archivo(100, 800), space = size * 0.4;   // atoms bloat glyphs: wider word space
  const words = line.words.map((w) => ({ w, lay: layout(w.w, fam, size) }));
  const total = words.reduce((a, x) => a + x.lay.width, 0) + space * (words.length - 1);
  const k = Math.min(1, 1150 / total);
  let x = 250;   // left third: the dissolved atoms blow across the empty right side
  // consecutive lines alternate baselines, so a line assembling never lands on the one still dissolving
  const baseY = line.i % 2 ? 640 : 500;
  const pos: number[] = [], win: number[] = [], sd: number[] = [], ln: number[] = [], gl: number[] = [];
  const boxes: { x: number; width: number }[] = [];
  for (const [i, { w, lay }] of words.entries()) {
    const glyphs = layout(w.w, fam, size * k).glyphs;
    for (const p of textPoints(w.w, fam, size * k, 2, seed + i)) {
      const g = glyphs.find((q) => p.x < q.x + q.w) ?? glyphs[glyphs.length - 1]!;
      pos.push(x + p.x, baseY + p.y, 0); win.push(w.start, w.end); ln.push(line.start); sd.push((pos.length * 0.618) % 1);
      gl.push(x + g.x + g.w / 2, baseY - size * k * 0.35, (i * 31 + g.i) * 0.6180339887 % 1);
    }
    boxes.push({ x, width: lay.width * k });
    x += lay.width * k + space * k;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aWin', new THREE.Float32BufferAttribute(win, 2));
  g.setAttribute('aSeed', new THREE.Float32BufferAttribute(sd, 1));
  g.setAttribute('aLine', new THREE.Float32BufferAttribute(ln, 1));
  g.setAttribute('aGlyph', new THREE.Float32BufferAttribute(gl, 3));
  return { g, boxes, size: size * k, baseY };
}

export default class Curl extends Scene {
  private bg = new FSPass(BG, { uBg: { value: 1 } });
  private mat = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthTest: false, depthWrite: false,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    uniforms: {
      uTime: { value: 0 }, uFlow: { value: 1 }, uPx: { value: SCALE }, uKick: { value: 0 }, uTwist: { value: 0 }, uCam: { value: new THREE.Vector4(1, 0, 0, 0) },
      // one orange across plates: signal pulled toward ember (curl alone sat at a redder hue, critic round 5)
      uBone: { value: new THREE.Color(...LIN.bone) }, uSignal: { value: new THREE.Color(...LIN.signal).lerp(new THREE.Color(...LIN.ember), 0.45) },
    },
  });
  private scene = new THREE.Scene();
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private atoms = new Map<number, ReturnType<typeof lineAtoms> & { pts: THREE.Points }>();
  private lb = new LineBatch(3000, { blend: 'add' });

  private atomsFor(line: Line) {
    let a = this.atoms.get(line.i);
    if (!a) {
      const built = lineAtoms(line, (this.ctx.params.seed ?? 1) + line.i);
      const pts = new THREE.Points(built.g, this.mat);
      pts.frustumCulled = false;
      a = { ...built, pts };
      this.atoms.set(line.i, a);
    }
    return a;
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { audio: au, lyrics, renderer, params } = this.ctx;
    const seed = params.seed ?? 1, energy = params.energy ?? 0.5;
    const cam = camera(f, au, seed, energy, params);
    const cv = camVec(cam);
    this.bg.u.uBg!.value = handoffState(f, params).bg;
    this.bg.render(renderer, out);

    // every line whose atoms are on screen: assembling, sung, or still being swept away
    const live = lyrics.lines.filter((l) => f.t > l.start - 1.0 && f.t < l.end + 2.8);
    this.scene.clear();
    for (const l of live) this.scene.add(this.atomsFor(l).pts);
    const u = this.mat.uniforms;
    u.uTime!.value = f.t;
    u.uKick!.value = f.a.kick;
    u.uTwist!.value = cam.twist ?? 0;
    u.uFlow!.value = 0.7 + 0.6 * energy;
    (u.uCam!.value as THREE.Vector4).set(...cv);
    renderer.setRenderTarget(out);
    renderer.render(this.scene, this.cam);

    // the spark sits on the sung edge of the current word (or drifts with the flow between lines)
    this.lb.clear();
    const cur = live.find((l) => f.t >= l.start - 0.05 && f.t < l.end);
    const at = (t: number) => {
      if (cur) {
        const a = this.atomsFor(cur), wi = cur.words.findIndex((w) => t < w.end);
        const i = wi < 0 ? cur.words.length - 1 : wi, w = cur.words[i]!;
        return sparkAt(f, t, camFwd(cam, a.boxes[i]!.x + a.boxes[i]!.width * sung(w, t), a.baseY - a.size * 0.95));   // above the cap height, never over a glyph
      }
      return sparkAt(f, t, camFwd(cam, 960 + 620 * Math.sin(0.21 * t + seed), 540 + 260 * Math.sin(0.33 * t + seed * 2)));
    };
    sparkParticles(this.lb, f.t, at, { rate: 80, seed, intensity: 0.9 });
    const p = at(f.t);
    sparkHead(this.lb, p.x, p.y, f.t, (0.85 + 0.4 * f.a.kick) * sparkFlare(f, params));
    this.lb.render(renderer, out);
    return { ...hitPost(f, au, energy, { fade: endFade(f.t, au) }), ...handoff(f, out, params, renderer, this.ctx.comp) };
  }

  override dispose() { for (const a of this.atoms.values()) a.g.dispose(); this.mat.dispose(); }
}
