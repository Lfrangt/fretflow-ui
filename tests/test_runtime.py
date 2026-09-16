import pytest
import backend.runtime as runtime


@pytest.mark.parametrize('setting,expected', [('4',4), ('90',6), ('0',1), ('bad',2)])
def test_model_threads_respects_cpu_budget(monkeypatch, setting, expected):
    monkeypatch.setattr(runtime, 'cpu_budget', lambda: 6)
    monkeypatch.setenv('FRETFLOW_MODEL_THREADS', setting)
    assert runtime.model_threads() == expected


def test_warming_isolated_from_missing_optional_models(monkeypatch):
    import backend.engines as engines
    import backend.vocal_removal as vocals
    calls=[]
    def missing():
        raise RuntimeError('missing')
    monkeypatch.setattr(engines,'chord_model',missing)
    monkeypatch.setattr(engines,'pitch_model',lambda:calls.append('notes'))
    monkeypatch.setattr(vocals,'available',lambda:False)
    runtime.warm_models()
    assert calls == ['notes']
