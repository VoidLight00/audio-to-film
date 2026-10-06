"""plan_gate — HARD, deterministic. Checks an authored song's plan.json against the resolved edit.

  python3 src/plan_gate.py app/src/songs/<slug> outputs/<run>      # needs <run>/timeline.json (render.ts timeline)
  python3 src/plan_gate.py --selfcheck                              # a valid plan passes, each trap plan fails

Criteria (docs/research/PDOOM_CRAFT_CATALOG.md §7, docs/v3/NEEDS.md):
  coverage  every shown lyric line belongs to exactly one plate
  A1        plate boundaries sit on the beat grid; a plate that opens on a line cuts at the beat at/before its first word
  A2        plates are 0.5..9 bars (the last plate may hold the tail), lengths vary, long lyric sections get >= 2 plates
  A3        neighbouring plates never share an idiom; distinct modules have distinct idioms (>= 90 %)
  B3        every line names an integration method; no method repeats across modules; subtitle-like <= 5 %
  C1        every plate records idea -> subject -> transform; literal illustration <= 20 % of plates
  C3        the running motif appears in >= 70 % of plates and is revealed/transformed in the last third
  C4        a declared counter appears in >= 70 % of plates and never decreases
  D6        <= 10 % of events are anchored on audio-feature thresholds; every sung plate has >= 1 event per bar
  E1        boundaries agree on hand-off type; >= 60 % are match cuts, the rest declared bridge/contrast
  N5        the song's palette is its own (not pdoom-video's palette)
  N10       at least one hero plate, with narrative purpose, metaphor, technique+why, camera, audio cues, cost, evidence
Exit 0 PASS, 1 FAIL (FAIL[plan:<id>] lines), 2 usage error.
"""
import json
import re
import sys
from pathlib import Path

TRANSFORMS = {"literal", "jargon-literal", "pun", "mechanism", "metaphor"}
HANDOFFS = {"match", "bridge", "contrast", "open", "end"}
SUBTITLE = {"subtitle", "overlay", "caption"}
HERO_FIELDS = ("purpose", "metaphor", "technique", "why", "camera", "audio_cues", "cost", "evidence")
PDOOM_HEX = {"#0a0a0b", "#151517", "#5e5b57", "#9c978f", "#eee9df", "#ff4d12", "#ff8a3d", "#c21d0b", "#d8ff3c"}
FRAME = 1 / 60
CUT_TOL = 0.06  # a singer may land up to ~50 ms ahead of the beat the cut snaps to (pdoom timeline.ts tol)
MIN_BARS = 0.5  # two beats: a one-gag punctuation plate (a 1.3 s line); shorter is a flash, not a plate


def norm(s):
    # letters and digits of any script: Hangul lyrics must not normalise to an empty string
    return re.sub(r"[\W_]", "", s.lower())


def beat_at(beats, t):
    if t <= beats[0]:
        return (t - beats[0]) / (beats[1] - beats[0])
    if t >= beats[-1]:
        return len(beats) - 1 + (t - beats[-1]) / (beats[-1] - beats[-2])
    lo, hi = 0, len(beats) - 1
    while hi - lo > 1:
        m = (lo + hi) // 2
        lo, hi = (m, hi) if beats[m] <= t else (lo, m)
    return lo + (t - beats[lo]) / (beats[hi] - beats[lo])


def time_of_beat(beats, i):
    n = len(beats)
    period = (beats[-1] - beats[0]) / (n - 1)
    if i <= 0:
        return beats[0] + i * period
    if i >= n - 1:
        return beats[-1] + (i - (n - 1)) * period
    k = int(i // 1)
    return beats[k] + (beats[k + 1] - beats[k]) * (i - k)


def check(plan, timeline, lyrics, audio):
    """Return a list of (criterion, message). Empty list = PASS."""
    fails = []
    F = lambda c, m: fails.append((c, m))
    plates = plan.get("plates") or []
    if not plates:
        return [("schema", "plan.json has no plates")]
    beats, downs = audio["beats"], audio["downbeats"]
    bar = (downs[-1] - downs[0]) / max(1, len(downs) - 1)
    entries = timeline.get("entries") or []
    ids = [p.get("id") for p in plates]
    if [e["id"] for e in entries] != ids:
        F("schema", f"timeline ids {[e['id'] for e in entries]} != plan ids {ids}")
        return fails
    win = {e["id"]: (e["start"], e["end"]) for e in entries}

    # contiguity: the edit tiles the song
    if abs(entries[0]["start"]) > 1e-6:
        F("A1", f"first plate starts at {entries[0]['start']:.3f}, not 0")
    for a, b in zip(entries, entries[1:]):
        if abs(a["end"] - b["start"]) > 1e-6:
            F("A1", f"gap/overlap between {a['id']} and {b['id']}")
    if abs(entries[-1]["end"] - timeline["duration"]) > 1e-3:
        F("A1", f"last plate ends {entries[-1]['end']:.3f}, song is {timeline['duration']:.3f}")

    # coverage: each sung occurrence (a repeated hook is several occurrences) belongs to exactly one plate,
    # the plate whose window holds its first word and which lists that text
    shown = [l for l in lyrics.get("lines", []) if l.get("words")]
    claimed = {(p["id"], norm(ln)) for p in plates for ln in p.get("lines", [])}
    used = set()
    for l in shown:
        w0, k = l["words"][0]["start"], norm(l["text"])
        o = [pid for pid, (s, e) in win.items() if s - CUT_TOL <= w0 < e - CUT_TOL and (pid, k) in claimed]
        if len(o) != 1:
            F("coverage", f"line {l['text']!r} @{w0:.2f} is claimed by {len(o)} plates whose window holds it {o}")
        used.update((pid, k) for pid in o)
    for pid, k in sorted(claimed - used):
        F("coverage", f"plate {pid} lists a line that is not sung inside its window (gated, misspelt or misplaced): {k[:40]}")

    # A1 boundaries on the grid, lyric-first cuts
    for e in entries[1:]:
        t = e["start"]
        nb = time_of_beat(beats, round(beat_at(beats, t)))
        if abs(t - nb) > FRAME:
            F("A1", f"{e['id']} starts at {t:.3f}, {abs(t - nb) * 1000:.0f} ms off the beat grid")
        p = plates[ids.index(e["id"])]
        if p.get("lines"):
            # the occurrence of the plate's first line that is sung inside this plate (hooks repeat)
            occ = [l["words"][0]["start"] for l in shown if norm(l["text"]) == norm(p["lines"][0]) and l["words"][0]["start"] < e["end"]]
            w0 = min(occ, key=lambda x: abs(x - t)) if occ else None
            if w0 is not None:
                want = time_of_beat(beats, (beat_at(beats, w0 + 0.02) + 1e-6) // 1)
                if abs(t - want) > FRAME and t > w0:
                    F("A1", f"{e['id']} cuts at {t:.3f}, after its first word ({w0:.3f})")

    # A2 granularity
    lens = [(e["end"] - e["start"]) / bar for e in entries]
    for e, L in zip(entries[:-1], lens[:-1]):
        if not MIN_BARS - 0.05 <= L <= 9 + 0.05:
            F("A2", f"{e['id']} is {L:.2f} bars ({MIN_BARS}..9)")
    if len(lens) > 2 and max(lens[:-1]) - min(lens[:-1]) < 0.5:
        F("A2", "plate lengths are (nearly) uniform: a fixed-length grid, not an edit")
    for s in audio.get("sections", []):
        sung = [l for l in shown if s["start"] <= l["start"] < s["end"]]
        if len(sung) >= 3 and (s["end"] - s["start"]) / bar >= 6:
            n = sum(1 for e in entries if e["start"] < s["end"] and e["end"] > s["start"])
            if n < 2:
                F("A2", f"section {s.get('name')} ({len(sung)} lines) is one plate")

    # A3 idioms
    idiom = [norm(p.get("idiom", "")) for p in plates]
    for i, p in enumerate(plates):
        if not idiom[i]:
            F("A3", f"{p['id']} has no idiom")
    for a, b, ia, ib in zip(plates, plates[1:], idiom, idiom[1:]):
        if ia and ia == ib:
            F("A3", f"{a['id']} and {b['id']} share the idiom {a.get('idiom')!r}")
    by_mod = {}
    for p, i in zip(plates, idiom):
        by_mod.setdefault(p.get("module"), i)
    if len(by_mod) and len(set(by_mod.values())) / len(by_mod) < 0.9:
        F("A3", f"{len(set(by_mod.values()))} distinct idioms over {len(by_mod)} modules (< 90 %)")

    # B3 integration
    methods, n_lines, n_sub = {}, 0, 0
    for p in plates:
        integ = {norm(x.get("line", "")): norm(x.get("method", "")) for x in p.get("integration", [])}
        for ln in p.get("lines", []):
            n_lines += 1
            m = integ.get(norm(ln), "")
            if not m:
                F("B3", f"{p['id']}: no integration method for {ln!r}")
                continue
            if m in SUBTITLE:
                n_sub += 1
            methods.setdefault(m, set()).add(p.get("module"))
    for m, mods in methods.items():
        if len(mods) > 1 and m not in SUBTITLE:
            F("B3", f"integration method {m!r} reused by modules {sorted(mods)}")
    if n_lines and n_sub / n_lines > 0.05:
        F("B3", f"{n_sub}/{n_lines} lines are subtitle-like (> 5 %)")

    # C1 concept
    lit = 0
    for p in plates:
        c = p.get("concept") or {}
        if not (c.get("idea") and c.get("subject") and c.get("transform") in TRANSFORMS):
            F("C1", f"{p['id']}: concept needs idea, subject, transform in {sorted(TRANSFORMS)}")
        lit += c.get("transform") == "literal"
    if lit / len(plates) > 0.2:
        F("C1", f"{lit}/{len(plates)} plates are literal illustrations (> 20 %)")

    # C3 motif
    motif = plan.get("motif") or {}
    roles = [bool(p.get("motif_role")) for p in plates]
    if not motif.get("name"):
        F("C3", "no running motif declared")
    elif sum(roles) / len(plates) < 0.7:
        F("C3", f"motif in {sum(roles)}/{len(plates)} plates (< 70 %)")
    rv = motif.get("reveal_plate")
    if motif.get("name") and (rv not in ids or ids.index(rv) < len(ids) * 2 / 3 - 1):
        F("C3", f"motif reveal plate {rv!r} is not in the last third")

    # C4 counter
    counter = plan.get("counter")
    if counter:
        cams = [p.get("counter_cameo") for p in plates]
        if sum(1 for c in cams if c) / len(plates) < 0.7:
            F("C4", f"counter in {sum(1 for c in cams if c)}/{len(plates)} plates (< 70 %)")
        vals = [c["value"] for c in cams if isinstance(c, dict) and isinstance(c.get("value"), (int, float))]
        if any(b < a for a, b in zip(vals, vals[1:])):
            F("C4", f"counter decreases: {vals}")

    # D6 anchors and density
    ev_all, ev_audio = 0, 0
    for p in plates:
        evs = p.get("events", [])
        for ev in evs:
            a = str(ev.get("anchor", ""))
            ev_all += 1
            ev_audio += a.startswith("audio:")
            if not re.match(r"^(word|syl|line|beat|downbeat|section|audio|plate):", a):
                F("D6", f"{p['id']}: event anchor {a!r} is not a named anchor")
        s, e = win[p["id"]]
        if p.get("lines") and p.get("intent") != "rest" and len(evs) < (e - s) / bar - 0.5:
            F("D6", f"{p['id']}: {len(evs)} events over {(e - s) / bar:.1f} bars (< 1 per bar)")
    if ev_all and ev_audio / ev_all > 0.1:
        F("D6", f"{ev_audio}/{ev_all} events are audio-threshold triggered (> 10 %)")

    # E1 hand-offs
    match = 0
    for a, b in zip(plates, plates[1:]):
        o, i = (a.get("handoff") or {}).get("out") or {}, (b.get("handoff") or {}).get("in") or {}
        if o.get("type") not in HANDOFFS or i.get("type") not in HANDOFFS:
            F("E1", f"{a['id']} -> {b['id']}: hand-off type missing")
        elif o.get("type") != i.get("type"):
            F("E1", f"{a['id']} -> {b['id']}: out {o.get('type')} != in {i.get('type')}")
        elif o.get("type") == "match":
            match += 1
            if not (o.get("geometry") and i.get("geometry")):
                F("E1", f"{a['id']} -> {b['id']}: match cut without a geometry contract")
    if len(plates) > 1 and match / (len(plates) - 1) < 0.6:
        F("E1", f"{match}/{len(plates) - 1} boundaries are match cuts (< 60 %)")

    # N5 palette is the song's own
    pal = {str(v).lower() for v in ((plan.get("style") or {}).get("palette") or {}).values()}
    if not pal:
        F("N5", "style.palette missing")
    elif pal <= PDOOM_HEX:
        F("N5", "style.palette is pdoom-video's palette")

    # N10 hero plates
    heroes = [p for p in plates if p.get("hero")]
    if not heroes:
        F("N10", "no hero plate")
    for p in heroes:
        miss = [k for k in HERO_FIELDS if not str((p["hero"] or {}).get(k, "")).strip()]
        if miss:
            F("N10", f"hero {p['id']} lacks {miss}")
    return fails


def selfcheck():
    beats = [i * 0.5 for i in range(400)]
    audio = {"beats": beats, "downbeats": beats[::4], "sections": [{"name": "v", "start": 0, "end": 200}]}
    words = lambda t, s: [{"w": x, "start": t + k * 0.4, "end": t + k * 0.4 + 0.3} for k, x in enumerate(s.split())]
    L = [("Coffee is hot", 4.1), ("Emails pile up", 8.1), ("Floor it then pray", 20.1)]
    lyrics = {"lines": [{"text": s, "start": t, "end": t + 1.5, "words": words(t, s)} for s, t in L]}
    hero = {k: "x" for k in HERO_FIELDS}
    mk = lambda pid, mod, idiom, lines, meth, ho_in, ho_out, n_ev, **kw: {
        "id": pid, "module": mod, "idiom": idiom, "lines": lines,
        "integration": [{"line": l, "method": m} for l, m in zip(lines, meth)],
        "concept": {"idea": "i", "subject": "s", "transform": "pun"},
        "events": [{"anchor": "beat:+1", "action": "a"}] * n_ev, "motif_role": "r", "counter_cameo": None,
        "handoff": {"in": ho_in, "out": ho_out}, **kw}
    m = {"type": "match", "geometry": "spark at 960,540"}
    plan = {"style": {"palette": {"ink": "#101114", "amber": "#ffb000"}}, "motif": {"name": "needle", "reveal_plate": "c"},
            "plates": [mk("a", "a", "memo paper", ["Coffee is hot", "Emails pile up"], ["typed", "stamped"], {"type": "open"}, m, 7, hero=hero),
                       mk("b", "b", "dashboard", [], [], m, m, 0),
                       mk("c", "c", "road survey", ["Floor it then pray"], ["road paint"], m, {"type": "end"}, 6)]}
    # 2 s bars: plates of 6, 4 and 5 bars
    tl = {"duration": 30.0, "entries": [{"id": "a", "start": 0, "end": 12.0}, {"id": "b", "start": 12.0, "end": 20.0},
                                        {"id": "c", "start": 20.0, "end": 30.0}]}
    ok = check(plan, tl, lyrics, audio)
    assert ok == [], ok

    def trap(name, mutate, crit):
        p, t = json.loads(json.dumps(plan)), json.loads(json.dumps(tl))
        mutate(p, t)
        got = {c for c, _ in check(p, t, lyrics, audio)}
        assert crit in got, f"trap {name} not caught (got {got})"

    trap("uncovered line", lambda p, t: p["plates"][0]["lines"].pop(), "coverage")
    trap("line claimed twice", lambda p, t: p["plates"][1]["lines"].append("Coffee is hot"), "coverage")
    trap("gated line listed", lambda p, t: p["plates"][2]["lines"].append("A race with no finish line"), "coverage")
    trap("off-grid cut", lambda p, t: (t["entries"][0].update(end=12.13), t["entries"][1].update(start=12.13)), "A1")
    trap("uniform grid", lambda p, t: (t["entries"][0].update(end=10.0), t["entries"][1].update(start=10.0)), "A2")
    trap("line outside plate", lambda p, t: (t["entries"][0].update(end=8.0), t["entries"][1].update(start=8.0)), "coverage")
    trap("cut after word", lambda p, t: (t["entries"][1].update(end=20.5), t["entries"][2].update(start=20.5)), "A1")
    trap("same idiom", lambda p, t: p["plates"][1].update(idiom="memo paper"), "A3")
    trap("reused method", lambda p, t: p["plates"][2]["integration"][0].update(method="typed"), "B3")
    trap("subtitles", lambda p, t: [x.update(method="subtitle") for x in p["plates"][0]["integration"]], "B3")
    trap("literal", lambda p, t: [x["concept"].update(transform="literal") for x in p["plates"]], "C1")
    trap("no motif", lambda p, t: p.update(motif={}), "C3")
    trap("audio events", lambda p, t: [x.update(events=[{"anchor": "audio:kick>0.5", "action": "a"}] * 4) for x in p["plates"]], "D6")
    trap("too few events", lambda p, t: p["plates"][0].update(events=[]), "D6")
    trap("mismatched handoff", lambda p, t: p["plates"][1]["handoff"].update(**{"in": {"type": "bridge"}}), "E1")
    trap("pdoom palette", lambda p, t: p["style"].update(palette={"ink": "#0A0A0B", "signal": "#FF4D12"}), "N5")
    trap("no hero", lambda p, t: p["plates"][0].pop("hero"), "N10")
    # a repeated hook: two identical lines in two plates is valid
    rl = json.loads(json.dumps(lyrics))
    rl["lines"].append({"text": "Floor it then pray", "start": 26.1, "end": 27.5, "words": words(26.1, "Floor it then pray")})
    p2, t2 = json.loads(json.dumps(plan)), json.loads(json.dumps(tl))
    t2["entries"][2]["end"] = 25.0
    t2["entries"].append({"id": "d", "start": 25.0, "end": 30.0})
    p2["plates"][2]["handoff"]["out"] = m
    p2["plates"].append(mk("d", "c", "road survey 2", ["Floor it then pray"], ["road paint"], m, {"type": "end"}, 3))
    p2["plates"][2]["events"] = p2["plates"][2]["events"][:3]
    rep = check(p2, t2, rl, audio)
    assert not [f for f in rep if f[0] == "coverage"], rep
    print("plan_gate selfcheck: valid plan passes, a repeated hook is covered, 17 trap plans fail")


def main():
    if sys.argv[1:] == ["--selfcheck"]:
        selfcheck()
        return 0
    if len(sys.argv) != 3:
        print(__doc__)
        return 2
    song, run = Path(sys.argv[1]), Path(sys.argv[2])
    try:
        plan = json.loads((song / "plan.json").read_text())
        timeline = json.loads((run / "timeline.json").read_text())
        lyrics = json.loads((run / "lyrics.json").read_text()) if (run / "lyrics.json").exists() else {"lines": []}
        audio = json.loads((run / "audio.json").read_text())
    except (OSError, ValueError) as e:
        print(f"FAIL[plan:io]: {e}")
        return 1
    fails = check(plan, timeline, lyrics, audio)
    if plan.get("status") == "final":  # a final song plays no placeholder plates
        fails += [("modules", f"scenes/{p['module']}.ts missing") for p in plan["plates"]
                  if not (song / "scenes" / f"{p['module']}.ts").exists()]
    for c, m in fails:
        print(f"FAIL[plan:{c}]: {m}")
    if not fails:
        print(f"PASS[plan]: {len(plan['plates'])} plates, every criterion met")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
