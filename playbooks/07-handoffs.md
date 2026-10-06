# 07 — Hand-offs between plates

Owners: the two plate engineers on either side of a boundary, coordinated by the lead through `plan.json`. pdoom's plate boundaries are all
hard cuts (`handlesTransition` is used by 0 scenes), yet 14 of 21 are geometric match cuts: the last frame of one plate is pixel-matched to the
first frame of the next (catalog §0-6, §5.2). v2 alternated two canned collapses (spark / flatline) at every cut (REF G6). `PD` =
`~/.cache/audio-to-film/pdoom-video`; bare `name.ts:N` = `PD/app/src/scenes/name.ts`.

## 1. The four rules (catalog §5.2)

1. **Match by default.** ≥ 60 % of boundaries are `match` with a geometry contract on both sides (plan_gate E1). Same element, same place
   (±20 px), same shape or colour on both sides of the cut (catalog E1).
2. **Contrast only where something flips**: light ↔ dark, still ↔ dynamic, quiet ↔ loud (pdoom: prompt2 → hook2, ascent → bureau, stack → dense).
3. **Hold the exit frame still** for the next plate: shake 0, zoom 1 in the last ~0.1 s; shake exactly 0 in the last 3 frames (`hook.ts:194-196`, E2).
4. **Words never get cut in half**: a word sung across the boundary finishes its wipe before the cut, or the next plate inherits and finishes it
   (`open.ts:1086`, `spacetime.ts:236-237`, `stack.ts:643`, `bureau.ts:329`; inherit: `room.ts:183-185`, `shoggoth.ts:159`).

Because plan_gate demands abutting windows, the engine never crossfades (`app/src/engine/engine.ts:351-358` blends only overlaps). Every transition
is authored inside the two plates around one hard cut on the beat.

## 2. Writing the contract in `plan.json`

```json
"handoff": { "in":  { "type": "match", "geometry": "line->line: hot horizontal trace y=540, x 300..1620, 3 px, accent, camera z=1, vignette .45" },
             "out": { "type": "match", "geometry": "pixel-contract: needle tip at (1150,631), 6 px dot, accent; next plate's caret starts there" } }
```

- `A.out.type == B.in.type` (E1). Types: `match` (needs `geometry` on both sides), `bridge` (flash/black/white/burn-out), `contrast`, and `open`/`end` for
  the film's first in and last out only.
- `geometry` is the contract text both owners implement. Start it with the **mechanism** name from §4 (`pixel-contract:`, `line->line:`, `dive-into:` …),
  then the numbers: element, screen px (1920×1080 logical, y down), size, angle, colour role, camera state, post values that must match. Write the
  same numbers on both sides.
- Transition variety: ≥ 4 distinct mechanisms in the film and no mechanism on > 40 % of boundaries (REF §5 #18). E1's ≥ 60 % `match` is a type
  share; variety is measured on the mechanism prefix (count them before the plan review).

## 3. Agreeing on contract constants without touching each other's files

pdoom: "hand-off geometry of the plates that follow (copied, not imported: they are other agents' files)" (`hook.ts:32-38`).

1. The lead writes the contract numbers into both plates' `handoff` in `plan.json` (the only shared source).
2. The **incoming** plate owner (B) builds the first frame to the contract, renders it, and reports the measured pixel values back to the lead.
3. The **outgoing** owner (A) copies those constants into a block at the top of its own file:
   `/** Hand-off to <B>: B's first frame (screen px). Copied, not imported: another owner's file. */ const NEXT = { x: 1150, y: 631, w: 5.6, h: 86 };`
   (pdoom: `leftturn.ts:41-42`), then computes its exit camera so the element lands exactly there (`camEnd`, `leftturn.ts:166-181`).
4. Match post values across the cut (vignette, grain, bloomThreshold): `leftturn.ts:328` interpolates to `prompt.ts:318`'s 0.6 / 0.065;
   `loom` ramps bloomThreshold to ilya's 0.9. Write them into `geometry`.
5. Same owner on both sides may share a module (`room-shrooms.ts:1-3` "Shared here so both plates agree on every letter"; `ROLL_IN` exported by
   `dense-askew.ts:29-32`). Different owners never import each other's files; any change to a contract goes through the lead and both files.
6. Rendering the next plate live inside this one (loom's Droste bottom = `IlyaRoom.render(…)`, `loom.ts:97-101, 405-415`) couples two owners'
   code: only with the lead's approval, and only through a class the other owner exports for that purpose.

## 4. Mechanism menu (catalog §6d)

| # | Mechanism (geometry prefix) | Type | Example |
|---|---|---|---|
| 1 | `contract-constants`: copy the next plate's first-frame camera/coordinates | match | `hook.ts:32-38`, `ascent.ts:110-122` |
| 2 | `shared-layout`: one module lays out the element for both plates (same owner) | match | `room-shrooms.ts`, `shoggoth.ts:750-773` |
| 3 | `shared-constant`: an exported angle/scale (same owner) | match | `dense-askew.ts:29-32`, `hook.ts:186-188` |
| 4 | `pixel-contract`: an element morphs into the next plate's element on the exact pixel (slot → caret) | match | `leftturn.ts:41-42`, `leftturn-gantt.ts:285-296` |
| 5 | `prefade`: the next plate's ground fades in under the end of this one; post values matched | match | `leftturn-map.ts:507-520`, `leftturn.ts:328` |
| 6 | `live-next`: render the next scene inside this one (recursion bottom, window, screen) | match | `loom.ts:97-101, 405-415` |
| 7 | `carry-over`: the next plate's first frames restage this plate's last element (white-out, cursor, tilt) | match | `hook.ts:151, 186-188, 202-212` |
| 8 | `line->line`: a line becomes the same line (flatline → trace, horizon → fuse) | match | `shoggoth.ts:14-17`, `spacetime.ts:296` |
| 9 | `crt-off`: picture collapses like a CRT to a line or point | match/bridge | `shoggoth.ts:355-356`, `spacetime.ts:277` |
| 10 | `burn-out` / `white-out` / `black`: exposure ramp, ≤ 0.1 s | bridge | `room.ts:474-475`, `prompt.ts:310`, `bureau.ts:531-535` |
| 11 | `tear`: the document tears, 40 ms of black, next fades in over 0.12 s | bridge | `bureau.ts:503-540`, `leftturn.ts:329` |
| 12 | `collapse-to-point` / `burst-from-point` | match | `hook.ts:507-514`, `ilya.ts:170-198` |
| 13 | `eyelid`: something closes onto the next plate's opening frame | match | `hook.ts:589-632` |
| 14 | `point-flash`: collapse to a point + a small flash | bridge | `ascent.ts:604, 697` |
| 15 | `contrast`: light/dark or still/dynamic flip | contrast | catalog §5.2 |
| 16 | `renderer-swap`: same framing, the renderer changes underneath (2D → ray-marched) | match | `paperclips-glsl.ts` [inferred] |
| 17 | `morph-as-cut`: one continuous transformation used as the cut (off-beat allowed inside a plate) | match | `ascent.ts:71, 597-613` |
| 18 | `finish-or-inherit`: a held word completes before the cut or continues after it | rule | catalog §1.5 |
| 19 | `bookend`: rewind to the first frame (loop) | end | `outro.ts:774-782` |

Choose the mechanism from meaning: the outgoing plate's last idea should *become* the incoming plate's first idea (pdoom's empty review slot
becomes the cursor of "Gato, please don't let me go", `leftturn.ts:41-42`; the loss funnel becomes an engraved throat, catalog §4.2).

## 5. Timing and craft

- The cut lands on the incoming plate's start beat (A1). The outgoing element arrives **early** (position 0.03 s before the cut, `fuse.ts:548-557`)
  and stays still; the incoming plate holds it for its first frames before moving.
- Closes and collapses last ≥ 4 frames and are held across the cut; a 3-frame close reads as a flash (F12). Reach the end state ≥ 2 frames
  before the cut (F17).
- Transform the elements, not the frame buffer: scaling the whole picture into a point reads as a "Keynote box zoom" (F11, F13).
- Exactly one instance of the carried element at any time (a second spark appeared at instrumental cuts, F13); draw it **after** any squash/warp
  pass or it disappears into it (F19).
- Keep a held line or point below saturation (~120/255 core) so the element riding it still reads as the brightest thing (F19).
- Bridges: flash is additive linear, keep ≤ 0.05–0.1 (`outro.ts:107`); true black for ~40 ms then a 0.12 s fade (`bureau.ts:533`, `leftturn.ts:329`).
- v2 kit hand-offs (`_kit.ts` `handoff()`, `handoffState`, `sparkAt`, `HANDOFF_PX`, the spark/flat pair) are banned in authored plates.

## 6. Check every boundary

```sh
cd app
# one boundary at start time S between plates A and B (both loaded)
ATF_RUN=../outputs/<run> bun scripts/render.ts sheet --only A,B --times <S-0.1>,<S-0.0333>,<S-0.0167>,<S+0.0167>,<S+0.0333>,<S+0.1> --cols 6 --out ../outputs/<run>/wip/cut-A-B.png
# all boundaries of the film (4 frames each: -0.1, -1/60, +1/60, +0.1); load everything (no --only) or unloaded plates render dark red
ATF_RUN=../outputs/<run> bun scripts/render.ts sheet --cuts --cols 4 --out ../outputs/<run>/wip/cuts.png
```

Read the PNGs. Pass when: the matched element is within ±20 px and the same shape/colour across the cut; no shake in the last frames; no
half-wiped sung word at the cut; a bridge is short and motivated; the film has ≥ 4 mechanisms, none on > 40 % of cuts.
