"""Fetch a predetermined, small GuitarSet regression subset; no media publishing."""
import hashlib
import io
import json
from pathlib import Path
import struct
import zipfile
import zlib
from urllib.parse import quote

import requests

ROOT = Path(__file__).resolve().parent.parent / "verification" / "transcription-quality"
ROOT.mkdir(parents=True, exist_ok=True)
BASE = "https://zenodo.org/records/3371780/files/"


def get_range(name, begin, end):
    header = f"bytes={begin}-{end}" if begin >= 0 else f"bytes={begin}"
    with requests.get(BASE + quote(name), headers={"Range": header}, stream=True, timeout=45) as r:
        r.raise_for_status()
        if r.status_code != 206:
            raise RuntimeError("The archive server must support partial downloads")
        total = int(r.headers["Content-Range"].split("/")[-1])
        content = r.content
        return content, total


class Archive:
    def __init__(self, name):
        self.name = name
        tail, self.size = get_range(name, -65536, "")
        self.shift = self.size - len(tail)
        self.files = {f.filename: f for f in zipfile.ZipFile(io.BytesIO(tail)).infolist()}

    def extract(self, name):
        info = self.files[name]
        begin = info.header_offset + self.shift
        # Read the local header, then exactly this member's compressed payload.
        header, _ = get_range(self.name, begin, begin + 29)
        fields = struct.unpack("<4s5H3I2H", header)
        assert fields[0] == b"PK\x03\x04"
        begin += 30 + fields[-2] + fields[-1]
        packed, _ = get_range(self.name, begin, begin + info.compress_size - 1)
        raw = zlib.decompress(packed, -15) if info.compress_type == zipfile.ZIP_DEFLATED else packed
        if len(raw) != info.file_size or zlib.crc32(raw) != info.CRC:
            raise RuntimeError(f"Archive member failed size/CRC check: {name}")
        return raw


def main():
    audio, annotations = Archive("audio_mono-mic.zip"), Archive("annotation.zip")
    items = []
    # Select before measuring: six performers, five styles, comp + solo each.
    for performer, style in enumerate(["BN", "Funk", "Jazz", "Rock", "SS", "SS"]):
        for mode in ["comp", "solo"]:
            filename = sorted(n for n in audio.files if n.startswith(f"{performer:02}_{style}") and n.endswith(f"_{mode}_mic.wav"))[0]
            clip_id = filename.removesuffix("_mic.wav")
            print("Fetching", clip_id, flush=True)
            wave_path, jams_path = ROOT / filename, ROOT / f"{clip_id}.jams"
            for archive, name, local in [(audio, filename, wave_path), (annotations, jams_path.name, jams_path)]:
                info = archive.files[name]
                if not local.exists(): local.write_bytes(archive.extract(name))
                data = local.read_bytes()
                if len(data) != info.file_size or zlib.crc32(data) != info.CRC:
                    raise RuntimeError("Cached fixture failed size/CRC check: " + name)
            jams = json.loads(jams_path.read_text())
            notes = sorted([
                {"start": float(n["time"]), "end": float(n["time"] + n["duration"]),
                 "midi": float(n["value"]), "string": ann.get("annotation_metadata", {}).get("data_source")}
                for ann in jams["annotations"] if ann["namespace"] == "note_midi"
                for n in ann["data"] if n["duration"] > 0
            ], key=lambda n: (n["start"], n["midi"]))
            if not notes: raise RuntimeError("No reference notes: " + clip_id)
            reference = ROOT / f"{clip_id}.reference.json"
            reference.write_text(json.dumps(notes, indent=2))
            items.append({"id": clip_id, "group": mode, "audio": wave_path.name,
                          "reference": reference.name, "audio_sha256": hashlib.sha256(wave_path.read_bytes()).hexdigest(),
                          "reference_sha256": hashlib.sha256(reference.read_bytes()).hexdigest(),
                          "jams_sha256": hashlib.sha256(jams_path.read_bytes()).hexdigest()})
    manifest = {"dataset": "GuitarSet 1.1.0 / predetermined 12-clip microphone subset",
                "source": "https://zenodo.org/records/3371780", "license": "CC-BY-4.0",
                "attribution": "Qingyang Xi, Rachel M. Bittner, Johan Pauwels, Xuzhou Ye, Juan P. Bello (2018), GuitarSet",
                "selection": "Before inference: first sorted comp and solo for players/styles 00 BN, 01 Funk, 02 Jazz, 03 Rock, 04 SS, 05 SS.",
                "limitations": ["Regression subset, not independent held-out product accuracy: Basic Pitch training includes GuitarSet.",
                               "Clean acoustic recordings only; no singing, mixed bands, electric distortion, or human-audited labels.",
                               "Dataset annotations have known errors: https://github.com/marl/GuitarSet/issues"], "clips": items}
    (ROOT / "manifest.json").write_text(json.dumps(manifest, indent=2))
    print("Saved manifest with", len(items), "clips", flush=True)


if __name__ == "__main__":
    main()
