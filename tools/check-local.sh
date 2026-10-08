#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
smoke_url="http://127.0.0.1:${ALBADR_TEST_PORT:-18080}"
if [[ -n "${LMS_BENCH_DIR:-}" ]]; then
    : "${LMS_TEST_URL:?Set LMS_TEST_URL to the running native test Bench URL (see TESTING.md)}"
    smoke_url="$LMS_TEST_URL"
fi

bash tools/check-quick.sh
LMS_LOCAL_CHECKS=1 NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=4096}" corepack yarn build
bash tools/check-packaging.sh
bash tools/check-backend.sh
"${LMS_CHECK_PYTHON:-.venv-checks/bin/python}" tools/check-runtime.py --url "$smoke_url" --site "${LMS_TEST_SITE:-lms.test}"
echo "Local automated checks passed. Complete the 3 built-in-browser scenarios in TESTING.md before merging into develop/master."
