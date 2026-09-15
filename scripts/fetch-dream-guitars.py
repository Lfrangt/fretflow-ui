"""Download the six official reference photos for this local prototype.
Fender photography is not covered by the repository's MIT license.
"""
import json
import subprocess
from pathlib import Path

root = Path(__file__).resolve().parents[1]
manifest = root / "public/assets/dream-guitars/sources.json"
for guitar in json.loads(manifest.read_text()):
    target = root / "public" / guitar["file"].removeprefix("/").removeprefix("public/")
    # Manifest paths already begin at the public asset root.
    target.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(["curl", "-fL", "--max-time", "30", "-o", str(target), guitar["sourceImage"]], check=True)
    print(guitar["model"], guitar["finish"], target)
