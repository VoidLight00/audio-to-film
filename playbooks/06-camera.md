# 06 — Camera

Owner: the plate engineer; `plan.json camera` states the plan. Each plate authors its own camera from its own anchors. v2 drove every shot with
one function (`app/src/archetypes/_kit.ts:23-63` `camera()`: beat dive, downbeat punch, kick micro-punch, a **seeded** pair of 180° rolls, drift),
which made every plate move alike (REF G6). Do not call it in an authored plate. `PD` = `~/.cache/audio-to-film/pdoom-video`; bare
`name.ts:N` = `PD/app/src/scenes/name.ts`.

## 1. The grammar: hold → snap

Creep (linear, tiny) or hold until the anchor; at the anchor, snap with `outExpo` (0.2–0.6 s) or move with intent (`inOutCubic`); settle; hold.
pdoom `open`: 24 keys, each with its own ease, "linear drift into the event, outExpo/inOutCubic snap right after" (`open.ts:203-233`).
Big camera events sit on beats or word onsets: ≥ 80 % within ±60 ms (catalog D3); in energetic sections 1.5–3 reframes per bar (D2).

```ts
import { keys, ease, type Key } from '../../../engine/util';
private logZ: Key[] = [];
// init(): every key time is an anchor from edit() (playbook 03); the ease on key i shapes the segment that ENDS at key i
this.logZ = [[start, Math.log(1.0)], [T.stamp, Math.log(1.04), ease.linear],        // creep into the word
             [T.stamp + 0.35, Math.log(1.6), ease.outExpo],                          // snap on it
             [T.reframe, Math.log(1.62), ease.linear], [T.reframe + 0.5, Math.log(0.9), ease.inOutCubic]];
// render():
const z = Math.exp(keys(f.t, this.logZ));                                            // zoom in log space (dives and pull-backs read as one gesture)
```

Zoom about the move's fixed point when zoom changes by > 4 % so a dive and a pan read as one gesture (`open.ts:240-250`):
`fx = (b.z·b.cx − a.z·a.cx)/(b.z − a.z)`, then `cx = fx − (a.z/z)(fx − a.cx)`.

## 2. Anticipation, landing, punches

- **Anticipate** big moves slightly before the beat so the motion peak lands on it: 30 ms (`spacetime.ts:441`), 50 ms (`fuse.ts:541, 545`),
  or 22 % of the step over 0.22 s with `inQuad`, then `springStep(dt, 3.6, 0.74)` capped at 1.08 overshoot (`stack.ts:363-381`). Keep the
  anticipation small next to the snap: frame_metrics measures motion in the frames just after the beat (M3 beat-lock ≥ 1.5).
- **Dead stop**: `inQuad` over the last 0.14 s landing exactly on the beat, then nothing moves but the subject (`stack.ts:375-378`).
- **Punch-in** (post `zoom` 1–5 %): rise over 2 frames, then decay — `1 + a·clamp((t − tb)/0.033)·pulse(t, tb, 0.16)`. An instant step draws two
  copies inside one motion-blurred frame (F14, `app/src/archetypes/_kit.ts:35-38`). A landing starts where the anticipation ended, not from the previous key (`app/src/archetypes/_kit.ts:31-33`).
- **Shake** = sum of event pulses, seeded per output frame: `amp = Σ kᵢ·pulse(t, tᵢ, 0.05–0.08)`,
  `shake: [amp·(hash(frameIdx(t), 11) − 0.5)·2, amp·(hash(frameIdx(t), 12) − 0.5)·2]` (`bureau.ts:353-368`). Never `Math.random`.
- **Flash**: additive linear, keep it ≤ 0.05 (`outro.ts:107`). A global flash on beats lifted the ink to grey (F11).

## 3. Ease vocabulary (catalog §5.6, 17 plates)

| Ease (`app/src/engine/util.ts` `ease`) | Count | Use |
|---|---|---|
| `inOutCubic` | 104 | intended moves, cranes, orbits, whips that must settle (`keys()` default) |
| `outExpo` | 100 | snaps right after an event; slams; reframes |
| `outCubic` | 94 | softer arrivals, glides |
| `inOutQuad` | 42 | follow cameras, gentle pans |
| `linear` | 40 | **only** creep, drift, held pushes |
| `inQuad` | 38 | anticipation, dead stops |
| `inCubic` | 25 | plunges, inhales into the next plate |
| `outBack` (s 1.6–2.2) | 17 | landings that overshoot (blocks, stamps, birth of an object) |
| `springStep(dt, freq, damping)` | 20 | beat landings with life |

≥ 60 % of camera keys use snap or intent eases (catalog D4). `inOutExpo` for page-space whips (`bureau.ts:406-410`). `outElastic` reads cartoon: avoid.

## 4. Camera patterns (catalog §6c) — pick by what the line does

| # | Pattern | Use when | Example |
|---|---|---|---|
| 1 | hold → snap keyframes | default for every plate | `open.ts:203-233` |
| 2 | log-space zoom about the fixed point | dives and pull-backs | `open.ts:240-250` |
| 3 | step in on each word + alternating dutch lean | a list of words building pressure | `ascent.ts:108-117` |
| 4 | punch per syllable | spelled-out jargon, acronyms | `bureau.ts:417-426`, `leftturn.ts:152-164` |
| 5 | whip (shader shutter or page-space blur) | jumping between parts of one document | `leftturn.ts:210-220`, `bureau.ts:406-410, 458-469` |
| 6 | crash dolly + zoom | entering a space on a hard word | `room.ts:648` |
| 7 | orbit / corkscrew crane / crane-out reveal | revealing what the line was about | `room.ts:660-676`, `spacetime.ts:711-715`, `leftturn.ts:193` |
| 8 | vertical tilt between two worlds | "this becomes that" | `fuse.ts:565-581` |
| 9 | dive into an object → match cut | the next idea lives inside this one | `dense-press.ts:337-357`, `ascent.ts:120` |
| 10 | inhale push landing on the next plate's anchor | outgoing match cuts | `fuse.ts:548-557` |
| 11 | dead stop on the beat, then stillness | a full stop, a refusal, a verdict | `stack.ts:375-378` |
| 12 | stepped fall: anticipation → spring snap → settle per beat | descending, stacking, counting | `stack.ts:363-381` |
| 13 | stepped roll per beat; loose objects lag | tilting, sliding, things going askew | `dense-askew.ts:225-256` |
| 14 | correction / over-correction roll | fixing that fails | `dense-askew.ts:238` |
| 15 | time-remapped camera (stutter) | "repeat", loops, déjà vu | `bureau.ts:411` |
| 16 | lead-offset chase; follow a half beat late | pursuing a moving head (price, spark, car) | `leftturn.ts:114-127`, `ascent.ts:307-312` |
| 17 | shot list `{Key, snap, kick, rollSpring}` / `{zoom, focus, push, blend}` | plates with 3–6 framings | `room.ts:646-657, 739-740`, `prompt.ts:34, 196-206` |
| 18 | shake = sum of event pulses seeded by `frameIdx` | impacts | `bureau.ts:353-368` |
| 19 | 2 inverted frames per slam | hook slams only | `hook.ts:152-155` |
| 20 | subdivision accelerates into the cut (4ths → 8ths → 16ths) | the last bar of a plate | `loss.ts:616-628` |
| 21 | FOV punch / ring contraction per beat | sustained pulse without cutting | `spacetime.ts:727-729, 768` |
| 22 | strobe every eighth | the final, maximal hook | `hook.ts:144-150` |
| 23 | intended stillness: no cuts, no punches | declared rests, fragility | `spacetime.ts:262-266`, `prompt.ts:161` |
| 24 | shake the type, keep the frame guides still | pressure against a fixed reference | `dense-press.ts:153-157, 175-181` |
| 25 | camera retreats to hold a growing object | exponential growth, overflow | `room.ts:322-324`, `outro.ts:117-119` |
| 26 | cut on beats inside a held word | a long held note | `prompt.ts:149-154` |
| 27 | post micro-values: zoom 1–5 %, flash ≤ 0.05, CA spike, still before the exit | everywhere, sparingly | — |

Use ≥ 4 distinct patterns across the film (REF §5 #18) and do not give two neighbouring plates the same signature move.

## 5. Rolls and flips

- Roll only when a lyric word motivates it ("boss" → the world rolls π and the inverted word comes upright, `loss.ts:1021-1040`; "askew" →
  stepped roll per beat). Never a seeded/random roll (v2 F7 turned lyrics upside down at 9.0–9.8 s and 24.5–25.3 s, REF §2.2).
- Sung text is upright at every plate end and during its own word (F7 rule: cos(roll) > 0.99 at shot end), unless the word was drawn
  counter-rotated so the roll rights it.
- Small key rolls (±0.015–0.075 rad, `open.ts`) and damped kick rolls are fine; a whole layer spinning uniformly reads as a stock spin-zoom (F16).

## 6. Bounds and continuity

- Bound every zoom/dive by plate progress, not by elapsed time: an unbounded `exp(0.022·e·t)` dive reached 1.46× and cropped the lyric (F8).
  Compute the sung text's bounding box at maximum zoom + shake: it stays ≥ 96 px inside the frame.
- Continuity at every anchor: no position/zoom jump between consecutive frames except at a deliberate hard cut; 4K adaptive motion blur turns any
  discontinuity into a visible double image (F14).
- 3D cameras: `far` large enough (1e6) for pulled-back moves; a 3000 far plane once clipped the motif out of the shot (F18).
- Motion blur is real (adaptive 4→324 sub-frames, master shutter 0.2): whips get streaks for free. Stylised smears must be capped (≤ 12 copies, `stack.ts:442-448`).
- Do not scale the whole frame buffer to "zoom": it reads as a box zoom (F13); move the camera or transform the elements.

## 7. Exit stillness before match cuts (catalog E2)

The outgoing plate hands geometry to the next: hold the frame still for it (`hook.ts:194-196`). From ~0.1 s before the cut: `shake: [0, 0]`,
`zoom: 1`, small `ca`; land the position 0.03 s early so the last frame is on the mark (`fuse.ts:548-557`). Shake must be zero in the last 3 frames.
The picture is still alive (non-rigid motion every ≤ 0.5 s, `src/film_qa.py`), only the camera is still.

## 8. Check

```sh
cd app && ATF_RUN=../outputs/<run> bun scripts/render.ts sheet --only <id> --from <start> --to <end> --n 16 --cols 4 --out ../outputs/<run>/wip/<id>-cam.png
ATF_RUN=../outputs/<run> bun scripts/render.ts stills --only <id> --t <anchor-0.033>,<anchor>,<anchor+0.033>,<anchor+0.1> --out ../outputs/<run>/wip/<id>
```

Read the PNGs: the snap starts at the anchor (not before), sung text stays inside the safe area at the widest/closest key, no frame-to-frame jump
outside cuts, the last frames before a match cut are still.
