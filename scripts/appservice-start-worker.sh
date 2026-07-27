#!/bin/sh
# App Service worker entrypoint. App Service passes the startup command to
# `docker run` without shell interpretation, so `sh -c '... && ...'` chains
# break — this file holds the chain instead (startup command: sh /app/appservice-start-worker.sh).
set -e
node dist/scripts/migrate.js
if [ "$SEED_SANDBOX" = "1" ]; then
  node dist/scripts/seedSandbox.js
fi
exec node dist/src/worker.js
