import random

import pytest

from clipper.detect.spikes import DetectorConfig, SpikeDetector, detect, top, weight
from clipper.models import Candidate, ChatMessage

NEUTRAL = ["nice", "ok", "that was good", "hello chat", "where is he going",
           "this mission again", "hmm", "true", "good morning", "he is driving"]


def background(per_window=3, duration=600.0, seed=1, window=10.0):
    """Rowne tlo: dokladnie `per_window` wiadomosci w kazdym oknie."""
    rng = random.Random(seed)
    msgs = []
    for k in range(int(duration / window)):
        for _ in range(per_window):
            t = k * window + rng.uniform(0, window - 0.01)
            msgs.append(ChatMessage(t, f"user{rng.randrange(100000)}", rng.choice(NEUTRAL)))
    return msgs


def burst(t0, n=60, texts=("LMAO", "KEKW"), kind="msg", span=8.0, seed=2, user=None):
    rng = random.Random(seed + int(t0))
    return [
        ChatMessage(t0 + rng.uniform(0, span), user or f"hype{t0:.0f}_{i}", texts[i % len(texts)], kind)
        for i in range(n)
    ]


def by_time(msgs):
    return sorted(msgs, key=lambda m: m.t)


# --- wagi ---------------------------------------------------------------------

@pytest.mark.parametrize("text,expected", [
    ("hello there", 1.0),
    ("lmao", 2.0),
    ("that was a clip", 2.0),
    ("no way", 2.0),
    ("CLIP IT", 2.5),
    ("KEKW", 2.5),
    ("xddd", 2.0),
    ("co xd", 2.0),
    ("hahaha", 2.0),
    ("what???", 2.0),
    ("\U0001F480", 2.0),
    ("W", 2.0),
    ("W stream", 2.0),
    ("jestem w domu", 1.0),          # male "w" to przyimek, nie hype
    ("slow walk", 1.0),              # "W"/"L" tylko jako cale tokeny
    ("lolly", 1.0),
    ("WHAT IS THIS", 1.5),
    ("OK", 1.0),                     # za malo liter na bonus za caps
    ("!drop", 0.0),
])
def test_weight(text, expected):
    assert weight(ChatMessage(0, "viewer", text)) == expected


def test_weight_system_and_bots():
    assert weight(ChatMessage(0, "viewer", "LMAO", kind="system")) == 0.0
    assert weight(ChatMessage(0, "Nightbot", "LMAO")) == 0.0
    assert weight(ChatMessage(0, "StreamElements", "hello")) == 0.0


# --- detekcja -------------------------------------------------------------------

def test_single_burst():
    cands = detect(background() + burst(400), "chan")
    assert len(cands) == 1
    c = cands[0]
    assert isinstance(c, Candidate)
    assert c.channel == "chan" and c.source == "chat"
    assert c.t_peak == pytest.approx(405.0)
    assert c.t_start == pytest.approx(405.0 - 5.0 - 20.0)
    assert c.t_end == pytest.approx(405.0 + 5.0 + 45.0)
    assert c.score >= 3.0
    assert 0 < len(c.sample) <= 15
    assert all(s in ("LMAO", "KEKW") for s in c.sample)      # wazone maja pierwszenstwo


def test_preroll_postroll_and_clamp():
    cands = detect(background() + burst(70), "chan", preroll=100.0, postroll=10.0)
    assert len(cands) == 1
    assert cands[0].t_start == 0.0
    assert cands[0].t_end == pytest.approx(75.0 + 5.0 + 10.0)


def test_system_burst_ignored():
    msgs = background() + burst(400, texts=("gifted a Tier 1 sub!",), kind="system")
    assert detect(msgs, "chan") == []


def test_bot_command_burst_ignored():
    assert detect(background() + burst(400, texts=("!drop",)), "chan") == []


def test_bot_user_burst_ignored():
    assert detect(background() + burst(400, user="Nightbot"), "chan") == []


def test_single_user_spam_ignored():
    # 60 wiadomosci jednego usera liczy sie jak 2: 3 (tlo) + 2 * 2.0 < 8
    assert detect(background() + burst(400, texts=("lmao",), user="spammer"), "chan") == []


def test_dead_chat_does_not_trigger():
    # 3 wiadomosci po dlugiej ciszy to duzy z-score, ale ponizej progu bezwzglednego
    msgs = [ChatMessage(400 + i, f"u{i}", "hello") for i in range(3)]
    assert detect(msgs, "chan") == []


def test_no_detection_before_baseline_ready():
    assert detect(background() + burst(30), "chan") == []


def test_two_bursts_close_merge():
    cands = detect(background() + burst(400, n=40) + burst(420, n=80), "chan")
    assert len(cands) == 1
    assert cands[0].t_peak == pytest.approx(425.0)           # zostaje mocniejszy szczyt


def test_two_bursts_far_apart():
    cands = detect(background(duration=900) + burst(400) + burst(700), "chan")
    assert [c.t_peak for c in cands] == pytest.approx([405.0, 705.0])


def test_cooldown_drops_second():
    # 50 s odstepu: za daleko na zlanie (30 s), za blisko na nowego kandydata (60 s)
    cands = detect(background() + burst(400) + burst(450), "chan")
    assert [c.t_peak for c in cands] == pytest.approx([405.0])


def test_big_streamer_no_burst():
    rng = random.Random(7)
    msgs = [ChatMessage(rng.uniform(0, 600), f"user{rng.randrange(100000)}", rng.choice(NEUTRAL))
            for _ in range(3000)]
    assert detect(msgs, "chan") == []


def test_big_streamer_with_burst():
    rng = random.Random(7)
    msgs = [ChatMessage(rng.uniform(0, 600), f"user{rng.randrange(100000)}", rng.choice(NEUTRAL))
            for _ in range(3000)]
    cands = detect(msgs + burst(400, n=150), "chan")
    assert [c.t_peak for c in cands] == pytest.approx([405.0])


def test_streaming_matches_batch():
    msgs = by_time(background(duration=900) + burst(400) + burst(420, n=30) + burst(700))
    det = SpikeDetector("chan")
    streamed = []
    for m in msgs:
        streamed.extend(det.feed(m))
    streamed.extend(det.flush())
    assert streamed == detect(msgs, "chan")
    assert len(streamed) == 2


def test_feed_emits_after_merge_gap():
    det = SpikeDetector("chan")
    emitted_at = None
    for m in by_time(background() + burst(400)):
        out = det.feed(m)
        if out:
            assert emitted_at is None
            emitted_at = m.t
    # ostatnie okno, ktore moglo sie zlac, konczy sie w t=440
    assert emitted_at is not None and 440.0 <= emitted_at < 450.0
    assert det.flush() == []


def test_tick_emits_when_chat_goes_silent():
    det = SpikeDetector("chan")
    out = []
    for m in by_time([m for m in background() if m.t < 400] + burst(400)):
        out.extend(det.feed(m))
    assert out == []
    assert det.tick(430.0) == []
    out = det.tick(440.0)
    assert len(out) == 1 and out[0].t_peak == pytest.approx(405.0)
    assert det.tick(2000.0) == []
    assert det.flush() == []


def test_long_silence_then_activity():
    det = SpikeDetector("chan")
    assert det.tick(1_000_000.0) == []
    out = []
    for m in burst(1_000_000.0):
        out.extend(det.feed(m))
    out.extend(det.flush())
    assert len(out) == 1


def test_custom_config():
    cfg = DetectorConfig(z_threshold=1000.0)
    assert detect(background() + burst(400), "chan", cfg) == []


def test_top():
    cands = [Candidate("c", t, s, t - 25, t + 50) for t, s in [(100, 5), (200, 9), (300, 4), (400, 7)]]
    assert [c.t_peak for c in top(cands, 2)] == [200, 400]
    assert [c.t_peak for c in top(cands, 10)] == [100, 200, 300, 400]
    assert top(cands, 0) == []
