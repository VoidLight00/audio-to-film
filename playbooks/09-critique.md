# 09 — Independent critique

The coordinator manages the loop. A new critic judges each round. `src/critic_gate.py` checks the recorded evidence.
`src/critic_pack.py` prepares the evidence. Prepare your own licensed reference sheets at the paths in section 2.
Private development frames are excluded. Do not report a final pass when reference evidence is absent.

## 1. The loop

1. Resolve the edit: `cd app && ATF_RUN=../outputs/<run> bun scripts/render.ts timeline` (the pack reads `outputs/<run>/timeline.json`).
2. Build the pack: `python3 src/critic_pack.py outputs/<run> <plate id | film> <N>` → `outputs/<run>/critic/round-NNN-<scope>/brief.md` + PNGs.
3. Spawn a **new** critic agent with the prompt in §7. Never reuse a critic, never `SendMessage` to an earlier one, never show it earlier verdicts or scores.
4. The critic writes `app/src/songs/<slug>/critique/round-NNN.json`.
5. `python3 src/critic_gate.py app/src/songs/<slug> --plate <id>` (or `--film`). Exit 0 = this scope passes. Otherwise the plate engineer fixes the
   listed defects (one fix per defect), re-renders stills, and the loop restarts at step 2 with the next N.
6. Before `status: final`: `python3 src/critic_gate.py app/src/songs/<slug> --final` (latest round of every plate in `plan.json` + the film).

**Round numbers are global per song**, not per scope: `round-NNN.json` carries no scope in its name, so two scopes with the same N
would overwrite each other. Next N = 1 + the highest existing number. `critic_pack.py` writes `{N:03d}` and `critic_gate` orders rounds by
their number (round-100 after round-99), so ~20 plates × 1–6 rounds never confuse the latest round.

## 2. Evidence (what `critic_pack.py` renders, final look: adaptive blur, shutter 0.2)

| Scope | Sheets | Frames |
|---|---|---|
| plate | `cuts.png` | ±2 frames at the cut in and the cut out (neighbour plates loaded) |
| plate | `words.png` | every word start of the plate's lines + 60 ms (sync, legibility, emphasis never ahead of the voice) |
| plate | `words_before.png` | every word start − 50 ms: B1, nothing lights before the voice |
| plate | `motion.png` | 8 frames 0.1 s apart from the middle (motion, beat events) |
| plate | `full_0..2_*.png` | 3 full-size stills at 25 %, 50 %, 80 % (100 % detail, finish) |
| film | `film_NN.png` | one frame every 2 s + the first frame of every plate |
| both | reference | `docs/research/frames/ref_cuts.png`, `ref_lyric_midpoints.png`, `detail_crops_100pct.png` |

Gaps to fill by hand when a question needs them (add the files to `evidence`): frames 2 frames **before** a few word starts (B1 cannot be judged
from +60 ms frames alone) and `--scale 2` stills for `resolution`/`finish` (the pack's full stills are 1080p):
`cd app && ATF_RUN=../outputs/<run> bun scripts/render.ts stills --only <prev>,<id>,<next> --t <w.start-0.033>,… --samples auto --shutter 0.2 [--scale 2] --out ../outputs/<run>/critic/round-NN-<scope>/extra`.

Optional targeted reference frames (add them to `reference_frames`; paths must exist, `src/critic_gate.py:35`):
`ffmpeg -v error -ss <t> -i ~/.cache/audio-to-film/ref/ref1080.mp4 -frames:v 1 outputs/<run>/critic/ref/ref_<t>.png`.
Pick the reference moment that does the same *job* (REF §2.1, §3.1): word slams 22.8–23.9 s (hook1); paper document 71.9 s / 75.8 s (bureau);
data chart as subject 11.1 s (loss), 63.3 s (ascent); UI typing 19.7 s (prompt1); 3D engraving 31.7 s (shoggoth); lens 43.2 s (spacetime);
map/schedule 84.4–88.0 s (leftturn); fuel/burn 104.2 s (fuse); frame-breaking type 117.9 s (dense); quiet breakdown 92.4 s (prompt3);
ending 143.9–149.1 s (outro).

## 3. Eight pairwise dimensions (`pairwise`, each `worse | par | better` than the reference)

| Key | Judge | Reference level |
|---|---|---|
| `concept` | the image interprets the line's meaning as a pun/transformation of a concrete subject, not decoration or literal illustration | loss curve as the subject of "sudden drop"; Form 7-B + stamp for "safe enough" |
| `lyric_integration` | words are part of the picture (path, surface, form, tool edge), and the method stages the meaning | ~40/46 lines L3 (REF §1.4 levels L0–L3) |
| `composition` | one clear focal point, asymmetric Swiss layouts, negative space, detail in ≥ half the frame | `ref_cuts.png` |
| `motion` | hold → snap on beats/words, anticipation, eases with intent, no idle beats | 37.9 hard changes/min, beat-lock 1.70 |
| `typography` | display scale, hierarchy, ≤ 4 families used with intent, kerning, punctuation, legibility, never ahead of the voice | 31 % frames with display-size lyrics |
| `finish` | grain/bloom discipline, accent restraint, engraving/paper/ink texture, micro-text and gags at 100 % crop, no artefacts | `detail_crops_100pct.png` left |
| `variety` | within the plate: sub-movements, state change per word; across the film: idioms, light/dark rhythm | 17 idioms, paper plates ~10 % |
| `transitions` | hand-offs motivated by content, matched geometry, still exit frames | 14/21 geometric match cuts |

`par` means the same craft level, not the same content. Name the reference frame you compared against in the defect or the `why` text.

## 4. Ten quality questions (`gate10`, NEEDS N14; each `{answer: yes|no, why}` citing a frame time)

| Key | Yes only if |
|---|---|
| `focal_point` | every evidence frame has one clear focal point; the eye knows where to look |
| `camera_intent` | each camera move has a reason tied to a word or beat; no ornamental drift, no random roll |
| `musical_events` | big events land on beats/word onsets; held words keep moving; nothing important fires off-grid |
| `metaphor_support` | material, light and depth support the plate's metaphor (paper reads as paper, steel as steel) |
| `typography` | sung words are legible, synced, upright, inside title-safe; scale and hierarchy are deliberate |
| `motivated_transitions` | in and out cuts come from content (matched element or declared contrast/bridge) |
| `artifacts_free` | no double images, moiré crawl, NaN discs, clipped highlights, aliasing, red error frames, black gaps |
| `resolution` | 100 % crops hold up: hairlines intact, text crisp, detail rewards zooming |
| `authored` | looks designed for this line of this song, not stock, not a template, not pdoom's identity |
| `narrative_purpose` | the plate does what its plan row says it is for (the hero `purpose`, the concept idea) |

## 5. Frame-judged catalog criteria (record failures as defects)

B1 emphasis never ahead of the voice · B2 text changes within ±1 frame of each word start · B4 lyric bbox sits on/in scene objects that react to it ·
B5 words > 1 s keep changing every ≤ 0.5 s · B6 sung word readable mid-word, ≥ 96 px from edges · D1 ≥ 85 % of sung beats carry an event ·
D3 ≥ 80 % of big camera events on a beat/word ±60 ms · E1 match element within ±20 px, same shape/colour · F1 no colour outside the palette ·
F2 only the accent blooms, paper-colour type stays crisp · F3 ≤ 4 families, no fallback glyphs, no outline/halo text unless declared.
Also check the ban list (playbook 02 §4). The verdict JSON may carry an extra `catalog` object (`{"B1": "ok|fail: …"}`); `critic_gate` ignores it.

## 6. Defects, severity and the pass rule

Defect = `{severity: high|medium|low, t: seconds, what, fix}`; `fix` is one concrete change ("cool the sung word to paper instantly at w.end + 0.03
instead of a linear blend that reads salmon"), never "improve".

| Severity | Examples |
|---|---|
| high (blocks pass) | a sung word illegible, flipped, cropped, smeared or emphasised before it is sung; a missing shown line; a red or black error frame; banned imagery; a literal illustration where the plan claims a pun; a broken match (element jumps > 20 px or changes shape); visible double images or moiré; pdoom's identity; the hero reading as a tech demo |
| medium | idle beats; timid display scale; an empty quadrant; a generic move; accent overused; weak gag |
| low | polish: kerning pair, timing by a frame, a grain or bloom value |

`src/critic_gate.py:27-56` (`problems`) accepts a round only when: `critic_id` present and never used before in this song (any scope); reference frames listed and
existing; evidence listed; all 8 `pairwise` keys answered and none `worse`; all 10 `gate10` answered with a non-empty `why` and all `yes`;
no `high` defect; `verdict` = `pass`. A `pass` verdict that breaks any of these is rejected.

Film scope: say the film **exceeds the reference** only when a majority of the 8 dimensions (≥ 5) are `better` (NEEDS N1, S1).

**Six rounds rule**: if one scope gets 6 rounds without passing, stop polishing. The Creative Director rewrites that plate's concept (new subject,
transform or idiom; the BRIEF runner-up device is a source), updates `TREATMENT.md` and `plan.json`, re-runs `plan_gate`, and the plate restarts
with new critics (DESIGN §3-5). Local fixes after round 6 are a sign of a weak idea, not a weak render.

## 7. Critic prompt template (fill the `<…>` and send to a NEW agent)

```text
You are an independent visual critic for a code-rendered music video, working at the standard of a title-sequence director.
You did not make this work and you will never see it again after this round. Your critic_id is "<slug>-<scope>-r<NN>-<random 6 chars>".

Read, in this order:
1. outputs/<run>/critic/round-<NN>-<scope>/brief.md  (plan row, lyrics with word times, evidence list, reference list, output schema)
2. app/src/songs/<slug>/TREATMENT.md: Tone, Palette, Typography, Karaoke rules, and this plate's paragraph
3. app/src/songs/<slug>/BRIEF.md: the analysis rows of this plate's lines (what each line means)
4. playbooks/09-critique.md sections 3-6 (definitions of every key, severity, pass rule)
5. EVERY PNG listed under Evidence and under Reference, with the Read tool. Do not judge a frame you have not opened.

Judge only what the frames show, not what the plan intends. The reference (pdoom-video) is the user's minimum bar: compare craft level, not content.
For each pairwise dimension answer worse | par | better and name the reference frame you compared with.
Answer all ten gate10 questions yes | no, each "why" citing a frame time. A "yes" you cannot point to in a frame is a "no".
List 5-12 defects {severity, t, what, fix}; every fix is one specific change an engineer can make. Vague approval is not allowed.
Check catalog criteria B1 B2 B4 B5 B6 D1 D3 E1 F1 F2 F3 and the ban list; a failure is a defect.
verdict = "pass" only if no dimension is worse, all ten answers are yes and no defect is high; otherwise "revise".

Write exactly the JSON from brief.md to app/src/songs/<slug>/critique/round-<NN>.json, with "reference_frames" listing every reference image you
used (repo-relative paths) and "evidence" listing every evidence PNG. Do not edit any other file. Do not read other critique/round-*.json files.
Reply with the file path and a three-line summary.
```

Then run `critic_gate.py`. Hand the defect list (not the scores) to the plate engineer.
