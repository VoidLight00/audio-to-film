# 01 — Song reading → `BRIEF.md`

Owner: Creative Director. Output: `app/src/songs/<slug>/BRIEF.md`. Read before: nothing. Read after: `02-treatment.md`.
Read the lyric meaning before scene design. Audio envelopes alone do not specify a song-specific treatment.

`PD` = `~/.cache/audio-to-film/pdoom-video`. Repo paths are relative to `~/projects/audio-to-film`.

## 0. Inputs

```sh
bun run create-film -- <song.mp3> --analysis-only        # ~6-10 min; prints outputs/<run>
```

| File | What you take from it |
|---|---|
| `outputs/<run>/lyrics.json` | lines that passed the confidence gate: these may be **displayed**. `gate` = stats (lines_in / lines_kept / thresholds) |
| `outputs/<run>/work/whisper.json` | every ASR segment and word with times, incl. lines the gate **dropped** and hallucinations in instrumentals |
| `outputs/<run>/audio.json` | `bpm`, `beats`, `downbeats`, `sections[{name, kind, start, end, energy, vocal}]`, `instrumental`, `tail_end`, `f0`, `features` |
| `outputs/<run>/lyrics.txt` | only if the user supplied lyrics (then trust its spelling over ASR) |

Section `kind`/`name` from analysis are heuristic (the test song's `intro0` holds 8 sung lines). Relabel sections musically in the brief
(verse / pre / chorus / bridge / break / instrumental / outro) but keep the analysis `name` beside it: `edit.section(name)` and `plan_gate` A2 use it.

## 1. Account for every sung line

Run both snippets from the repo root and paste their output into the brief.

```sh
RUN=outputs/<run>
python3 - "$RUN" <<'EOF'
import json, sys
r = sys.argv[1]; A = json.load(open(f"{r}/audio.json")); L = json.load(open(f"{r}/lyrics.json"))["lines"]
bar = 240 / A["bpm"]
print(f"bpm {A['bpm']:.2f}  bar {bar:.3f}s  first downbeat {A['downbeats'][0]:.3f}  duration {A['duration']:.2f}  tail_end {A.get('tail_end', 0):.2f}")
for s in A["sections"]:
    n = sum(1 for l in L if s["start"] <= l["start"] < s["end"])
    print(f"{s['name']:14s} {s['start']:7.2f}-{s['end']:7.2f} {(s['end'] - s['start']) / bar:5.1f} bars  energy {s.get('energy', 0):.2f}  vocal {s.get('vocal', 0):.2f}  shown lines {n}")
EOF
python3 - "$RUN" <<'EOF'
import json, sys        # sung words that no shown line covers: runs of >= 3 words
r = sys.argv[1]
W = json.load(open(f"{r}/work/whisper.json"))["segments"]; L = json.load(open(f"{r}/lyrics.json"))["lines"]
A = json.load(open(f"{r}/audio.json")); voc, fps, inst = A["features"]["vocal"], A["fps"], A.get("instrumental", [])
shown = lambda t: any(l["start"] - 0.2 <= t <= l["end"] + 0.2 for l in L)
runs = []
for w in (w for s in W for w in s.get("words", [])):
    if shown((w["start"] + w["end"]) / 2): continue
    if runs and w["start"] - runs[-1][-1]["end"] < 0.6: runs[-1].append(w)
    else: runs.append([w])
for g in (g for g in runs if len(g) >= 3):
    a, b = g[0]["start"], g[-1]["end"]; v = voc[int(a * fps):int(b * fps) + 1]; vm = sum(v) / max(1, len(v))
    ghost = vm < 0.2 or any(x <= a and b <= y for x, y in inst)
    print(f"{a:7.2f}-{b:7.2f} vocal {vm:.2f} {'HALLUCINATION?' if ghost else 'DROPPED':14s}" + "".join(w["word"] for w in g))
EOF
```

Calibrated on the test run: it finds the three real dropped lines (38.0–46.7 s ×2, 120.4–123.4 s) and flags "Thank you." (80.9 s, vocal 0.01) and
"I don't know where to say it." (141.6 s, vocal 0.10) as hallucinations. Restore a dropped line's full text from its whisper segment
(the run can miss a first word whose timing overlaps a shown line).

| Class | Display? | Use |
|---|---|---|
| shown (in `lyrics.json`) | yes, every one, legible, word-synced | goes in a plate's `lines[]` (coverage gate) |
| dropped (real vocal, failed gate) | **never as text** | interpret it in the image of the plate that covers its time; not in `lines[]` (plan_gate rejects gated lines) |
| hallucination (vocal < 0.2 or inside an instrumental span) | never | ignore; note it so nobody resurrects it |

Never invent or "fix" lyric words the gate dropped, never claim them as shown (`.claude/skills/audio-to-film/SKILL.md`).
A dropped line still needs a visual answer (REF §5 #11).

## 2. Per-line analysis (one table row per sung line, shown and dropped)

| Column | Ask | pdoom example: "Sharp left turn and there you are" |
|---|---|---|
| t | first-word start, last-word end, section | 81.80–83.9, verse3 |
| literal | what the words say if read like a manual | a vehicle turns left; someone is found |
| jargon / idiom | domain terms, set phrases, citations, slang | AI-safety term *sharp left turn* (capabilities generalise, alignment does not) |
| double meanings | second reading, homonym, pun, irony | "there you are" = arrival + discovery of who was steering |
| concrete nouns / verbs | the objects and actions you can draw | turn, road, you |
| register | emotional temperature + voice (deadpan, pleading, prophetic, machine) | dread delivered deadpan |
| candidate subject | one concrete thing the line could *become* | an engineering roadmap where the route literally turns left (`PD/app/src/scenes/leftturn-map.ts:14-32`) |

Rules:
- Read the jargon literally first: pdoom's best plates are jargon taken at its word (loss curve as the subject of "sudden drop", `loss.ts:2-8`;
  "safety fence" = the video's own title-safe frame, `dense-press.ts:1-6`). If a song has no jargon, use the physical meaning of its verbs/nouns
  and genre conventions (love song → letters, maps, contracts) (catalog §8).
- Mark held words (> 1 s) and melismas: they need multi-event treatment later (catalog B5). Mark syllable-rich words (`w.syl` present?) for per-syllable hits.
- Mark lines repeated verbatim (hooks): they become one template module with escalating params (`02-treatment.md` §6).
- Preserve the song's stance. For a warning song: speculative, darkly ironic, evidence-aware questions; never assert that a real company
  or person intends harm (N6). Never put real logos, product UIs or recognisable faces on screen (catalog C2).

## 3. Whole-song extraction

Write each as a short table or list with times.

1. **Central metaphor axes** — the 1–2 worlds the lyric keeps returning to (test song: a car floored at night × a company that ships anyway).
   Every plate should sit on at least one axis.
2. **Recurring keywords** — non-stopword tokens with counts and first/last times. Repetition is where the edit can rhyme.
3. **Increasing quantity → counter candidate** — a number, speed, risk, time, distance, count that grows across the song (pdoom: P(doom)
   0.02 → 0.15 → 0.42 → 0.81 → 0.99 → ∞ → NaN, `PD/app/src/engine/hud.ts:13-71`). None in the lyric? Define one narrative state variable
   the world can display (catalog §8). It must be monotonic (gate C4).
4. **Running motif object** — an object that links line 1 to a late line, can play a different role in every plate and can be *revealed* in the
   last third (pdoom: the spark of line 1 turns out to be a fuse, `fuse.ts:2`; catalog §6e-1). List 2 candidates with the two lines they bind.
5. **Section emotion curve** — per section: name, bars, energy, vocal, one emotion word, density target (`03-edit-and-anchors.md` §5),
   and where the song is quietest / loudest. The quietest moment usually carries the key question; the peak carries the hero.
6. **Hook** — the most repeated or title line: where it first appears, how often, and what must escalate each time.
7. **Instrumental stretches** — spans without vocal (`audio.json instrumental`): they need beat-choreographed content, not visualiser filler
   (v2's instrumental plate read as "visualiser-like", `FAILURE_LOG.md` F11).

## 4. Choose the concept device (3 candidates, then one)

The device frames the whole song as one document genre or world that can host every plate. pdoom: "plates from an illustrated treatise on
the end of the world", each set piece with its own instrument, idiom and dry humour (`PD/docs/TREATMENT.md:3-5`).

Score each candidate 0/1/2 per row; pick the highest; record the runner-up (it is the fallback when a plate fails 6 critic rounds, `09-critique.md`).

| Criterion | Why it matters | Gate / metric it feeds |
|---|---|---|
| hosts ≥ 12 distinct sub-idioms (one per plate) inside one world | variety without incoherence | A3, REF §5 #7 |
| gives each line a literal/pun/mechanism transform, not illustration | concept quality | C1 (literal ≤ 20 %) |
| has native slots for the counter and the motif | through-line | C3, C4 |
| carries native in-scene text (labels, forms, legends, footnotes, logs) | detail + dry humour | M7 (≥ 50 % unsung frames), C5 |
| supports light/dark rhythm (paper plates) | contrast | M4 (≥ 8 % bright frames) |
| matches the song's register (irony, dread, tenderness) | narrative purpose | gate10 `narrative_purpose` |
| avoids the ban list and pdoom's own device | originality | N5, C2 |

Not allowed as the device: pdoom's treatise-plates framing, a "glowing physics simulation on black" (v2's single idiom, G2), a literal
storyboard of the lyric's story.

## 5. `BRIEF.md` skeleton

```md
# <Title> — song reading (BRIEF)
Run: outputs/<run> (<duration> s, <bpm> BPM, bar = <s>, first downbeat <s>). Lyrics: <source>, <kept>/<in> lines shown.
## 1. Energy and sections      (snippet 1 output + musical relabel + emotion word + density target)
## 2. Every sung line          (shown / dropped / hallucination table, snippet 2 output)
## 3. Line analysis            (one row per sung line, columns of §2)
## 4. Whole-song extraction    (axes, keywords, counter, motif candidates, emotion curve, hook, instrumentals)
## 5. Concept device           (3 candidates scored, chosen one with reasons, runner-up)
## 6. Constraints              (stance, things never to show, open questions decided by default)
```

## 6. Exit checklist

- [ ] every whisper run is classified; dropped lines are listed with times and marked "interpret, never display"
- [ ] every shown line has a full analysis row (no blank jargon/double-meaning cells: write "none" after checking)
- [ ] counter candidate is monotonic; motif candidate binds line 1 to a late line and can be revealed in the last third
- [ ] 3 devices scored on all rows; the choice and the runner-up are written with reasons
- [ ] no decision is left as a question to the user: pick the best default and note it (N9, N23)
