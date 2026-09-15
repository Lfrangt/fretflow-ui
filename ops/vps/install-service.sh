#!/usr/bin/env bash
# Run on the prepared Linux VPS, after dependencies, models and secrets exist.
set -euo pipefail
if [[ "$(uname -s)" != Linux || "$EUID" -ne 0 ]]; then
  echo 'Run as root on the target Linux server.' >&2
  exit 1
fi
cd /opt/fretflow-worker
test -d /run/systemd/system
id fretflow >/dev/null
test -x .venv-audio/bin/python
test -f /etc/fretflow/worker.env
for command_name in systemctl systemd-analyze curl; do command -v "$command_name" >/dev/null; done

# Validate required settings without loading shell code or displaying secrets.
.venv-audio/bin/python - <<'PY'
from pathlib import Path
import stat

path = Path('/etc/fretflow/worker.env')
info = path.stat()
if info.st_uid != 0 or stat.S_IMODE(info.st_mode) != 0o600:
    raise SystemExit('worker.env must be root-owned with mode 600')
values = {}
for line in path.read_text().splitlines():
    line = line.strip()
    if line and not line.startswith('#'):
        key, sep, value = line.partition('=')
        if not sep:
            raise SystemExit('Invalid environment file line')
        values[key] = value.strip().strip('"').strip("'")
if values.get('FRETFLOW_HOSTED') != '1':
    raise SystemExit('Hosted mode must be enabled')
if len(values.get('FRETFLOW_WORKER_TOKEN', '')) < 32:
    raise SystemExit('A worker token of at least 32 characters is required')
origins = set(values.get('FRETFLOW_ALLOWED_ORIGINS', '').split(','))
if not {'https://fretflow.io', 'https://www.fretflow.io'} <= origins:
    raise SystemExit('Both production website origins are required')
PY

.venv-audio/bin/python scripts/verify_models.py
systemd-analyze verify ops/vps/fretflow-worker.service
install -m 644 ops/vps/fretflow-worker.service /etc/systemd/system/fretflow-worker.service
systemctl daemon-reload
systemctl enable fretflow-worker.service
systemctl restart fretflow-worker.service
for _attempt in {1..60}; do
  if curl --silent --fail --max-time 3 http://127.0.0.1:8771/api/health >/dev/null; then
    systemctl is-active --quiet fretflow-worker.service
    echo 'Worker started. Complete HTTPS, restart and reboot acceptance before cutover.'
    exit 0
  fi
  sleep 2
done
echo 'Worker health check failed. Inspect journalctl -u fretflow-worker locally.' >&2
exit 1
