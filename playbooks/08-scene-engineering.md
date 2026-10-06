# 08 — Scene engineering: one plate, one module, one owner

Owner: a Graphics Engineer per plate module. Read first: your plate's row in `plan.json`, its paragraph in `TREATMENT.md`, the BRIEF rows of its
lines, playbooks 03–07, and one pdoom example of your idiom (playbook 05 §2). Our engine (`app/src/engine/`) is a port of pdoom's, so pdoom
scene code (`PD/app/src/scenes/`, `PD` = `~/.cache/audio-to-film/pdoom-video`) applies almost line for line; bare `name.ts:N` below = `PD/app/src/scenes/name.ts`.

## 1. Files and ownership

| Path | Owner | Plate engineers may |
|---|---|---|
| `app/src/songs/<slug>/scenes/<module>.ts` | you | write (default export = the Scene class) |
| `app/src/songs/<slug>/scenes/<module>-*.ts` | you | write helpers, shaders, data tables |
| song style module (`app/src/songs/<slug>/style.ts`; DESIGN §5 calls it `palette.ts`) | lead | import read-only (palette `HEX`/`LIN`/`rgba`, shared motif drawing, counter readout) |
| `plan.json`, `timeline.ts`, `TREATMENT.md`, `BRIEF.md` | lead | read only |
| `app/src/engine/*`, `app/src/songs/edit.ts`, `app/src/songs/_placeholder.ts`, `app/src/archetypes/*`, `app/src/scenes/_motifs.ts` | lead | read only |
| other plates' files | their owners | never edit, never import (copy hand-off constants, playbook 07) |

pdoom's rule, verbatim: "Don't edit files outside your scene files (and your own helper files named `scenes/<name>-*.ts`). Engine changes: ask the
lead (report in your final message what you'd need)" (`PD/docs/ENGINE.md:55`). Put engine requests in your report, never in a shared file.

## 2. The Scene contract (`app/src/engine/scene.ts`)

- `class X extends Scene`; `init()` (async allowed) builds everything once; `render(f, out)` draws frame `f` and **fully overwrites** `out`
  (HalfFloat, linear HDR; values above ~0.85 bloom); returns `PostOverrides` (`app/src/engine/post.ts:16-32`: `exposure, bloom, bloomThreshold,
  bloomKnee, bloomRadius, halation, ca, grain, vignette, hud, fade, flash, shake: [x, y], zoom, invert`).
- `this.ctx`: `renderer, audio, lyrics, comp, W, H, id, params, start, end` (`app/src/engine/scene.ts:10-23`). One module may serve several plates through `params`.
- `Frame f`: `t` (song s), `dt`, `lt` (local s), `p` (0..1 in window), `start`, `end`, `seeked`, `preroll`, `beat`, `bar`, `beatPhase`, `barPhase`,
  `a` (audio sample), `under`, `tin`, `tout` (`app/src/engine/scene.ts:25-56`).
- Leave `stateful = false`: adaptive motion blur renders sub-frames out of order and throws on stateful scenes (`app/src/engine/engine.ts:224-228`).
  Keep `handlesTransition = false`: windows abut, nothing overlaps (playbook 07).
- An exception in `init()` or `render()` paints the plate dark red (`app/src/engine/engine.ts:324-327, 345-348`) and fails every render of an authored song
  (`app/scripts/render.ts:73-74`).

```ts
// app/src/songs/<slug>/scenes/memo.ts — owner <agent>. Plate memo: "<one-line concept>".
import type * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../../../engine/scene';
import { FSPass, Layer2D } from '../../../engine/gl';
import { Lyrics, type Line } from '../../../engine/lyrics';
import { ease, prog, pulse, hash, frameIdx } from '../../../engine/util';
import { edit, span } from '../../edit';
import { LIN } from '../style';                                   // the song's palette (lead-owned)

export default class Memo extends Scene {
  private ui = new Layer2D();
  private ground!: FSPass;
  private L!: Line;
  private tStamp = 0;
  private push: [number, number] = [0, 0];

  override init() {
    const { lyrics: ly, audio: au, start } = this.ctx;
    const e = edit(ly, au);
    this.L = e.line('Coffee is hot');                             // by content; throws if missing
    this.tStamp = e.snap(e.word('Coffee is hot', -1).start);      // last word, on the beat if within 0.1 s
    this.push = span('memo push', start, this.tStamp);            // every window through span(), in init()
    this.ground = new FSPass(/* glsl */ `
      uniform vec3 uPaper, uInk;
      void main() { float g = hatch(FRAG_PX.y / 7.0, 0.12); fragColor = vec4(mix(uPaper, uInk, g), 1.0); }`,
      { uPaper: { value: LIN.paper }, uInk: { value: LIN.ground } });   // role names = whatever the style module defines
  }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer: r, comp } = this.ctx;
    this.ground.render(r, out);                                   // overwrites out
    const c = this.ui.ctx;
    this.ui.clear();
    const z = 1 + 0.04 * prog(f.t, this.push[0], this.push[1]) + 0.5 * prog(f.t, this.tStamp, this.tStamp + 0.35, ease.outExpo);
    c.save(); c.translate(960, 540); c.scale(z, z); c.translate(-960, -540);
    for (const w of this.L.words) { const k = Lyrics.wordProgress(w, f.t); /* draw by state: playbook 04 */ }
    c.restore();
    comp.draw(r, this.ui.upload(), out);
    const amp = 18 * pulse(f.t, this.tStamp, 0.06), n = frameIdx(f.t);
    return { bloomThreshold: 1.8, halation: 0, shake: [amp * (hash(n, 11) - 0.5) * 2, amp * (hash(n, 12) - 0.5) * 2] };
  }
}
```

## 3. Determinism (N19, catalog F4)

- Every pixel is a function of `f.t`. No `Math.random()`, `Date.now()`, `performance.now()`, no bitmap images or texture loaders: `gates/film_gate.sh`
  R13 greps `app/src/songs` for `Math.random(`, `Date.now(`, `performance.now(`, `TextureLoader`, `ImageLoader`, `new Image(` and image file
  extensions in quotes — **comments and strings count**, so never write those tokens at all.
- Seeded randomness: `mulberry32(seed)` in `init()` for precomputed sets; `hash(...)` (stateless) per element; `frameIdx(t)` for per-frame jitter
  and flicker (constant across one frame's blur shutter; `Math.floor(t·60)` blends two states, `app/src/engine/util.ts:75-80`). `seedOf(id)` gives a stable seed.
- Never quantise time into a noise seed (`floor(t·12)` popped every 1/12 s, F2): blend continuous fields.
- Simulations run once in `init()` and are indexed by `t`: flow clock line-integrated (`spacetime.ts:205-213`), a string ODE at 1000 Hz
  (`fuse.ts:414-474`), DBM trees and Lorenz paths (`app/src/archetypes/_physics.ts`). A speed that changes over time: phase = ∫ frequency dt
  (precompute, or `au.integral(name, t)` for envelopes); `cos(2π·f(t)·t)` chirps (F14).
- Particles with a time-varying rate: birth on a fixed `rateMax` clock, thin by `hash`, so each particle keeps its identity across sub-frames
  (`app/src/scenes/_motifs.ts:10-18` comment, `sparkParticles` 19-48).
- Decide discrete choices (row breaks, arc side, which cell flips) per word or per plate in `init()`, never per frame (F11, F13).

## 4. Anchors (playbook 03)

All times come from `edit(ly, au)` and `ly` lookups by content, computed in `init()`; every `prog`/`keys` window goes through `span()` there.
Audio features only for micro-decoration (≤ 3–5 % zoom, flicker). No hard-coded seconds; derived offsets from anchors (`tStamp + 0.35`) are fine.

## 5. Performance budget

- ≤ 25 ms per frame at 1080p with `--samples 1` (`PD/docs/ENGINE.md:54`), measured with `render.ts perf`. The master multiplies this by its
  adaptive sub-frames (4 → 324; v2's 4K master averaged ~133 per frame), so every millisecond counts ~100×.
- ≤ 2–3 `Layer2D` per plate (2–4 ms upload each); precompute layouts, paths, atlases and simulations in `init()`; no per-frame allocation of big arrays.
- Heavy ray marches at half resolution (G-buffer + full-res composite, `shoggoth-glsl.ts`); cap noisy shaders with the timeline entry's
  `maxSamples` (108, `PD/app/src/timeline.ts:62-64`) — ask the lead to set it.
- Use `rgss(k)` with `SS_TAP_GLSL` for in-shader 4-tap AA: the engine spreads the taps over blur sub-frames for a quarter of the cost (`app/src/engine/gl.ts:14-28`).
- Work in logical 1920×1080 px; the engine scales to 4K (`makeRT` sizes, `FRAG_PX`, `pxLine`/`rampLine`/`aaStroke` keep hairline ink at 4K).

## 6. Engineering lessons from v2 that still apply (`FAILURE_LOG.md`)

| F | What broke | Rule |
|---|---|---|
| F2 | noise reseeded every 1/12 s: visible cadence | continuous fields; per-frame variation only via `frameIdx` |
| F4 | a contact sheet was misread by eye | label every still with its time; confirm claims with a second frame and with `frame_metrics.py` |
| F6 | a mask sampled outside its span produced grey panels | clamp/mask domains explicitly; look at the plate's edges |
| F7 | a roll held at π left lyrics upside down | text upright at plate end; rolls only for a word (playbook 06) |
| F8 | an unbounded dive cropped the lyric | bound zoom by plate progress; 96 px title-safe at max zoom |
| F9 | resume reused stale segments | after any code change delete `<film>.segments/` (and the old film file, playbook 10) |
| F11 | global flash greyed the blacks; rows flipped 1↔2; debug-looking overlays | no global flash; layout from resting widths; scene text belongs to an object |
| F12 | 3-frame closes read as flashes; hatch < 6 px crawled; type clipped by zoom | closes ≥ 4 frames; hatch ≥ 6 px on screen; safe margins |
| F13 | whole-frame scaling read as a box zoom; a second copy of the motif | transform elements, not the buffer; one instance of a carried element |
| F14 | double images inside 4K blurred frames | phase = ∫ f dt; hold + smooth at voicing edges; 60 ms pre-pull before impulses; 2-frame attacks; landings continue from the anticipation |
| F15 | the shockwave fired before the object arrived | schedule travel so the arrival lands on the anchor |
| F16 | uniform layer spin read stock; global chromatic aberration fringed hairlines | real 3D or radius-dependent motion; `ca: 0` on hairline plates |
| F17 | a dim 1 px line read as black | key lines ≥ 2–3 px and bright enough at 1080p |
| F18 | the 3D far plane clipped the motif | `far` 1e6 when the camera pulls back; always draw key elements |
| F19 | an element drawn before a squash pass vanished; lines saturated to 255 | draw carried elements last; keep held lines ~120/255 |

## 7. Kit inventory (verified names)

| Module (under `app/src/`) | What you get |
|---|---|
| `engine/gl.ts` | `W`, `H`, `PW`, `PH`, `SCALE`; `FSPass(frag, uniforms, {blending, transparent})` with `GLSL_COMMON` prepended, `.u`, `.render(r, target)`; `Layer2D` (`.ctx`, `.clear(color?)`, `.upload()`); `Compositor` via `ctx.comp.draw(r, tex, target, {mode: normal\|add\|screen\|multiply\|max\|replace, opacity, tint, scale, offset})`; `makeRT(w, h, opts)`; `clearRT(r, rt, rgb)`; `SS_TAP`, `SS_TAP_GLSL` |
| `engine/glsl/common.ts` | `hatch`, `engrave`, `aaFill`, `aaStroke`, `pxLine`, `rampLine`, `sdCircle/sdBox/sdSegment/sdSphere/sdBox3/sdCapsule/sdTorus`, `smin/smax`, `snoise`, `fbm`, `curl2`, `hash11…hash33`, `rot2`, `luma`, `toSRGB/toLinear`, `rgss`, `FRAG_PX`, `PX_SCALE` (ignore `C_*` and `heat()`: pdoom palette) |
| `engine/lines.ts` | `LineBatch(capacity, {screen2D, worldWidth, blend: add\|max\|normal, depthTest})`: `seg`, `seg2`, `polyline`, `clear`, `render(r, target, camera?, widthScale)` |
| `engine/type.ts` | `F.*` families, `font`, `layout`, `glyphX`, `measure`, `fitSize`, `textPath2D`, `textPathCommands`, `textPoints`, `smart`, `plain`, `missingGlyphs`, `ot` |
| `engine/stroke.ts` | `STROKE_FONTS`, `strokeText`, `drawStrokeText`, `writtenLength` |
| `engine/util.ts` | `clamp`, `lerp`, `invLerp`, `remap`, `smoothstep`, `smootherstep`, `window01`, `ease.*`, `prog`, `springStep`, `pulse`, `mulberry32`, `frameIdx`, `hash`, `noise1/2/3`, `fbm1/2`, `keys`, `polylineLengths`, `pointAtLength`, `hexToLinear` |
| `engine/lyrics.ts`, `engine/audio.ts`, `songs/edit.ts` | lookups and anchors (playbook 03) |
| `archetypes/_physics.ts` | `dbmTree`, `lorenz`, `pluck`, `modeCurves`, `curveAt` (pure, import freely) |
| `archetypes/_kit.ts` | palette-free: `morphText`, `morphWidth`, `morphGlyph`, `mixCss`, `CAM_GLSL`, `camFwd`, `camVec`, `endFade`, `seedOf`, `NOISE_GLSL`. Banned in authored plates: `camera`, `hitPost`, `handoff`, `handoffState`, `sparkAt`, `sparkFlare`, `drawKaraoke`, `drawWord` (pdoom orange), `compositeHot` (orange-only) |
| `scenes/_motifs.ts` | pdoom's spark and mask: patterns to learn from, not motifs to use (N5) |

## 8. Check your work — render stills and LOOK at them

```sh
cd app
ATF_RUN=../outputs/<run> bun scripts/render.ts stills --only <id> --t <t1>,<t2>,<t3> --out ../outputs/<run>/wip/<id>    # then Read each PNG
ATF_RUN=../outputs/<run> bun scripts/render.ts stills --only <id> --t <t> --samples auto --shutter 0.2 --scale 2 --out ../outputs/<run>/wip/<id>-4k
ATF_RUN=../outputs/<run> bun scripts/render.ts sheet --only <id> --from <start> --to <end> --n 16 --cols 4 --out ../outputs/<run>/wip/<id>.png
ATF_RUN=../outputs/<run> bun scripts/render.ts perf --only <id> --from <a> --to <b> --samples 1
```

"Stills (the main way to check your work — then LOOK at the PNGs with the Read tool)" (`PD/docs/ENGINE.md:8`). Pick times at: plate start + 2
frames, every anchor ±1 frame, each line's mid-point, the busiest beat, the last 3 frames. Look for: red error frames, black frames, sung text
legibility and safe area, accent budget, empty quadrants, moiré, double edges, the hand-off pixel. Fix, re-render, look again.

Report back: files written; still paths with times; perf (avg/p95 ms); measured hand-off pixels; any request for the lead (engine, style module,
`maxSamples`, contract change). Never claim a look you have not seen in a rendered PNG.
