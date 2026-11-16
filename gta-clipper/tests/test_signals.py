"""Testy sygnalu klipow widzow. Wylacznie zamockowany HTTP."""
from __future__ import annotations

import math

import pytest

from clipper.detect import signals
from clipper.models import Candidate


class FakeResp:
    def __init__(self, status=200, body=None, headers=None):
        self.status_code = status
        self._body = body if body is not None else {}
        self.headers = headers or {}
        self.text = str(self._body)

    def json(self):
        return self._body


class FakeHttp:
    """Zapisuje wywolania; odpowiedzi wg sciezki (lista = kolejne odpowiedzi)."""

    def __init__(self, routes):
        self.routes = {k: list(v) for k, v in routes.items()}
        self.calls = []

    def __call__(self, method, url, **kw):
        self.calls.append((method, url, kw))
        for key, queue in self.routes.items():
            if url.endswith(key):
                return queue.pop(0) if len(queue) > 1 else queue[0]
        raise AssertionError(f"nieoczekiwany URL {url}")

    def count(self, suffix):
        return sum(1 for _, u, _ in self.calls if u.endswith(suffix))


@pytest.fixture(autouse=True)
def _clean(monkeypatch):
    signals.reset_token()
    monkeypatch.setattr(signals, "env", lambda name, default="": {
        "TWITCH_CLIENT_ID": "id", "TWITCH_CLIENT_SECRET": "sekret"}.get(name, default))
    monkeypatch.setattr(signals.time, "sleep", lambda s: None)
    yield
    signals.reset_token()


TOKEN = FakeResp(200, {"access_token": "tok", "expires_in": 3600})


def install(monkeypatch, routes):
    http = FakeHttp(routes)
    monkeypatch.setattr(signals.requests, "request", http)
    return http


def test_brak_kluczy(monkeypatch):
    monkeypatch.setattr(signals, "env", lambda name, default="": "")
    with pytest.raises(signals.TwitchApiError, match="TWITCH_CLIENT_ID"):
        signals.get_token()


def test_token_cache(monkeypatch):
    http = install(monkeypatch, {
        "/token": [TOKEN],
        "/users": [FakeResp(200, {"data": [{"id": "42"}]})],
    })
    assert signals.user_id("Buddha") == "42"
    assert signals.user_id("buddha") == "42"
    assert http.count("/token") == 1


def test_token_wygasa(monkeypatch):
    http = install(monkeypatch, {"/token": [FakeResp(200, {"access_token": "t", "expires_in": 10})]})
    signals.get_token()
    signals.get_token()      # expires_in < zapas 60 s, wiec token od razu uznany za stary
    assert http.count("/token") == 2


def test_429_czeka_i_ponawia(monkeypatch):
    http = install(monkeypatch, {
        "/token": [TOKEN],
        "/users": [FakeResp(429, headers={"Ratelimit-Reset": "0"}),
                   FakeResp(200, {"data": [{"id": "7"}]})],
    })
    assert signals.user_id("x") == "7"
    assert http.count("/users") == 2


def test_blad_http(monkeypatch):
    install(monkeypatch, {"/token": [FakeResp(400, {})]})
    with pytest.raises(signals.TwitchApiError, match="HTTP 400"):
        signals.get_token()


@pytest.mark.parametrize("text,expected", [
    ("3s", 3), ("2m3s", 123), ("1h2m3s", 3723), ("10h", 36000), ("5m", 300)])
def test_parse_duration(text, expected):
    assert signals.parse_duration(text) == expected


def test_parse_duration_zly():
    with pytest.raises(ValueError):
        signals.parse_duration("abc")


def clip(vid, off, views=5, dur=30, title="t"):
    return {"video_id": vid, "vod_offset": off, "duration": dur, "view_count": views,
            "title": title, "url": "u", "created_at": "2026-01-01T00:00:00Z"}


def test_vod_clips_paginacja_i_filtr(monkeypatch):
    http = install(monkeypatch, {
        "/token": [TOKEN],
        "/videos": [FakeResp(200, {"data": [
            {"created_at": "2026-01-01T10:00:00Z", "duration": "1h2m3s"}]})],
        "/users": [FakeResp(200, {"data": [{"id": "42"}]})],
        "/clips": [
            FakeResp(200, {"data": [clip("1", 100), clip("2", 200), clip("1", None)],
                           "pagination": {"cursor": "abc"}}),
            FakeResp(200, {"data": [clip("1", 300, views=9)], "pagination": {}}),
        ],
    })
    out = signals.vod_clips("1", "buddha")
    assert [c["vod_offset"] for c in out] == [100, 300]
    assert http.count("/clips") == 2
    first, second = [c for c in http.calls if c[1].endswith("/clips")]
    assert "after" not in first[2]["params"]
    assert second[2]["params"]["after"] == "abc"
    # zakres dat: start VOD-a, koniec = start + 1h2m3s + margines 30 min
    assert first[2]["params"]["started_at"] == "2026-01-01T10:00:00Z"
    assert first[2]["params"]["ended_at"] == "2026-01-01T11:32:03Z"


def test_recent_clips_zostawia_pusty_offset(monkeypatch):
    install(monkeypatch, {
        "/token": [TOKEN],
        "/users": [FakeResp(200, {"data": [{"id": "42"}]})],
        "/clips": [FakeResp(200, {"data": [clip("1", None)], "pagination": {}})],
    })
    out = signals.recent_clips("buddha", 30)
    assert len(out) == 1 and out[0]["vod_offset"] is None and out[0]["created_at"]


# --- kandydaci ---------------------------------------------------------------

def test_clip_candidates_pola_i_skala():
    c = signals.clip_candidates([clip("1", 100, views=7, dur=20, title="hej")],
                                "buddha", preroll=20, postroll=40)[0]
    assert c.source == "viewer_clip"
    assert c.t_peak == 110
    assert c.t_start == 90          # 100 - 20/2
    assert c.t_end == 140           # 100 + 20 + 40/2
    assert c.score == pytest.approx(math.log2(8))
    assert c.sample == ["hej"]


def test_clip_candidates_t_start_nie_ujemny_i_min_views():
    cs = signals.clip_candidates([clip("1", 3, views=5), clip("1", 500, views=0)],
                                 "b", 20, 40, min_views=1)
    assert len(cs) == 1 and cs[0].t_start == 0


def test_clip_candidates_zlewa_bliskie():
    cs = signals.clip_candidates(
        [clip("1", 100, views=3, title="a"), clip("1", 120, views=12, title="b"),
         clip("1", 400, views=1)], "b", 20, 40)
    assert len(cs) == 2
    assert cs[0].score == pytest.approx(math.log2(16))    # 3 + 12
    assert cs[0].sample == ["b"]                          # tytul najpopularniejszego
    assert cs[0].t_start == 90


def cand(t, score=5.0, start=None, src="chat"):
    return Candidate(channel="b", t_peak=t, score=score,
                     t_start=t - 20 if start is None else start, t_end=t + 45,
                     sample=["x"], source=src)


def test_merge_podbija_i_zostawia_niedopasowane():
    chat = [cand(100, 5.0), cand(1000, 6.0)]
    clips = [cand(130, 2.0, start=95, src="viewer_clip"),
             cand(5000, 3.0, src="viewer_clip")]
    out = signals.merge(chat, clips, window=45)
    assert [c.t_peak for c in out] == [100, 1000, 5000]
    both, chat_only, clip_only = out
    assert both.source == "both" and both.score == 8.0
    assert both.t_start == 80                 # wczesniejszy z (80, 95)
    assert chat_only.source == "chat" and chat_only.score == 6.0
    assert clip_only.source == "viewer_clip"
    assert chat[0].score == 5.0               # wejscie nietkniete


def test_merge_poza_oknem():
    out = signals.merge([cand(100)], [cand(200, src="viewer_clip")], window=45)
    assert [c.source for c in out] == ["chat", "viewer_clip"]


def test_compare_hit_rate():
    clips = [clip("1", 100 + i * 1000, views=100 - i, dur=20) for i in range(12)]
    chat = [cand(110), cand(1110), cand(2110), cand(3110)]    # trafia 4 pierwsze
    rep = signals.compare(chat, clips)
    assert rep["checked"] == 10 and rep["clips_total"] == 12
    assert len(rep["hits"]) == 4 and len(rep["misses"]) == 6
    assert rep["hit_rate"] == pytest.approx(0.4)
    assert rep["hits"][0]["vod_offset"] == 100


def test_compare_bez_klipow():
    rep = signals.compare([cand(1)], [])
    assert rep["hit_rate"] == 0.0 and rep["checked"] == 0
