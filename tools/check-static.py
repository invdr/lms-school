#!/usr/bin/env python3
"""Validate source files without importing apps or generating bytecode."""

import ast
import json
import re
import subprocess
from pathlib import Path

import yaml

try:
	import tomllib
except ImportError:
	import tomli as tomllib

ROOT = Path(__file__).resolve().parents[1]
files = subprocess.check_output(
	["git", "ls-files", "-z", "--cached", "--others", "--exclude-standard"], cwd=ROOT
).decode().split("\0")
errors = []
for name in sorted(set(files)):
	path = ROOT / name
	if not path.is_file() or path.suffix not in {".py", ".js", ".ts", ".vue", ".css", ".json", ".yaml", ".yml", ".toml", ".sh", ".md"}:
		continue
	try:
		text = path.read_text()
		if re.search(r"^(?:<<<<<<< |>>>>>>> )", text, re.MULTILINE):
			raise ValueError("unresolved merge conflict")
		if path.suffix == ".py":
			ast.parse(text, filename=name)
		elif path.suffix == ".json":
			json.loads(text)
		elif path.suffix in {".yaml", ".yml"}:
			yaml.safe_load(text)
		elif path.suffix == ".toml":
			tomllib.loads(text)
	except (ValueError, SyntaxError, yaml.YAMLError) as error:
		errors.append(f"{name}: {error}")

if errors:
	raise SystemExit("\n".join(errors))
print("Python/JSON/YAML/TOML syntax and merge markers: OK")
