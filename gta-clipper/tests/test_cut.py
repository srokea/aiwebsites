"""Testy ciecia: syntetyczne wideo z ffmpeg, bez sieci."""
from __future__ import annotations

import subprocess

import pytest

from clipper import cut as cutmod
from clipper.models import Candidate


@pytest.fixture(scope="module")
def sample(tmp_path_factory):
    """20 s wideo testowego 640x360 @ 30 fps z dzwiekiem, klatka kluczowa co 1 s."""
    path = tmp_path_factory.mktemp("video") / "sample.mp4"
    proc = subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
         "-f", "lavfi", "-i", "testsrc=size=640x360:rate=30",
         "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100",
         "-t", "20", "-c:v", "libx264", "-preset", "ultrafast", "-g", "30",
         "-pix_fmt", "yuv420p", "-c:a", "aac", str(path)],
        capture_output=True, text=True,
    )
    assert proc.returncode == 0, proc.stderr
    return path


def test_probe(sample):
    info = cutmod.probe(sample)
    assert info["width"] == 640
    assert info["height"] == 360
    assert info["fps"] == pytest.approx(30, abs=0.1)
    assert info["duration"] == pytest.approx(20, abs=0.5)
    assert info["has_audio"] is True


def test_probe_missing_file(tmp_path):
    with pytest.raises(FileNotFoundError):
        cutmod.probe(tmp_path / "nie_ma.mp4")


def test_cut_copy(sample, tmp_path):
    out = cutmod.cut(sample, 5, 12, tmp_path / "a" / "b" / "copy.mp4")
    assert out.exists()
    assert cutmod.probe(out)["duration"] == pytest.approx(7, abs=1.0)


def test_cut_reencode(sample, tmp_path):
    out = cutmod.cut(sample, 5.5, 12.0, tmp_path / "reenc.mp4", reencode=True)
    info = cutmod.probe(out)
    assert info["duration"] == pytest.approx(6.5, abs=0.2)
    assert info["has_audio"] is True


def test_cut_empty_range(sample, tmp_path):
    with pytest.raises(ValueError):
        cutmod.cut(sample, 10, 10, tmp_path / "x.mp4")


def test_has_nvenc_is_bool():
    assert isinstance(cutmod.has_nvenc(), bool)


def test_video_encoder_args():
    args = cutmod.video_encoder_args(21)
    assert args[0] == "-c:v"
    assert args[1] in ("h264_nvenc", "libx264")
    assert args[-1] == "21"


def test_segment_for_local_file(sample, tmp_path, monkeypatch):
    monkeypatch.setenv("CLIPPER_DATA_DIR", str(tmp_path / "data"))
    # plik lokalny zaczyna sie w t=100 s, kandydat to 104-112 s nagrania
    cand = Candidate(channel="TestChan", t_peak=108, score=5.0, t_start=104.7, t_end=112.7)
    seg = cutmod.segment_for(cand, local_file=sample, offset=100.0)
    assert seg.candidate is cand
    assert seg.path == tmp_path / "data" / "segments" / "testchan" / "testchan_104.mp4"
    assert cutmod.probe(seg.path)["duration"] == pytest.approx(8, abs=1.0)

    # drugi raz: plik istnieje, wiec nic nie jest ciete ponownie
    def boom(*a, **k):
        raise AssertionError("cut nie powinien byc wywolany")

    monkeypatch.setattr(cutmod, "cut", boom)
    again = cutmod.segment_for(cand, local_file=sample, offset=100.0)
    assert again.path == seg.path


def test_segment_for_requires_one_source(sample):
    cand = Candidate(channel="x", t_peak=1, score=1, t_start=0, t_end=2)
    with pytest.raises(ValueError):
        cutmod.segment_for(cand)
    with pytest.raises(ValueError):
        cutmod.segment_for(cand, vod_url="https://www.twitch.tv/videos/1", local_file=sample)
