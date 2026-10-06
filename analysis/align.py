"""Word-level lyric alignment -> <run>/lyrics.json (only words that pass the confidence gate).

Pipeline (after mexicat/pdoom-video analysis/align.py, MIT, minus its hand-made FIX/ANCHORS):
  1. lyric text: <run>/lyrics.txt when the user gave one (ground truth), else Whisper segments
     (hallucination-filtered). Whisper word times are kept as an independent cross-check.
  2. CTC emissions of the Demucs vocal stem and the karaoke lead stem: MMS_FA always,
     wav2vec2 LV60K too for Latin-script lyrics; probability mixture of all of them.
  3. one global constrained Viterbi pass (ctcalign.py) with a garbage star token between lines;
     Whisper-sourced lines are confined to their segment +-1 s.
  4. signal-based refinement of every sub-word start (refine.py: rest-onset, onset-snap,
     fricative 4-10.5 kHz onset) and ends on a 15 dB drop.
  5. confidence gate: a word is shown only when its CTC path probability and its agreement with
     Whisper say it was really sung there; a line is shown only when >= 70 % of its words pass.
     Nothing is invented: a dropped line simply leaves that stretch to the pure audio-reactive mode.
Run:  ATF_RUN=<run dir> uv run python align.py
"""
import json
import re
from difflib import SequenceMatcher

import numpy as np

import common
import ctc_emissions
import ctcalign
import vocal_feats
import whisper_run
from pron import jamo, pron
from refine import load_feats, refine

WORD_CONF = 0.25        # min CTC path probability of a word
WORD_CONF_ALONE = 0.5   # ... when Whisper does not confirm its start within AGREE_S
AGREE_S = 0.35
LINE_PASS = 0.7


def norm(w):
    return re.sub(r"[^\w']", "", w.lower())


def whisper_lines(wh):
    """Whisper segments that look like singing, not hallucination, as (start, end, text)."""
    out = []
    for s in wh["segments"]:
        if s.get("compression_ratio", 0) > 2.4 or s.get("avg_logprob", 0) < -1.0 or not s["text"].strip():
            continue
        out.append((s["start"], s["end"], s["text"].strip()))
    return out


def whisper_words(wh):
    return [(w["word"].strip(), w["start"], w["end"], w.get("probability", 1.0))
            for s in wh["segments"] for w in s.get("words", [])]


def map_whisper(words, ww):
    """Fuzzy sequence alignment of Whisper words to lyric tokens -> whisper (start, prob) per token."""
    a = [norm(w["w"]) for w in words]
    b = [norm(x[0]) for x in ww]
    for blk in SequenceMatcher(None, a, b, autojunk=False).get_matching_blocks():
        for k in range(blk.size):
            w, x = words[blk.a + k], ww[blk.b + k]
            w["whisper"] = (round(x[1], 3), round(float(x[3]), 3))
    return words


MAX_WORDS = 11


def split_long(lines):
    """Whisper sometimes merges two sung lines; split any line over MAX_WORDS at its widest word gap."""
    out = []
    for ln in lines:
        ws = ln["words"]
        if len(ws) <= MAX_WORDS:
            out.append(ln)
            continue
        lo, hi = len(ws) // 3, len(ws) - len(ws) // 3
        k = max(range(lo, hi), key=lambda i: ws[i]["start"] - ws[i - 1]["end"])
        for part in (ws[:k], ws[k:]):
            out.extend(split_long([dict(text=" ".join(w["w"] for w in part), start=part[0]["start"], end=part[-1]["end"], words=part)]))
    return out


def fix_title(text, title_words):
    """Correct a near-miss transcription of the song title inside a line (Flore it, then pray -> Floor it,
    then pray). Whisper's initial prompt only reaches its first 30 s window when it does not condition
    on previous text, so a chorus that sings the title later is fixed here instead."""
    toks, n = text.split(), len(title_words)
    if n < 2:
        return text, 0
    tn, fixed = [norm(w) for w in title_words], 0
    for i in range(len(toks) - n + 1):
        cand = [norm(w) for w in toks[i:i + n]]
        if cand != tn and SequenceMatcher(None, " ".join(cand), " ".join(tn)).ratio() >= 0.8:
            for j in range(n):
                if cand[j] != tn[j]:
                    w = title_words[j] if toks[i + j][:1].isupper() else title_words[j].lower()
                    toks[i + j] = re.sub(r"[\w']+", w, toks[i + j], count=1)
                    fixed += 1
    return " ".join(toks), fixed


def gate(words):
    for w in words:
        wh = w.get("whisper")
        agree = wh is not None and abs(wh[0] - w["start"]) <= AGREE_S
        w["pass"] = bool(w["conf"] >= WORD_CONF and (agree or w["conf"] >= WORD_CONF_ALONE))
    return words


def main():
    if not (common.WORK / "vocal_feats.npz").exists():
        vocal_feats.compute()
    wh = whisper_run.run()
    lang = wh.get("language") or "en"
    if common.LYRICS_TXT.exists():
        texts = [l.strip() for l in common.LYRICS_TXT.read_text(encoding="utf-8").splitlines() if l.strip()]
        windows, source, title_fixes = None, "user", 0
    else:
        wl = whisper_lines(wh)
        tp = whisper_run.title_prompt()
        title = tp.rstrip(".").split() if tp else []
        fixed = [fix_title(t, title) for _, _, t in wl]
        texts = [t for t, _ in fixed]
        title_fixes = sum(k for _, k in fixed)
        windows = {i: (s - 1.0, e + 1.0) for i, (s, e, _) in enumerate(wl)}
        source = "asr"
    tokens = [t.split() for t in texts]
    if not tokens:
        (common.RUN / "lyrics.json").write_text(json.dumps(dict(lines=[], language=lang, source=source, gate={})))
        print("lyrics.json: no lyric lines (instrumental or nothing transcribed)")
        return

    latin = not any(jamo(c) or ord(c) > 0x2FF for t in texts for c in t)
    models = ["mms", "lv60k"] if latin else ["mms"]
    for m in models:
        for src in ("vocals", "lead"):
            tag = m if src == "vocals" else f"{m}_{src}"
            if not (common.WORK / f"emission_{tag}.npy").exists():
                ctc_emissions.compute(m, source=src)
    E = ctcalign.emissions("fused4" if latin else "mms_both")
    spans, score, _, _ = ctcalign.align(E, tokens, line_windows=windows)
    words = refine(ctcalign.word_table(spans, tokens), load_feats())
    words = gate(map_whisper(words, whisper_words(wh)))

    lines, kept = [], 0
    for li, text in enumerate(texts):
        ws = [w for w in words if w["li"] == li]
        share = sum(w["pass"] for w in ws) / max(1, len(ws))
        if share < LINE_PASS:
            continue
        kept += 1
        lines.append(dict(text=text, start=round(ws[0]["start"], 3), end=round(ws[-1]["end"], 3), words=[
            dict(w=w["w"], start=round(w["start"], 3), end=round(w["end"], 3), conf=round(w["conf"], 3),
                 **({"syl": [[round(a, 3), round(b, 3)] for a, b in w["subs"]]} if len(w["subs"]) > 1 else {}))
            for w in ws]))
    lines = split_long(lines)
    confs = np.array([w["conf"] for w in words])
    stats = dict(lines_in=len(texts), lines_kept=kept, lines_shown=len(lines), words_in=len(words),
                 words_passing=int(sum(w["pass"] for w in words)),
                 conf_p10=round(float(np.percentile(confs, 10)), 3), conf_p50=round(float(np.median(confs)), 3),
                 thresholds=dict(word=WORD_CONF, alone=WORD_CONF_ALONE, agree_s=AGREE_S, line=LINE_PASS),
                 viterbi_score=round(score, 1), models=models, title_fixes=title_fixes)
    (common.RUN / "lyrics.json").write_text(json.dumps(dict(lines=lines, language=lang, source=source, gate=stats),
                                                       ensure_ascii=False, indent=1))
    (common.WORK / "words_all.json").write_text(json.dumps(words, ensure_ascii=False, default=float, indent=1))
    print(f"lyrics.json: {kept}/{len(texts)} lines kept ({source}, {lang}), "
          f"{stats['words_passing']}/{len(words)} words pass, conf p50 {stats['conf_p50']}")


def selfcheck():
    """The gate never shows a word the voice does not confirm (run by gates/film_gate.sh)."""
    ws = [dict(conf=0.9, start=1.0, whisper=(1.1, 0.9)),   # strong and confirmed -> shown
          dict(conf=0.6, start=2.0),                        # strong alone -> shown
          dict(conf=0.3, start=3.0, whisper=(3.9, 0.9)),    # weak, Whisper disagrees -> hidden
          dict(conf=0.3, start=4.0, whisper=(4.1, 0.9)),    # weak but confirmed -> shown
          dict(conf=0.1, start=5.0, whisper=(5.0, 0.9))]    # below the floor -> hidden
    assert [w["pass"] for w in gate(ws)] == [True, True, False, True, False]
    long = [dict(text="x", start=0, end=9, words=[dict(w=str(i), start=i + (0.8 if i == 6 else 0), end=i + 0.5) for i in range(14)])]
    assert [len(l["words"]) for l in split_long(long)] == [6, 8]
    assert fix_title("Flore it, then pray.", ["Floor", "It", "Then", "Pray"]) == ("Floor it, then pray.", 1)
    assert fix_title("It's the only way.", ["Floor", "It", "Then", "Pray"])[1] == 0
    print("align gate ok")


if __name__ == "__main__":
    import sys
    selfcheck() if "--selfcheck" in sys.argv else main()
