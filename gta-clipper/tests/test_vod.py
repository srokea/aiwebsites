"""Testy zrodla VOD. Testy sieciowe tylko z CLIPPER_NETWORK_TESTS=1."""
from __future__ import annotations

import json
import os

import pytest

from clipper.models import ChatMessage
from clipper.sources import vod

network = pytest.mark.skipif(
    os.environ.get("CLIPPER_NETWORK_TESTS") != "1",
    reason="test sieciowy; ustaw CLIPPER_NETWORK_TESTS=1",
)
# URL prawdziwego VOD-a do testow sieciowych (VOD-y znikaja, wiec mozna go podmienic)
NETWORK_VOD_URL = os.environ.get("CLIPPER_TEST_VOD_URL", "")


@pytest.mark.parametrize("url,video_id", [
    ("https://www.twitch.tv/videos/2345678901", "2345678901"),
    ("https://www.twitch.tv/videos/2345678901?t=1h2m3s", "2345678901"),
    ("https://www.twitch.tv/videos/2345678901/", "2345678901"),
    ("http://twitch.tv/videos/123", "123"),
    ("https://m.twitch.tv/videos/123?filter=archives&sort=time", "123"),
    ("https://www.twitch.tv/somechannel/v/123", "123"),
    ("  https://www.twitch.tv/videos/123  ", "123"),
])
def test_parse_vod_url_ok(url, video_id):
    assert vod.parse_vod_url(url) == ("twitch", video_id)


@pytest.mark.parametrize("url", [
    "",
    "https://www.twitch.tv/somechannel",
    "https://www.twitch.tv/somechannel/clip/FunnyClip-abc",
    "https://clips.twitch.tv/FunnyClip-abc",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://kick.com/video/123",
    "https://www.twitch.tv/videos/abc",
    "https://evil.example/https://www.twitch.tv/videos/123",
])
def test_parse_vod_url_rejects(url):
    with pytest.raises(ValueError):
        vod.parse_vod_url(url)


def test_load_chat_round_trip(tmp_path):
    fixture = [
        {"t": 1.5, "user": "alice", "text": "LUL", "kind": "msg"},
        {"t": 2.0, "user": "bob", "text": "zazolc gesla jazn", "kind": "msg"},
        {"t": 3.25, "user": "carol", "text": "subscribed at Tier 1", "kind": "system"},
        {"t": 4, "user": "dave", "text": "bez pola kind"},
    ]
    path = tmp_path / "chat.json"
    path.write_text(json.dumps(fixture), encoding="utf-8")

    msgs = vod.load_chat(path)
    assert [m.user for m in msgs] == ["alice", "bob", "carol", "dave"]
    assert msgs[0] == ChatMessage(t=1.5, user="alice", text="LUL", kind="msg")
    assert msgs[2].kind == "system"
    assert msgs[3].kind == "msg" and isinstance(msgs[3].t, float)

    out = tmp_path / "sub" / "chat2.json"
    vod.save_chat(msgs, out)
    assert vod.load_chat(out) == msgs


def test_download_chat_uses_cache(tmp_path, monkeypatch):
    path = tmp_path / "chat.json"
    path.write_text(json.dumps([{"t": 1, "user": "a", "text": "hi", "kind": "msg"}]), encoding="utf-8")

    def boom(*a, **k):
        raise AssertionError("siec nie powinna byc uzyta, gdy jest cache")

    monkeypatch.setattr(vod, "_chat_via_chat_downloader", boom)
    monkeypatch.setattr(vod, "_chat_via_gql", boom)
    msgs = vod.download_chat("https://www.twitch.tv/videos/123", path)
    assert msgs == [ChatMessage(t=1.0, user="a", text="hi", kind="msg")]


def test_download_chat_falls_back_to_gql(tmp_path, monkeypatch):
    def broken(url):
        raise RuntimeError("stara biblioteka")

    monkeypatch.setattr(vod, "_chat_via_chat_downloader", broken)
    monkeypatch.setattr(vod, "_chat_via_gql", lambda vid: [
        ChatMessage(t=9.0, user="b", text="drugi"), ChatMessage(t=3.0, user="a", text="pierwszy"),
    ])
    path = tmp_path / "chat.json"
    msgs = vod.download_chat("https://www.twitch.tv/videos/123", path)
    assert [m.t for m in msgs] == [3.0, 9.0]
    assert vod.load_chat(path) == msgs


def test_gql_node_mapping():
    node = {
        "id": "x", "contentOffsetSeconds": 42,
        "commenter": {"login": "alice", "displayName": "Alice"},
        "message": {"fragments": [{"text": "hej "}, {"text": "Kappa"}], "userNoticeParams": None},
    }
    assert vod._gql_node_to_message(node) == ChatMessage(t=42.0, user="alice", text="hej Kappa", kind="msg")
    node["message"]["userNoticeParams"] = {"msgID": "resub"}
    node["commenter"] = None  # usuniete konto
    msg = vod._gql_node_to_message(node)
    assert msg.kind == "system" and msg.user == ""


def test_kind_from_type():
    assert vod._kind_from_type("text_message") == "msg"
    assert vod._kind_from_type(None) == "msg"
    for mt in ("subscription", "resubscription", "subscription_gift", "mystery_subscription_gift", "raid"):
        assert vod._kind_from_type(mt) == "system"
    assert vod._kind_from_type("text_message", has_bits=True) == "system"


def test_quality_to_format():
    assert vod._max_height_from_quality("720p,720p60,best") == 720
    assert vod._max_height_from_quality("1080p60,best") == 1080
    assert vod._max_height_from_quality("best") is None
    assert "height<=720" in vod._format_selector(720)
    assert "height" not in vod._format_selector(None)


def test_download_range_rejects_empty_range(tmp_path):
    with pytest.raises(ValueError):
        vod.download_range("https://www.twitch.tv/videos/123", 10, 10, tmp_path / "x.mp4")


@network
@pytest.mark.skipif(not NETWORK_VOD_URL, reason="ustaw CLIPPER_TEST_VOD_URL na istniejacy VOD")
def test_network_vod_info_and_range(tmp_path):
    from clipper.cut import probe

    info = vod.vod_info(NETWORK_VOD_URL)
    assert info["id"] == vod.parse_vod_url(NETWORK_VOD_URL)[1]
    assert info["channel"] and info["channel"] == info["channel"].lower()
    assert info["duration"] > 60

    out = vod.download_range(NETWORK_VOD_URL, 30, 40, tmp_path / "r.mp4")
    meta = probe(out)
    assert meta["duration"] == pytest.approx(10, abs=2)
    assert meta["height"] <= 720
