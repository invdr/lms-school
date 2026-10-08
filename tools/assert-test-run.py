#!/usr/bin/env python3
"""Frappe can exit zero without discovering tests; reject empty/skipped runs."""
import re
import sys
from pathlib import Path

log = Path(sys.argv[1]).read_text()
counts = [int(n) for n in re.findall(r"^Ran (\d+) tests? in ", log, re.MULTILINE)]
if not counts or sum(counts) == 0:
    raise SystemExit("No backend tests ran")
if re.search(r"^OK \(skipped=|^FAILED|\bskipped=[1-9]", log, re.MULTILINE):
    raise SystemExit("Backend suite failed or skipped tests")
print(f"Backend execution confirmed: {sum(counts)} tests, no skips")
