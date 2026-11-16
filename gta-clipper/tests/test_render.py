"""Testy renderu: napisy ASS, wybor okna, graf filtrow i pelny render obu ukladow."""
from __future__ import annotations

import importlib
import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest

from clipper.config import Layout
from clipper.models import Candidate, Segment, Word
from clipper.render.captions import (build_ass, burnable_text, disclosure_events, font_family,
                                     title_anchor, wrap_title)
from clipper.render.layout import build_filter
from clipper.render.pick import pick_window

render_mod = importlib.import_module("clipper.render.render")
transcribe_mod = importlib.import_module("clipper.render.transcribe")

TIME_RE = re.compile(r"^(\d+):(\d\d):(\d\d)\.(\d\d)$")


def _secs(stamp: str) -> float:
    m = TIME_RE.match(stamp)
    assert m, stamp
    h, mi, s, cs = (int(g) for g in m.groups())
    return h * 3600 + mi * 60 + s + cs / 100


def _words(n: int, start: float = 0.0, step: float = 0.35, pause_every: int = 0) -> list[Word]:
    out, t = [], start
    for i in range(n):
        out.append(Word(start=t, end=t + step * 0.8, text=f"word{i}"))
        t += step
        if pause_every and (i + 1) % pause_every == 0:
            t += 0.9
    return out


def _dialogues(path: Path) -> list[list[str]]:
    return [ln.split(",", 9) for ln in path.read_text(encoding="utf-8").splitlines()
            if ln.startswith("Dialogue:")]


# ---------- napisy ----------

def test_build_ass_events(tmp_path):
    words = [
        Word(9.0, 9.4, "before"),              # przed oknem: odpada
        Word(10.0, 10.3, "hello"),
        Word(10.4, 10.8, "{wor}ld"),
        Word(11.0, 11.2, "back\\slash"),
        Word(14.0, 14.5, " last "),            # po dlugiej pauzie
        Word(31.0, 31.2, "after"),             # za oknem: odpada
    ]
    out = build_ass(words, tmp_path / "c.ass", t0=10.0, t1=30.0)
    text = out.read_text(encoding="utf-8")
    assert "[Script Info]" in text and "[V4+ Styles]" in text and "[Events]" in text
    assert "PlayResX: 1080" in text and "PlayResY: 1920" in text
    assert "&H0000FFFF" in text                       # zolty (BGR)
    assert font_family() in text

    rows = _dialogues(out)
    assert len(rows) == 4
    starts = [_secs(r[1]) for r in rows]
    ends = [_secs(r[2]) for r in rows]
    assert starts == pytest.approx([0.0, 0.4, 1.0, 4.0], abs=0.011)
    assert starts == sorted(starts)
    assert all(e > s for s, e in zip(starts, ends))
    assert all(ends[i] <= starts[i + 1] + 1e-6 for i in range(3))   # bez nakladania
    assert ends[2] == pytest.approx(1.2 + 0.6, abs=0.011)           # przerwa obcieta do 0.6 s
    assert ends[3] <= 20.0

    payloads = [r[9] for r in rows]
    assert all(p.startswith("{\\an5\\pos(540,1200)") for p in payloads)
    assert all("\\t(0,80,\\fscx100\\fscy100)" in p for p in payloads)
    spoken = [p.split("}", 1)[1] for p in payloads]
    assert spoken[0] == "HELLO"
    assert spoken[3] == "LAST"
    for s in spoken:                                   # znaki specjalne zneutralizowane
        assert "{" not in s and "}" not in s and "\\" not in s
    assert "Disclosure,," not in text.split("[Events]")[1]


def test_build_ass_disclosure_and_groups(tmp_path):
    words = _words(6, start=1.0)
    out = build_ass(words, tmp_path / "d.ass", t0=0.0, t1=10.0, max_words=3, disclosure="#ad {x}")
    rows = _dialogues(out)
    disc = [r for r in rows if r[3] == "Disclosure"]
    assert len(disc) == 1
    assert _secs(disc[0][1]) == 0.0 and _secs(disc[0][2]) == pytest.approx(3.0)
    assert disc[0][9].startswith("#ad") and "{" not in disc[0][9]
    captions = [r for r in rows if r[3] == "Word"]
    assert len(captions) == 2
    assert captions[0][9].endswith("WORD0 WORD1 WORD2")
    assert disclosure_events("", 3.0) == []


def test_build_ass_shrinks_long_word(tmp_path):
    out = build_ass([Word(0.0, 1.0, "supercalifragilistic")], tmp_path / "l.ass", t0=0.0, t1=5.0)
    assert "\\fs" in _dialogues(out)[0][9].replace("\\fscx", "").replace("\\fscy", "")


def test_build_ass_rejects_empty_window(tmp_path):
    with pytest.raises(ValueError):
        build_ass([], tmp_path / "e.ass", t0=5.0, t1=5.0)


# ---------- tytul na ekranie ----------

def _title_row(path: Path) -> list[str]:
    rows = [r for r in _dialogues(path) if r[3] == "Title"]
    assert len(rows) == 1
    return rows[0]


def test_title_event_present_whole_clip_not_uppercased(tmp_path):
    out = build_ass(_words(4, start=1.0), tmp_path / "t.ass", t0=0.0, t1=20.0, title="Cop Gets Rammed By Partner")
    row = _title_row(out)
    assert _secs(row[1]) == 0.0 and _secs(row[2]) == pytest.approx(20.0)
    assert row[9].replace("\\N", " ").endswith("Cop Gets Rammed By Partner")   # bez upper()
    assert "Style: Title," in out.read_text(encoding="utf-8")
    none = build_ass([], tmp_path / "n.ass", t0=0.0, t1=5.0)
    assert not [r for r in _dialogues(none) if r[3] == "Title"]


def test_title_position_differs_by_layout(tmp_path):
    blur_an, blur_y = title_anchor(Layout())
    cam_an, cam_y = title_anchor(Layout(facecam=(0, 0, 320, 180), facecam_ratio=0.35))
    assert blur_y == 410 and cam_y > 672 and cam_y != blur_y
    for an, y in ((blur_an, blur_y), (cam_an, cam_y)):
        out = build_ass([], tmp_path / f"p{y}.ass", t0=0.0, t1=5.0, title="Taxi vs Truck", title_an=an, title_y=y)
        assert f"\\an{an}\\pos(540,{y})" in _title_row(out)[9]


def test_title_wraps_to_two_lines_max(tmp_path):
    long = "Jet Ski Jump Over the Bridge Fails Hard"
    lines, size = wrap_title(long, font_family(), 78, 900)
    assert 1 <= len(lines) <= 2 and size <= 78 and " ".join(lines) == long
    out = build_ass([], tmp_path / "w.ass", t0=0.0, t1=5.0, title=long)
    assert _title_row(out)[9].count("\\N") <= 1
    lines, _ = wrap_title("Supercalifragilistic Expialidocious Words Everywhere Today", font_family(), 78, 900)
    assert len(lines) <= 2


def test_title_does_not_overlap_disclosure(tmp_path):
    # kamerka bardzo niska: szew wypada w pasie oznaczenia reklamy, tytul musi zejsc nizej
    an, y = title_anchor(Layout(facecam=(0, 0, 320, 180), facecam_ratio=0.1))
    out = build_ass([], tmp_path / "o.ass", t0=0.0, t1=10.0, title="When the getaway car won't start",
                    disclosure="#ad", title_an=an, title_y=y)
    m = re.search(r"\\pos\(540,(\d+)\)", _title_row(out)[9])
    assert m and int(m.group(1)) >= 1920 * 0.09 + 44 * 1.3 + 3     # pod dolna krawedzia "#ad"
    # rozmyte tlo: tytul jest i tak pod oznaczeniem
    an, y = title_anchor(Layout())
    out = build_ass([], tmp_path / "o2.ass", t0=0.0, t1=10.0, title="Two Lines Title That Needs Wrapping Here",
                    disclosure="#ad", title_an=an, title_y=y)
    assert f"\\pos(540,{y})" in _title_row(out)[9]


def test_burnable_text_strips_emoji_only():
    assert burnable_text("Cop chase \U0001F602 ends") == "Cop chase ends"
    assert burnable_text("Zażółć gęślą") == "Zażółć gęślą"


# ---------- wybor okna ----------

@pytest.mark.parametrize("words", [
    [],
    _words(200),                               # gadanie bez przerw
    _words(200, pause_every=7),                # zdania z pauzami
    _words(10, start=50.0),                    # mowa tylko wokol spike'a
    _words(5, start=2.0),                      # mowa tylko na poczatku
])
@pytest.mark.parametrize("dur,peak", [(75.0, 30.0), (75.0, 2.0), (75.0, 74.0), (90.0, 45.0), (20.0, 10.0), (300.0, 150.0)])
def test_pick_window_invariants(words, dur, peak):
    s, e = pick_window(words, dur, peak=peak)
    assert 0.0 <= s < e <= dur
    assert 18.0 - 1e-6 <= e - s <= 35.0 + 1e-6


def test_pick_window_hard_cap_and_defaults():
    s, e = pick_window(_words(300), 200.0, peak=100.0, min_len=10.0, max_len=90.0)
    assert e - s <= 45.0 + 1e-6                          # twardy sufit
    s, e = pick_window(_words(300), 200.0, peak=100.0)
    assert 18.0 - 1e-6 <= e - s <= 35.0 + 1e-6


def test_pick_window_empty_is_fixed():
    assert pick_window([], 90.0, peak=45.0) == (20.0, 53.0)


def test_pick_window_uses_pauses():
    words = _words(200, pause_every=7)
    s, e = pick_window(words, 90.0, peak=45.0)
    assert s < 45.0 - 2.0 and e >= 48.0
    assert abs(s - 20.0) <= 8.0                # start blisko peak - 25
    # start tuz przed slowem zaczynajacym zdanie, koniec tuz po slowie konczacym zdanie
    assert any(0.0 <= w.start - s <= 0.2 for w in words)
    assert any(0.0 <= e - w.end <= 0.35 for w in words)


def test_pick_window_short_segment_returns_all():
    assert pick_window([], 8.0, peak=4.0) == (0.0, 8.0)


# ---------- graf filtrow ----------

def test_build_filter_facecam():
    f = build_filter(1280, 720, Layout(facecam=(0, 0, 320, 180)), "captions.ass")
    assert "vstack" in f and "boxblur" not in f
    assert "crop=320:180:0:0" in f
    assert "crop=1080:672" in f and "crop=1080:1248" in f      # 35% / 65% z 1920
    assert "ass=captions.ass:fontsdir=fonts" in f
    assert "fps=30" in f and "format=yuv420p" in f and f.endswith("[v]")


def test_build_filter_blur():
    f = build_filter(1920, 1080, Layout(), None)
    assert "boxblur" in f and "vstack" not in f and "overlay" in f
    assert "scale=1622:912" in f or "scale=1620:912" in f       # 150% szerokosci, 16:9
    assert "ass=" not in f
    assert "fps=30" in f and "format=yuv420p" in f and f.endswith("[v]")


def test_build_filter_rejects_bad_input():
    with pytest.raises(ValueError):
        build_filter(1280, 720, Layout(), "C:\\tmp\\captions.ass")
    with pytest.raises(ValueError):
        build_filter(1280, 720, Layout(facecam=(5000, 0, 10, 10)), None)


# ---------- transkrypcja (bez modelu) ----------

def test_words_text():
    words = [Word(0.0, 0.5, "a"), Word(1.0, 1.5, "b"), Word(2.0, 2.5, "c")]
    assert transcribe_mod.words_text(words, 1.0, 2.0) == "b"
    assert transcribe_mod.words_text(words, 0.0, 9.0) == "a b c"


# ---------- pelny render ----------

needs_ffmpeg = pytest.mark.skipif(shutil.which("ffmpeg") is None or shutil.which("ffprobe") is None,
                                  reason="brak ffmpeg/ffprobe na PATH")


@pytest.fixture(scope="module")
def sample_video(tmp_path_factory) -> Path:
    path = tmp_path_factory.mktemp("src") / "sample.mp4"
    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
           "-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=30:duration=30",
           "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=30",
           "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
           "-c:a", "aac", "-shortest", str(path)]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    assert proc.returncode == 0, proc.stderr[-2000:]
    return path


def _ffprobe(path: Path) -> dict:
    proc = subprocess.run(["ffprobe", "-v", "error", "-show_format", "-show_streams", "-of", "json", str(path)],
                          capture_output=True, text=True)
    assert proc.returncode == 0, proc.stderr[-2000:]
    return json.loads(proc.stdout)


@needs_ffmpeg
@pytest.mark.parametrize("layout", [Layout(), Layout(facecam=(40, 40, 320, 240), gameplay=(0, 0, 1280, 720))],
                         ids=["blur", "facecam"])
def test_render_end_to_end(layout, sample_video, tmp_path, monkeypatch):
    monkeypatch.setenv("CLIPPER_DATA_DIR", str(tmp_path / "data"))
    fake = _words(60, start=0.5, step=0.45, pause_every=6)
    calls = []

    def fake_transcribe(path, lang="en"):
        calls.append((Path(path), lang))
        return fake

    monkeypatch.setattr(render_mod, "transcribe", fake_transcribe)
    cand = Candidate(channel="tester", t_peak=1024.0, score=4.2, t_start=1000.0, t_end=1030.0, sample=["KEKW", "LUL"])
    clip = render_mod.render_clip(Segment(candidate=cand, path=sample_video), layout, disclosure="#ad",
                                  title="Taxi Driver vs Armored Truck")

    assert len(calls) == 1
    side = json.loads(clip.path.with_suffix(".json").read_text(encoding="utf-8"))
    w0, w1 = side["window"]
    assert 18.0 <= w1 - w0 <= 35.0
    assert clip.path.is_file()
    assert clip.path.parent == tmp_path / "data" / "clips" / "tester"
    assert clip.path.name == f"tester_{int(1000.0 + w0)}.mp4"
    assert clip.channel == "tester" and clip.t_start == pytest.approx(1000.0 + w0)
    assert side["title"] == "Taxi Driver vs Armored Truck"
    assert side["transcript"] and side["candidate"]["score"] == 4.2 and side["candidate"]["sample"] == ["KEKW", "LUL"]
    assert not list((tmp_path / "data" / "work").iterdir())      # katalog roboczy posprzatany

    info = _ffprobe(clip.path)
    video = next(s for s in info["streams"] if s["codec_type"] == "video")
    assert (video["width"], video["height"]) == (1080, 1920)
    assert video["pix_fmt"] == "yuv420p"
    num, den = video["avg_frame_rate"].split("/")
    assert int(num) / int(den) == pytest.approx(30.0, abs=0.5)
    assert any(s["codec_type"] == "audio" for s in info["streams"])
    assert float(info["format"]["duration"]) == pytest.approx(w1 - w0, abs=0.3)
    assert clip.duration == pytest.approx(w1 - w0, abs=0.3)
