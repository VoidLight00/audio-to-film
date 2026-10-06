# 03 — The edit and every anchor (`timeline.ts`, `app/src/songs/edit.ts`)

Owner: the coordinator writes `app/src/songs/<slug>/timeline.ts`; every plate engineer uses the same anchor helpers inside
`init()`. Rule: **every big event is a named time** — a lyric word/syllable/line start or a beat/downbeat. Never an audio-feature
threshold, never a hard-coded second (`app/src/songs/edit.ts:1-4`; pdoom `PD/docs/ENGINE.md:19` "Find lines by content, never hard-code
times"). pdoom is *scored*, not reactive: `env()` appears 0 times in its 17 plates; kick/snare pulses only drive ≤ 3 % zooms, pupils and lamp
flicker (catalog §5.1). `PD` = `~/.cache/audio-to-film/pdoom-video`; bare `name.ts:N` = `PD/app/src/scenes/name.ts`.

## 1. Wiring

- `app/src/director.ts:25-34` loads `./songs/<slug>/timeline.ts` when `outputs/<run>/song.json` is `{"slug": "<slug>"}`; without it the legacy
  v2 director runs and every gate compares the wrong edit. Write it once: `echo '{"slug": "<slug>"}' > outputs/<run>/song.json`.
- `timeline.ts` exports `makeTimeline(ly: Lyrics, au: AudioData): TimelineEntry[]`. `TimelineEntry` (`app/src/engine/engine.ts:13-25`):
  `id, load, start, end, post?, params?, maxSamples?`.
- Windows must tile the song: first `start = 0`, each `end` = next `start` (no gap, no overlap: plan_gate A1), last `end = au.duration`.
  Abutting windows mean the engine never crossfades (`app/src/engine/engine.ts:351-358` only blends overlaps): every transition is authored inside the plates (playbook 07).
- Drive ids/modules/params from `plan.json` so plan and edit cannot drift (plan_gate `schema` demands identical ids in identical order):

```ts
import type { TimelineEntry } from '../../engine/engine';
import type { SceneClass } from '../../engine/scene';
import type { Lyrics } from '../../engine/lyrics';
import type { AudioData } from '../../engine/audio';
import { edit } from '../edit';
import plan from './plan.json';

const modules = import.meta.glob<{ default: SceneClass }>('./scenes/*.ts');
// unbuilt modules play the draft slate (app/src/songs/_placeholder.ts); plan_gate refuses status "final" while any is missing
const scene = (name: string) => () => (modules[`./scenes/${name}.ts`]?.() ?? import('../_placeholder'));

export function makeTimeline(ly: Lyrics, au: AudioData): TimelineEntry[] {
  const e = edit(ly, au);
  const b: Record<string, number> = {
    open: 0,
    memo: e.cut('Coffee is hot'),                        // lyric-first: the beat at/before the line's first word
    hook1: e.cut('Floor it then pray', 0),               // a repeated line: nth occurrence
    breakdown: e.nearestDown(e.section('instrumental6').start),  // instrumental boundary: a downbeat, never a raw section time
  };
  const ids = plan.plates.map((p) => p.id);
  return plan.plates.map((p, i) => ({
    id: p.id, load: scene(p.module), start: b[p.id]!,
    end: i + 1 < ids.length ? b[ids[i + 1]!]! : au.duration,
    params: { ...(p.params ?? {}) },
    ...(p.id === 'creature' ? { maxSamples: 108 } : {}),   // cap adaptive blur for noisy ray-marched plates (PD/app/src/timeline.ts:62-64)
  }));
}
```

## 2. Anchor helpers — `edit(ly, au)` (`app/src/songs/edit.ts`)

| Helper | Returns | Use it for | pdoom origin |
|---|---|---|---|
| `cut(q, nth = 0, tol = 0.02)` | last beat at/before the first word of line `q` | plate boundaries (A1) | `PD/app/src/timeline.ts:17-20` |
| `after(q, nth = 0)` | downbeat nearest the end of line `q` | the boundary after a line nobody sings into | `PD/app/src/timeline.ts:22-25` |
| `pick(t, lo, hi)` | downbeat in `[lo, hi]` nearest `t`, else nearest beat inside, else `t` | big reframes, structural hits ("downbeat first, beat fallback") | `loss.ts:254-260`, `fuse.ts:257` |
| `snap(t, tol = 0.1)` | nearest beat if within `tol`, else `t` | word-anchored hits that should also sit on the grid | `ascent.ts:75-79` |
| `beatBefore(t)` / `beatAfter(t)` | beat at/before, at/after `t` | stamps, camera hits, "the beat after the word" | `leftturn.ts:62-63` |
| `downAfter(t)` / `downBefore(t)` / `nearestDown(t)` | downbeat after / before / nearest (`downAfter` falls back to `beatAfter`) | section-scale events, instrumental boundaries | `leftturn.ts:64` |
| `beatFrom(t, i)` | beat `i` counted from the beat at/before `t` (`i` fractional: `+0.5` = the next eighth) | beat-indexed choreography, exits on the eighth | `hook.ts:96`, `paperclips.ts:91` |
| `beatsIn(a, b)` | every beat strictly inside `(a, b)` | re-hit each beat of a held word or of a plate | `hook.ts:125-130`, `prompt.ts:149-154` |
| `syllables(w)` | syllable starts (`w.syl`), else `[w.start]` | one glyph/token/price step per syllable | `prompt.ts:78-81`, `ascent.ts:275-291` |
| `section(name)` | the analysis section (throws if absent) | instrumental and outro boundaries | `PD/app/src/timeline.ts:49` |
| `line(q, nth)` / `word(q, i, nth)` | line / word `i` (negative = from the end); both throw | every lookup | `PD/app/src/engine/lyrics.ts:68-73` |
| `span(label, a, b)` (module export) | `[a, b]`; records an issue when `b <= a` | **every** `prog()`/`keys()` window | guards pdoom's `fuse.ts:521-522` inverted window (catalog §1.4) |

Engine primitives underneath (`app/src/engine/lyrics.ts`, `audio.ts`): `ly.get/find/findWords/linesIn/lineAt/lastLine/nextLine/wordAt/lastWord`,
`Lyrics.wordProgress(w, t)` (piecewise per syllable), `Lyrics.lineCharProgress(l, t)`; `au.beatAt` (continuous index), `au.timeOfBeat`,
`au.barAt`, `au.nearestBeat`, `au.lastDownbeat`, `au.downbeats`, `au.sections`, `au.events(kind, t0, t1)`, `au.hit(kind, t, halfLife)`,
`au.env`, `au.integral(name, t)`, `au.pitch(t)`; per frame `f.beat`, `f.bar`, `f.beatPhase`, `f.barPhase`, `f.a.{kick, snare, hat, vonset, rms…}`.
Because the beat index is continuous, musical arithmetic is one line: the next eighth after `t` is `au.timeOfBeat(Math.floor(au.beatAt(t)) + 0.5)`.

## 3. Rules for anchors

1. **Compute every anchor and every `span()` in `init()`.** `render.ts` reads `anchorIssues` once, right after boot (`app/scripts/render.ts:76-77`);
   a span created lazily inside `render()` escapes the check. Any issue fails `timeline`, `stills`, `video` for an authored song.
2. **Find lines by content.** `e.line('stack of paper')`, `e.word('stack of paper', -1)`. A template module serving several plates takes
   "the line that starts inside my window" (`prompt.ts:61-63`) or uses `nth` from `ctx.params`.
3. **Fail loudly.** `ly.get()` throws when a line is missing; an `init()` exception fails the render for authored songs (`app/scripts/render.ts:73-74`)
   and paints the plate dark red (`app/src/engine/engine.ts:324-327`). Never wrap lookups in silent fallbacks to a time.
4. **Fall back to musical times, never to arbitrary ones** (`fuse.ts:257`): downbeat → beat → the word itself.
5. **Audio only for micro-decoration**: `f.a.kick`, `au.hit('snare', t)` may drive ≤ 3–5 % zoom, flicker, a pupil. Plan events on `audio:` ≤ 10 % (D6).
   v2's `dbm` archetype fired a discharge on every kick: re-anchor such things to words/beats when you reuse them.

## 4. Event anchors in `plan.json`

The gate checks only the prefix (`word: syl: line: beat: downbeat: section: audio: plate:`); use this convention so engineers can resolve it:
`word:<line query>#<i>` → `e.word(q, i)` · `syl:<line query>#<i>.<k>` → `e.syllables(e.word(q, i))[k]` · `line:<query>` → first word start ·
`beat:+<n>` → `e.beatFrom(start, n)` · `beat:each` → every beat of the plate (one entry) · `downbeat:<k>` → k-th downbeat inside the window ·
`section:<name>` · `plate:start|end` · `audio:<kind>`. Sung plates need ≥ bars − 0.5 entries (D6).

## 5. Density — what to plan per section type

Measured on pdoom (catalog §6f) and enforced on the render by `src/frame_metrics.py` (playbook 10):

| Section type | Visual events per beat | Reframes per bar | Hard cuts per bar | pdoom plates |
|---|---|---|---|---|
| hook (first chorus line) | a full-frame state per word (0.22–0.38 s) + 2 inverted frames per slam | per word | — | hook ×4 |
| chorus body | ≥ one per eighth; per-syllable events | 1–4 | 0.3–1 | room, ascent, paperclips, loom |
| verse | ~1–1.6; held notes filled with several events | 1–3 | 0–1 | loss, spacetime, bureau, leftturn |
| pre-chorus | per syllable / per beat / deliberately sparse (vary by round) | 1.2 / 2 / 0 | 1.2 / 1.7 / 0 | prompt ×3 |
| bridge | **one structural event on every beat**, a dead stop as the full stop | 1–4 | 0.4–1 | stack, dense |
| instrumental | 1 per beat → 16th acceleration → deceleration; phases by beat index | phase per downbeat | — | shoggoth tail, outro |
| declared rest | ≤ 0.5 | 0 | 0 | spacetime I, prompt3, the held "know" |

Film-level limits (M1–M3, `src/frame_metrics.py:158-163`): hard changes ≥ 25/min with median gap ≤ 1 bar (at B bpm that is ≥ 100/B per bar,
0.81/bar at 123 BPM); stretches longer than 4 bars without a hard change ≤ 10 % of runtime; ≥ 50 % of hard changes within ±50 ms of a beat;
beat-locked motion peak/median ≥ 1.5; ≥ 35 % of beats carry a visible accent. Catalog D1/D2: in sung sections ≥ 85 % of beats have an event
within ±60 ms; 1.5–3 reframes per bar in energetic sections.

A "hard change" is a large, persistent image change (mean |Δ| ≥ 6/255 on 96×54 grey and persistent; `src/frame_metrics.py:53-74`): a cut, a big
reframe, a full-frame slam, a whip, a light/dark flip. A 4 % punch on a mostly black frame does not register (v2's beat-lock was 1.12 for that reason).

Shape the plate's rhythm:
- put the plate's **biggest internal event on a downbeat** even though the boundary is lyric-first (21 pdoom boundaries, only 7 on downbeats; catalog §3)
- accelerate into the cut: quarters → eighths → sixteenths over the last bar (`loss.ts:616-628`)
- sub-movements of 1–2 bars with internal hard cuts on line starts (`nearestBeat(line.start)`, `loom.ts:78-79`)
- a held word (> 1 s) is never a still: re-hit its inner beats (`beatsIn`), step its width, or fill it with 2–4 scene events
  ("reckoned" 2.94 s = stamp → typing → signature → FILED; catalog §4.9 `bureau`)

## 6. Declared rests

Contrast needs stillness, but only declared stillness: `intent: "rest"` on the plate (exempt from D6 density), ≤ 15 % of runtime (D1), at most one
> 4-bar stretch without a hard change in the film (REF §5 #3), dense plates before and after. pdoom: "one slow push and a lateral drift … (no cuts,
no punches)" (`spacetime.ts:262-266`), gato "slow, floating; no cuts, only long eases" (`prompt.ts:161`). A rest still needs non-rigid motion
at least every 0.5 s (`src/film_qa.py` motion check: film grain or a Ken Burns move over a still fails).

## 7. Robustness idioms (catalog §1.5)

| Situation | Do | Example |
|---|---|---|
| an anchor may land too close to another | clamp/fallback (`Math.max`, `min`, fallback beat) | `bureau.ts:281-291`, `room.ts:191` |
| no downbeat between two lines | fall back to the nearest beat | `loss.ts:263-265` |
| a word is held past the cut | finish its wipe before the boundary | `open.ts:1086`, `spacetime.ts:236-237`, `stack.ts:643`, `bureau.ts:329` |
| the boundary arrives while the previous word still sounds | the next plate inherits and finishes it | `room.ts:183-185`, `shoggoth.ts:159` |
| a line's first word starts a hair before its beat | raise `cut()` tolerance for that line | `PD/app/src/timeline.ts:44` (`tol 0.05`) |
| the first beat falls right after the opening word starts | skip that beat; don't carry the word out of frame at once | `stack.ts:108-114` |
| re-aligned data could invert a window | `span()` everything | `fuse.ts:521-522` shipped inverted |

## 8. Check

```sh
cd app && ATF_RUN=../outputs/<run> bun scripts/render.ts timeline                  # ~6 s; throws on scene errors / inverted spans / missing glyphs
cd .. && python3 - outputs/<run> <<'EOF'
import json, sys
r = sys.argv[1]; T = json.load(open(f"{r}/timeline.json")); d = json.load(open(f"{r}/audio.json"))["downbeats"]
bar = (d[-1] - d[0]) / (len(d) - 1)                                                # the bar plan_gate uses
for e in T["entries"]: print(f"{e['id']:16s} {e['start']:8.3f}-{e['end']:8.3f} {(e['end'] - e['start']) / bar:5.2f} bars")
EOF
python3 src/plan_gate.py app/src/songs/<slug> outputs/<run>                         # A1 A2 coverage D6 must pass
```

Exit: plan_gate exit 0; no window < 0.5 bar (`MIN_BARS`; except the last); each lyric plate starts on the beat before its first line.
