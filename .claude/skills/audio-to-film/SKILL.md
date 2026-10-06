---
name: audio-to-film
description: Create code-rendered scenes for one song. Read lyrics, write a treatment, and implement scene modules. Use independent critique and executable checks. Support 1080p and 4K rendering. Quality requires review and is not guaranteed.
---

# /audio-to-film (v3: authored direction)

Input: one audio/video file. Two optional files make the reading better:
- `--lyrics lyrics.txt`: the real lyrics, one sung line per line. Ask for it when the song is the user's own.
  Speech recognition drops or misreads lines (3 lines of the first song failed the confidence gate).
- `<run>/creator_note.md`: what the song means to its maker. It outranks your own reading in step B.
Do not ask about techniques or settings. Decide, record the decision, continue. Stop only at step C2,
and for paid, public or destructive actions.

The v2 director uses fixed formulas in `app/src/plan.ts`. The authored workflow adds lyric reading and song-specific scenes.
Provide reference frames you have permission to use. Private development references are not part of this export.

## Pipeline (read the playbook named at each step before doing it)

| step | do | output | gate |
|---|---|---|---|
| A analysis | `bun run create-film -- <song> --analysis-only` | `outputs/<run>/` audio.json, lyrics.json, work/whisper.json | — |
| B song reading | playbooks/01 | `app/src/songs/<slug>/BRIEF.md` (3 concept devices compared, one chosen) | — |
| C treatment | playbooks/02 | `TREATMENT.md`, `plan.json` (`status: draft`, `run`) | `python3 src/plan_gate.py <song> <run>` exit 0 |
| C2 review | show the user BRIEF.md (line table, 3 devices, the chosen one) and the TREATMENT.md plate table; apply their edits | `plan.json` `"approved": "<date> <their words>"` | `src/engineer_brief.py` exits 2 without it |
| D edit | playbooks/03 | `timeline.ts` (content anchors via `songs/edit.ts`), `<run>/song.json` = `{"slug": "<slug>"}` | `bun scripts/render.ts timeline` then plan_gate |
| E vertical slice | playbooks/04–08 | hero plates in `scenes/<module>.ts` | `src/critic_pack.py` → fresh critic → `src/critic_gate.py <song> --plate <id>` exit 0 |
| F all plates | same, parallel: one engineer per module, owns only its files | every module | critic_gate per plate, then a film round |
| G master | playbooks/10 | 1080p `film.mp4` by default; 4K (`--scale 2`, `--claim` workers) only when the user chooses it | `frame_metrics.py`, `plan.json status: final`, `bash gates/verify_audio_to_film.sh .` |

## Roles (separate agents; the coordinator integrates and owns plan.json, timeline.ts, edit.ts)

- **Creative Director** (the coordinator): B, C, D, revisions of the treatment. Main model.
- **Graphics Engineers**: one per plate module; read the plan row, TREATMENT.md, playbooks 03–08 and a reference
  example; render stills and LOOK at them (Read tool) before reporting.
- **Independent Critic**: a NEW agent every round (critic_gate refuses a repeated critic_id). Gets only the pack
  `outputs/<run>/critic/round-NN-<scope>/brief.md`; writes `critique/round-NN.json`. Prompt template: playbooks/09.
- **Render/QA**: drafts, 4K master, `frame_metrics.py`.

## Rules that are gates, not prose

- `plan_gate`: every sung line in exactly one plate; lyric-first cuts on the beat grid; 0.5–9-bar plates, not a
  fixed grid; no neighbouring idioms alike; a different integration method per line; concept cards (≤ 20 % literal);
  running motif ≥ 70 % with a late reveal; counter monotonic; ≤ 10 % audio-threshold events; ≥ 60 % match cuts with
  geometry contracts; the song's own palette; hero notes complete; `final` = no placeholder plate.
- `critic_gate`: fresh critic, reference frames attached, nothing worse than the reference, ten yes, no high defect.
  Six failed rounds on one plate → rewrite its concept in the treatment instead of polishing.
- `frame_metrics.py <film> <run> --accent <hex>`: reference-calibrated limits M1–M7 (cut rhythm, beat lock,
  light/dark rhythm, emptiness, accent budget, scene text, display-size lyrics). Calibration: `--calibrate`.
- Renderer: an authored song fails on any scene error or inverted anchor span (`songs/edit.ts span()`).
- After changing plate code delete `<film>.segments/` before `--resume` (F9).

## Report to the user

Run folder, plates and their critic rounds, frame_metrics table, gate exit codes, measured time per stage, and what
is still below the reference. Claim "exceeds the reference" only when the film critic rated a majority of
dimensions better. No upload or publication without explicit approval.
