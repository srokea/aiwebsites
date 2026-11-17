import pytest
import requests

from clipper import approve, config, tracker, watch
from clipper.watch import Watcher


@pytest.fixture
def env(monkeypatch, tmp_path):
    notes = []
    state = {"decisions": [], "pending": [], "now": 1000.0}
    monkeypatch.setattr(config, "subdir", lambda name: tmp_path / name)
    monkeypatch.setattr(watch.pipeline, "apply_decisions", lambda: state["decisions"])
    monkeypatch.setattr(watch.approve, "notify",
                        lambda title, message, priority=3, attach_url=None: notes.append((title, message, priority)) or "id")
    monkeypatch.setattr(watch.approve, "upload_full_clip", lambda path: "https://example.test/klip.mp4")
    monkeypatch.setattr(tracker, "pending_submissions", lambda *a, **k: state["pending"])
    monkeypatch.setattr(watch.time, "monotonic", lambda: state["now"])
    return notes, state, tmp_path


def _post(pid, left):
    return {"id": pid, "url": f"https://t.example/{pid}", "campaign": "k", "minutes_left": left}


def test_approved_clip_one_notification(env):
    notes, state, tmp = env
    folder = tmp / "to_post" / "7"
    folder.mkdir(parents=True)
    (folder / "caption.txt").write_text("Tytul\n\nopis #gta\n\n" + "-" * 40 + "\nnotatki\n", encoding="utf-8")
    state["decisions"] = [(7, "approved"), (8, "rejected")]
    w = Watcher()
    w.run_once()
    state["decisions"] = []
    w.run_once()
    assert len(notes) == 1
    msg = notes[0][1]
    assert str(folder) in msg and "opis #gta" in msg and "notatki" not in msg
    assert "clipper posted 7 tiktok <url>" in msg


def test_reminder_throttle_and_priority(env):
    notes, state, _ = env
    state["pending"] = [_post(1, 25.0)]
    w = Watcher(remind_every=60)
    w.run_once()
    assert [n[2] for n in notes] == [3]
    state["now"] += 300                       # 5 min: za wczesnie na powtorke
    w.run_once()
    assert len(notes) == 1
    state["now"] += 301                       # ponad 10 min od pierwszego
    state["pending"] = [_post(1, 8.0)]
    w.run_once()
    assert [n[2] for n in notes] == [3, 4]
    state["now"] += 700
    state["pending"] = [_post(1, -2.0)]
    w.run_once()
    assert notes[-1][2] == 5 and len(notes) == 3


def test_network_error_does_not_kill_loop(env, monkeypatch):
    notes, state, _ = env

    def boom():
        raise requests.ConnectionError("offline")
    monkeypatch.setattr(watch.pipeline, "apply_decisions", boom)
    state["pending"] = [_post(2, 5.0)]
    w = Watcher()
    w.run_once()                              # nie rzuca
    assert len(notes) == 1                    # przypomnienia dzialaja mimo bledu decyzji


def test_notify_network_error_retried(env, monkeypatch):
    notes, state, tmp = env
    (tmp / "to_post" / "3").mkdir(parents=True)
    state["decisions"] = [(3, "approved")]
    calls = {"n": 0}

    def flaky(title, message, priority=3, attach_url=None):
        calls["n"] += 1
        if calls["n"] == 1:
            raise requests.Timeout("x")
        notes.append(title)
    monkeypatch.setattr(watch.approve, "notify", flaky)
    w = Watcher(remind_every=10**9)
    w.run_once()
    state["decisions"] = []
    w.run_once()
    assert len(notes) == 1


def test_config_error_stops_watcher(env, monkeypatch):
    def bad():
        raise approve.NtfyConfigError("brak NTFY_TOPIC")
    monkeypatch.setattr(watch.pipeline, "apply_decisions", bad)
    w = Watcher(interval=0.01)
    w.start()
    w._thread.join(timeout=5)
    assert not w.is_alive()
    assert isinstance(w.config_error, approve.NtfyConfigError)
    w.stop()
