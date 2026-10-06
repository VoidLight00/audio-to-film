# 02 — Treatment → `TREATMENT.md` + `plan.json`

Owner: Creative Director. Inputs: `BRIEF.md` (playbook 01), `outputs/<run>/{audio,lyrics}.json`.
Outputs: `app/src/songs/<slug>/TREATMENT.md` (prose, for people and plate engineers) and `app/src/songs/<slug>/plan.json`
(machine-checked by `src/plan_gate.py`). `PD` = `~/.cache/audio-to-film/pdoom-video`.

## 1. `TREATMENT.md` — pdoom's order (`PD/docs/TREATMENT.md`, headings at lines 3, 7, 15, 22, 31, 38, 47, 71+)

| # | Section | Must contain |
|---|---|---|
| 1 | The idea in one paragraph | the concept device from the brief, what the motif is and how it is revealed, what the counter does, how the film ends |
| 2 | Tone | 4–6 bullets: dynamics (big changes on the beat, holds then snaps), impressiveness (hairlines, depth, restraint), humour register, the ban list, originality |
| 3 | Palette | hex table with roles (§2); which colour may bloom; where paper plates sit |
| 4 | Typography | role → family/axis/case/tracking; ≤ 4 families; display-size rule (playbook 04) |
| 5 | Karaoke rules | readable, word-synced, never ahead of the voice, title-safe ≥ 96 px, one integration method per line, held-word rule |
| 6 | Motifs | running object (roles, reveal plate), counter (values per plate), rationed motifs (≤ 5 plates), recurring templates |
| 7 | Plate table | `id · module · lines · section · ≈bars · idiom · transform · hand-off in/out · owner · hero` |
| 8 | One paragraph per plate | the pun, what we see, how each line enters the image, camera, key events with anchors, hand-off, motif role, counter cameo, gag |

The treatment is a brief, not a frozen spec: pdoom left choices open ("'servant' huge, 'boss'… or the reverse", `PD/docs/TREATMENT.md:75`)
and scene authors closed them (`loss.ts:1021-1022`). Update it whenever a critic round changes a plate's concept.

## 2. Originality (N5) — the song gets its own identity

pdoom's identity is **not ours**: ink/bone/signal-orange palette (`#0A0A0B #151517 #5E5B57 #9C978F #EEE9DF #FF4D12 #FF8A3D #C21D0B #D8FF3C`),
the spark, the bone mask, the P(doom) readout, the treatise-plate framing, its type-role mapping. Do not reuse any of them.

- **Palette**: one dark ground, one light paper, 2–3 neutrals, one accent (the only colour that may bloom), at most one rare accent owned
  by one moment (pdoom kept acid to ~2 s, `PD/docs/TREATMENT.md:18`). Use none of the hexes above (the gate fails only if *all* your colours are
  pdoom's; the rule is stricter). Pick the accent hue for the concept and keep it saturated enough to read as a signal.
- **Type**: families registered in `app/src/engine/type.ts` (`F`): Archivo (width 62–125, weight 300–900), Archivo Italic, Cormorant
  (lining figures), IBM Plex Mono, Pretendard (Hangul), any family the lead added for a song (e.g. Overpass `F.road`/`F.roadMono`),
  and 8 single-stroke fonts (`STROKE_FONTS`, `app/src/engine/stroke.ts:7-16`). Identity = which family is the
  lyric voice + scale system + case + tracking + axis gesture. If you land on pdoom's mapping (Archivo voice, Plex machine, Cormorant prophecy),
  change the treatment and say why. A new family is a shared-file change (`app/src/engine/type.ts`, OFL font in `app/public/fonts`): ask the lead.
- **Motif / counter**: from the brief's candidates, never the spark or a P(doom)-style probability unless the lyric itself says so.

## 3. Visual puns and transformations, never literal storyboard illustration

`PD/docs/TREATMENT.md:5`. Every plate records `concept = {idea → subject → transform}`; literal ≤ 20 % of plates (gate C1).

| transform | Definition | pdoom example |
|---|---|---|
| `jargon-literal` | take a domain term at its word | "sharp left turn" → the route on an engineering roadmap turns left (`leftturn-map.ts:63-170`) |
| `pun` | two meanings at once | "Loom" → a weaving loom and the Loom base-model UI (`loom-tree.ts`) |
| `mechanism` | stage the process the word names | "sudden drop in training loss" → the loss curve falls and the camera follows into the loss landscape (`loss.ts:443-447`) |
| `metaphor` | A shown as B | "safety report = stack of paper" → compliance as a filing ritual |
| `literal` | draw the noun | a bag of shrooms is just a bag (`room.ts`, part C) — use sparingly, then distort it |

## 4. Ban list (anti-slop)

From `PD/docs/TREATMENT.md:11-13`, catalog C2 and our own v2 failures (`FAILURE_LOG.md` F11–F19, REF G2–G6):
- purple/cyan neon cyberpunk, glowing brains, Matrix code rain, lens-flare soup, generic particle nebulae, stock "AI" imagery, emoji, cartoon faces
- realistic human faces or eyes (pdoom retired them as "uncanny", `PD/docs/TREATMENT.md:41`), real logos, imitations of real product UIs
- v2's look: a glowing simulation on black as the default plate; centred subtitles; the spark/flatline hand-off pair; seeded random rolls;
  a global flash on beats (it lifted ink to grey, F11); full-frame particle dust; outlined or haloed lyric text (allowed only as a declared exception)
- debug-looking mono overlays that belong to no idiom (F11); in-scene text must be part of a document/instrument the world contains
- decorative accent stripes on in-frame cards/labels (coloured left bars or accent underlines); mark state with a dot, label text or a tint

## 5. Plate granularity targets

| Target | Value | Source |
|---|---|---|
| plates | ≥ runtime / 9 s (169 s song → ≥ 19) | REF §5 #1 |
| plate length | 0.5–9 bars (`MIN_BARS`; pdoom's shortest was 0.75), mean ≤ 4.5, lengths must vary (max − min ≥ 0.5 bar) | plan_gate A2, REF §5 #1 |
| lines per plate | 0–4; a lyric section of ≥ 3 lines and ≥ 6 bars needs ≥ 2 plates | catalog A2, plan_gate A2 |
| sub-movements | 1–2 bars each inside a plate (pdoom ascent: 4 in 5.25 bars) | catalog §6f |
| hooks | 0.75–1 bar, one full-frame state per word | catalog §4.4 |
| idioms | unique per module (≥ 90 %), never shared by neighbours, ≥ 12 per film, ≥ 6 macro families | plan_gate A3, REF §5 #7 |
| boundaries | on the beat before the line's first word (playbook 03) | plan_gate A1 |

## 6. Repeated lyrics → one template module with escalating params

A verbatim-repeated line (hook, pre-chorus) is **one module** serving several plates via `params` (pdoom `hook` ×4 `{n}`, `prompt` ×3 `{variant}`,
`PD/app/src/timeline.ts:59-77`). Recognisable skeleton, clearly different rounds (A5: rounds differ visibly, share the layout skeleton).
- escalate through arrays indexed by round: word shake `[0, 7, 13, 0, 20][n]` (`hook.ts:169`), hit shake `[0, 10, 16, 0, 26][n]` (`hook.ts:191`),
  footnotes per round (`hook.ts:41-46`), per-round timing and exits (`hook.ts:86-106`), per-variant data tables (`prompt-data.ts:16-58`)
- vary mood, not only intensity: pdoom's pre-choruses go energy → confinement → fragility (catalog §4.3); hook 3 is the *quiet* one
- the module finds its own line as "the line that starts inside my window" (`prompt.ts:61-63`), or `edit(...).cut(q, nth)` with the occurrence index
- each round's plate lists the repeated text in its own `lines[]`; the gate counts occurrences per window (see §7, coverage).
  Integration methods may repeat inside the same module (B3 only forbids reuse across modules)

## 7. `plan.json` schema — exactly what `src/plan_gate.py` reads

Text comparisons use `norm()` = lowercase, `’`→`'`, then drop everything outside `[a-z0-9]` (`norm` in `src/plan_gate.py`). Write ids, idioms and
methods in ASCII English: a Hangul-only string normalises to `""` (see §9).

**Top level**

| Key | Type | Read by | Rule |
|---|---|---|---|
| `slug` | string | (nobody) | = the folder name and `outputs/<run>/song.json` `slug` |
| `status` | `"draft"` \| `"final"` | `songs_gate.sh` | only `final` songs are gated; `final` also requires `scenes/<module>.ts` for every plate |
| `run` | string | `songs_gate.sh` | repo-relative run dir, e.g. `outputs/<run>`; must exist; its `song.json` must name this slug or `timeline` resolves the legacy edit |
| `concept` | string | (nobody) | the device in one paragraph |
| `style.palette` | `{role: "#rrggbb"}` | N5 | non-empty; not a subset of pdoom's 9 hexes |
| `style.accent` | `"#rrggbb"` | (nobody) | the one colour that may bloom; pass it to `frame_metrics.py --accent` (playbook 10) |
| `motif` | `{name, reveal_plate}` | C3 | `name` non-empty; `reveal_plate` = a plate id at index ≥ ⌈2/3·n⌉ − 1 (the last third) |
| `counter` | object, optional | C4 | truthy enables C4; suggested `{name, unit, start, end}` |
| `plates` | array, in edit order | all | ids must equal `timeline.json` entry ids, same order |

**Per plate**

| Key | Type | Read by | Rule |
|---|---|---|---|
| `id` | string | schema, all | unique; = `TimelineEntry.id` in `timeline.ts` |
| `module` | string | A3, B3, `final` | file stem of `app/src/songs/<slug>/scenes/<module>.ts`; template plates share it |
| `params` | object | (nobody) | handed to the scene as `ctx.params` (e.g. `{"n": 2}`) |
| `anchor` | string | (nobody) | the line query or section name `timeline.ts` cuts on |
| `lines` | string[] | coverage, A1, B3, D6 | shown lines (exact text, `lyrics.json`) whose first word falls in `[start − 0.06, end − 0.06)` (`CUT_TOL`); never gated lines |
| `concept` | `{idea, subject, transform}` | C1 | all non-empty; `transform` ∈ `literal · jargon-literal · pun · mechanism · metaphor` |
| `idiom` | string | A3 | non-empty; ≠ neighbour's; one idiom per module |
| `integration` | `[{line, method}]` | B3 | one entry per `lines` item; `method` not reused by another module; `subtitle`/`overlay`/`caption` ≤ 5 % of lines |
| `events` | `[{anchor, action}]` | D6 | anchor prefix ∈ `word: syl: line: beat: downbeat: section: audio: plate:`; `audio:` ≤ 10 % film-wide; a sung plate (non-empty `lines`, `intent` ≠ `rest`) needs ≥ bars − 0.5 events |
| `camera` | string or keys | (nobody) | key list with eases (playbook 06) |
| `handoff` | `{in: {type, geometry}, out: {type, geometry}}` | E1 | type ∈ `match · bridge · contrast · open · end`; A.out.type = B.in.type; `match` needs non-empty `geometry` on both sides; ≥ 60 % of boundaries `match`; use `open`/`end` only for the first in / last out |
| `counter_cameo` | `{value: number, …}` or `null` | C4 | truthy in ≥ 70 % of plates; numeric `value`s never decrease in plate order |
| `motif_role` | string | C3 | non-empty in ≥ 70 % of plates (`""` = motif absent) |
| `gag` | string | (nobody) | one dry text gag in the plate's idiom referencing the lyric's domain (catalog C5) |
| `intent` | string | D6 | `"rest"` = declared still stretch, exempt from event density (keep ≤ 15 % of runtime) |
| `hero` | object or omitted | N10 | ≥ 1 hero plate; all of `purpose, metaphor, technique, why, camera, audio_cues, cost, evidence` non-empty |

**Top-level skeleton**

```json
{ "slug": "<slug>", "status": "draft", "run": "outputs/<run>", "concept": "<one paragraph>",
  "style": { "palette": { "ground": "#<hex>", "paper": "#<hex>", "neutral": "#<hex>", "accent": "#<hex>" }, "accent": "#<hex>" },
  "motif": { "name": "<object>", "reveal_plate": "<id in last third>" },
  "counter": { "name": "<quantity>", "unit": "<unit>", "start": 0, "end": 0 },
  "plates": [ ... ] }
```

**One plate** — pdoom's `bureau` re-expressed in our schema, to show the *shape* only (never reuse its content):

```json
{ "id": "bureau", "module": "bureau", "params": {}, "anchor": "That was safe enough",
  "lines": ["That was safe enough, we reckoned", "Forward MLP, backward, repeat", "Now von Neumann's obsolete"],
  "concept": { "idea": "the safety sign-off as a bureaucratic ritual", "subject": "Form 7-B, a typewriter and a rubber stamp", "transform": "jargon-literal" },
  "idiom": "government form on bone paper",
  "integration": [
    { "line": "That was safe enough, we reckoned", "method": "typed into a form field, reckoned lands as a rubber stamp" },
    { "line": "Forward MLP, backward, repeat", "method": "network pulse as syllable cursor, mirror-set backward, time-remapped stutter" },
    { "line": "Now von Neumann's obsolete", "method": "marker strike and handwriting on an appendix that tears" } ],
  "events": [
    { "anchor": "word:That was safe enough#3", "action": "X in the SAFE ENOUGH box" },
    { "anchor": "word:That was safe enough#5", "action": "hard cut wide + stamp slam, shake 30, zoom +5 %" },
    { "anchor": "downbeat:3", "action": "FILED / NO FURTHER ACTION stamp" },
    { "anchor": "syl:Forward MLP#1.0", "action": "M pops over layer 1, camera snap" },
    { "anchor": "word:Now von Neumann#0", "action": "hard cut to Appendix C" },
    { "anchor": "word:Now von Neumann#3", "action": "marker X, then the page tears to 40 ms black" } ],
  "camera": "page-space affine, log zoom; snap per syllable (outExpo 0.2 s); 1500 px whip inOutExpo between annexes",
  "handoff": { "in": { "type": "contrast", "geometry": "contrast: dark odometer -> bone paper, 0.6 s outExpo landing" },
               "out": { "type": "bridge", "geometry": "bridge: tear + 40 ms black, next plate fades in over 0.12 s" } },
  "counter_cameo": { "value": 0.42, "idiom": "form field 5, EST. (ROUND DOWN)" },
  "motif_role": "",
  "gag": "* 'Safe enough' is defined in Form 7-C, which has not been drafted. Do not detach.",
  "intent": "" }
```

Event anchor convention (the gate checks only the prefix; engineers rely on the rest): `word:<line query>#<word index>`,
`syl:<line query>#<word>.<syllable>`, `line:<query>`, `beat:+<n>` (from plate start), `downbeat:<k>` (k-th downbeat in the plate),
`section:<analysis name>`, `plate:start|end`, `audio:<kind>` (micro only).

## 8. Gate and fix loop

```sh
cd app && ATF_RUN=../outputs/<run> bun scripts/render.ts timeline     # writes outputs/<run>/timeline.json (needs timeline.ts, playbook 03)
cd .. && python3 src/plan_gate.py app/src/songs/<slug> outputs/<run>  # exit 0 = PASS; FAIL[plan:<criterion>] lines otherwise
```

| FAIL token | Usual cause | Fix |
|---|---|---|
| `schema` | plan ids ≠ timeline ids/order | same ids, same order in both files |
| `coverage` | a shown occurrence claimed by 0 or 2 plates; a listed line not sung in that window | list each occurrence in the plate whose window holds its first word |
| `A1` | boundary off the beat grid, cut after the first word, gap/overlap, last plate ≠ duration | cut with `edit().cut()`; end on `au.duration` (playbook 03) |
| `A2` | plate < 0.5 or > 9 bars; uniform lengths; long section in one plate | split/merge at line starts |
| `A3` | missing/shared idiom | re-derive the idiom from the plate's subject (playbook 05) |
| `B3` | missing method, method reused across modules, subtitles | pick another method from playbook 04 |
| `C1` / `C3` / `C4` | concept fields, motif coverage/reveal, counter coverage/monotony | fix the treatment first, then the JSON |
| `D6` | < 1 event per bar, unnamed anchors, audio-triggered events | anchor big events on words/beats (playbook 03) |
| `E1` | type mismatch, match without geometry, < 60 % match | write the contract on both sides (playbook 07) |
| `N5` / `N10` | pdoom palette; hero fields | own palette; complete the hero card |
| `modules` | `status: final` with a missing `scenes/<module>.ts` | finish the plate or keep `draft` |

## 9. Known gate limits (do not exploit; report instead)

- `norm()` keeps only `[a-z0-9]`: Hangul/CJK lines all normalise to `""`, so coverage/B3 cannot tell them apart. For a non-Latin song, keep
  ids/idioms/methods ASCII and ask the lead to extend `norm()` before trusting a PASS.
- A1's lyric-first check keys the first word by text, so for a repeated line it only checks the plate of its **last** occurrence. Cut every
  occurrence with `cut(q, nth)` anyway.
- Methods are compared after `norm()`: renaming a reused method ("stamped" → "stamp-ed") passes the gate and fails the critic. Do not.

## 10. Exit checklist

- [ ] TREATMENT has all 8 sections; every plate paragraph names its pun, integration per line, key anchors, hand-off, motif role, counter cameo, gag
- [ ] palette, type mapping, motif and counter are this song's own; ban list respected
- [ ] hero plate chosen (the song's peak or its most interpretable line) with all 8 N10 fields; it is the vertical slice (N11)
- [ ] `plan_gate` exit 0 on the resolved timeline
