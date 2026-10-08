#!/usr/bin/env bash
set -euo pipefail
cd /home/frappe/frappe-bench
# This script operates only on the disposable local-test Bench copy.
test -f .albadr-local-test-bench
mkdir -p apps/lms
# Delete the previous copy so removed tests cannot keep running from a warm volume.
find apps/lms -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
tar --exclude=.git --exclude=node_modules --exclude=backups \
    --exclude=.ruff_cache \
    --exclude=.venv-checks --exclude=.local-tests --exclude=__pycache__ --exclude='*.pyc' \
    -C /workspace -cf - . | tar -C apps/lms -xf -
