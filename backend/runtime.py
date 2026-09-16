"""Bound model CPU work and preload trusted checkpoints on the model executor."""
import logging
import os
from pathlib import Path


def cpu_budget() -> int:
    count = len(os.sched_getaffinity(0)) if hasattr(os, "sched_getaffinity") else (os.cpu_count() or 1)
    try:
        quota, period = Path("/sys/fs/cgroup/cpu.max").read_text().split()
        if quota != "max":
            count = min(count, max(1, int(quota) // int(period)))
    except (OSError, ValueError, ZeroDivisionError):
        pass
    return max(1, count)


def model_threads() -> int:
    try:
        requested = int(os.getenv("FRETFLOW_MODEL_THREADS", "2"))
    except ValueError:
        requested = 2
    return max(1, min(requested, cpu_budget(), 8))


def configure_torch():
    import torch
    torch.set_num_threads(model_threads())


def warm_models():
    from .engines import chord_model, pitch_model
    from .vocal_removal import available, vocal_model
    for name, loader in [("chords", chord_model), ("notes", pitch_model), ("vocals", vocal_model if available() else None)]:
        if loader is not None:
            try:
                loader()
                logging.info("Model ready: %s", name)
            except Exception:
                logging.exception("Model preload failed: %s", name)
