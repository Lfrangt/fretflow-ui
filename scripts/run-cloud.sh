#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
set -a
source .runtime/hosted.env
set +a
# A single lock and a single ASGI process protect the in-memory model executor.
exec 9>.runtime/worker.lock
flock -n 9 || exit 0
child=''
trap 'if [[ -n "$child" ]]; then kill -TERM "$child" 2>/dev/null || true; wait "$child" || true; fi; exit 0' TERM INT
while true; do
  .venv-audio/bin/python -m uvicorn backend.app:app --host 127.0.0.1 --port 8771 --workers 1 --no-access-log &
  child=$!
  wait "$child" || true
  child=''
  sleep 3
done
