# Audio to Film — Outcome contracts

| id | requirement | gate |
|---|---|---|
| R1 | Exactly one decodable audio path enters a fresh per-run directory; originals remain untouched | pipeline_gate.sh |
| R2 | Decode/probe/render subprocess failures return nonzero and preserve diagnostic logs | error_path_gate.sh |
| R3 | Analysis, treatment, timeline, draft, final, evidence, report exist and are nonempty | count_gate.sh |
| R4 | No secret literals in project output | secrets_gate.sh |
| R5 | Every requirement names a real gate or explicit human judgment | req_coverage_gate.sh |
| R6 | Same seed/time produces identical pixels regardless of frame order | pipeline_gate.sh |
| R7 | Unknown/uncertain vocals never produce fabricated lyrics | pipeline_gate.sh |
| R8 | Synthetic rhythm produces timed sections and event evidence | pipeline_gate.sh |
| R9 | Export is muxed audio/video with duration and frame evidence | pipeline_gate.sh |
| R10 | Narrative and visual quality require review of actual motion, not typecheck alone | human |
| R11 | Forbidden color stripe is absent | no_vertical_stripe_gate.sh |
| R12 | v2 engine typechecks; physics, director-plan and karaoke unit tests pass; pronunciation rules self-check | film_gate.sh |
| R13 | Archetype and director code contain no unseeded randomness, wall clock or bitmap imagery (zero slop at the source) | film_gate.sh |
| R14 | Every frame is a pure function of song time: the same t rendered in opposite orders is pixel-identical | film_gate.sh |
| R15 | No stretch over 0.5 s without non-rigid motion; a still under live grain and a Ken Burns zoom must fail the check | film_gate.sh |
| R16 | A v2 film is H.264 60 fps BT.709 with audio, its frame count equals its span x 60 (the reverb tail is never cut) | film_qa.py |
| R17 | Segmented rendering resumes after a crash: finished segments are skipped, the result concatenates losslessly | film_gate.sh |
| R18 | Only lyric words confirmed by the confidence gate are shown; lines below 70 % confirmed are dropped, never invented | film_gate.sh |
| R19 | Every shown lyric character is drawable by a bundled font (Archivo / Plex / Pretendard) | render.ts |
| R20 | Cinematic quality of the rendered motion is judged by an independent critic on the actual film | human |
| R21 | v3 authored direction: every sung line in exactly one plate, lyric-first cuts on the beat grid, 0.5–9-bar plates (no fixed grid), no neighbouring idioms alike, a distinct lyric integration per line, concept cards (≤ 20 % literal), a running motif with a late reveal, a monotonic counter, ≤ 10 % audio-threshold events, ≥ 60 % match cuts with geometry, the song's own palette, complete hero notes, no placeholder in a final song (docs/v3/NEEDS.md N4 N7–N10 N20 N21) | plan_gate.py via songs_gate.sh |
| R22 | Every plate and the whole film pass a fresh independent critic who judges against the reference frames: nothing worse than the reference, ten quality questions yes, no high defect; a critic never grades twice (N1 N14 N15) | critic_gate.py via songs_gate.sh |
| R23 | The final film meets the reference-calibrated frame limits M1–M7: cut rhythm, beat lock, light/dark rhythm, no empty frames, accent budget, scene text, display-size lyrics (N1 N2; calibration in docs/v3/CALIBRATION.md) | frame_metrics.py |
| R24 | An authored song renders only when every plate loads and no anchor span is inverted (pdoom fuse.ts:521 class of bug) | render.ts |
