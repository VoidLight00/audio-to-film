# 05 — Visual idioms and the techniques that render them

Owner: Creative Director picks `idiom` per plate; the plate engineer picks the technique. `PD` = `~/.cache/audio-to-film/pdoom-video`;
bare `name.ts:N` = `PD/app/src/scenes/name.ts`. pdoom gives every plate its own idiom (17 modules, 17 idioms, 11 macro families) under one
palette/grain/humour (catalog §0-5). v2 had one family for the whole film: "glowing physics simulation on black" (REF G2).

## 1. From a line's concept to an idiom

1. Start from the concept card (`concept.subject`, playbook 02 §3). The subject is a concrete thing: a loss curve, a form, a road, a fuse.
2. Ask: **which document, instrument or interface displays that subject natively?** chart, form, map, schematic, ledger, specimen sheet,
   dial, terminal, engraving, broadcast monitor, floor plan… That is the idiom. (Love song: letters, maps, contracts; catalog §8.)
3. The idiom must supply: a place for each line (playbook 04 method), its own furniture for detail (§4), its own scene text and one dry gag (§5),
   a counter cameo slot, a motif role, and an element to hand over at the boundary (playbook 07).
4. Check the neighbours: never the same idiom as the plate before or after (A3); macro families vary (REF §5 #7: ≥ 12 idioms, ≥ 6 families,
   no family > 30 % of runtime, ≤ 20 % of neighbouring plates in one family); light/dark alternates (§3).
5. Inside a plate, sub-idioms may chain by transformation (pdoom `ascent`: engraved snake eye → log chart → banknote → inverted convergence →
   odometer in 5.25 bars, each link a match cut, catalog §4.8).

## 2. Idiom menu (catalog §6b) — technique and our building blocks

| Idiom | Technique | Build with (our engine) | Example |
|---|---|---|---|
| technical drawing sheet | analytic grid shader; stroke system with ease-inverted arrival time for hot-ink cooling | `FSPass`, `LineBatch`, `strokeText` | `open.ts:44-74, 256-272, 777-785` |
| plot → engraved contour terrain | height field twinned in JS and GLSL; `fwidth` contours, Tanaka shading, hachures, fog, reveal wavefront | `FSPass` + same function in TS | `loss.ts:21-75, 91-161` |
| prompt / terminal UI | Canvas2D UI plane under a 2D camera; only the accent blooms | `Layer2D` | `prompt.ts`, `hook.ts` |
| engraved tunnel / cage / pool of light | polar fake-3D tunnel, procedural cylinder + `hatch()`, hashed dust grid | `FSPass` | `prompt.ts:693-804` |
| type specimen | width-axis grotesk, guide lines, numbered legend | `morphText`, `layout` | `hook.ts:258-374` |
| paper figure + doubling tree | polar grid + analytic shock rings; max-blend lines | `FSPass`, `LineBatch({blend:'max'})` | `room.ts:70-111` |
| hairline wireframe interior | CPU pinhole projection, near-plane clip, batches split for occlusion | `LineBatch` | `room.ts:165-173, 801-811` |
| scratchboard ray-marched creature | half-res G-buffer + engraving composite (lines follow surface params, LOD, rim) | two `FSPass`es | `shoggoth-glsl.ts:39-451` |
| detector / dashboard UI | corner brackets, confidences, flicker seeded by `frameIdx` | `Layer2D` | `shoggoth.ts:604-740` |
| phosphor oscilloscope | analytic graticule; core + halo + afterglow traces | `FSPass` + `LineBatch` | `spacetime.ts` (I) |
| gravitational lens | thin-lens equation refracting a whole Canvas2D layer | `FSPass` sampling a `Layer2D` | `spacetime-lens.ts:3-129` |
| 3D hairline well / flow | grid height field; flow clock integrated in `init()` | `LineBatch` 3D | `spacetime.ts:205-213` |
| engraved eye / scales | height-field normals, Voronoi scales, section hatching | `FSPass` | `ascent-eye.ts:9-226` |
| log chart / banknote guilloché | hatched candles; rosette r = R + a·sin(nθ + φ); line-relief engraving | `LineBatch`, `FSPass` | `ascent-note.ts:40-154` |
| mechanical odometer | drum `asin` mapping, digit atlas, analytic blur | `FSPass` + atlas `Layer2D` | `ascent-odo.ts:44-136` |
| government paper | channel-coded ink, Beer-Lambert overprint `col *= pow(transmission, density)`, stamp mask, tear pass | `Layer2D` + `FSPass` | `bureau.ts:33-187` |
| blueprint + survey map | keystone 2D camera, multi-tap camera blur, height-field contours, SDF relief | `FSPass` + world `Layer2D` | `leftturn-map.ts:286-522` |
| Gantt / schedule | song time is the x axis, beats are the ticks | `Layer2D` | `leftturn-gantt.ts:132-175` |
| engraved steel lattice | 2D SDF items → ray-marched woven cell stack, swapped at the same framing | `FSPass` | `paperclips-glsl.ts:67-294` |
| braided fuse / cable | arc-length strip + procedural braid shader + burn erosion | custom mesh + shader | `fuse.ts:56-117, 381-409` |
| grid chart + guitar tab | axes + a spring ODE string precomputed at 1000 Hz in `init()` | `LineBatch` | `fuse.ts:414-474` |
| 3D technical line drawing | 3D lines + dark `InstancedMesh` bodies for hidden-line removal | `LineBatch` 3D + three.js | `stack.ts:174-186, 237-343, 458-478` |
| broadcast QC monitor | safe-area rectangles as breakable objects | `Layer2D` | `dense-press.ts:115-128` |
| floor plan of cells | cell lookup shader + beat rings | `FSPass` | `dense-gpu.ts:64-137` |
| probability tree / corpus / Droste | Canvas2D tree; mono corpus canvas; log-polar recursion | `Layer2D`, `FSPass` | `loom-tree.ts:116-188`, `loom-glsl.ts:17-64` |
| white-line engraved room / theatre | SDF march, rect area light, tone → line coverage, volumetric haze | `FSPass` | `ilya-glsl.ts:177-472` |
| typeset equation + chat UI | font outlines flattened and partially drawn | `textPathCommands` | `outro.ts:833-870` |

The idiom names are pdoom's *techniques*; their content (AI-safety jargon) is song-specific — never reuse it.

## 3. Light/dark rhythm (M4) — paper plates are mandatory

Measured: ≥ 8 % of frames with mean luma > 0.45 and the std of mean luma over time ≥ 0.15 (`src/frame_metrics.py:161`; ref 9.8 % / 0.214,
v2 0 % / 0.036). With dark frames near 0.1 and paper frames near 0.75, 8 % bright already gives std ≈ 0.17; 3 % does not pass.
- Plan ≥ 2 paper plates or paper sub-movements (pdoom: `ascent` B on bone, all of `bureau`; plus bone/accent fields in hooks), never adjacent,
  each entered or left by a contrast cut (playbook 07). Total ≥ 10 % of runtime.
- Paper recipe: procedural paper ground (fbm fibre, specks, side light), ink as overprint, accent as a third ink (`bureau.ts:33-140`).
  Our post chain has no `paper` switch (pdoom's had one): draw the paper yourself, then return `bloomThreshold` ≈ 1.8 so nothing on paper blooms
  (`bureau.ts:535`) and `halation: 0` (our halation tint is a fixed red-orange, `app/src/engine/post.ts:128`).
- Do not use the post `invert` to make paper: it maps around pdoom's bone (`app/src/engine/post.ts:134`), not your palette.

## 4. Detail density (M5)

Measured: near-empty frames (< 3 % of pixels with grey > 0.12) ≤ 10 %; in the median frame ≥ 8 of 16 grid cells hold edges (Canny 60/150 > 2 %)
(`src/frame_metrics.py:110-127`; ref 7.7 % / 0.56–0.63, v2 39–41 % / 0.25).
- Spread structure over the whole frame: the idiom's own furniture — grids, scales, ticks, rules, registration marks, legends, title blocks,
  hatching, contour lines, cell walls. A single object centred on black fails, however beautiful.
- Edges must be real contrast (≥ ~60/255 steps), not 10 % grey hairlines on near-black.
- Grounds count: engraved hatching, paper fibre, dust that lives *in the light* (faint motes scattered in the dark "read as stars", `ilya-room.ts:366`).
- Hatch period ≥ 6 px on screen, or it crawls as moiré (F12); pdoom keeps engraving lines ~6 px with LOD (`shoggoth-glsl.ts:192-451`).
- 100 % crops at 4K should reveal more (micro-text, ink texture, stamp grain), not hairlines and moiré (REF §1.5).

## 5. Scene text and dry humour (M7, C5)

Measured: OCR finds scene text in ≥ 50 % of frames with no singing (ref 81–84 %, v2 3 %) (`src/frame_metrics.py:129-155`). So every plate's
world carries readable text even between lines: labels, axis values, form fields, footnotes, instrument readouts, logs, legends, stamps.
- At least one text block per frame large and upright enough for Vision OCR on a 1280×720 sample (≥ 3 alphanumerics; keep ≥ ~18 px at 1080p;
  smaller micro-text is still worth it for 4K crops).
- One dry gag per plate in the idiom's own voice, referencing the lyric's domain (`gag` in plan.json). Tone models from pdoom — never copy them:
  `EXIT (DECORATIVE)` (`room.ts:1263-1265`), `* "Safe enough" is defined in Form 7-C, which has not been drafted.` (`bureau.ts:648`),
  `REV C · SUPERSEDES REV B (ALSO FINE)` (`leftturn-map.ts:158`), `r = 0.00` (`fuse.ts:855`). Straight-faced, small, mono; no jokes that explain themselves.
- Debug-looking overlays that belong to no document read as slop (F11). Text is part of an object the world contains.

## 6. Accent budget and bloom (M6, catalog F1–F2)

- The accent covers ≤ 8 % of painted pixels in the median frame (`frame_metrics.py` M6; ref 5.7–6.5 %, v2 15–16 %). Spend it on: the sung word,
  the motif, system marks (stamps, strikes, cursors), one hit per bar. Brief full-frame accent fields are fine (they are rare frames).
- Run `frame_metrics.py --accent '#<your accent>'` — the default is pdoom's `#FF4D12`. M6 only counts saturated pixels (S > 120, V > 100, hue ±6
  OpenCV units), so a desaturated accent is unmeasured: judge it by eye then.
- Only the accent may exceed ~0.85 linear and bloom; paper-coloured type never blooms (catalog F2, `PD/docs/TREATMENT.md:20`).
- Engine colour coupling (shared files, pdoom palette): `GLSL_COMMON` constants `C_INK … C_ACID` and `heat()` (`app/src/engine/glsl/common.ts`),
  post halation tint and `flash` (adds pdoom bone), `_kit.ts compositeHot` (blooms only orange-red: `c.r − 1.3·c.g`), `_motifs.ts` spark/mask.
  Pass your palette as uniforms from the song's style module; write your own hot-pass keyed to your accent; use `flash` ≤ 0.05 (additive, `outro.ts:107`).

## 7. Depth (REF §5 #17: ≥ 40 % of plates show a depth cue)

Lit 3D (ray-marched SDF with rim/AO/shadow), fog, perspective grids, occlusion and hidden-line removal, viewpoint moves (crash dolly, crane, orbit,
fall), Tanaka-shaded contours, keystone tilt (`leftturn-map.ts`). v2 had "2D emission on a plane; depth = zoom dives" (REF §1.5).

Choosing the renderer:

| Need | Use | Cost notes |
|---|---|---|
| flat document, UI, type | `Layer2D` (Canvas2D, uploaded each frame) | 2–4 ms per upload; ≤ 2–3 layers per plate (`PD/docs/ENGINE.md:54`) |
| analytic field, grid, paper, contours | `FSPass` (fragment shader; `GLSL_COMMON` prepended) | cheap; use `rgss(k)` + `SS_TAP_GLSL` to spread 4-tap AA over blur sub-frames |
| many lines (2D or 3D, hairlines) | `LineBatch(capacity, {screen2D, worldWidth, blend, depthTest})` | instanced; capacity fixed in the constructor |
| real 3D surfaces | ray-marched SDF in an `FSPass` (half-res G-buffer when heavy) or three.js meshes | set `maxSamples` (e.g. 108) for noisy marches |

## 8. Our kit as materials inside an authored plate

Archetypes are no longer plates (DESIGN §2). Lift the technique into `scenes/<module>-*.ts`; never import an archetype class: it brings v2's
`camera()` (seeded 180° rolls), `hitPost()` (snare-triggered shake), the spark/flatline `handoff()`, `drawKaraoke` subtitles and pdoom colours.

| Kit piece (`app/src/archetypes/`) | Physics / technique | Use as material when… | Watch |
|---|---|---|---|
| `lens.ts` | Schwarzschild thin-lens trace of a source-plane layer; accretion ring | a line is about pull, collapse, a singularity; refract *your* plate's content | v2 lens judged derivative (`docs/STATUS.md`) |
| `curl.ts` | divergence-free flow ψ; atoms advected by fixed Euler steps (pure f(t)) | smoke/steam/flow carrying scene text **after** it is sung | sung words dissolved into illegibility in v2 |
| `dbm.ts` + `_physics.dbmTree` | dielectric-breakdown trees solved in `init()` | an arc or crack between two words on stressed syllables | v2 fired on kicks: re-anchor to words/beats (D6); 4K seams |
| `attractor.ts` + `_physics.lorenz` | Lorenz pair (RK4) parting from 1e-5 | sensitivity, forking futures, a forecast fan inside a chart idiom | generic alone; frame it in a document |
| `string.ts` + `_physics.modeCurves / curveAt / pluck` | standing modes from sung f0; d'Alembert pluck with 60 ms pre-pull | a word riding a string bent by the real pitch (method 20) | phase = ∫ frequency (F14) |
| `kinetic.ts` | SDF lattice crash-dolly + full-screen word slam via `morphText` | a hook plate's depth ground | lattice must be the idiom's object, not décor |
| `instrumental.ts` | closed-form kernels of drum onsets on a point lattice | micro-texture under beat-indexed instrumental choreography | audio-triggered: keep big events on beats |

Safe to import directly (palette-free, pure): `_physics.ts` (`dbmTree`, `lorenz`, `pluck`, `modeCurves`, `curveAt`); from `_kit.ts`: `morphText`,
`morphWidth`, `morphGlyph`, `mixCss`, `CAM_GLSL`, `camFwd`, `camVec`, `endFade`, `seedOf`, `NOISE_GLSL`. `sparkParticles` (`app/src/scenes/_motifs.ts:19-48`)
shows the right pattern for deterministic particles with a varying rate (birth-time clock, hash thinning), but draws pdoom's colours: copy the
pattern, not the call.

## 9. Checklist per plate

- [ ] idiom derived from the subject; differs from both neighbours; supplies place-for-lyric, furniture, scene text, gag, cameo, motif, hand-off element
- [ ] light/dark plan known (paper plate or not); bloom only on the accent
- [ ] median frame has structure in ≥ half the frame; no near-empty frames outside a declared rest
- [ ] scene text readable in unsung frames; one gag
- [ ] at least one depth cue unless the idiom is deliberately flat (paper, UI), and then the camera supplies parallax or scale change
