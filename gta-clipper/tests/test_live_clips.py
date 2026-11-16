"""Testy klipow widzow w trybie live: bez sieci, falszywy recorder i falszywe API klipow."""
from __future__ import annotations

import logging
import threading
from datetime import datetime, timedelta, timezone

import pytest

from clipper import config
from clipper.config import Streamer
from clipper.sources import live
from clipper.sources.live import Recorder
from tests.test_live import FakeRecorder

WALL0 = datetime(2026, 11, 16, 12, 0, 0, tzinfo=timezone.utc)   # clock()==0 w tych testach


class ClockRecorder(FakeRecorder):
    def __init__(self, started=True, buf_start=None):
        super().__init__(started)
        self.buf_start = buf_start
        self.end = 10_000.0

    def t_at(self, when):
        return (when - WALL0).total_seconds()

    def buffer_start(self):
        return self.buf_start


def _clip(url, at, duration=30.0, views=5, title="klip"):
    return {"url": url, "created_at": (WALL0 + timedelta(seconds=at)).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "duration": duration, "view_count": views, "title": title}


@pytest.fixture
def data_dir(tmp_path, monkeypatch):
    monkeypatch.setenv("CLIPPER_DATA_DIR", str(tmp_path / "data"))
    return tmp_path / "data"


def _session(fetch, rec=None, got=None):
    rec = rec or ClockRecorder()

    def on_cand(c, p):
        if got is not None:
            got.append(c)

    s = live.LiveSession(["testchan"], on_cand, recorder_factory=lambda n: rec,
                         clips_fetcher=fetch, clip_poll=60.0, clip_lag=5.0)
    return s, rec


def _drain(s):
    s._pool.shutdown(wait=True)


def test_recorder_t_at_maps_wall_clock(tmp_path):
    r = Recorder("test", buffer_dir=tmp_path)
    with pytest.raises(ValueError):
        r.t_at(WALL0)
    r.register_segment(0, tmp_path / "seg_000000.ts", 0.0, 10.0)
    base = r._wall_t0
    assert abs(r.t_at(base + timedelta(seconds=42)) - 42.0) < 1e-6
    assert r.buffer_start() == 0.0


def test_clip_mapped_to_recording_axis(data_dir):
    got = []
    s, rec = _session(lambda ch, m: [_clip("u1", at=200.0, duration=30.0, views=7)], got=got)
    s._poll_clips(now=1000.0)
    _drain(s)
    assert len(got) == 1
    c = got[0]
    # koniec = 200 - 5 (lag) = 195, start = 165; preroll 20 -> -10, postroll 45 -> +22.5
    assert c.source == "viewer_clip" and c.channel == "testchan"
    assert c.t_peak == pytest.approx(180.0)
    assert c.t_start == pytest.approx(155.0)
    assert c.t_end == pytest.approx(217.5)
    assert c.sample == ["klip"]
    assert c.score > 0
    assert s._clip_count["testchan"] == 1


def test_seen_clips_ignored(data_dir):
    calls = []

    def fetch(ch, minutes):
        calls.append(minutes)
        return [_clip("u1", at=200.0)]

    s, rec = _session(fetch)
    s._poll_clips(now=1000.0)
    s._poll_clips(now=1030.0)          # za wczesnie (clip_poll 60 s): nawet nie pyta API
    s._poll_clips(now=1061.0)          # pyta, ale klip juz widziany
    _drain(s)
    assert len(calls) == 2 and calls[0] == 10
    assert s._cand_count["testchan"] == 1


def test_clip_near_chat_candidate_not_duplicated(data_dir, caplog):
    s, rec = _session(lambda ch, m: [_clip("u1", at=200.0)])
    s._emitted["testchan"] = [180.0 + 40.0]          # kandydat z czatu 40 s od t_peak klipu (180)
    with caplog.at_level(logging.INFO, logger="clipper.sources.live"):
        s._poll_clips(now=1000.0)
    _drain(s)
    assert s._cand_count["testchan"] == 0
    assert any("potwierdzony przez widzow" in r.getMessage() for r in caplog.records)


def test_clip_near_pending_chat_spike_boosts_score(data_dir):
    s, rec = _session(lambda ch, m: [_clip("u1", at=200.0)])
    from clipper.detect.spikes import _Pending
    s.detectors["testchan"]._pending = _Pending(t_peak=170.0, score=4.0, sample=[], last_spike=170.0)
    s._poll_clips(now=1000.0)
    _drain(s)
    assert s._cand_count["testchan"] == 0
    assert s.detectors["testchan"]._pending.score > 4.0


def test_clip_far_from_chat_candidate_is_emitted(data_dir):
    s, rec = _session(lambda ch, m: [_clip("u1", at=200.0)])
    s._emitted["testchan"] = [180.0 + 100.0]
    s._poll_clips(now=1000.0)
    _drain(s)
    assert s._cand_count["testchan"] == 1


def test_clip_out_of_buffer_or_before_start_skipped(data_dir, caplog):
    rec = ClockRecorder(buf_start=500.0)
    s, _ = _session(lambda ch, m: [_clip("old", at=200.0), _clip("neg", at=-50.0)], rec=rec)
    with caplog.at_level(logging.INFO, logger="clipper.sources.live"):
        s._poll_clips(now=1000.0)
    _drain(s)
    assert s._cand_count["testchan"] == 0
    assert any("poza buforem" in r.getMessage() for r in caplog.records)
    assert any("sprzed startu" in r.getMessage() for r in caplog.records)


def test_api_failure_warns_once_and_continues(data_dir, caplog):
    state = {"fail": True}

    def fetch(ch, minutes):
        if state["fail"]:
            raise RuntimeError("brak kluczy")
        return [_clip("u1", at=200.0)]

    s, rec = _session(fetch)
    with caplog.at_level(logging.WARNING, logger="clipper.sources.live"):
        s._poll_clips(now=1000.0)
        s._poll_clips(now=1061.0)      # kolejna proba, ostrzezenie tlumione na 10 min
    warns = [r for r in caplog.records if r.levelno == logging.WARNING]
    assert len(warns) == 1 and "tylko na czacie" in warns[0].getMessage()
    state["fail"] = False
    s._poll_clips(now=1122.0)          # sesja zyje i bierze klipy, gdy API wraca
    _drain(s)
    assert s._cand_count["testchan"] == 1


def test_chat_only_signals_still_polls_nothing_else_and_vice_versa(data_dir, monkeypatch):
    profiles = {"testchan": Streamer(name="testchan", signals=["chat"])}
    monkeypatch.setattr(config, "streamers", lambda: profiles)
    calls = []
    s, rec = _session(lambda ch, m: calls.append(ch) or [])
    s._poll_clips(now=1000.0)
    _drain(s)
    assert calls == []

    profiles["testchan"] = Streamer(name="testchan", signals=["viewer_clips"])
    done = threading.Event()
    s2 = live.LiveSession(["testchan"], lambda c, p: done.set(),
                          recorder_factory=lambda n: rec, clips_fetcher=lambda ch, m: [])
    from clipper.models import ChatMessage
    s2._on_message("testchan", ChatMessage(t=0, user="u", text="LMAO"))   # czat wylaczony
    s2._tick()
    assert s2.detectors["testchan"]._idx == 0 and s2._cand_count["testchan"] == 0
    s2._pool.shutdown(wait=True)
