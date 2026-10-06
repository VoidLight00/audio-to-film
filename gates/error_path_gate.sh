#!/usr/bin/env bash
set -u
ROOT="${1:-$(pwd)}"
result="$(cd "$ROOT" && python3 src/create_video.py /nonexistent/audio.wav 2>&1)"; rc=$?
[ "$rc" -ne 0 ] || { printf 'invalid input unexpectedly succeeded\n'; exit 1; }
case "$result" in *'nonempty, readable audio file'*) exit 0 ;; *) printf 'unexpected failure output\n'; exit 1 ;; esac
