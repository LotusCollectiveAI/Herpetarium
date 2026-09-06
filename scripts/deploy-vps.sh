#!/usr/bin/env bash
set -euo pipefail

echo "[deploy] installing Herpetarium dependencies"
npm ci

echo "[deploy] checking and building Herpetarium"
npm run check
npm run build

# db:push is gone: the schema is applied through the journalled migrations
# in migrations/ now, so that a deploy applies a reviewed, ordered set of
# changes rather than whatever diff drizzle-kit infers against live tables.
echo "[deploy] applying database migrations"
npm run db:migrate

echo "[deploy] restarting Herpetarium"
sudo -n systemctl restart herpetarium.service

for attempt in $(seq 1 30); do
  if curl -fsS --max-time 3 http://127.0.0.1:3000/healthz >/dev/null; then
    echo "[deploy] Herpetarium is healthy"
    exit 0
  fi
  sleep 2
done

echo "[deploy] Herpetarium did not become healthy" >&2
sudo -n systemctl status herpetarium.service --no-pager >&2 || true
exit 1
