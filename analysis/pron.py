"""Display token -> pronunciation sub-words of plain letters [a-z'] for CTC alignment.

Generalised from mexicat/pdoom-video analysis/pron.py (MIT), whose table was hand-written for one
song. Here the rules are automatic:
  * acronyms (2-6 capitals, optional digits) are spelled letter by letter: GPU -> gee pee you
  * Hangul is decomposed into jamo (Unicode arithmetic) and romanised per syllable with the Revised
    Romanization table, one sub-word per syllable, so CTC times every syllable separately
  * digits are read as English number words; other scripts go through uroman
Each sub-word is one timed unit (refine.py snaps each unit's start separately).
"""
import re
import unicodedata

LETTER = dict(zip("ABCDEFGHIJKLMNOPQRSTUVWXYZ", (
    "ay bee see dee ee ef gee aitch eye jay kay el em en oh pee cue ar ess tee you vee "
    "doubleyou ex why zee").split()))
DIGIT = "zero one two three four five six seven eight nine".split()

# Revised Romanization of Korean, by jamo index (initial 19, medial 21, final 28)
_INI = ["g", "kk", "n", "d", "tt", "r", "m", "b", "pp", "s", "ss", "", "j", "jj", "ch", "k", "t", "p", "h"]
_MED = ["a", "ae", "ya", "yae", "eo", "e", "yeo", "ye", "o", "wa", "wae", "oe", "yo", "u", "wo", "we", "wi",
        "yu", "eu", "ui", "i"]
_FIN = ["", "k", "k", "k", "n", "n", "n", "t", "l", "k", "m", "l", "l", "l", "p", "l", "m", "p", "p", "t", "t",
        "ng", "t", "t", "k", "t", "p", "t"]
HANGUL0, HANGUL1 = 0xAC00, 0xD7A3


def jamo(ch: str) -> tuple[int, int, int] | None:
    """(initial, medial, final) jamo indices of a precomposed Hangul syllable, else None."""
    c = ord(ch)
    if not HANGUL0 <= c <= HANGUL1:
        return None
    k = c - HANGUL0
    return k // 588, (k % 588) // 28, k % 28


def hangul_syllable(ch: str) -> str:
    i, m, f = jamo(ch)  # type: ignore[misc]
    return _INI[i] + _MED[m] + _FIN[f]


def _uroman(text: str) -> str:
    import uroman  # lazy: only non-Latin, non-Hangul scripts need it
    global _UR
    try:
        _UR
    except NameError:
        _UR = uroman.Uroman()
    return _UR.romanize_string(text)


def _letters(s: str) -> str:
    s = unicodedata.normalize("NFKD", s.lower())
    return re.sub(r"[^a-z']", "", s).strip("'")


def pron(token: str) -> list[str]:
    """Sub-words (each non-empty, letters/apostrophes only) for one display token."""
    t = token.strip()
    core = re.sub(r"^[^\w]+|[^\w]+$", "", t)
    if any(jamo(c) for c in core):
        subs = [hangul_syllable(c) if jamo(c) else _letters(c) for c in core]
        return [s for s in subs if s] or ["a"]
    if re.fullmatch(r"[A-Z][A-Z0-9]{1,5}", core):
        return [LETTER[c] if c.isalpha() else DIGIT[int(c)] for c in core]
    if core.isdigit():
        return [DIGIT[int(c)] for c in core]
    parts = [p for p in re.split(r"[-–—/]+", core) if p]
    out = []
    for p in parts:
        w = _letters(p)
        if not w and p:
            w = _letters(_uroman(p))
        if w:
            out.append(w)
    return out or ["a"]


def _demo():
    assert pron("GPU") == ["gee", "pee", "you"]
    assert pron("AGI,") == ["ay", "gee", "eye"]
    assert pron("don't") == ["don't"]
    assert pron("pre-training") == ["pre", "training"]
    assert jamo("한") == (18, 0, 4)
    assert pron("사랑해") == ["sa", "rang", "hae"]  # one sub-word per syllable
    assert pron("닭") == ["dak"]
    assert all(re.fullmatch(r"[a-z']+", s) for tok in ("Hello!", "10", "꽃잎", "RLHF") for s in pron(tok))
    print("pron ok")


if __name__ == "__main__":
    _demo()
