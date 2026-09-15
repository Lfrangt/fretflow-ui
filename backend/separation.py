"""Optional local six-stem Demucs inference. Never downloads models during a job."""
from functools import lru_cache
import hashlib
import importlib.util
import json
import math
from pathlib import Path

import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parent.parent
MODEL = "htdemucs_6s"
STEMS = ("guitar", "vocals", "drums", "bass", "piano", "other")
CHECKPOINT = ROOT / ".runtime/models/5c90dfd2-34c22ccb.th"
SETUP_MESSAGE = "吉他分离尚未安装，请运行 npm run setup:separation，或选择原音分析。"


def available() -> bool:
    return CHECKPOINT.is_file() and importlib.util.find_spec("demucs") is not None


@lru_cache(maxsize=1)
def separation_model():
    if not available():
        raise RuntimeError(SETUP_MESSAGE)
    expected = json.loads((ROOT / "models.lock.json").read_text())["demucs"]["sha256"]
    if hashlib.sha256(CHECKPOINT.read_bytes()).hexdigest() != expected:
        raise RuntimeError("分轨模型校验失败，请重新运行 npm run setup:separation。")
    import torch
    from demucs.states import load_model

    # The upstream checkpoint serializes its model class. Only deserialize our
    # fixed, hash-verified upstream file, never an uploaded/user-selected model.
    package = torch.load(CHECKPOINT, map_location="cpu", weights_only=False)
    model = load_model(package, strict=True).eval()
    if set(model.sources) != set(STEMS) or model.samplerate != 44100 or model.audio_channels != 2:
        raise RuntimeError("分轨模型的声部或采样率不匹配。")
    return model


def separate_audio(source: Path, output: Path, progress) -> dict:
    progress(12, "加载吉他分离模型")
    model = separation_model()
    import torch
    from demucs.apply import apply_model

    audio, sr = sf.read(source, dtype="float32", always_2d=True)
    if sr != model.samplerate or audio.shape[1] != 2 or not np.isfinite(audio).all():
        raise ValueError("分轨需要有效的 44.1 kHz 立体声音频。")
    if len(audio) < sr // 2:
        raise ValueError("音频太短，请选择至少 0.5 秒的录音。")
    torch.set_num_threads(2)
    mix = torch.from_numpy(audio.T.copy())
    reference = mix.mean(0)
    scale = reference.std()
    # Preserve a stereo signal even when its channels cancel in the mono mean.
    if scale < 1e-8:
        scale = mix.std()
    mean = reference.mean()
    segments = max(1, math.ceil(len(audio) / int(.75 * 7 * sr)))
    completed = 0

    def before_chunk(_model, _args):
        nonlocal completed
        # Demucs runs chunks sequentially. This also checks job cancellation
        # between chunks, without changing the third-party inference engine.
        progress(16 + int(40 * completed / segments), "正在分离吉他与其他声部")
        completed += 1

    hook = model.register_forward_pre_hook(before_chunk)
    try:
        if scale < 1e-8:
            estimates = torch.zeros(len(model.sources), 2, len(audio))
        else:
            with torch.inference_mode():
                estimates = apply_model(model, ((mix - mean) / scale)[None],
                                        shifts=0, split=True, segment=7,
                                        overlap=.25, device="cpu", num_workers=0)[0]
            estimates = estimates * scale + mean
    finally:
        hook.remove()
    if tuple(estimates.shape) != (6, 2, len(audio)) or not torch.isfinite(estimates).all():
        raise RuntimeError("分轨输出无效，请改用原音分析或重新尝试。")
    progress(58, "保存分离后的声部")
    output.mkdir(parents=True, exist_ok=True)
    for name, data in zip(model.sources, estimates):
        # Float WAV preserves relative gain; no per-stem normalization, trimming
        # or lossy encoding that could change comparison or note timing.
        sf.write(output / f"{name}.wav", data.cpu().numpy().T, sr, subtype="FLOAT")
    return {"enabled": True, "model": MODEL, "stems": list(STEMS),
            "sample_rate": sr, "notes_source": "guitar", "chords_source": "original"}
