import json
import logging

import pytest
import requests

from clipper import brain


class FakeResp:
    def __init__(self, content=None, status=200, body=None):
        self.status_code = status
        self._body = body if body is not None else {"message": {"role": "assistant", "content": content}}

    def raise_for_status(self):
        if self.status_code >= 400:
            raise requests.HTTPError(f"{self.status_code}")

    def json(self):
        if isinstance(self._body, Exception):
            raise self._body
        return self._body


@pytest.fixture
def ollama(monkeypatch):
    """Podmienia requests.post; `replies` to kolejka odpowiedzi (albo wyjatkow)."""
    monkeypatch.setenv("OLLAMA_URL", "http://localhost:11434")
    monkeypatch.setenv("OLLAMA_MODEL", "qwen2.5:7b")
    calls, replies = [], []

    def fake_post(url, json=None, timeout=None, **kw):
        calls.append({"url": url, "json": json, "timeout": timeout})
        item = replies.pop(0)
        if isinstance(item, Exception):
            raise item
        return item

    monkeypatch.setattr(brain.requests, "post", fake_post)
    return calls, replies


GOOD = {
    "title": "Cop chase ends in the ocean",
    "description": "He tried to lose the cops and drove straight off the pier.",
    "hashtags": ["#GTAVI", "gta 6", "funny", "police", "fail", "twitch"],
    "score": 8,
    "reason": "Chat exploded with laughter.",
}


def test_clean_json_and_request_shape(ollama):
    calls, replies = ollama
    replies.append(FakeResp(json.dumps(GOOD)))
    meta = brain.describe("oh no no no the pier", ["LUL", "OMEGALUL he drowned"], "streamer")
    assert meta.title == GOOD["title"] and meta.description == GOOD["description"]
    assert meta.hashtags == ["gta6", "gtavi", "gta", "shorts", "police"]
    assert meta.score == 8 and meta.reason == GOOD["reason"]

    assert len(calls) == 1
    call = calls[0]
    assert call["url"] == "http://localhost:11434/api/chat" and call["timeout"] == 120
    body = call["json"]
    assert body["model"] == "qwen2.5:7b" and body["format"] == "json" and body["stream"] is False
    assert body["options"] == {"temperature": 0.4, "num_ctx": 4096} and body["keep_alive"] == "2m"
    system, user = body["messages"]
    assert system["role"] == "system" and "leaks" in system["content"]
    assert "oh no no no the pier" in user["content"] and "- OMEGALUL he drowned" in user["content"]
    assert "Streamer: streamer" in user["content"] and "Game: GTA VI" in user["content"]


def test_fenced_json_with_chatter(ollama):
    calls, replies = ollama
    replies.append(FakeResp("Sure! Here you go:\n```json\n" + json.dumps(GOOD) + "\n```\nHope it helps"))
    meta = brain.describe("x", [], "streamer")
    assert meta.title == GOOD["title"] and meta.score == 8 and len(calls) == 1


def test_missing_keys_clamp_and_truncate(ollama):
    _, replies = ollama
    replies.append(FakeResp(json.dumps({"title": "A" * 90, "score": "15"})))
    meta = brain.describe("x", [], "streamer")
    assert len(meta.title) <= 40
    assert meta.score == 10
    assert meta.description                      # uzupelnione z zastepczych
    assert 4 <= len(meta.hashtags) <= 6
    assert meta.reason == ""

    replies.append(FakeResp(json.dumps({"title": "Ok", "score": -3, "hashtags": "gta, funny"})))
    meta = brain.describe("x", [], "streamer")
    assert meta.score == 0 and meta.hashtags[:4] == ["gta6", "gtavi", "gta", "shorts"] and 4 <= len(meta.hashtags) <= 6


def test_leaks_never_get_through(ollama):
    _, replies = ollama
    replies.append(FakeResp(json.dumps({**GOOD, "title": "GTA VI LEAK reaction",
                                        "hashtags": ["gta6leaks", "gta", "funny"]})))
    meta = brain.describe("x", [], "streamer")
    assert "leak" not in meta.title.lower()
    assert not any("leak" in h for h in meta.hashtags)


def test_empty_transcript_marked_in_prompt(ollama):
    calls, replies = ollama
    replies.append(FakeResp(json.dumps(GOOD)))
    brain.describe("", ["KEKW"], "streamer", game="GTA RP", lang="pl")
    user = calls[0]["json"]["messages"][1]["content"]
    assert "(empty)" in user and "Game: GTA RP" in user and "Output language: pl" in user


def test_garbage_twice_gives_fallback(ollama, caplog):
    calls, replies = ollama
    replies.extend([FakeResp("lol not json"), FakeResp('{"foo": 1}')])
    with caplog.at_level(logging.WARNING, logger="clipper.brain"):
        meta = brain.describe("x", ["LUL"], "streamer")
    assert len(calls) == 2
    assert meta.title == "Streamer GTA VI moment"
    assert meta.score == 5 and meta.reason == "fallback: brak LLM"
    assert "gtavi" in meta.hashtags and 4 <= len(meta.hashtags) <= 6
    assert any("zastepczych" in r.message for r in caplog.records)


def test_garbage_then_good_recovers(ollama):
    calls, replies = ollama
    replies.extend([FakeResp("", status=500), FakeResp(json.dumps(GOOD))])
    assert brain.describe("x", [], "streamer").title == GOOD["title"]
    assert len(calls) == 2


def test_unreachable_gives_fallback_without_retry(ollama, caplog):
    calls, replies = ollama
    replies.append(requests.ConnectionError("connection refused"))
    with caplog.at_level(logging.WARNING, logger="clipper.brain"):
        meta = brain.describe("x", ["LUL"], "streamer")
    assert len(calls) == 1
    assert meta.reason == "fallback: brak LLM" and meta.score == 5
    assert caplog.records


def test_available(monkeypatch):
    monkeypatch.setattr(brain.requests, "get", lambda url, timeout=None: FakeResp(status=200))
    assert brain.available() is True

    def boom(url, timeout=None):
        raise requests.ConnectionError("nope")
    monkeypatch.setattr(brain.requests, "get", boom)
    assert brain.available() is False


def test_unload(ollama):
    calls, replies = ollama
    replies.append(FakeResp(body={"done": True}))
    assert brain.unload() is True
    assert calls[0]["url"].endswith("/api/generate")
    assert calls[0]["json"] == {"model": "qwen2.5:7b", "keep_alive": 0}
    replies.append(requests.ConnectionError("nope"))
    assert brain.unload() is False


# ---------- hashtagi i tytul w kodzie ----------

def test_tags_gtav_removed_base_present():
    tags = brain.finish_tags(["#GTAV", "gta5", "gtaV", "GTA5RP", "heli", "bridge", "jetski", "funny", "gta6leaks"])
    assert tags[:4] == ["gta6", "gtavi", "gta", "shorts"]
    assert not any(t in tags for t in ("gtav", "gta5", "gta5rp", "funny"))
    assert tags[4:] == ["heli", "bridge"]                  # najwyzej 2 od modelu
    assert all(t == t.lower() and "#" not in t for t in tags)


def test_tags_rp_and_limits():
    tags = brain.finish_tags(["heli", "bridge", "jetski"], rp=True)
    assert tags[:4] == ["gtarp", "nopixel", "gta", "shorts"] and "gta6" not in tags and len(tags) == 6
    assert "gtarp" not in brain.finish_tags(["gtarp", "heli"], rp=False)
    tags = brain.finish_tags(["heli", "bridge"], rp=True, extra_tags=["lysium", "other"])
    assert len(tags) == 6 and "lysium" in tags
    assert 4 <= len(brain.finish_tags(None)) <= 6


def test_describe_passes_rp_to_tags(ollama):
    _, replies = ollama
    replies.append(FakeResp(json.dumps({**GOOD, "hashtags": ["gtav", "police"]})))
    meta = brain.describe("x", [], "streamer", rp=True)
    assert meta.hashtags == ["gtarp", "nopixel", "gta", "shorts", "police"]


def test_title_normalisation():
    assert brain.normalise_title("COP CHASE ENDS IN THE OCEAN WITH A HUGE SPLASH") == "Cop Chase Ends In The Ocean With A Huge"
    assert brain.normalise_title("GTA VI cop chase") == "GTA VI cop chase"
    t = brain.normalise_title("When the getaway car will not start at all today ok")
    assert len(t) <= 40 and not t.endswith(" ") and "When the getaway car will not start at all today ok".startswith(t)
    assert brain.normalise_title("x" * 90) == "x" * 40
    assert brain.normalise_title("Boom \U0001F602\U0001F602\U0001F602\U0001F602 crash").count("\U0001F602") == 2
    assert brain.normalise_title('"Taxi vs Truck"') == "Taxi vs Truck"
