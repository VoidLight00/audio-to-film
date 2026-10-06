#!/usr/bin/env bash
# film_gate — HARD. The v2 GPU engine (R12-R19): types, unit tests, analysis self-checks, zero-slop at
# the source, determinism of frames, and the motion check calibrated on trap clips that MUST fail.
# Needs bun, Chrome, ffmpeg, uv. ~3 min. macOS bash 3.2 safe, fail-closed.
set -u
ROOT="${1:-$(pwd)}"; case "$ROOT" in --*) ROOT="$(pwd)";; esac
APP="$ROOT/app"
RC=0
fail() { RC=1; printf 'FAIL[film]: %s\n' "$1" >&2; }
TMP="$(mktemp -d)" || { fail "mktemp"; exit 1; }
trap 'rm -rf "$TMP"' EXIT

# Generate synthetic test data on a fresh clone before the unit tests read it.
(cd "$APP" && bun scripts/fixture.ts "$ROOT/tests/fixture-run") >"$TMP/fixture" 2>&1 || { fail "test fixture"; exit 1; }

# R12 types + unit tests (physics, director plan, karaoke never ahead of the voice) + pron rules
(cd "$APP" && bunx tsc --noEmit -p tsconfig.json) >"$TMP/tsc" 2>&1 || { fail "typecheck"; head -20 "$TMP/tsc" >&2; }
(cd "$APP" && bun test) >"$TMP/test" 2>&1 || { fail "bun test"; tail -25 "$TMP/test" >&2; }
(cd "$ROOT/analysis" && uv run python pron.py) >"$TMP/pron" 2>&1 || { fail "pron self-check"; cat "$TMP/pron" >&2; }
# R18 the lyric confidence gate hides unconfirmed words (no fabricated karaoke)
(cd "$ROOT/analysis" && ATF_RUN="$TMP/alignchk" uv run python align.py --selfcheck) >"$TMP/al" 2>&1 || { fail "align gate self-check"; cat "$TMP/al" >&2; }

# R13 zero slop at the source: no unseeded randomness, wall clock or bitmap imagery in what draws frames
# code files only: critique/*.json evidence paths end in .png" and are data, not frame-drawing code
hits=$(grep -rnE --include='*.ts' --include='*.js' 'Math\.random\(|Date\.now\(|performance\.now\(|TextureLoader|ImageLoader|new Image\(|\.(jpe?g|png|webp|gif)["'"'"'`]' \
  "$APP/src/archetypes" "$APP/src/songs" "$APP/src/plan.ts" "$APP/src/director.ts" | tee "$TMP/hits" | wc -l | tr -d ' ')
[ "$hits" = "0" ] || { fail "forbidden API in archetypes/songs/director: $hits hit(s)"; cat "$TMP/hits" >&2; }

# R14 determinism: the same t rendered in opposite orders gives identical pixels (one t per archetype family)
(cd "$APP" && bun scripts/fixture.ts "$TMP/run") >/dev/null 2>&1 || fail "fixture"
TS="5,14.6,31.5,46.3,55.2,62.6,74.3"
REV="74.3,62.6,55.2,46.3,31.5,14.6,5"
(cd "$APP" && ATF_RUN="$TMP/run" bun scripts/render.ts stills --t "$TS" --out "$TMP/a") >"$TMP/sa" 2>&1 || { fail "stills A"; tail -5 "$TMP/sa" >&2; }
(cd "$APP" && ATF_RUN="$TMP/run" bun scripts/render.ts stills --t "$REV" --out "$TMP/b") >"$TMP/sb" 2>&1 || { fail "stills B"; tail -5 "$TMP/sb" >&2; }
n=0
for f in "$TMP"/a/*.png; do
  [ -e "$f" ] || continue
  n=$((n + 1))
  cmp -s "$f" "$TMP/b/$(basename "$f")" || fail "nondeterministic frame $(basename "$f")"
done
[ "$n" -eq 7 ] || fail "determinism compared $n stills, expected 7"

# R15 motion: a fixture clip across a cut passes film_qa; a still under live grain and a Ken Burns zoom
# over a still MUST fail it (proves the check is not blind to grain or rigid pans)
(cd "$APP" && ATF_RUN="$TMP/run" bun scripts/render.ts video --from 38 --to 42 --samples 4 --preset veryfast --crf 22 \
  --out "$TMP/run/clip.mp4") >"$TMP/clip" 2>&1 || { fail "fixture clip render"; tail -5 "$TMP/clip" >&2; }
python3 "$ROOT/src/film_qa.py" "$TMP/run" "$TMP/run/clip.mp4" >"$TMP/qa" 2>&1 || { fail "film_qa rejects the fixture clip"; tail -15 "$TMP/qa" >&2; }

# R17 crash recovery: drop a finished segment, re-run the same command -> only that segment renders
R17=(--from 40 --to 42 --samples 1 --preset ultrafast --segment 0.5 --keep-segments --out "$TMP/run/seg.mp4")
(cd "$APP" && ATF_RUN="$TMP/run" bun scripts/render.ts video "${R17[@]}") >/dev/null 2>&1 || fail "segmented render"
rm -f "$TMP/run/seg.mp4.segments/seg_0002430_0002460.mp4"
(cd "$APP" && ATF_RUN="$TMP/run" bun scripts/render.ts video "${R17[@]}") >"$TMP/resume" 2>&1 || fail "resume render"
skipped=$(grep -c 'complete, skipped' "$TMP/resume")
[ "$skipped" = "3" ] || fail "resume re-rendered finished segments (skipped $skipped of 3)"
python3 "$ROOT/src/film_qa.py" "$TMP/run" "$TMP/run/seg.mp4" --max-still 99 >/dev/null 2>&1 || fail "resumed film fails QA"
mkdir -p "$TMP/trap" && printf '{"duration": 3.0}' >"$TMP/trap/audio.json"
ffmpeg -y -v error -f lavfi -i "color=c=0x303030:s=1920x1080:r=60:d=3,noise=alls=24:allf=t" -f lavfi -i "sine=d=3" \
  -c:v libx264 -preset ultrafast -pix_fmt yuv420p -c:a aac -shortest "$TMP/trap/still.mp4" || fail "trap still"
ffmpeg -y -v error -f lavfi -i "testsrc2=s=1920x1080:r=60:d=1" -frames:v 1 "$TMP/trap/f.png" || fail "trap frame"
ffmpeg -y -v error -loop 1 -i "$TMP/trap/f.png" -f lavfi -i "sine=d=3" -t 3 \
  -vf "zoompan=z='1+0.0005*on':d=180:s=1920x1080:fps=60,noise=alls=10:allf=t" \
  -c:v libx264 -preset ultrafast -pix_fmt yuv420p -c:a aac -shortest "$TMP/trap/kenburns.mp4" || fail "trap kenburns"
for t in still kenburns; do
  python3 "$ROOT/src/film_qa.py" "$TMP/trap" "$TMP/trap/$t.mp4" >/dev/null 2>&1
  [ $? -eq 1 ] || fail "film_qa PASSED the $t trap (motion check is blind)"
done

[ "$RC" -eq 0 ] && printf 'PASS[film]: types, tests, zero-slop source, %s deterministic stills, motion calibrated\n' "$n"
exit "$RC"
