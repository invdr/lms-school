#!/usr/bin/env bash
set -euo pipefail
site="$1"
[[ "$site" == *.test ]] || { echo "Only isolated *.test sites are supported" >&2; exit 1; }
shift
run_suite() {
    bench --site "$site" run-tests --app lms "$@" 2>&1 | tee .backend-results.log
    env/bin/python apps/lms/tools/assert-test-run.py .backend-results.log
}
if [[ $# == 0 ]]; then
    run_suite
else
    for module in "$@"; do
        [[ "$module" == lms.* ]] || { echo "Expected an LMS test module, got: $module" >&2; exit 1; }
        run_suite --module "$module"
    done
fi
