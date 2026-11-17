import base64
import json

import pytest

from clipper import approve
from clipper.models import ClipMeta


class FakeResp:
    def __init__(self, body=None, text=""):
        self._body = body or {"id": "msg123"}
        self.text = text
        self.status_code = 200

    def raise_for_status(self):
        pass

    def json(self):
        return self._body


@pytest.fixture
def ntfy(monkeypatch, tmp_path):
    """Zadnej sieci: put/post/get podmienione, kazde wywolanie zapisane."""
    monkeypatch.setenv("NTFY_URL", "https://ntfy.example")
    monkeypatch.setenv("NTFY_TOPIC", "tajny-temat")
    monkeypatch.setenv("CLIPPER_DATA_DIR", str(tmp_path / "data"))
    calls = []

    def recorder(method, resp=None):
        def fake(url, data=None, headers=None, params=None, timeout=None, **kw):
            body = data.read() if hasattr(data, "read") else data
            calls.append({"method": method, "url": url, "data": body, "headers": headers,
                          "params": params})
            return resp or FakeResp()
        return fake

    monkeypatch.setattr(approve.requests, "put", recorder("PUT"))
    monkeypatch.setattr(approve.requests, "post", recorder("POST"))
    monkeypatch.setattr(approve.requests, "get", recorder("GET"))
    return calls


def meta(title="Cop chase ends in the ocean"):
    return ClipMeta(title=title, description="He drove off the pier.", hashtags=["gtavi", "#fail"],
                    score=8, reason="chat exploded")


def test_send_small_clip_headers_and_actions(ntfy, tmp_path):
    clip = tmp_path / "clip.mp4"
    clip.write_bytes(b"MP4DATA")
    msg_id = approve.send_for_approval(7, clip, meta(), extra="kampania: lysium")
    assert msg_id == "msg123"
    (call,) = ntfy
    assert call["method"] == "PUT" and call["url"] == "https://ntfy.example/tajny-temat"
    assert call["data"] == b"MP4DATA"
    h = call["headers"]
    assert h["Title"] == "[7] Cop chase ends in the ocean"
    assert h["Filename"] == "clip_7.mp4" and h["Priority"] == "3" and h["Tags"]
    for part in ("He drove off the pier.", "#gtavi #fail", "ocena 8/10", "chat exploded",
                 "kampania: lysium"):
        assert part in h["X-Message"]
    ok, no = h["Actions"].split("; ")
    assert ok.startswith("http, OK, https://ntfy.example/tajny-temat-reply,")
    assert "method=POST" in ok and "body=ok 7" in ok
    assert no.startswith("http, Odrzuc, https://ntfy.example/tajny-temat-reply,")
    assert "method=POST" in no and "body=no 7" in no


def test_non_ascii_headers_are_rfc2047(ntfy, tmp_path):
    clip = tmp_path / "clip.mp4"
    clip.write_bytes(b"x")
    approve.send_for_approval(3, clip, meta("Zażółć gęślą jaźń 🔥"))
    h = ntfy[0]["headers"]
    for value in h.values():
        value.encode("latin-1")                  # requests wymaga latin-1
    assert h["Title"].startswith("=?UTF-8?B?") and h["Title"].endswith("?=")
    decoded = base64.b64decode(h["Title"][len("=?UTF-8?B?"):-2]).decode("utf-8")
    assert decoded == "[3] Zażółć gęślą jaźń 🔥"


def test_big_clip_sends_ffmpeg_preview(ntfy, tmp_path, monkeypatch):
    monkeypatch.setattr(approve, "MAX_ATTACHMENT_BYTES", 10)
    monkeypatch.setattr(approve, "_duration", lambda p: 40.0)
    clip = tmp_path / "big.mp4"
    clip.write_bytes(b"B" * 100)
    ffmpeg_calls = []

    def fake_run(cmd, check=False, **kw):
        ffmpeg_calls.append((cmd, check))
        with open(cmd[-1], "wb") as fh:
            fh.write(b"small")

    monkeypatch.setattr(approve.subprocess, "run", fake_run)
    approve.send_for_approval(12, clip, meta())

    (cmd, check), = ffmpeg_calls
    assert check is True and cmd[0] == "ffmpeg" and str(clip) in cmd
    assert "scale=540:960,fps=30" in cmd and cmd[cmd.index("-b:v") + 1] == "240k"
    assert cmd[cmd.index("-b:a") + 1] == "32k"
    preview = tmp_path / "data" / "previews" / "12_preview.mp4"
    assert cmd[-1] == str(preview) and preview.is_file()
    assert ntfy[0]["data"] == b"small"
    assert ntfy[0]["headers"]["Filename"] == "clip_12.mp4"


def test_preview_still_too_big_sends_text_only(ntfy, tmp_path, monkeypatch):
    monkeypatch.setattr(approve, "MAX_ATTACHMENT_BYTES", 10)
    monkeypatch.setattr(approve, "_duration", lambda p: 40.0)
    clip = tmp_path / "big.mp4"
    clip.write_bytes(b"B" * 100)

    def fake_run(cmd, check=False, **kw):
        with open(cmd[-1], "wb") as fh:
            fh.write(b"S" * 50)

    monkeypatch.setattr(approve.subprocess, "run", fake_run)
    approve.send_for_approval(12, clip, meta())
    assert ntfy[0]["data"] == b"" and "Filename" not in ntfy[0]["headers"]
    assert "obejrzyj lokalnie" in ntfy[0]["headers"]["X-Message"]
    assert "body=ok 12" in ntfy[0]["headers"]["Actions"]


def test_poll_decisions(monkeypatch, ntfy):
    lines = [
        {"id": "a0", "event": "open", "topic": "tajny-temat-reply"},
        {"id": "a1", "event": "message", "message": "ok 12"},
        {"id": "a2", "event": "message", "message": "no 12 too boring"},
        {"id": "a3", "event": "message", "message": "NO 7"},
        {"id": "a4", "event": "message", "message": "  Ok #5 super"},
        {"id": "a5", "event": "message", "message": "czesc, to nie decyzja"},
        {"id": "a6", "event": "message", "message": "ok"},
        {"id": "a7", "event": "keepalive"},
    ]
    text = "\n".join(json.dumps(x) for x in lines) + "\n\nto nie json\n"
    seen = {}

    def fake_get(url, params=None, timeout=None, **kw):
        seen.update(url=url, params=params)
        return FakeResp(text=text)

    monkeypatch.setattr(approve.requests, "get", fake_get)
    out = approve.poll_decisions(since="a0")
    assert seen["url"] == "https://ntfy.example/tajny-temat-reply/json"
    assert seen["params"] == {"poll": "1", "since": "a0"}
    assert out == [
        (12, "approved", "a1", ""),
        (12, "rejected", "a2", "too boring"),
        (7, "rejected", "a3", ""),
        (5, "approved", "a4", ""),
    ]


def test_parse_decision():
    assert approve.parse_decision("no 12 too boring") == (12, "rejected", "too boring")
    assert approve.parse_decision("nie 3: za dlugie") == (3, "rejected", "za dlugie")
    assert approve.parse_decision("tak 4") == (4, "approved", "")
    assert approve.parse_decision("ok12") is None
    assert approve.parse_decision("okay 12") is None
    assert approve.parse_decision("") is None


def test_notify(ntfy):
    assert approve.notify("Zgłoś link", "Zostalo 10 minut na zgloszenie klipu 7", priority=5) == "msg123"
    (call,) = ntfy
    assert call["method"] == "POST" and call["url"] == "https://ntfy.example/tajny-temat"
    assert call["data"] == "Zostalo 10 minut na zgloszenie klipu 7".encode()
    assert call["headers"]["Priority"] == "5"
    assert call["headers"]["Title"].startswith("=?UTF-8?B?")


def test_missing_topic_raises_clear_error(ntfy, monkeypatch, tmp_path):
    monkeypatch.setenv("NTFY_TOPIC", "")
    clip = tmp_path / "clip.mp4"
    clip.write_bytes(b"x")
    with pytest.raises(approve.NtfyConfigError, match="NTFY_TOPIC") as exc:
        approve.send_for_approval(1, clip, meta())
    assert ".env" in str(exc.value)
    with pytest.raises(approve.NtfyConfigError):
        approve.poll_decisions()
    with pytest.raises(approve.NtfyConfigError):
        approve.notify("a", "b")
    assert ntfy == []                            # nic nie poszlo w siec
