"""critic_gate — HARD. Judges the independent critic's verdict files of an authored song (docs/v3/DESIGN.md §3).

  python3 src/critic_gate.py app/src/songs/<slug> --plate <id>    # latest round for one plate must pass
  python3 src/critic_gate.py app/src/songs/<slug> --film          # latest whole-film round must pass
  python3 src/critic_gate.py app/src/songs/<slug> --final         # every plate in plan.json + the film
  python3 src/critic_gate.py --selfcheck

A verdict file is critique/round-NNN.json (numbered per song, ordered by number):
  {round, critic_id, scope: "plate:<id>"|"film", reference_frames: [paths], evidence: [paths],
   pairwise: {<dimension>: worse|par|better}, gate10: {<question>: {answer: yes|no, why}},
   defects: [{severity: high|medium|low, t, what, fix}], verdict: pass|revise}
Rules: every critic_id is new (no critic grades twice: v2 inflated 4 -> 8.5 with one critic over 9 rounds);
reference frames were supplied and exist; a "pass" is only accepted when no dimension is worse than the
reference, all ten quality questions are yes and there is no high-severity defect.
Exit 0 PASS, 1 FAIL, 2 usage.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIMS = ("concept", "lyric_integration", "composition", "motion", "typography", "finish", "variety", "transitions")
GATE10 = ("focal_point", "camera_intent", "musical_events", "metaphor_support", "typography",
          "motivated_transitions", "artifacts_free", "resolution", "authored", "narrative_purpose")


def problems(v, root=ROOT):
    """Why this verdict cannot count as a pass (empty = it passes)."""
    out = []
    if not str(v.get("critic_id", "")).strip():
        out.append("no critic_id")
    refs = v.get("reference_frames") or []
    if not refs:
        out.append("no reference frames: the critic must judge against the baseline")
    out += [f"reference frame missing: {r}" for r in refs if not (root / r).exists() and not Path(r).exists()]
    if not v.get("evidence"):
        out.append("no rendered evidence listed")
    pw = v.get("pairwise") or {}
    for d in DIMS:
        if pw.get(d) not in ("worse", "par", "better"):
            out.append(f"pairwise.{d} missing")
        elif pw[d] == "worse":
            out.append(f"worse than the reference on {d}")
    g = v.get("gate10") or {}
    for q in GATE10:
        a = (g.get(q) or {})
        if a.get("answer") not in ("yes", "no") or not str(a.get("why", "")).strip():
            out.append(f"gate10.{q} unanswered")
        elif a["answer"] == "no":
            out.append(f"gate10.{q} = no")
    for d in v.get("defects") or []:
        if d.get("severity") == "high":
            out.append(f"high defect @{d.get('t')}: {d.get('what', '')[:80]}")
    if v.get("verdict") != "pass":
        out.append(f"verdict is {v.get('verdict')!r}")
    return out


def load_rounds(song):
    rounds = []
    num = lambda f: int(re.sub(r"\D", "", f.stem) or 0)  # round-100 after round-99, not after round-10
    for f in sorted((song / "critique").glob("round-*.json"), key=num):
        try:
            rounds.append((f, json.loads(f.read_text())))
        except ValueError as e:
            rounds.append((f, {"_error": str(e)}))
    return rounds


def judge(song, scopes, root=ROOT):
    fails, seen = [], {}
    rounds = load_rounds(song)
    for f, v in rounds:
        if "_error" in v:
            fails.append(f"{f.name}: invalid JSON ({v['_error']})")
            continue
        cid = str(v.get("critic_id", ""))
        if cid in seen:
            fails.append(f"{f.name}: critic {cid!r} already graded {seen[cid]} (critics must be fresh each round)")
        seen.setdefault(cid, f.name)
    for scope in scopes:
        mine = [(f, v) for f, v in rounds if v.get("scope") == scope]
        if not mine:
            fails.append(f"{scope}: no critic round yet")
            continue
        f, v = mine[-1]
        fails += [f"{scope} ({f.name}): {p}" for p in problems(v, root)]
    return fails


def selfcheck():
    import tempfile
    with tempfile.TemporaryDirectory() as d:
        song = Path(d)
        (song / "critique").mkdir()
        ref = song / "ref.png"
        ref.write_bytes(b"png")
        good = {"critic_id": "c1", "scope": "plate:a", "reference_frames": [str(ref)], "evidence": ["x.png"],
                "pairwise": {k: "par" for k in DIMS}, "gate10": {q: {"answer": "yes", "why": "seen"} for q in GATE10},
                "defects": [{"severity": "low", "t": 1, "what": "w", "fix": "f"}], "verdict": "pass"}
        put = lambda n, v: (song / "critique" / f"round-{n:03d}.json").write_text(json.dumps(v))
        put(1, good)
        assert judge(song, ["plate:a"]) == [], judge(song, ["plate:a"])
        traps = {
            "lenient pass with a worse dimension": dict(good, critic_id="c2", pairwise={**good["pairwise"], "concept": "worse"}),
            "pass with a 'no'": dict(good, critic_id="c3", gate10={**good["gate10"], "authored": {"answer": "no", "why": "stock"}}),
            "pass with a high defect": dict(good, critic_id="c4", defects=[{"severity": "high", "t": 3, "what": "w", "fix": "f"}]),
            "no reference": dict(good, critic_id="c5", reference_frames=[]),
            "same critic twice": dict(good, critic_id="c1"),
            "revise verdict": dict(good, critic_id="c6", verdict="revise"),
        }
        for i, (name, v) in enumerate(traps.items(), start=2):
            put(i, v)
            assert judge(song, ["plate:a"]), f"trap not caught: {name}"
            (song / "critique" / f"round-{i:03d}.json").unlink()
        assert judge(song, ["film"]), "missing film round not caught"
    print(f"critic_gate selfcheck: valid verdict passes, {len(traps) + 1} trap verdicts fail")


def main():
    a = sys.argv[1:]
    if a == ["--selfcheck"]:
        selfcheck()
        return 0
    if len(a) < 2:
        print(__doc__)
        return 2
    song = Path(a[0])
    if a[1] == "--plate" and len(a) == 3:
        scopes = [f"plate:{a[2]}"]
    elif a[1] == "--film":
        scopes = ["film"]
    elif a[1] == "--final":
        plan = json.loads((song / "plan.json").read_text())
        scopes = [f"plate:{p['id']}" for p in plan["plates"]] + ["film"]
    else:
        print(__doc__)
        return 2
    fails = judge(song, scopes)
    for m in fails:
        print(f"FAIL[critic]: {m}")
    if not fails:
        print(f"PASS[critic]: {', '.join(scopes)}")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
