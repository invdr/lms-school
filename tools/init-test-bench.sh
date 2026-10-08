#!/usr/bin/env bash
set -euo pipefail
export PATH="/home/frappe/.nvm/current/bin:/home/frappe/.local/bin:$PATH"
bench_root=/home/frappe/frappe-bench
rm -f "$bench_root/.local-tests-ready"

if [[ ! -d "$bench_root/apps/frappe" ]]; then
    source_options=()
    if [[ -d /workspace/.local-tests/frappe/.git ]]; then
        source_options=(--frappe-path /workspace/.local-tests/frappe)
    fi
    bench init "$bench_root" --ignore-exist --frappe-branch version-16 \
        --python /home/frappe/.pyenv/versions/3.14.7/bin/python3 \
        --skip-assets --skip-redis-config-generation --no-backups "${source_options[@]}"
fi
cd "$bench_root"
touch .albadr-local-test-bench
bench set-mariadb-host mariadb
bench set-redis-cache-host redis://redis:6379
bench set-redis-queue-host redis://redis:6379
bench set-redis-socketio-host redis://redis:6379
if [[ ! -d apps/payments ]]; then
    bench get-app --branch version-15 --skip-assets https://github.com/frappe/payments
fi
bash /workspace/tools/sync-test-environment.sh
if ! grep -qx 'lms' sites/apps.txt; then
    printf '\nlms\n' >> sites/apps.txt
fi
if [[ ! -f sites/lms.test/site_config.json ]]; then
    bench new-site lms.test --mariadb-root-password local-tests \
        --admin-password admin --no-mariadb-socket
fi
bench --site lms.test install-app payments
bench --site lms.test install-app lms
bench --site lms.test set-config allow_tests true
bench --site lms.test set-config mute_emails true
bench --site lms.test migrate
bench use lms.test
bench set-config -g serve_default_site true
bash /workspace/tools/build-test-assets.sh
touch .local-tests-ready
exec bench serve --port 8000
