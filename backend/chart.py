"""Readable chord charts preserve detected timing and uncertainty, without inferred bars."""


def chord_status(chord):
    if chord.get("root") is None or chord.get("review"):
        return "Needs review / 待回听"
    if chord.get("edited"):
        return "Edited, not verified / 已编辑，未核实"
    return "Model estimate, not verified / 模型估计，未核实"


def chord_chart(result):
    lines = [
        f"FretFlow · Chord chart / 和弦谱 · {result.get('name', '')}",
        "Draft / 草稿：Automatic chord estimates need listening review. / 自动识别和弦需要回听确认。",
        "Inversions and extended chords may be missed. / 转位与延伸和弦可能遗漏。",
        f"Key estimate / 调性参考：{result.get('key', {}).get('label', 'Unknown / 未确定')}",
        f"Source clip starts at / 原文件片段起点：{result.get('clip_start', 0):.2f}s",
        "Times below are relative to the clip; bar lines and meter are not inferred. / 以下为片段内时间，未推断小节或拍号。",
        "", "Start–end (seconds) / 起止秒数 | Chord / 和弦 | Degree / 级数 | Status / 状态",
    ]
    for chord in result.get("chords", []):
        lines.append(f"{chord['start']:.2f}–{chord['end']:.2f} | {chord['label']} | {chord.get('roman', '?')} | {chord_status(chord)}")
    lines += ["", "Playing recommendation / 演奏建议（非原演奏复刻）："]
    if any(chord.get("root") is not None for chord in result.get("chords", [])):
        lines += [
            "After checking the changes, loop a short passage with a simple accompaniment. Choose your own voicings, picking patterns and fills.",
            "确认和弦变化后，循环一小段，从简单伴奏开始；把位、分解方式和过渡句可以自由发挥。",
        ]
    else:
        lines.append("No usable harmony identified. Replay or try a clearer clip. / 未识别出可用和声，请回听或换用更清晰的片段。")
    return "\n".join(lines) + "\n"
