"""Validate pinned model provenance without importing ML runtimes."""
from pathlib import Path
from importlib.metadata import distribution
import hashlib
import json
import subprocess

root = Path(__file__).resolve().parent.parent
lock = json.loads((root / "models.lock.json").read_text())
revision = subprocess.check_output(["git", "-C", str(root / "vendor/ChordMini"), "rev-parse", "HEAD"], text=True).strip()
if revision != lock["chordmini"]["revision"]:
    raise SystemExit("ChordMini 版本与 models.lock.json 不一致；请检查 vendor/ChordMini。")
package = distribution("basic-pitch")
if package.version != lock["basic_pitch"]["version"]:
    raise SystemExit("Basic Pitch 版本与 models.lock.json 不一致。")
for key, path in [
    ("chordmini", root / "vendor/ChordMini" / lock["chordmini"]["checkpoint"]),
    ("basic_pitch", Path(package.locate_file(lock["basic_pitch"]["checkpoint"]))),
]:
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if digest != lock[key]["sha256"]:
        raise SystemExit(f"{key} 模型校验失败。")
    print(f"{key}: version and SHA-256 verified")
