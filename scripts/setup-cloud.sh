#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p verification .runtime
command -v uv >/dev/null
command -v ffmpeg >/dev/null
uv venv --python 3.11 --allow-existing .venv-audio
# Use CPU wheels; the Linux default would otherwise install large CUDA libraries.
uv pip install --python .venv-audio/bin/python --index-url https://download.pytorch.org/whl/cpu torch==2.9.1 torchaudio==2.9.1
# The complete locked dependency set is installed explicitly. Basic Pitch uses
# ONNX here; its optional TensorFlow/CoreML runtimes are intentionally omitted.
python3 - <<'PY'
from pathlib import Path
excluded = ('coremltools==', 'torch==', 'torchaudio==', '-r ')
lines = []
for name in ('requirements.lock.txt', 'requirements.separation.lock.txt'):
    lines.extend(line for line in Path(name).read_text().splitlines()
                 if line and not line.startswith(excluded))
Path('.runtime/requirements-cloud.txt').write_text('\n'.join(dict.fromkeys(lines)) + '\n')
PY
uv pip install --python .venv-audio/bin/python --no-deps -r .runtime/requirements-cloud.txt
if [ ! -d vendor/ChordMini/.git ]; then
  mkdir -p vendor/ChordMini
  git -C vendor/ChordMini init
  git -C vendor/ChordMini remote add origin https://github.com/ptnghia-j/ChordMini.git
  git -C vendor/ChordMini fetch --depth 1 origin aa6e3a8d7b017f082fd2aaff9329d5c26af49c03
  git -C vendor/ChordMini checkout --detach FETCH_HEAD
fi
.venv-audio/bin/python scripts/check_models.py
.venv-audio/bin/python scripts/setup_separation.py demucs_vocals
.venv-audio/bin/python scripts/setup_separation.py demucs
.venv-audio/bin/python -c 'import torch, torchaudio, onnxruntime, fastapi, demucs; print("Cloud imports OK; torch=" + torch.__version__)'
date -u +%FT%TZ > verification/cloud-setup-complete.txt
