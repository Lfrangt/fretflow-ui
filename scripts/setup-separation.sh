#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [ ! -x .venv-audio/bin/python ]; then
  echo '请先运行 npm run setup:audio。'
  exit 1
fi
uv pip install --python .venv-audio/bin/python -r requirements.separation.lock.txt
.venv-audio/bin/python scripts/setup_separation.py
