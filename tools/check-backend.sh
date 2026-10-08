#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

test_site="${LMS_TEST_SITE:-lms.test}"
if [[ "$test_site" != *.test ]]; then
    echo "Backend checks require a dedicated *.test site; never run them on a school site." >&2
    exit 1
fi

if [[ -n "${LMS_BENCH_DIR:-}" ]]; then
    # A native Bench must use this checkout as apps/lms, not a stale clone.
    source_root="$(pwd -P)"
    bench_app="$(cd "$LMS_BENCH_DIR/apps/lms" && pwd -P)"
    if [[ "$source_root" != "$bench_app" ]]; then
        echo "LMS_BENCH_DIR/apps/lms must point to this checkout." >&2
        exit 1
    fi
    cd "$LMS_BENCH_DIR"
    bench --site "$test_site" set-config allow_tests true
    bash "$source_root/tools/run-backend-tests.sh" "$test_site" "$@"
else
    if [[ "$test_site" != lms.test ]]; then
        echo "Docker checks use lms.test; use LMS_BENCH_DIR for a different *.test site." >&2
        exit 1
    fi
    compose=(docker compose -p albadr-tests -f docker/tests.compose.yml)
    "${compose[@]}" up -d --wait --wait-timeout 1800
    "${compose[@]}" exec -T --user frappe bench bash -lc '
        set -euo pipefail
        export PATH="/home/frappe/.nvm/current/bin:/home/frappe/.local/bin:$PATH"
        cd /home/frappe/frappe-bench
        bash /workspace/tools/sync-test-environment.sh
        bench --site lms.test migrate
        bench --site lms.test set-config allow_tests true
        bash /workspace/tools/run-backend-tests.sh lms.test "$@"
    ' bash "$@"
fi
