# 10 — Rendering, measurement and the gates

Owner: Render/QA. Every claim in the final report comes from a command's exit code or printed measurement (N16, N17). All `render.ts` commands
run from `app/` with `ATF_RUN=../outputs/<run>`; the run folder must hold `song.json` = `{"slug": "<slug>"}` or the legacy v2 edit renders.

## 1. Render modes (`app/scripts/render.ts`)

| Mode | Command (from `app/`) | Use it for | Measured cost |
|---|---|---|---|
| `timeline` | `bun scripts/render.ts timeline [--out f]` | resolve the edit → `outputs/<run>/timeline.json` for `plan_gate` and `critic_pack` | ~6 s |
| `stills` | `bun scripts/render.ts stills --t 12.5,13.0 [--only a,b] [--samples auto --shutter 0.2] [--scale 2] [--out dir]` | the main way to check work; Read every PNG. Final look = `--samples auto --shutter 0.2`; 100 % detail = `--scale 2` | est. ~1 min per ~95 stills (`docs/BUILD_REPORT.html`, unmeasured) |
| `sheet` | `bun scripts/render.ts sheet --from a --to b --n 16 --cols 4` / `--times a,b,c` / `--cuts` | contact sheets of a plate; `--cuts` = 4 frames around every boundary (−0.1, −1/60, +1/60, +0.1 s) | seconds |
| `perf` | `bun scripts/render.ts perf --from a --to b --only id --samples 1` | per-frame budget (avg, p50, p95, max ms incl. readback); target ≤ 25 ms at 1080p | seconds |
| `video` (draft) | `bun scripts/render.ts video --samples 4 --shutter 0.2 --preset veryfast --crf 20 --out ../outputs/<run>/film-draft.mp4` | whole-film timing, motion, `frame_metrics`, the film critic | ~10.5 min for 169 s (v2 plates; authored plates cost more: measure) |
| `video` (4K master) | `bun scripts/render.ts video --scale 2 --samples auto --shutter 0.2 --out ../outputs/<run>/film-4k.mp4 [--claim]` | the deliverable | v2: 5084 s for 169 s (~30 s per film second, ~133 sub-frames/frame) |
| `gpu` | `bun scripts/render.ts gpu` | confirm Chrome uses the GPU (ANGLE Metal) before long renders | seconds |

`--only a,b` loads only those plates (faster); every other plate renders as a dark-red error frame, so load both neighbours for boundary checks.
An authored song refuses to render on any scene error, inverted anchor span or lyric glyph no font can draw (`app/scripts/render.ts:73-79`).

Equivalent pipeline commands (`src/create_film.py:55-110`): `bun run create-film -- --resume outputs/<run> --draft` (draft: 4 sub-frames, veryfast,
crf 20, then `contact-sheet.png` and `film_qa`), `bun run create-film -- --resume outputs/<run> --scale 2` (4K master, adaptive, shutter 0.2).
`--from/--to` render a span.

## 2. Stale output (F9) — read before every re-render

- `video` resumes from `<film>.segments/` and reuses **any** complete segment, whatever code drew it. After changing plate code, `timeline.ts`, the
  style module or the engine: `rm -rf outputs/<run>/<film>.mp4.segments`. (A successful concat deletes the folder unless `--keep-segments`; the risk is
  a crashed or partial render.)
- `create-film --resume` skips every stage whose output file exists (`src/create_film.py:40-43`): also delete the old `film-draft.mp4` /
  `film-4k.mp4` and `contact-sheet.png`, or the "new" draft is the old one.
- `frame_metrics.py` caches per film path + size + mtime (`~/.cache/audio-to-film/metrics/`): a re-rendered file is re-measured automatically.

## 3. 4K master with parallel workers

Run the same `video --scale 2 … --claim` command N times at once: workers share `<film>.segments/` as a queue (atomic `mkdir` lock per segment);
the last worker to find every segment complete concatenates and muxes. Measured: 2 local workers = 1.23× (one M4 Pro), byte-identical segments
(`docs/STATUS.md`). A killed worker leaves `seg_….mp4.lock`: re-run once **without** `--claim` to finish. Estimate first: render a representative
10–15 s span at 4K (`--from/--to`, heaviest plates) and extrapolate (v2: 15 s span = 488 s).

## 4. `frame_metrics.py` — measured limits M1–M7

```sh
python3 src/frame_metrics.py outputs/<run>/film-draft.mp4 outputs/<run> --accent '#<song accent>' --json outputs/<run>/frame_metrics.json
python3 src/frame_metrics.py --calibrate       # proves the judge: pdoom's YouTube render must PASS, our v2 film must FAIL (>= 6 limits)
```

Always pass `--accent` (the default `#FF4D12` is pdoom's). OCR (M7) compiles `src/ocr.swift` with `swiftc` on first use (macOS Vision).
Output: one line per metric `  M1 hard_per_min   37.900  (>= 25)`, then `FAIL[frames:M<n>]: <metric> = <value> (needs <op> <limit>)`, then
`PASS[frames]` on success; exit 0 / 1.

| Metric | Limit | ref / v2 | Meaning | If it fails |
|---|---|---|---|---|
| M1 `hard_per_min` | ≥ 25 | 37.9 / 3.5 | large persistent image changes (cut, sub-cut, slam, whip, punch-in) | more sub-movements, reframes and full-frame slams per bar (playbook 03 §5) |
| M1 `hard_gap_median_bars` | ≤ 1 | 0.50 / 7.12 | typical spacing of hard changes | ≥ 1 hard change in most bars |
| M2 `long_static_frac` | ≤ 0.10 | 0.061 / 0.944 | runtime inside > 4-bar stretches without a hard change | only one declared rest may run long |
| M3 `hard_on_beat_frac` | ≥ 0.5 | 0.586 / 0.10 | hard changes within ±50 ms of a beat | anchor cuts/slams on beats (`cut`, `pick`, `snap`) |
| M3 `beatlock_ratio` | ≥ 1.5 | 1.70 / 1.12 | motion just after beats vs the median | snaps start on the beat, anticipation small; visible area must move |
| M3 `beats_with_accent_frac` | ≥ 0.35 | 0.441 / 0.185 | beats carrying a visible accent | a pulse, stamp, step or flip on more beats |
| M4 `light_frames_frac` | ≥ 0.08 | 0.098 / 0.0 | frames with mean luma > 0.45 | paper plates (playbook 05 §3) |
| M4 `meanY_std` | ≥ 0.15 | 0.214 / 0.036 | light/dark swing over time | brighter and longer paper moments |
| M5 `near_empty_frac` | ≤ 0.10 | 0.077 / 0.392 | frames < 3 % painted | fill grounds with the idiom's furniture |
| M5 `detail_cells_median` | ≥ 0.5 | 0.63 / 0.25 | 4×4 cells with edges in the median frame | spread structure across the frame |
| M6 `accent_share_median` | ≤ 0.08 | 0.057 / 0.151 | saturated accent pixels / painted pixels | spend the accent on the sung word, motif, marks |
| M7 `text_frames_unsung_frac` | ≥ 0.5 | 0.811 / 0.034 | OCR finds scene text while nobody sings | labels, forms, legends, footnotes in every world |
| M7 `display_lyric_frac` | ≥ 0.25 | 0.328 / 0.006 | lyric frames with advance ≥ 80 px/char at 1080p | display-size, upright lyric moments (playbook 04 §5) |

Known limits: M7 tokenises `[a-z]+` words of ≥ 3 letters, so a non-Latin (e.g. Korean) lyric never counts as display text; M6 ignores desaturated
accents. Report such cases instead of claiming a pass.

## 5. Other gates

```sh
python3 src/plan_gate.py app/src/songs/<slug> outputs/<run>          # after every timeline/plan change (playbook 02 §8)
python3 src/critic_gate.py app/src/songs/<slug> --plate <id> | --film | --final
python3 src/film_qa.py outputs/<run> outputs/<run>/film-4k.mp4         # streams, frame count = round(duration × 60), non-rigid motion (no still > 0.5 s), glyphs
bash gates/songs_gate.sh .                                             # judges' self-checks + every status:final song: timeline → plan_gate → critic_gate --final
bash gates/verify_audio_to_film.sh .                                   # master gate: every gates/*_gate.sh, fail-closed
```

`gates/film_gate.sh` R13 greps `app/src/songs` for `Math.random(`, `Date.now(`, `performance.now(`, texture/image loaders and image file names:
one hit in any plate (comments included) fails the master gate. `film_qa`'s motion check means even a declared rest and an exit hold need
non-rigid motion every ≤ 0.5 s (grain alone and a pan over a still picture fail).

## 6. Order of work and evidence

| Step | Gate (exit 0) | Evidence to keep |
|---|---|---|
| plan + edit | `plan_gate` | its PASS line |
| hero plate (vertical slice, N11) | `critic_gate --plate <hero>` | round file, stills |
| every plate | `critic_gate --plate <id>` | round files |
| draft film | `film_qa` on the draft, `frame_metrics` | `frame_metrics.json`, `qa-film-draft.json` |
| film critic | `critic_gate --film` | round file |
| 4K master | `film_qa` on the master, `frame_metrics` on the master | `qa-film-4k.json`, metrics |
| final | set `"status": "final"`, `songs_gate`, `verify_audio_to_film.sh` | gate output |

## 7. Cost expectations (v2 measurements on this machine, 169 s song, unless marked estimated)

| Stage | Time |
|---|---|
| analysis (`--analysis-only`: stems, beats/sections/f0, CTC + Whisper, gate) | ~6–10 min (vocal separation 5.5 min under contention / ~2 min alone, music 50 s, CTC 57 s, Whisper 96 s, alignment 52 s; `docs/BUILD_REPORT.html`) |
| timeline resolve | ~6 s |
| critic pack (adaptive stills) | estimated ~1 min per ~95 stills (not yet measured) |
| 1080p draft, 4 sub-frames | ~10.5 min (8–14 min per round in v2) |
| 4K60 adaptive master | 1 h 25 min render + 111 s QA, 12.97 GB; 2 `--claim` workers ≈ 1.23× faster |

Authored plates (ray marching, many layers) cost more than v2's archetypes: re-measure with `perf` and a 4K span, then update DESIGN §6 with the real
numbers. Speed never buys back quality (N24): use stills instead of full drafts for critic evidence, plates in parallel, `--claim` for 4K.

## 8. Report

Run folder, plate list with critic rounds and final verdicts, the `frame_metrics` table (ours vs reference vs limit), every gate's exit code,
measured time per stage, and what is still below the reference. Say "exceeds the reference" only with a film critic majority of `better`
(playbook 09 §6). No upload or publication without explicit approval.
