"""Conservative tonal labels. These are interpretations, not an audio model."""
import re

PITCHES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
QUALITIES = {
    "maj": ("", [0, 4, 7], "大三和弦"), "min": ("m", [0, 3, 7], "小三和弦"),
    "dim": ("dim", [0, 3, 6], "减三和弦"), "aug": ("aug", [0, 4, 8], "增三和弦"),
    "min6": ("m6", [0, 3, 7, 9], "小六和弦"), "maj6": ("6", [0, 4, 7, 9], "大六和弦"),
    "min7": ("m7", [0, 3, 7, 10], "小七和弦"), "minmaj7": ("m(maj7)", [0, 3, 7, 11], "小大七和弦"),
    "maj7": ("maj7", [0, 4, 7, 11], "大七和弦"), "7": ("7", [0, 4, 7, 10], "属七和弦"),
    "dim7": ("dim7", [0, 3, 6, 9], "减七和弦"), "hdim7": ("m7♭5", [0, 3, 6, 10], "半减七和弦"),
    "sus2": ("sus2", [0, 2, 7], "挂二和弦"), "sus4": ("sus4", [0, 5, 7], "挂四和弦"),
}


def chord_info(raw: str) -> dict:
    if raw in ("N", "X"):
        return {"raw": raw, "label": raw, "root": None, "quality": None, "bass": None, "notes": [],
                "description": "无和弦 / 静音" if raw == "N" else "无法确定和弦"}
    match = re.fullmatch(r"([A-G]#?)(?::([a-z0-9]+))?(?:/([A-G]#?))?", raw)
    if not match or match[1] not in PITCHES or (match[2] or "maj") not in QUALITIES:
        raise ValueError("不支持的和弦名称")
    root, quality, bass = PITCHES.index(match[1]), match[2] or "maj", match[3]
    if bass and bass not in PITCHES:
        raise ValueError("不支持的低音")
    suffix, intervals, description = QUALITIES[quality]
    return {"raw": raw, "label": PITCHES[root] + suffix + (f"/{bass}" if bass else ""),
            "root": root, "quality": quality, "bass": bass,
            "notes": [PITCHES[(root + i) % 12] for i in intervals], "description": description}


def catalog() -> list[dict]:
    return [chord_info("N"), chord_info("X")] + [chord_info(root if quality == "maj" else f"{root}:{quality}") for root in PITCHES for quality in QUALITIES]


def function_label(chord: dict, key: dict) -> dict:
    root = chord.get("root")
    tonic = key.get("root")
    quality = chord.get("quality")
    if root is None or tonic is None:
        return {"roman": "—", "function": "待确定"}
    degree = (root - tonic) % 12
    major = key.get("mode") == "major"
    scale = [0, 2, 4, 5, 7, 9, 11] if major else [0, 2, 3, 5, 7, 8, 10]
    expected = ["maj", "min", "min", "maj", "maj", "min", "dim"] if major else ["min", "dim", "maj", "min", "min", "maj", "maj"]
    if degree not in scale:
        return {"roman": "—", "function": "调外和弦 · 需结合上下文"}
    idx = scale.index(degree)
    roman = ["I", "II", "III", "IV", "V", "VI", "VII"][idx]
    family = "min" if quality.startswith("min") else "dim" if quality in ("dim", "dim7", "hdim7") else "maj"
    if family in ("min", "dim"):
        roman = roman.lower()
    if quality in ("dim", "dim7"):
        roman += "°"
    elif quality == "hdim7":
        roman += "ø"
    if quality in ("7", "min7", "dim7", "hdim7"):
        roman += "7"
    elif quality in ("maj7", "minmaj7"):
        roman += "maj7"
    elif quality in ("maj6", "min6"):
        roman += "6"
    elif quality in ("sus2", "sus4"):
        roman += quality
    if not major and degree == 7 and quality in ("maj", "7"):
        function = "属功能 · 小调中的升导音"
    elif any((degree+i)%12 not in scale for i in QUALITIES[quality][1]) or family != expected[idx] or quality in ("aug", "sus2", "sus4", "minmaj7"):
        function = "变体 / 借用可能 · 需结合上下文"
    elif idx == 0:
        function = "主功能 · 稳定、归属"
    elif idx in (1, 3):
        function = "下属功能候选 · 向属和弦推进"
    elif idx == 4:
        function = "属功能候选 · 倾向回到主和弦" if major else "小属和弦 · 解决感较弱"
    elif idx == 6 and major:
        function = "导和弦 · 倾向解决到主和弦"
    else:
        function = "调内和弦 · 功能取决于上下文"
    return {"roman": roman, "function": function}


def enrich(result: dict) -> dict:
    for chord in result["chords"]:
        chord.update(function_label(chord, result["key"]))
    return result
