#!/usr/bin/env bash
set -euo pipefail
cd /home/frappe/frappe-bench
# Refresh exact source/dependencies on both fresh startup and a warm test Bench.
test -f .albadr-local-test-bench
source /workspace/tools/framework-revisions.env
pin_revision() {
    local app="$1" revision="$2"
    if [[ "$(git -C "apps/$app" rev-parse HEAD)" != "$revision" ]]; then
        # Bench names clone remotes upstream; a cached clone can use origin.
        git -C "apps/$app" fetch "https://github.com/frappe/$app.git" "$revision"
        git -C "apps/$app" checkout --detach "$revision"
        rm -f .backend-packages.sha256 .framework-assets-ready
    fi
}
pin_revision frappe "$FRAPPE_REVISION"
pin_revision payments "$PAYMENTS_REVISION"
bash /workspace/tools/sync-test-source.sh
if [[ ! -f .backend-packages.sha256 ]] || ! sha256sum -c .backend-packages.sha256 >/dev/null 2>&1; then
    env/bin/pip install -e 'apps/frappe[test]' -e apps/payments -e apps/lms
    sha256sum apps/frappe/pyproject.toml apps/payments/pyproject.toml apps/lms/pyproject.toml /workspace/tools/framework-revisions.env > .backend-packages.sha256
fi
