"""token_ledger — token use of the Claude Code sessions that built a film, read from their transcripts.

  python3 src/token_ledger.py <session.jsonl> [...] [--md docs/v3/TOKEN_LEDGER.md]

Counts each API message once (streamed chunks share a message id) for the main loop and for every subagent in
<session>/subagents/. Three columns, because they are priced very differently: output, fresh input (input + cache
write) and cache read (re-reading the context each turn; ~10x cheaper per token, but the bulk of long sessions).
Not the same number as a task notification's subagent_tokens, which Claude Code computes its own way.
"""
import json
import sys
from pathlib import Path

KEYS = ("input_tokens", "cache_creation_input_tokens", "cache_read_input_tokens", "output_tokens")


def usage(path):
    seen = {}
    for line in path.open(encoding="utf-8", errors="replace"):
        try:
            m = json.loads(line).get("message") or {}
        except ValueError:
            continue
        u = m.get("usage") if isinstance(m, dict) else None
        if u and m.get("id"):
            seen[m["id"]] = [int(u.get(k) or 0) for k in KEYS]  # the last chunk of a message carries its final usage
    return [sum(c) for c in zip(*seen.values())] if seen else [0, 0, 0, 0]


def kind(desc):
    d = desc.lower()
    for k, words in (("engineer", ("plate", "engineer", "fix ", "rework")), ("critic", ("critic",)),
                     ("research", ("study", "catalog", "research", "playbook", "explore"))):
        if any(w in d for w in words):
            return k
    return "other"


def rows(session):
    out = [("main loop", "main", usage(session))]
    sub = session.with_suffix("") / "subagents"
    for f in sorted(sub.glob("agent-*.jsonl")) if sub.exists() else []:
        meta = f.with_name(f.stem + ".meta.json")
        desc = json.loads(meta.read_text()).get("description", f.stem) if meta.exists() else f.stem
        out.append((desc, kind(desc), usage(f)))
    return out


def main():
    a = sys.argv[1:]
    md = a[a.index("--md") + 1] if "--md" in a else None
    sessions = [Path(x) for x in a if x.endswith(".jsonl")]
    if not sessions:
        print(__doc__)
        return 2
    lines, grand = [], {}
    for s in sessions:
        rs = rows(s)
        tot = [sum(c) for c in zip(*(u for _, _, u in rs))]
        lines += [f"\n### {s.stem[:8]} — output {tot[3]:,} · fresh input {tot[0] + tot[1]:,} · cache read {tot[2]:,}\n",
                  "| agent | kind | output | fresh input | cache read |", "|---|---|---:|---:|---:|"]
        for desc, k, u in sorted(rs, key=lambda r: -(r[2][0] + r[2][1] + r[2][3])):
            lines.append(f"| {desc} | {k} | {u[3]:,} | {u[0] + u[1]:,} | {u[2]:,} |")
            g = grand.setdefault(k, [0, 0, 0])
            grand[k] = [g[0] + u[3], g[1] + u[0] + u[1], g[2] + u[2]]
    head = ["| kind | output | fresh input | cache read |", "|---|---:|---:|---:|"]
    head += [f"| {k} | {v[0]:,} | {v[1]:,} | {v[2]:,} |" for k, v in sorted(grand.items(), key=lambda x: -x[1][1])]
    al = [sum(v[i] for v in grand.values()) for i in range(3)]
    head.append(f"| **all** | **{al[0]:,}** | **{al[1]:,}** | **{al[2]:,}** |")
    text = "\n".join(head + lines) + "\n"
    print(text)
    if md:
        p = Path(md)
        keep = p.read_text().split("<!-- generated -->")[0] if p.exists() else "# Token ledger\n\n"
        p.write_text(keep + "<!-- generated -->\n" + text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
