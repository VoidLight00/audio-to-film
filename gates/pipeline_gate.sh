#!/usr/bin/env bash
set -u
ROOT="${1:-$(pwd)}"
(cd "$ROOT" && python3 -m unittest discover -s tests -v) || exit 1
for f in src/analyze.py src/render.py src/create_video.py .claude/skills/audio-to-film/SKILL.md docs/ARCHITECTURE.md docs/STYLE_BIBLE.md; do
  [ -s "$ROOT/$f" ] || { printf 'missing %s\n' "$f"; exit 1; }
done
exit 0
