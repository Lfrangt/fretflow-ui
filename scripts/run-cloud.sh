#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
set -a
source .runtime/hosted.env
set +a
# Tuned on the eight-vCPU Grok Box. The runtime clamps this to the actual
# affinity/cgroup CPU budget; hosted.env can override it for another machine.
export FRETFLOW_MODEL_THREADS="${FRETFLOW_MODEL_THREADS:-8}"
export FRETFLOW_WARM_MODELS="${FRETFLOW_WARM_MODELS:-1}"
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
