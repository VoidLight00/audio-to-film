# Public engine failure log

This export omits private review transcripts and song-specific evidence.

| Date | Failure | Correction | Runnable check |
|---|---|---|---|
| 2026-09-28 | Noise changed abruptly at an old twelve-hertz boundary. | Blend seeded fields continuously. | tests/test_pipeline.py |
| 2026-10-01 | A still image with grain passed motion checks. | Measure non-rigid residual motion and test intentional traps. | gates/film_gate.sh |
| 2026-10-01 | Camera roll left lyric text inverted. | Complete the second half-turn before the shot ends. | app/src/plan.test.ts |
| 2026-10-01 | Resume could reuse segments from older renderer code. | Reject stale render segments after source changes. | app/scripts/render.ts |
| 2026-10-06 | Generated architecture and OG images had incorrect dimensions. | Normalize images to the publication contract. | GitHub harness target verification |
