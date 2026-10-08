#!/usr/bin/env bash
set -euo pipefail
cd /home/frappe/frappe-bench
test -f .albadr-local-test-bench
# Registration fixtures render mail even with mute_emails. Keep that real path
# working without compiling the complete Desk in CI.
if [[ ! -f .email-assets-ready || ! -f sites/assets/assets.json ]]; then
    bench --site lms.test execute frappe.bundler.bundle \
        --args '["production"]' \
        --kwargs '{"apps":"frappe","files":["frappe/email.bundle.scss"]}'
    touch .email-assets-ready
fi
if [[ "${LMS_TEST_ASSETS:-1}" == 1 && ! -f .framework-assets-ready ]]; then
    bench build --app frappe
    touch .framework-assets-ready
fi
