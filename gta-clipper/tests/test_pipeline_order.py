"""Kolejnosc w pipeline.process: Whisper -> okno -> LLM -> render z tytulem, z dyscyplina VRAM."""
from __future__ import annotations

import importlib

from clipper import brain, pipeline
from clipper.config import Streamer
from clipper.models import Candidate, ClipMeta, RenderedClip, Word

tr = importlib.import_module("clipper.render.transcribe")
rd = importlib.import_module("clipper.render.render")


def test_process_order_and_title(monkeypatch, tmp_path):
    monkeypatch.setenv("CLIPPER_DATA_DIR", str(tmp_path))
    calls: list[str] = []
    seen: dict = {}
    words = [Word(float(i), i + 0.5, f"w{i}") for i in range(60)]

    monkeypatch.setattr(pipeline.config, "streamer",
                        lambda name: Streamer(name=name, rp=True, tags=["lysium"]))
    monkeypatch.setattr(rd, "probe", lambda p: {"duration": 75.0})

    def fake_transcribe(path, lang="en"):
        calls.append("transcribe")
        return words
    monkeypatch.setattr(tr, "transcribe", fake_transcribe)
    monkeypatch.setattr(tr, "unload", lambda: calls.append("whisper_unload"))

    def fake_describe(transcript, sample, channel, **kw):
        calls.append("describe")
        seen["describe"] = (transcript, kw)
        return ClipMeta(title="Taxi vs Truck", description="d", hashtags=["gta6"], score=8)
    monkeypatch.setattr(brain, "describe", fake_describe)
    monkeypatch.setattr(brain, "unload", lambda: calls.append("llm_unload") or True)

    def fake_render(segment, layout, **kw):
        calls.append("render")
        seen["render"] = kw
        return RenderedClip(path=tmp_path / "c.mp4", duration=20.0, channel="chan", t_start=10.0)
    monkeypatch.setattr(rd, "render_clip", fake_render)

    cand = Candidate(channel="chan", t_peak=40.0, score=5.0, t_start=0.0, t_end=75.0, sample=["LUL"])
    clip_id = pipeline.process(cand, tmp_path / "seg.mp4", "test", send=False, force=True)

    assert calls == ["transcribe", "whisper_unload", "describe", "llm_unload", "render"]
    kw = seen["render"]
    assert kw["title"] == "Taxi vs Truck" and kw["words"] is words
    w0, w1 = kw["window"]
    assert 18.0 <= w1 - w0 <= 35.0
    transcript, dkw = seen["describe"]
    inside = [w.text for w in words if w0 <= w.start < w1]
    assert transcript.split() == inside                     # tylko okno klipu
    assert dkw["rp"] is True and dkw["extra_tags"] == ["lysium"]
    assert clip_id is not None
