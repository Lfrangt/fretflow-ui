#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
command -v uv >/dev/null || { echo '需要 uv：安装后重新运行本脚本。'; exit 1; }
command -v ffmpeg >/dev/null || { echo '需要 FFmpeg：macOS 可执行 brew install ffmpeg。'; exit 1; }
command -v npm >/dev/null || { echo '需要 Node.js 和 npm。'; exit 1; }
uv venv --python 3.11 --allow-existing .venv-audio
uv pip install --python .venv-audio/bin/python -r requirements.lock.txt
if [ ! -d vendor/ChordMini/.git ]; then
  mkdir -p vendor/ChordMini
  git -C vendor/ChordMini init
  git -C vendor/ChordMini remote add origin https://github.com/ptnghia-j/ChordMini.git
  git -C vendor/ChordMini fetch --depth 1 origin aa6e3a8d7b017f082fd2aaff9329d5c26af49c03
  git -C vendor/ChordMini checkout --detach FETCH_HEAD
fi
.venv-audio/bin/python scripts/check_models.py
echo "模型安装完成。运行 npm run worker；另一个终端运行 npm run dev。"
