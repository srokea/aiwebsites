"""Testy trybu live bez sieci: sztuczne segmenty z ffmpeg + falszywy recorder/czat."""
from __future__ import annotations

import subprocess
import threading

import pytest

from clipper import config
from clipper.cut import probe
from clipper.models import Candidate, ChatMessage
from clipper.sources import live


def _make_segments(dst, count=5, seg=3):
    """count segmentow .ts po `seg` s (testsrc + sine, czeste klatki kluczowe)."""
    subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
         "-f", "lavfi", "-i", f"testsrc=size=160x120:rate=25:duration={count * seg}",
         "-f", "lavfi", "-i", f"sine=frequency=440:duration={count * seg}",
         "-c:v", "libx264", "-g", "5", "-keyint_min", "5", "-sc_threshold", "0",
         "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest",
         "-f", "segment", "-segment_time", str(seg), "-reset_timestamps", "1",
         str(dst / "seg_%06d.ts")],
        check=True, capture_output=True)
    return [dst / f"seg_{i:06d}.ts" for i in range(count)]


@pytest.fixture
def rec(tmp_path):
    buf = tmp_path / "buf"
    buf.mkdir()
    files = _make_segments(buf, count=5, seg=3)
    r = live.Recorder("test", segment_seconds=3, keep_seconds=9, buffer_dir=buf)
    for i, f in enumerate(files):
        r.register_segment(i, f, i * 3.0, (i + 1) * 3.0)
    return r


def test_extract_three_segments(rec, tmp_path):
    out = rec.extract(2.0, 9.0, tmp_path / "out" / "clip.mp4")      # segmenty 0, 1, 2
    info = probe(out)
    assert abs(info["duration"] - 7.0) <= 0.5
    assert info["has_audio"]
    assert not list(out.parent.glob("*.part.mp4"))
    assert not list(out.parent.glob("*.concat.txt"))


def test_extract_outside_buffer_raises(rec, tmp_path):
    rec.prune()                                  # keep 9 s -> zostaja segmenty 2..4
    with pytest.raises(live.RangeExpired):
        rec.extract(0.0, 6.0, tmp_path / "a.mp4")
    with pytest.raises(live.RangeNotReady):
        rec.extract(10.0, 20.0, tmp_path / "b.mp4")
    assert not (tmp_path / "a.mp4").exists()


def test_extract_clamp_start(rec, tmp_path):
    rec.prune()
    out = rec.extract(0.0, 12.0, tmp_path / "c.mp4", clamp=True)    # dostepne od 6 s
    assert abs(probe(out)["duration"] - 6.0) <= 0.5


def test_extract_refuses_cross_session(rec, tmp_path):
    seg3 = rec._segments[3]
    rec._segments[3] = live._Seg(3, seg3.path, seg3.start, seg3.end, session=1)
    with pytest.raises(live.RangeBroken):
        rec.extract(5.0, 10.0, tmp_path / "d.mp4")


def test_prune_deletes_only_old(rec):
    files = {i: rec._segments[i].path for i in range(5)}
    assert rec.prune() == 2                      # 9 s / 3 s = 3 segmenty zostaja (indeksy 2..4)
    assert not files[0].exists() and not files[1].exists()
    assert all(files[i].exists() for i in (2, 3, 4))
    assert rec.prune() == 0


def test_clock_zero_before_first_segment(tmp_path):
    r = live.Recorder("test", buffer_dir=tmp_path)
    assert not r.started and r.clock() == 0.0


def test_scan_reads_csv_list(tmp_path):
    files = _make_segments(tmp_path, count=2, seg=3)
    r = live.Recorder("test", segment_seconds=3, buffer_dir=tmp_path)
    sess = live._Session(sid=0, base_index=0, list_path=tmp_path / "list_0.csv")
    r._sessions[0] = sess
    (tmp_path / "list_0.csv").write_text(
        "seg_000000.ts,1.500000,4.500000\nseg_000001.ts,4.500000,7.500000\nseg_0000",
        encoding="utf-8")
    r._scan()
    assert r.started and sorted(r._segments) == [0, 1]       # niepelny wiersz pominiety
    assert abs(r._segments[1].start - (sess.t_offset + 3.0)) < 1e-6
    assert files[0].exists()


# --- LiveSession ---------------------------------------------------------------

class FakeRecorder:
    def __init__(self, started=True):
        self.started = started
        self.now = 100.0
        self.end = 0.0
        self.extracted = []

    def clock(self):
        return self.now

    def buffer_end(self):
        return self.end

    def extract(self, t_start, t_end, out, clamp=False):
        self.extracted.append((t_start, t_end, out))
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes(b"x")
        return out

    def prune(self):
        return 0

    def is_alive(self):
        return True

    def buffer_seconds(self):
        return 0.0

    def buffer_mb(self):
        return 0.0

    def start(self):
        pass

    def stop(self):
        pass


@pytest.fixture
def data_dir(tmp_path, monkeypatch):
    monkeypatch.setenv("CLIPPER_DATA_DIR", str(tmp_path / "data"))
    return tmp_path / "data"


def test_live_candidate_flow(data_dir):
    got = []
    done = threading.Event()

    def on_cand(c, p):
        got.append((c, p))
        done.set()

    fake = FakeRecorder()
    s = live.LiveSession(["TestChan"], on_cand, recorder_factory=lambda n: fake)
    # tlo: 8 okien po 10 s z 1 wiadomoscia, potem skok
    for w in range(8):
        fake.now = w * 10 + 1.0
        s._on_message("testchan", ChatMessage(t=0, user=f"u{w}", text="hej"))
    for i in range(30):
        fake.now = 85.0 + i * 0.1
        s._on_message("testchan", ChatMessage(t=0, user=f"fan{i}", text="LMAO KEKW"))
    fake.now = 130.0
    s._tick()                                   # zamyka okna, skok staje sie kandydatem
    fake.now = 200.0
    s._tick()
    assert s._cand_count["testchan"] == 1
    assert not done.wait(0.5)                   # bufor jeszcze nie doszedl do t_end
    fake.end = 500.0                            # teraz bufor zawiera t_end
    assert done.wait(5)
    s.stop()
    s._pool.shutdown(wait=True)
    cand, path = got[0]
    assert isinstance(cand, Candidate) and cand.channel == "testchan"
    assert path.parent == config.subdir("segments") / "testchan"
    assert path.name.startswith("testchan_live_") and path.exists()
    assert fake.extracted[0][:2] == (cand.t_start, cand.t_end)


def test_messages_before_first_segment_dropped(data_dir):
    fake = FakeRecorder(started=False)
    s = live.LiveSession(["a"], lambda c, p: None, recorder_factory=lambda n: fake)
    s._on_message("a", ChatMessage(t=0, user="u", text="hej"))
    assert len(s._recent["a"]) == 0
    s._tick()                                   # nie ma bledu bez startu nagrania
    s._pool.shutdown(wait=True)
