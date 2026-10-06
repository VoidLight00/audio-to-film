# Architecture

## v2 — GPU engine (2026-10-01)

```
song file ─ decode ─> input.wav (one gapless 44.1 kHz decode; every stage shares this timeline)
  analysis/ (uv, Python)
    stems.py     htdemucs_ft -> drums/bass/other/vocals; mel-band-roformer karaoke -> lead   (offset check < 1 ms)
    analyze.py   beats (librosa DP), downbeats (4/4 phase: kick + chroma change), sections (bar SSM novelty),
                 100 fps envelopes, kick/snare/hat/vocal onsets, lead f0, instrumental spans, tail -> audio.json
    align.py     lyrics.txt or Whisper (title near-miss fix, run-on lines split) -> fused MMS_FA/wav2vec2 CTC
                 Viterbi with a star token -> refine.py (rest-onset / onset-snap / fricative) -> confidence gate
                 -> lyrics.json (only confirmed words)
  app/ (bun, Vite, three.js, headless Chrome)
    src/plan.ts       director: sections -> <= 8-bar shots cut on downbeats -> archetype by role + relative features
    src/archetypes/   lens, curl, dbm, attractor, string, kinetic, instrumental (+ _kit camera/type, _physics)
    src/engine/       pdoom-video engine: f(t) scenes, ternary adaptive motion blur, bloom/halation/grain, HDR
    scripts/render.ts segmented video (resume, lossless concat, audio mux), stills, sheet, perf
  src/film_qa.py      streams, frame count, non-rigid motion (affine-removed residual) -> qa.json
```

Determinism: a frame is a function of song time only. Simulations (DBM growth, Lorenz orbits) are solved
once in `init()` from a seed and indexed by onset number and t; energy-driven speeds use prefix
integrals (`AudioData.integral`), never `x += dt`. `film_gate.sh` proves it by rendering the same times
in opposite orders and comparing pixels.

Anti-slop is enforced, not described: no bitmap imagery or unseeded randomness in archetype code (grep
gate), and `film_qa.py` fails any stretch over 0.5 s without non-rigid motion — calibrated on a still
under live grain and a Ken Burns zoom, both of which must fail.

Lyrics are never invented: a word shows only if its CTC path probability and Whisper's timing agree
(`align.py` thresholds), a line only if 70 % of its words pass; shots without displayable lyrics get
non-typographic archetypes. Without a lyrics file, ASR spelling errors that sound right (Flore/Floor)
pass the gate; the title fix covers the song title only. Supplying `--lyrics` is the accurate path.

Known limits: 4/4 assumed for downbeats; section kinds are heuristic labels; 4K adaptive rendering costs
hours on an M4 Pro (measure with a short `--from/--to` span first); the visual pass verdict (R20) is a
human/independent-critic judgment, not a gate.

## v1 — CPU prototype (2026-09-28)


The command accepts one audio file, copies it to an exclusive timestamp/hash folder, decodes through installed FFmpeg 9.0.1, analyzes a low-rate mono stream with NumPy 2.4.2 / SciPy 1.17.1, writes a machine-readable timeline and creative treatment, generates indexed OpenCV 4.13.0 frames, encodes with x264, then muxes the original audio. No network calls. Python and native binaries are local prerequisites, not downloaded dependencies. Record versions before upgrade; pin compatible environments for distribution.

Frames are pure functions of time, seed, dimensions and beat list. Review resolution 480×270, draft 640×360, safe-CPU final 960×540 at 24 fps. A 1080p GPU master, real lensing, color-managed HDR and perceptual motion blur are not yet implemented. The master path is currently 960×540 CPU. This is deliberately an approximation rather than a claim of physical ray-tracing. Never claim validated vocals, lyrics or meter until a separate recognizer and confidence gate exist. Existing `remotion-kurz` was unrelated and is not imported.

Pipeline failure writes `FAILED.txt`, retains logs and never overwrites an older run. Tests check deterministic frames, synthetic onsets and invalid-input failures. A subjective quality decision requires inspection of actual frames and motion. Use `playbooks/` by problem, not all at once.
