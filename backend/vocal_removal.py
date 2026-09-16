"""Local two-output vocal removal with the standard four-source HTDemucs model."""
from functools import lru_cache
import importlib.util
import math
from pathlib import Path
import time

import numpy as np
import soundfile as sf

from .engines import ROOT, verify_model
from .runtime import configure_torch

CHECKPOINT = ROOT / "vendor/demucs/955717e8-8726e21a.th"
SETUP_MESSAGE = "去人声模型尚未安装，请运行 npm run setup:vocals，或选择原音分析。"


def available() -> bool:
    return CHECKPOINT.is_file() and importlib.util.find_spec("demucs") is not None


@lru_cache(maxsize=1)
def vocal_model():
    if not available():
        raise RuntimeError(SETUP_MESSAGE)
    verify_model(CHECKPOINT, "demucs_vocals")
    import torch
    from demucs.states import load_model
    configure_torch()
    # PyTorch 2.9 requires explicit trusted checkpoint loading. Verify the
    # pinned official hash first; user-provided models are never accepted.
    package = torch.load(CHECKPOINT, map_location="cpu", weights_only=False)
    model = load_model(package, strict=True).eval()
    if model.sources != ["drums", "bass", "other", "vocals"] or model.samplerate != 44100 or model.audio_channels != 2:
        raise RuntimeError("去人声模型格式不匹配。")
    return model


def remove_vocals(source: Path, output: Path, progress) -> dict:
    started = time.monotonic()
    progress(12, "加载去人声模型")
    model = vocal_model()
    import torch
    from demucs.apply import apply_model

    samples, rate = sf.read(source, dtype="float32", always_2d=True)
    if rate != 44100 or samples.shape[1] != 2 or len(samples) < rate // 2 or not np.isfinite(samples).all():
        raise ValueError("去人声需要至少 0.5 秒的有效立体声音频。")
    configure_torch()
    mix = torch.from_numpy(samples.T.copy())
    reference = mix.mean(0)
    mean, scale = reference.mean(), reference.std()
    if scale < 1e-8:
        scale = mix.std()  # Preserve stereo with an anti-phase mono average.
    segment = float(model.segment)
    total = max(1, math.ceil(len(samples) / int(rate * segment * .75)))
    completed = 0

    def before_chunk(_model, _args):
        nonlocal completed
        progress(16 + min(40, int(40 * completed / total)), "正在分离人声与伴奏")
        completed += 1

    hook = model.register_forward_pre_hook(before_chunk)
    try:
        if scale < 1e-8:
            estimates = torch.zeros(4, 2, len(samples))
        else:
            with torch.inference_mode():
                estimates = apply_model(model, ((mix - mean) / scale)[None], shifts=0,
                                        split=True, overlap=.25, device="cpu", num_workers=0)[0]
            estimates = estimates * scale + mean
    finally:
        hook.remove()
    if tuple(estimates.shape) != (4, 2, len(samples)) or not torch.isfinite(estimates).all():
        raise RuntimeError("去人声未生成有效音轨，请重试。")
    progress(58, "保存人声与伴奏音轨")
    output.mkdir(parents=True, exist_ok=True)
    # Same sample count and gain basis for comparison. Float WAV avoids clipping
    # or independent stem normalization; no additional MP3 loss before analysis.
    sf.write(output / "vocals.wav", estimates[3].numpy().T, rate, subtype="FLOAT")
    sf.write(output / "instrumental.wav", estimates[:3].sum(0).numpy().T, rate, subtype="FLOAT")
    return {"enabled": True, "mode": "instrumental", "model": "htdemucs", "sample_rate": rate,
            "stems": ["instrumental", "vocals"], "notes_source": "instrumental", "chords_source": "instrumental",
            "seconds": round(time.monotonic() - started, 2)}
