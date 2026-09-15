"""Fetch the pinned upstream checkpoint once, and verify before publishing it."""
import hashlib
import json
import sys
from pathlib import Path
import urllib.request

ROOT = Path(__file__).resolve().parent.parent


def setup(key="demucs"):
    model = json.loads((ROOT / "models.lock.json").read_text())[key]
    target = ROOT / model["checkpoint"]
    def valid(path):
        return path.is_file() and hashlib.sha256(path.read_bytes()).hexdigest() == model["sha256"]
    if not valid(target):
        target.parent.mkdir(parents=True, exist_ok=True)
        temporary = target.with_suffix(".download")
        try:
            print(f"Downloading Demucs {model['model']}…", flush=True)
            with urllib.request.urlopen(model["url"], timeout=60) as response, temporary.open("wb") as stream:
                while chunk := response.read(1024 * 1024):
                    stream.write(chunk)
            if not valid(temporary):
                raise RuntimeError("Demucs checkpoint SHA-256 does not match models.lock.json")
            temporary.replace(target)
        finally:
            temporary.unlink(missing_ok=True)
    print(f"Demucs {model['model']} ready; SHA-256 verified. Restart the audio worker.")


if __name__ == "__main__":
    setup(sys.argv[1] if len(sys.argv) > 1 else "demucs")
