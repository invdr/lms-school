# Packaging check for the same pinned runtime used by integration tests.
# This image is deliberately local to a CI run; it is never published or deployed.
FROM frappe/bench@sha256:3f3ce9e2e3a324111b250cd8b95d3edbd10f47dc7710f89d0a813f936529404f
USER frappe
ENV PATH="/home/frappe/.nvm/current/bin:/home/frappe/.local/bin:${PATH}"
COPY --chown=frappe:frappe tools/framework-revisions.env /tmp/framework-revisions.env
RUN . /tmp/framework-revisions.env && \
    bench init /home/frappe/frappe-bench --frappe-branch version-16 \
      --python /home/frappe/.pyenv/versions/3.14.7/bin/python3 \
      --skip-assets --skip-redis-config-generation --no-backups && \
    cd /home/frappe/frappe-bench/apps/frappe && \
    git fetch https://github.com/frappe/frappe.git "$FRAPPE_REVISION" && git checkout --detach "$FRAPPE_REVISION" && \
    cd /home/frappe/frappe-bench && \
    bench get-app --branch version-15 --skip-assets https://github.com/frappe/payments && \
    cd apps/payments && git fetch https://github.com/frappe/payments.git "$PAYMENTS_REVISION" && git checkout --detach "$PAYMENTS_REVISION"
WORKDIR /home/frappe/frappe-bench
COPY --chown=frappe:frappe . apps/lms
RUN env/bin/pip install -e apps/frappe -e apps/payments -e apps/lms && \
    printf '\nlms\n' >> sites/apps.txt && \
    cd apps/lms && corepack yarn install --frozen-lockfile && \
    LMS_LOCAL_CHECKS=1 corepack yarn build
