# 04 — Lyric typography: words inside the image

Owner: each plate engineer, per line in `plan.json integration[]`. The lyric is the subject, not a caption: pdoom puts ~44 of 46 lines inside the
picture and ~40 stage the line's meaning (REF §3.1); v2 showed 18 of 23 lines as subtitles and 0 interpreted (REF §3.2, G4).
`PD` = `~/.cache/audio-to-film/pdoom-video`; bare `name.ts:N` = `PD/app/src/scenes/name.ts`. Colour names below are roles: *accent* = the song's
signal colour, *paper* = its light, *neutral* = its mid grey.

## 1. Invariants (any violation is a high-severity critic defect)

1. **Never ahead of the voice.** A word's emphasis (fill, colour, slam, burn front) starts at `w.start` (±1 frame), never before
   (`PD/docs/TREATMENT.md:33`, catalog B1). Faint anticipation is allowed ≤ 0.5 s before (treatment cap ~0.4 s). A probability popup may open
   early but the sampled row lights only at `t0` (`prompt.ts:90-95`); fuse ignition starts at 15 % of the glyph so the burn never leads (`fuse.ts:311-320`).
2. **Every word synced.** Use `Lyrics.wordProgress(w, t)` (piecewise across `w.syl` when present, `app/src/engine/lyrics.ts:91-104`) or
   `Lyrics.lineCharProgress(l, t)` for per-glyph wipes; ≥ 95 % of sung words show a text-region change within ±1 frame of `w.start` (B2).
3. **Readable while sung.** The current word is never flipped, mirrored (unless the method *is* mirroring, e.g. "backward"), dissolved, cropped, or
   smeared. v2 broke this three ways: a seeded 360° roll turned subtitles upside down (`FAILURE_LOG.md` F7), particle words read "building" as
   "bevolog" (REF §1.5), zoom cropped lines at the frame edge (F8). Schedule whips between words or after the wipe completes.
4. **Title-safe**: lyric text ≥ 96 px from every edge at the plate's maximum zoom + shake (`PD/docs/TREATMENT.md:36`, B6). Declared exception
   only when the method is breaking the frame (pdoom `dense` "safety fence", `dense-press.ts:115-128`).
5. **One method per line, unique across modules** (plan_gate B3); subtitle/overlay/caption ≤ 5 % of lines — aim for 0.
6. **Dropped lines** (failed the confidence gate) never appear as text; the image interprets them (playbook 01). Never type a word the gate dropped.

## 2. Emphasis grammar (catalog §6a; defaults, adapt to the idiom)

| State | Treatment | Source |
|---|---|---|
| unsung | paper at 10–45 % or a thin outline (outlines rarer after pdoom R5) | `open.ts:1088`, `fuse.ts:688-736` |
| anticipation | faint, 0.15–0.5 s before the word | `PD/docs/TREATMENT.md:33` |
| onset | slam 1.10–1.35× decaying over 45–160 ms (`1 + amt·(1 − outExpo((t − t0)/0.16))`) | `hook.ts:119-123` |
| sung | accent, or white-hot → hot accent → accent (heat `exp(−age/0.28)`) | `loss.ts:1046-1051` |
| after | cool to paper with τ 0.25–0.8 s, **or switch instantly**: a linear blend from accent to paper "reads salmon" | `stack.ts:612` |
| held (> 0.6 s) | finish the wipe in 0.4 s, then keep moving (width steps per beat, re-slams, burn) | `shoggoth.ts:822-825` |
| printed / typed / stamped | the *act* of printing marks the sung state; the accent is reserved for system marks (guides, stamps, strikes) | `bureau.ts` (catalog §4.9) |

## 3. Integration-method menu (catalog §6a, 36 methods)

Pick by the line's verb or jargon: the method should *stage* the meaning ("backward" set mirrored, "disobey" highlighted right-to-left,
"drop" letters stacked down the fall). Write the method into `integration[].method` in your own words.

| # | Method | Example |
|---|---|---|
| 1 | pen/spark writes it in a single-stroke font (word length spread over its letters, `writtenLength`) | `open.ts:282-292`, `spacetime.ts:51-59` |
| 2 | text on a path, glyph time capped by the writing head's arrival | `loss.ts:407-429, 798-829` |
| 3 | letters pile up along an event (one per fall height, growing) | `loss.ts:830-850` |
| 4 | perspective text on a 3D surface (floor, board, block face, proscenium) | `loss.ts:879-903`, `room.ts:828-838`, `stack-kit.ts:66-166`, `ilya.ts:130-163` |
| 5 | typed as tokens with a next-token distribution popup | `prompt.ts:78-104, 449-575` |
| 6 | typed into a form field (char = `w.start + i·min(70 ms, dur/len)`, key jitter) | `bureau.ts:300-305` |
| 7 | terminal line with block cursor / auto-reply subject line | `loss.ts:974-991`, `paperclips.ts:367-391` |
| 8 | word stamp: drops from 0.45 m, 1.7→1 scale, debris, no anticipation | `room.ts:1388-1398`, `leftturn.ts:420-431` |
| 9 | one letter slammed per syllable | `open.ts:1100-1106`, `ascent.ts:520-544`, `dense-askew.ts:411-426` |
| 10 | one word = one full frame, width axis as character | `hook.ts:258-374` |
| 11 | Swiss column, each row fitted to the column width, glyph clip wipe | `open.ts:151-199`, `room.ts:536-572` |
| 12 | hierarchy inversion by rolling the world (word drawn upside down, the roll rights it) | `loss.ts:1021-1040` |
| 13 | width axis as expression: stretch on held notes, condense under pressure, step per beat | `spacetime.ts:835-847`, `shoggoth.ts:464`, `dense-press.ts:192-195` |
| 14 | engraved into the scene plane by the subject's own hatching, occluded by geometry | `shoggoth-glsl.ts:416-440` |
| 15 | the tool's edge is the karaoke cursor (x-ray band, burn front, branch tip, network pulse) | `shoggoth.ts:475-492`, `fuse.ts:311-320`, `bureau.ts:774-783` |
| 16 | lyric as data-vis label: leader tags with countdowns / Gantt bars as long as the sung word / probability-tree tokens | `shoggoth.ts:604-672`, `leftturn-gantt.ts:132-175`, `loom-tree.ts` |
| 17 | occluder peeled off ([MASK] block wiped) / covered by a censor bar | `loom.ts:348-378`, `ilya.ts:103-123` |
| 18 | letters become atoms and reassemble into an object | `spacetime.ts:215-258, 902-962` |
| 19 | letters as fuel: ignite → char → crumble | `fuse.ts:672-736` |
| 20 | a word on a string bends with the singer's real pitch (`au.pitch(t)` gives f0 here) | `fuse.ts:414-474, 950-970` |
| 21 | the world's cells spell it (text mask as a data texture lighting cells) | `dense-gpu.ts:17-58` |
| 22 | letters break the frame guides | `dense-press.ts:115-128, 415-479` |
| 23 | mirror-set right-to-left / highlight runs backwards (disobedience) | `bureau.ts:926-934`, `stack.ts:641-662` |
| 24 | time-remapped stutter repeat | `bureau.ts:341-351` |
| 25 | text on an eyelid seam, glyphs split top/bottom as it opens | `ascent.ts:169-219` |
| 26 | repeated on expanding shockwave arcs | `ascent.ts:220-264` |
| 27 | refracted by a lens / wrapped round a photon ring / the hole is the word's O | `spacetime.ts:177-187, 516-562`, `spacetime-lens.ts` |
| 28 | road-marking paint: hot while sung, paint afterwards | `leftturn-map.ts:172-230, 441-448` |
| 29 | letters drift apart after singing, the cursor clings to the last one | `prompt.ts:426-440, 592-597` |
| 30 | shrinks into a convergence point | `ascent.ts:667-694` |
| 31 | notation tokens + gloss + the number on an odometer | `ascent.ts:787-827` |
| 32 | a held word echoes as ghosts into the next containers | `stack.ts:132-142` |
| 33 | in the dark margin with no backing; the camera composes space for it | `ilya.ts:76`, `ilya-room.ts:276-280` |
| 34 | squeezed in a closing gap | `paperclips.ts:405-441` |
| 35 | printed on the subject's surface in its "polite voice" | `shoggoth.ts:553-602` |
| 36 | the lyric word match-moves into an instrument's label | `hook.ts:488-500, 680-688` |

## 4. Putting words INTO the image — engine techniques (our port)

| Technique | How | Our API |
|---|---|---|
| world-space text under the plate camera | draw in world coordinates in a `Layer2D`, sampled through the same camera so it shares keystone and blur | `Layer2D` (`app/src/engine/gl.ts:187-214`), pattern `leftturn-map.ts:245-284` |
| text on a 3D plane | three projected points → a Canvas2D affine; or a text texture on a mesh | `room.ts:828-838` (`planeAffine`), `stack-kit.ts:21-166` (`TextPlane`) |
| text the material renders | rasterise the word to a coverage texture; the shader hatches/lights/occludes it | `shoggoth-glsl.ts:416-440`, `dense-gpu.ts:17-58` |
| text on a path | sample `polylineLengths` + `pointAtLength`, rotate each glyph by the tangent | `app/src/engine/util.ts:147-163`, `layout()` per-glyph x |
| text as outlines / particles | `textPath2D`, `textPathCommands`, `textPoints` (legible while sung!) | `app/src/engine/type.ts` |
| continuous width × weight morph | interpolated Archivo / Pretendard outlines | `morphText`, `morphWidth`, `morphGlyph` (`app/src/archetypes/_kit.ts:136-172`) |
| written by a moving point | `strokeText` → `drawStrokeText(c, st, len)` returns the pen head; `writtenLength(st, charTimes, t)` syncs letters to word times | `app/src/engine/stroke.ts:244-324` |
| objects react to the text | occlusion by geometry, refraction, burning, bending, exclusion boxes so scatter avoids the word | `fuse.ts:355-376` (exclusion), catalog B4 |

`_kit.ts drawWord/drawKaraoke` hard-code pdoom's signal orange (`app/src/archetypes/_kit.ts:216`) and the v2 karaoke row layout: do not use them for a song with its
own accent; copy the lifecycle into your plate helper with your palette (`style.ts`/`palette.ts`, lead-owned).

## 5. Display size and hierarchy (M7)

- **≥ 25 % of frames that show lyric text must show display-size lyric type**: advance ≥ 80 px per character at 1080p, as OCR reads it
  (`src/frame_metrics.py:129-155`; ref 31–33 %, v2 0.6 %). Largest lyric glyph p90 ≥ 150 px (ref 194 px); ≥ 3 lyric type roles (REF §5 #12).
- OCR (macOS Vision on 1280×720 samples) under-counts rotated, curved, hatched and engraved text: keep at least the hero word of each display
  moment upright and solid enough to read; let the subtler integrations carry the rest.
- Scale contrast: pair big display words with small mono annotations (Swiss discipline, asymmetric layouts, generous negative space;
  `PD/docs/TREATMENT.md:28`). Vary lyric box positions across the frame (ref position std 0.23/0.25 vs v2 0.10/0.17, REF §1.4).
- Typography is the song's own (playbook 02 §2). Families registered in `app/src/engine/type.ts` (`F.archivo(width, weight)`,
  `F.archivoItalic`, `F.serif(weight, italic)`, `F.mono`, `F.ko`, plus song additions such as `F.road`/`F.roadMono`); `font(family, px)` always appends the
  Pretendard Hangul fallback (`koFallback`).

## 6. Craft (pdoom revision 5, `PD/docs/TREATMENT.md:29`)

- Kern every proportional line glyph by glyph: `layout(text, family, size, tracking)` returns per-glyph `x` with the font's kerning; `glyphX(text, i, …)`
  gives one glyph's x (`app/src/engine/type.ts`). Single-stroke fonts are kerned optically by `strokeText` (`app/src/engine/stroke.ts:244`).
- Optical word space where diagonals face each other ("Now von" reads as one word) (`bureau.ts:967-989`); tune pairs by eye in a still.
- Typographic punctuation: lyric display text arrives curly via `smart()`; typed/terminal text uses `plain()` straight quotes (`app/src/engine/type.ts`,
  `prompt.ts:65-67`). True minus U+2212, real primes, hanging punctuation in Swiss stacks (`room.ts:536-572`).
- No glyph outside the bundled families: draw a missing symbol with paths (pdoom drew ⏎ ▸ ✂ ♭, `prompt.ts:389`). The renderer refuses lyrics with
  glyphs no font can draw (`app/scripts/render.ts:78-79`).
- ≤ 4 families per film; no outlined or haloed lyric text except a declared, motivated exception (catalog F3).
- Lay a line out from its **resting** widths once per line; morph only the drawing (a layout from per-frame morphing widths flipped rows 1↔2,
  F11); decide arc side / row break per word, not per frame (F13).

## 7. Repeated lines and held words

- A template module may reuse its method for every round of a repeated line (same module = allowed by B3) but must escalate the treatment per round
  (hook: clean → heavier → hairline-quiet → strobe + echoes, catalog §4.4).
- Held word: wipe in 0.4 s, then a continuous change every ≤ 0.5 s (B5) or 2+ scene events; re-slam on each inner beat (`hook.ts:125-130`).

## 8. Check (render stills and LOOK — Read the PNGs)

```sh
cd app && ATF_RUN=../outputs/<run> bun scripts/render.ts stills --only <id> --t <w.start-0.05>,<w.start+1/60>,<mid of each line> --out ../outputs/<run>/wip/<id>
```

For each line: the word before its start is not yet emphasised; the frame after its start is; the mid-line frame is legible at 1080p; nothing sung
is within 96 px of an edge; the method reads as the meaning, not as a caption. Then measure the film with `frame_metrics.py` (M7, playbook 10).
