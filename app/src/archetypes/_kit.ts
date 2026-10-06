// Shared parts of every archetype: the macro camera, karaoke lyric drawing, continuously morphing
// type (width x weight), and hit-driven post. Everything here is a pure function of song time.
import * as THREE from 'three';
import type { AudioData } from '../engine/audio';
import type { Line, Lyrics, Word } from '../engine/lyrics';
import type { Frame, PostOverrides } from '../engine/scene';
import { F, font, ot } from '../engine/type';
import { FSPass, makeRT, type Compositor } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { sparkHead } from '../scenes/_motifs';
import { GLSL_COMMON } from '../engine/glsl/common';
import { HEX, LIN, rgba } from '../engine/palette';
import { clamp, ease, hash, noise1, prog, pulse, springStep } from '../engine/util';

// ------------------------------------------------------------------ camera
export interface Cam { zoom: number; roll: number; x: number; y: number; twist?: number }

/**
 * Macro motion: a beat-stepped dive across the shot, a crash punch-in on every downbeat, a kick
 * micro-punch, a seeded pair of 180° rolls (one per beat, ending upright) in the middle of long shots, and a slow drift.
 * `energy` (0..1, the section's loudness) scales everything.
 */
export function camera(f: Frame, au: AudioData, seed: number, energy: number, params: Record<string, any> = {}): Cam {
  const e = 0.4 + 0.9 * energy;
  // dive in beat steps (pdoom stack.ts): ~22 % of each step anticipated with inQuad, then a spring landing;
  // bounded to ~1.2x over the shot so type never leaves the frame
  const b0 = au.beatAt(f.start), b = au.beatAt(f.t) - b0, nb = Math.max(1, au.beatAt(f.end) - b0);
  const k = Math.floor(b), ph = b - k, step = (0.12 * e) / nb;
  const land = springStep((ph * 60) / Math.max(60, au.bpm), 3.6, 0.74);
  const antic = 0.22 * ease.inQuad(clamp((ph - 0.78) / 0.22));
  // each landing starts where the previous beat's anticipation left off (k - 1 + 0.22): continuous at the beat
  // (restarting from k - 1 dropped the zoom by 22 % of a step on every beat — caught by plan.test.ts)
  const dive = 1 + step * Math.max(0, k - 0.78 + 0.78 * land + antic);
  const db = au.lastDownbeat(f.t);
  // the punch rises over 2 frames: an instant zoom step drew two copies of the frame inside one blurred frame
  const kk = au.lastOnset('kick', f.t);
  const kick = kk ? kk[1] * clamp((f.t - kk[0]) / 0.033) * pulse(f.t, kk[0], 0.12) : 0;
  const punch = 0.045 * e * clamp((f.t - db) / 0.033) * pulse(f.t, db, 0.16) + 0.02 * e * kick;   // bounded: type stays 96 px inside
  let roll = 0;
  const dbs = au.downbeats.filter((d) => d > f.start + 4 && d < f.end - 4);
  if (dbs.length >= 4) {
    const r0 = dbs[Math.floor(hash(seed, 7) * dbs.length)]!;
    const beat = 60 / Math.max(60, au.bpm);
    // two 180° rolls locked to consecutive beats: upside down on the beat, upright again on the next,
    // so type is never left inverted (a held 180° flip made lyrics unreadable, see FAILURE_LOG F7)
    const half = (a: number) => Math.PI * prog(f.t, a, a + beat, ease.inOutCubic);
    roll = (half(r0) + half(r0 + beat)) * (hash(seed, 8) < 0.5 ? 1 : -1);
  }
  // a damped roll kick right after the cut (pdoom room.ts)
  roll += 0.05 * e * Math.sin(Math.PI * 2 * 2.6 * f.lt) * Math.exp(-6 * f.lt);
  // spark hand-off: every figure is pulled into the spark at the frame centre (pull = 1 at the cut)
  // converge to within ~2 % of the radius 2 frames before the cut (inCubic left figures at 60 % width 3 frames out)
  const h = handoffState(f, params), pk = ease.inOutCubic(clamp(Math.cbrt(h.k) / 0.83)), pull = h.style === 'spark' ? 1 - 0.985 * pk : 1;
  // the pulled figures are wound into the spark: a radius-dependent twist (inner turns faster), not a layer spin
  const twist = h.style === 'spark' ? 2.4 * pk * (f.end - f.t < 0.2 ? 1 : -1) : 0;
  return {
    zoom: dive * (1 + punch) * pull,
    roll: roll + 0.035 * noise1(f.t * 0.11, seed),
    twist,
    x: 38 * noise1(f.t * 0.13, seed + 1) * pull,
    y: 22 * noise1(f.t * 0.17, seed + 2) * pull,
  };
}

/** Post overrides for hits: flash on strong downbeats, shake on snares (seeded per 60 fps frame). */
export function hitPost(f: Frame, au: AudioData, energy: number, base: PostOverrides = {}): PostOverrides {
  const sn = au.lastOnset('snare', f.t);
  const k = sn ? pulse(f.t, sn[0], 0.06) * sn[1] : 0;
  const n = sn ? au.onsetIndex('snare', f.t) : 0;
  return {
    bloom: 0.55 + 0.35 * energy,
    // no global flash: it lifted the ink to grey on every beat (critic round 1); emissive elements carry the beat
    shake: [7 * energy * k * (hash(n, 1) - 0.5), 7 * energy * k * (hash(n, 2) - 0.5)],
    ...base,
  };
}

// ------------------------------------------------------------------ lyrics
/** The line on screen at t: shown `lead` s before its first word, held `tail` s after its last. */
export function activeLine(ly: Lyrics, t: number, lead = 0.4, tail = 0.35): Line | null {
  let best: Line | null = null;
  for (const l of ly.lines) if (t >= l.start - lead && t < l.end + tail) best = l;
  return best;
}

/** Sung progress of a word 0..1 (never ahead of the voice). */
export const sung = (w: Word, t: number) => clamp((t - w.start) / Math.max(0.05, w.end - w.start));

/** Expression of a word: held notes widen, the loud voice thickens. */
export function wordStyle(w: Word, t: number, au: AudioData) {
  const held = clamp((w.end - w.start - 0.25) / 0.9);
  const k = sung(w, t);
  return { width: 75 + 50 * held * ease.outCubic(k), weight: 380 + 520 * clamp(au.env('vocal', t) * 1.3) };
}

// ------------------------------------------------------------------ morphing type
// Archivo static instances were cut from one variable master (same outline points), and so were the
// Pretendard ones: interpolating their outlines is exactly what the variable font does, continuously.
const AW = [620, 750, 875, 1000, 1125, 1250], AWT = [300, 500, 700, 900], KWT = [300, 500, 700, 900];
type Cmd = { type: string; x?: number; y?: number; x1?: number; y1?: number; x2?: number; y2?: number };
const glyphCache = new Map<string, { cmds: Cmd[]; adv: number }>();

function glyph(family: string, ch: string) {
  const key = `${family}|${ch}`;
  let g = glyphCache.get(key);
  if (!g) {
    const f = ot(family), gl = f.charToGlyph(ch);
    g = { cmds: gl.getPath(0, 0, 1).commands as Cmd[], adv: (gl.advanceWidth ?? 0) / f.unitsPerEm };
    glyphCache.set(key, g);
  }
  return g;
}

function bracket(list: number[], v: number): [number, number, number] {
  const x = clamp(v, list[0]!, list[list.length - 1]!);
  let i = 0;
  while (i < list.length - 2 && list[i + 1]! < x) i++;
  return [i, i + 1, (x - list[i]!) / (list[i + 1]! - list[i]!)];
}

function mix(gs: { cmds: Cmd[]; adv: number }[], ws: number[]) {
  const n = gs[0]!.cmds.length;
  if (!gs.every((g) => g.cmds.length === n && g.cmds.every((c, i) => c.type === gs[0]!.cmds[i]!.type)))
    return gs[ws.indexOf(Math.max(...ws))]!; // incompatible outlines: nearest instance
  const K = ['x', 'y', 'x1', 'y1', 'x2', 'y2'] as const;
  const cmds = gs[0]!.cmds.map((c, i) => {
    const o: Cmd = { type: c.type };
    for (const k of K) if (c[k] !== undefined) o[k] = gs.reduce((s, g, j) => s + g.cmds[i]![k]! * ws[j]!, 0);
    return o;
  });
  return { cmds, adv: gs.reduce((s, g, j) => s + g.adv * ws[j]!, 0) };
}

const isKo = (ch: string) => /[ᄀ-ᇿ㄰-㆏가-힣]/.test(ch);

/** One glyph at width 62..125 (%) and weight 300..900, unit size. Hangul: weight only (Pretendard). */
export function morphGlyph(ch: string, width: number, weight: number) {
  if (isKo(ch) || ot('Archivo-1000-700').charToGlyphIndex(ch) <= 0) {
    const [a, b, k] = bracket(KWT, weight);
    return mix([glyph(`Pretendard-${KWT[a]}`, ch), glyph(`Pretendard-${KWT[b]}`, ch)], [1 - k, k]);
  }
  const [w0, w1, kw] = bracket(AW, width * 10), [t0, t1, kt] = bracket(AWT, weight);
  return mix([
    glyph(`Archivo-${AW[w0]}-${AWT[t0]}`, ch), glyph(`Archivo-${AW[w1]}-${AWT[t0]}`, ch),
    glyph(`Archivo-${AW[w0]}-${AWT[t1]}`, ch), glyph(`Archivo-${AW[w1]}-${AWT[t1]}`, ch),
  ], [(1 - kw) * (1 - kt), kw * (1 - kt), (1 - kw) * kt, kw * kt]);
}

/** Outline of `text` at (x, baseline y), continuously morphed; returns the path and its advance width. */
export function morphText(text: string, width: number, weight: number, size: number, x = 0, y = 0, tracking = 0) {
  const p = new Path2D();
  let cx = x;
  for (const ch of Array.from(text)) {
    const g = morphGlyph(ch, width, weight);
    for (const c of g.cmds) {
      const X = (v?: number) => cx + v! * size, Y = (v?: number) => y + v! * size;
      if (c.type === 'M') p.moveTo(X(c.x), Y(c.y));
      else if (c.type === 'L') p.lineTo(X(c.x), Y(c.y));
      else if (c.type === 'Q') p.quadraticCurveTo(X(c.x1), Y(c.y1), X(c.x), Y(c.y));
      else if (c.type === 'C') p.bezierCurveTo(X(c.x1), Y(c.y1), X(c.x2), Y(c.y2), X(c.x), Y(c.y));
      else if (c.type === 'Z') p.closePath();
    }
    cx += g.adv * size + tracking;
  }
  return { path: p, width: cx - x - tracking };
}

export function morphWidth(text: string, width: number, weight: number, size: number, tracking = 0) {
  let w = 0;
  for (const ch of Array.from(text)) w += morphGlyph(ch, width, weight).adv * size + tracking;
  return w - tracking;
}

// ------------------------------------------------------------------ the glyph lifecycle (pdoom open.ts / loss.ts)
const hexRgb = (h: string) => { const n = parseInt(h.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
/** CSS colour between two palette hexes. */
export function mixCss(a: string, b: string, k: number, alpha = 1) {
  const A = hexRgb(a), B = hexRgb(b), q = clamp(k);
  return `rgba(${A.map((v, i) => Math.round(v + (B[i]! - v) * q)).join(',')},${alpha})`;
}
const WHITE_HOT = '#FFE2C2';

/**
 * One word through its life: waiting = ash outline (anticipated 0.3 s before its line), sung = a per-glyph
 * wipe that fills white-hot at the onset and cools to signal (heat exp(-age/0.28)), done = cools to bone
 * over 0.3 s after the word ends; the fill pops in vertically with outBack. Returns the word's width.
 */
export function drawWord(c: CanvasRenderingContext2D, w: Word, t: number, lineStart: number, x: number, y: number, size: number,
  st: { width: number; weight: number }, o: { cold?: string; done?: string; lineEnd?: number; outline?: number } = {}) {
  const exit = o.lineEnd === undefined ? 0 : clamp((t - (o.lineEnd + 0.05)) / 0.3);
  if (exit >= 1) return morphWidth(w.w, st.width, st.weight, size);
  c.save();
  c.globalAlpha = 1 - exit;
  c.translate(0, -18 * ease.inCubic(exit));   // lines leave by lifting away, not by vanishing
  const chars = Array.from(w.w);
  const advs = chars.map((ch) => morphGlyph(ch, st.width, st.weight).adv * size);
  const { path, width } = morphText(w.w, st.width, st.weight, size, x, y);
  const ant = clamp((t - (lineStart - 0.3)) / 0.3), p = sung(w, t), gp = p * chars.length;
  if (p < 1 && ant > 0) {
    c.lineWidth = Math.max(2, size * 0.024) * (o.outline ?? 1);
    c.strokeStyle = rgba(o.cold ?? 'bone', 0.62 * ant);   // bone, not ash: ash outlines vanished on the dark plates
    c.stroke(path);
  }
  if (p > 0) {
    let fill = 0;
    advs.forEach((a, i) => (fill += a * clamp(gp - i)));
    const heat = Math.exp(-(t - w.start) / 0.28), done = clamp((t - w.end) / 0.3);
    const pop = 0.3 + 0.7 * ease.outBack(clamp((t - w.start) / 0.12));
    c.save();
    c.beginPath();
    c.rect(x - size * 0.2, y - size * 1.4, fill + size * 0.2, size * 2);
    c.clip();
    c.translate(0, y);
    c.scale(1, pop);
    c.translate(0, -y);
    c.fillStyle = heat > 0.02 ? mixCss(HEX.signal, WHITE_HOT, heat) : mixCss(HEX.signal, o.done ?? HEX.bone, done);
    c.fill(path);
    c.restore();
  }
  c.restore();
  return width;
}

/**
 * Pull a word's width axis (then its weight) back until its morphed advance overruns its slot by less than
 * 45 % of the word space: a relative cap (6 %) still let long words touch their neighbours (critic round 3).
 */
function clampStyle(text: string, st: { width: number; weight: number }, slot: number, size: number, space: number) {
  let { width, weight } = st;
  for (let i = 0; i < 16 && morphWidth(text, width, weight, size) > slot + space * 0.45; i++) {
    if (width > 62) width -= 6; else weight = Math.max(300, weight - 60);
  }
  return { width, weight };
}

/** Greedy split into at most `rows` rows by advance width (balanced: the widest row is minimised). */
function breakRows(widths: number[], space: number, rows: number) {
  if (rows <= 1 || widths.length < 4) return [widths.length];
  const total = widths.reduce((a, b) => a + b, 0) + space * (widths.length - 1);
  let best = widths.length, bestW = total, acc = 0;
  for (let k = 1; k < widths.length; k++) {
    acc += widths[k - 1]! + (k > 1 ? space : 0);
    const w = Math.max(acc, total - acc - space);
    if (w < bestW) { bestW = w; best = k; }
  }
  return [best, widths.length];
}

/**
 * Karaoke block: every word morphs with its own expression and lives through the glyph lifecycle.
 * Long lines break into two balanced rows; with `fit`, each row is scaled to exactly `maxWidth`
 * (Swiss: rows of different word counts end up at different sizes). `legend` adds a numbered mono
 * word index above the block with the current word lit. Returns word boxes (for anchoring effects).
 */
export function drawKaraoke(c: CanvasRenderingContext2D, line: Line, t: number, au: AudioData,
  o: { x: number; y: number; size: number; maxWidth: number; align?: 'left' | 'center'; rows?: number; fit?: boolean; legend?: boolean; cold?: string; done?: string; outline?: number }) {
  const space = o.size * 0.26;
  const styles = line.words.map((w) => wordStyle(w, t, au));
  // layout (row breaks, row sizes, word slots) comes from the resting style (width 75 / weight 600), so it is
  // fixed for the whole line; only the drawing morphs (a layout from morphing widths flipped 1<->2 rows, and
  // slots at width 100 left uneven gaps behind condensed words)
  const base = line.words.map((w) => morphWidth(w.w, 75, 600, o.size));
  // a word may swell by 6 % at most inside its reserved slot, so neighbours never collide (critic round 2)
  const widths = base;
  const styles2 = line.words.map((w, i) => clampStyle(w.w, styles[i]!, base[i]!, o.size, space));
  const ends = breakRows(base, space, o.rows ?? (base.reduce((a, b) => a + b, 0) > o.maxWidth * 1.15 ? 2 : 1));
  const boxes: { w: Word; x: number; y: number; width: number; size: number; p: number }[] = [];
  let from = 0, y = o.y - (ends.length - 1) * o.size * 1.05;
  for (const to of ends) {
    const rw = base.slice(from, to).reduce((a, b) => a + b, 0) + space * (to - from - 1);
    const k = o.fit ? Math.min(1.6, o.maxWidth / Math.max(1, rw)) : Math.min(1, o.maxWidth / Math.max(1, rw)), size = o.size * k;
    let x = o.align === 'center' ? o.x - (rw * k) / 2 : o.x;
    for (let i = from; i < to; i++) {
      const w = line.words[i]!;
      drawWord(c, w, t, line.start, x, y, size, styles2[i]!, { ...o, lineEnd: line.end });
      boxes.push({ w, x, y, width: widths[i]! * k, size, p: sung(w, t) });
      x += (widths[i]! + space) * k;
    }
    y += size * 1.05;
    from = to;
  }
  if (o.legend) {
    const top = boxes.length ? Math.min(...boxes.map((b) => b.y - b.size * 0.95)) : o.y;
    let lx = o.align === 'center' ? o.x - Math.min(o.maxWidth, 1200) / 2 : o.x;
    c.font = font(F.mono(500), 17);
    line.words.slice(0, 9).forEach((w, i) => {
      const s = `${String(i + 1).padStart(2, '0')} ${w.w.toUpperCase()}`;
      const on = t >= w.start && t < w.end + 0.1;
      c.fillStyle = on ? rgba('signal', 1) : rgba('ash', 0.55);
      c.fillText(s, lx, top - 14);
      lx += c.measureText(s).width + 22;
    });
  }
  return boxes;
}

// ------------------------------------------------------------------ signal-only bloom
const HOT_FRAG = /* glsl */ `
uniform sampler2D tex; uniform float boost, pull;
void main() {
  vec2 uv = (vUv - 0.5) / max(pull, 1e-3) + 0.5;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) discard;
  vec4 c = texture(tex, uv);
  float hot = smoothstep(0.25, 0.7, c.r - 1.3 * c.g);   // only the signal/ember family crosses the bloom threshold
  c.rgb *= 1.0 + boost * hot;
  fragColor = vec4(c.rgb * c.a, c.a);
}`;
let hotPass: FSPass | null = null;
/** Alpha-over a Canvas2D layer, pushing only its signal-orange pixels into HDR so they alone bloom. */
export function compositeHot(renderer: THREE.WebGLRenderer, tex: THREE.Texture, out: THREE.WebGLRenderTarget, boost = 2.2, pull = 1) {
  if (!hotPass) {
    hotPass = new FSPass(HOT_FRAG, { tex: { value: null }, boost: { value: 2.2 }, pull: { value: 1 } }, { blending: THREE.CustomBlending, transparent: true });
    const m = hotPass.mat;
    m.blendEquation = THREE.AddEquation;
    m.blendSrc = THREE.OneFactor; m.blendDst = THREE.OneMinusSrcAlphaFactor;
    m.blendSrcAlpha = THREE.OneFactor; m.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
  }
  hotPass.u.tex!.value = tex;
  hotPass.u.boost!.value = boost;
  hotPass.u.pull!.value = pull;
  hotPass.render(renderer, out);
}

// ------------------------------------------------------------------ hand-off cuts (pdoom: motivated hard cuts)
export type Handoff = 'flat' | 'spark';
export const HANDOFFS: Handoff[] = ['flat', 'spark'];
/** Where the spark waits across every cut: the shots hand it over at this pixel. */
export const HANDOFF_PX = { x: 960, y: 540 };
const HAND = 0.2;   // 12 frames at 60 fps on each side of the cut (critic round 2: 3-frame closes read as flashes)
export { HAND };
const HO_FRAG = /* glsl */ `
uniform sampler2D tex; uniform float k, mode;
void main() {
  vec2 P = vec2(FRAG_PX.x, 1080.0 - FRAG_PX.y), c = vec2(960.0, 540.0);
  vec3 col = vec3(0.0);
  if (mode < 0.5) {            // flat: the picture collapses vertically into a white-hot line on the horizon
    float sy = 1.0 - 0.994 * k;
    vec2 uv = vec2(vUv.x, (vUv.y - 0.5) / sy + 0.5);
    // the squashed picture dims as it flattens, so the spark riding the line stays the brightest thing on it
    if (uv.y >= 0.0 && uv.y <= 1.0) col = texture(tex, uv).rgb * (1.0 - 0.6 * k);
    // the held line itself: a 3 px bone core in an orange glow, peaking on the downbeat (the cut was a black frame)
    float d = abs(P.y - 540.0), edge = smoothstep(0.0, 520.0, min(P.x, 1920.0 - P.x));
    // held 4 frames each side then gone fast; dimmer than the spark so the spark reads as the object on it
    // well below white (~120/255): a saturated line hid the spark riding it (measured: peak/median 1.01)
    col += (C_BONE * 0.2 * exp(-d * d / 2.2) + C_EMBER * 0.1 * exp(-d / 16.0)) * smoothstep(0.85, 1.0, k) * edge;
  } else {                     // spark: the whole scene is drawn into the spark, on black, through a soft round mask
    float s = max(1.0 - k, 1e-3);
    vec2 src = c + (P - c) / s;
    float m = 1.0 - smoothstep(0.55, 1.0, length(P - c) / (1150.0 * s));
    if (src.x >= 0.0 && src.x <= 1920.0 && src.y >= 0.0 && src.y <= 1080.0)
      col = texture(tex, vec2(src.x / 1920.0, 1.0 - src.y / 1080.0)).rgb * m * (1.0 + 2.0 * k);
  }
  fragColor = vec4(col, 1.0);
}`;
let hoPass: FSPass | null = null, hoRT: THREE.WebGLRenderTarget | null = null, hoLB: LineBatch | null = null;

/**
 * Hand-off progress of a frame: `k` 0..1 (eased, 1 at the cut), `bg` the multiplier archetypes apply to their
 * ground (hatching, dust, dot grids, field lines): it reaches 0 in the first 4 of the 12 frames, so only the
 * figures (type, lines, arcs, trails, the spark) take part in the close and no picture rectangle is ever seen.
 */
export function handoffState(f: Frame, params: Record<string, any>): { style?: Handoff; k: number; bg: number } {
  let raw = 0, style: Handoff | undefined;
  if (params.out && f.end - f.t < HAND) { raw = 1 - (f.end - f.t) / HAND; style = params.out; }
  else if (params.in && f.t - f.start < HAND) { raw = 1 - (f.t - f.start) / HAND; style = params.in; }
  if (!style || raw <= 0) return { k: 0, bg: 1 };
  return { style, k: ease.inCubic(clamp(raw)), bg: 1 - ease.outCubic(clamp(raw / 0.33)) };
}

/** Spark size multiplier: it flares as it swallows the scene (spark hand-offs only). */
export const sparkFlare = (f: Frame, params: Record<string, any>) => {
  const h = handoffState(f, params);
  // the cut frame is the spark at its largest (critic r4); on a flatline it is the hot point riding the line
  return h.style === 'spark' ? 1 + 4 * h.k : 1;   // on flat cuts the spark is drawn by handoff(), on the line
};

/**
 * The flatline cut squashes the (already ground-free) picture into a line; the spark cut needs no pass: its
 * pull is folded into camera() and compositeHot(). Call last in render(); merge the returned post overrides.
 */
export function handoff(f: Frame, out: THREE.WebGLRenderTarget, params: Record<string, any>, renderer: THREE.WebGLRenderer, comp: Compositor): PostOverrides {
  const h = handoffState(f, params);
  if (!h.style || h.k <= 0) return {};
  if (h.style === 'flat') {
    // reach the line by 4 frames before the cut and hold it across (the collapse was crammed into 2 frames)
    const kk = ease.outCubic(clamp((h.k > 0 ? Math.cbrt(h.k) : 0) / 0.67));
    hoRT ??= makeRT();
    hoPass ??= new FSPass(HO_FRAG, { tex: { value: null }, k: { value: 0 }, mode: { value: 0 } });
    comp.draw(renderer, out.texture, hoRT, { mode: 'replace', premult: false });
    hoPass.u.tex!.value = hoRT.texture;
    hoPass.u.k!.value = kk;
    hoPass.u.mode!.value = 0;
    hoPass.render(renderer, out);
    // the spark rides the held line, drawn AFTER the squash (drawn before, it was flattened into the line and
    // vanished, critic round 8): it crosses left to right through the 4 frames each side of the cut, at the
    // centre exactly on the downbeat, so the incoming shot picks it up where the outgoing one left it
    const raw = f.end - f.t < 0.2 ? 1 - (f.end - f.t) / 0.2 : 1 - (f.t - f.start) / 0.2;
    if (raw >= 0.67) {   // only once the line is formed: no second spark while the picture is still collapsing
      const side = f.end - f.t < 0.2 ? -1 : 1, x = HANDOFF_PX.x + side * 220 * clamp((1 - raw) / 0.33);
      hoLB ??= new LineBatch(64, { blend: 'add' });
      hoLB.clear();
      sparkHead(hoLB, x, HANDOFF_PX.y, f.t, 2.4, 1.6);
      hoLB.render(renderer, out);
    }
  }
  return { vignette: 0, grain: 0.03 };
}

/**
 * The spark's position with the hand-off applied: it slides from the hand-off pixel over the shot's first
 * 8 frames and back to it over the last 8 (critic round 2: a longer glide left it floating off the action).
 */
export function sparkAt(f: Frame, t: number, p: { x: number; y: number }) {
  const k = Math.min(prog(t, f.start, f.start + 0.13, ease.outCubic), 1 - prog(t, f.end - 0.13, f.end, ease.inCubic));   // flat cuts; spark cuts converge through the camera pull
  return { x: HANDOFF_PX.x + (p.x - HANDOFF_PX.x) * k, y: HANDOFF_PX.y + (p.y - HANDOFF_PX.y) * k };
}

/** Stable small integer seed from a timeline id. */
export function seedOf(id: string) {
  let h = 2166136261;
  for (const ch of id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (h >>> 0) % 100000;
}


// ------------------------------------------------------------------ camera transforms (logical px, y down)
/** GLSL: `uCam` (zoom, roll, shiftX, shiftY) and the screen<->world maps matching camFwd. */
export const CAM_GLSL = /* glsl */ `
uniform vec4 uCam;
uniform float uTwist;
vec2 untwist(vec2 P) {   // inverse of the hand-off twist θ(r) = uTwist·(1 − r/1100)², which keeps r
  vec2 c = vec2(960.0, 540.0), d = P - c;
  float r = length(d), a = -uTwist * pow(max(0.0, 1.0 - r / 1100.0), 2.0), s = sin(a), k = cos(a);
  return c + vec2(k * d.x - s * d.y, s * d.x + k * d.y);
}
vec2 camInv(vec2 P0) {
  vec2 P = untwist(P0);
  vec2 c = vec2(960.0, 540.0), d = (P - c - uCam.zw) / uCam.x;
  float s = sin(-uCam.y), k = cos(-uCam.y);
  return c + vec2(k * d.x - s * d.y, s * d.x + k * d.y);
}
// logical px, y down, from the fragment (sub-pixel tap offset in logical px)
vec2 screenPx(vec2 tap) { return vec2(FRAG_PX.x, 1080.0 - FRAG_PX.y) + tap; }`;

/** World px -> screen px under the camera (the inverse of camInv). */
export function camFwd(c: Cam, x: number, y: number) {
  const dx = x - 960, dy = y - 540, s = Math.sin(c.roll), k = Math.cos(c.roll);
  const px = c.x + c.zoom * (k * dx - s * dy), py = c.y + c.zoom * (s * dx + k * dy);
  if (!c.twist) return { x: 960 + px, y: 540 + py };
  const a = c.twist * Math.max(0, 1 - Math.hypot(px, py) / 1100) ** 2, ts = Math.sin(a), tk = Math.cos(a);
  return { x: 960 + tk * px - ts * py, y: 540 + ts * px + tk * py };
}

export function camVec(c: Cam): [number, number, number, number] { return [c.zoom, c.roll, c.x, c.y]; }

/** Film-end fade: the picture keeps its energy through the audio's tail and only fades in the last second. */
export function endFade(t: number, au: AudioData) {
  return prog(t, Math.max(au.tailEnd, au.duration - 0.45), au.duration) * 0.95;
}

/**
 * Only the noise part of GLSL_COMMON (simplex noise, fbm, curl2): vertex shaders cannot take the
 * whole common block, whose AA helpers use fwidth.
 */
export const NOISE_GLSL = (() => {
  const a = GLSL_COMMON.indexOf('vec3 _mod289'), b = GLSL_COMMON.indexOf('// ---- 2D SDFs');
  if (a < 0 || b < 0) throw new Error('GLSL_COMMON layout changed: noise block not found');
  return `${GLSL_COMMON.slice(GLSL_COMMON.indexOf('mat2 rot2'), GLSL_COMMON.indexOf('\n', GLSL_COMMON.indexOf('mat2 rot2')))}\n${GLSL_COMMON.slice(a, b)}`;
})();
