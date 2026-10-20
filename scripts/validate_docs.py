#!/usr/bin/env python3
"""Check local Markdown paths and fence balance; NOT a code-import analyzer."""
from pathlib import Path
from urllib.parse import unquote, urlsplit
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
LINK = re.compile(r"(?<!!)\[[^\]]*\]\(([^)]+)\)")
problems = []
docs = sorted(p for p in ROOT.rglob("*.md") if "node_modules" not in p.parts)

for md in docs:
    source = md.read_text(encoding="utf-8")
    if sum(line.strip().startswith(("~~~", "\x60\x60\x60")) for line in source.splitlines()) % 2:
        problems.append(f"{md.relative_to(ROOT)}: unbalanced code fences")
    prose = re.sub(r"~~~[\s\S]*?~~~", "", source)
    for found in LINK.finditer(prose):
        target = found.group(1).strip().split(maxsplit=1)[0].strip("<>")
        if target.startswith(("https://", "http://", "#", "mailto:")):
            continue
        path = urlsplit(target).path
        if not path:
            continue
        resolved = (md.parent / unquote(path)).resolve()
        if not resolved.is_relative_to(ROOT) or not resolved.exists():
            problems.append(f"{md.relative_to(ROOT)}: missing {target}")

if problems:
    for problem in problems:
        print("FAIL:", problem, file=sys.stderr)
    sys.exit(1)
print(f"PASS: local links and fences ({len(docs)} markdown files)")
