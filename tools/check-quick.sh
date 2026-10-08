#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

check_python="${LMS_CHECK_PYTHON:-.venv-checks/bin/python}"
if [[ ! -x "$check_python" ]]; then
    echo "Create .venv-checks and install tools/requirements-checks.txt (see TESTING.md)." >&2
    exit 1
fi

git diff --check
"$check_python" tools/check-static.py
"$check_python" -m ruff check lms tools
"$check_python" -m unittest discover -s tools -p 'test_*.py'
corepack yarn --cwd frontend test
echo "Quick local gate passed. Run relevant backend tests for the changed behavior."
