from pathlib import Path

import pytest

from clipper import tracker
from clipper.models import Candidate, ClipMeta, RenderedClip

VOD = "https://www.twitch.tv/videos/123"


@pytest.fixture
def conn(tmp_path):
    c = tracker.connect(tmp_path / "t.db")
    yield c
    c.close()


def cand(t_peak=100.0, score=4.2, channel="streamer"):
    return Candidate(channel=channel, t_peak=t_peak, score=score, t_start=t_peak - 20,
                     t_end=t_peak + 45, sample=["LUL", "OMEGALUL"])


def clip(campaign="lysium-gta-rp", score=8):
    meta = ClipMeta(title="Tytul", description="Opis", hashtags=["gta", "gtavi"], score=score)
    return RenderedClip(path=Path("clip.mp4"), duration=42.0, channel="streamer", t_start=80.0,
                        meta=meta, campaign=campaign)


def test_connect_default_path_and_pragmas(tmp_path, monkeypatch):
    monkeypatch.setenv("CLIPPER_DATA_DIR", str(tmp_path / "data"))
    c = tracker.connect()
    try:
        assert (tmp_path / "data" / "clipper.db").is_file()
        assert c.execute("PRAGMA journal_mode").fetchone()[0] == "wal"
        assert c.execute("PRAGMA foreign_keys").fetchone()[0] == 1
        tables = {r["name"] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        assert {"candidates", "clips", "posts"} <= tables
    finally:
        c.close()


def test_candidate_dedupe(conn):
    first = tracker.add_candidate(cand(100), VOD, conn=conn)
    assert tracker.add_candidate(cand(120), VOD, conn=conn) == first      # 20 s obok
    assert tracker.add_candidate(cand(75), VOD, conn=conn) == first       # 25 s przed
    assert tracker.add_candidate(cand(140), VOD, conn=conn) != first      # 40 s dalej
    assert tracker.add_candidate(cand(100), VOD + "9", conn=conn) != first  # inny VOD
    assert tracker.add_candidate(cand(100, channel="inny"), VOD, conn=conn) != first
    assert conn.execute("SELECT COUNT(*) FROM candidates").fetchone()[0] == 4
    row = conn.execute("SELECT * FROM candidates WHERE id = ?", (first,)).fetchone()
    assert row["sample_json"] == '["LUL", "OMEGALUL"]'
    assert row["created_at"].endswith("+00:00")


def test_status_transitions(conn):
    cid = tracker.add_candidate(cand(), VOD, conn=conn)
    clip_id = tracker.add_clip(cid, clip(), conn=conn)
    row = tracker.get_clip(clip_id, conn=conn)
    assert row["status"] == "rendered" and row["decided_at"] is None
    assert row["llm_score"] == 8 and row["hashtags_json"] == '["gta", "gtavi"]'

    tracker.set_clip_status(clip_id, "pending_approval", conn=conn)
    assert tracker.get_clip(clip_id, conn=conn)["decided_at"] is None

    tracker.set_clip_status(clip_id, "rejected", "za nudne", conn=conn)
    row = tracker.get_clip(clip_id, conn=conn)
    assert (row["status"], row["reject_reason"]) == ("rejected", "za nudne")
    assert row["decided_at"]

    tracker.set_clip_status(clip_id, "approved", conn=conn)
    row = tracker.get_clip(clip_id, conn=conn)
    assert row["status"] == "approved" and row["reject_reason"] is None

    with pytest.raises(ValueError):
        tracker.set_clip_status(clip_id, "cokolwiek", conn=conn)
    with pytest.raises(KeyError):
        tracker.set_clip_status(9999, "approved", conn=conn)


def test_add_post_marks_published_and_dedupes_url(conn):
    clip_id = tracker.add_clip(None, clip(), conn=conn)
    post_id = tracker.add_post(clip_id, "tiktok", "konto", "https://tiktok.com/v/1", conn=conn)
    assert tracker.get_clip(clip_id, conn=conn)["status"] == "published"
    assert tracker.add_post(clip_id, "tiktok", "konto", "https://tiktok.com/v/1", conn=conn) == post_id
    row = conn.execute("SELECT * FROM posts WHERE id = ?", (post_id,)).fetchone()
    assert row["campaign"] == "lysium-gta-rp"          # odziedziczona z klipu
    with pytest.raises(KeyError):
        tracker.add_post(9999, "tiktok", "konto", "https://tiktok.com/v/2", conn=conn)


def test_pending_submissions_deadline(conn):
    with_campaign = tracker.add_clip(None, clip(), conn=conn)
    without = tracker.add_clip(None, clip(campaign=None), conn=conn)
    posted = "2026-11-15T12:00:00+00:00"
    p1 = tracker.add_post(with_campaign, "tiktok", "a", "https://t/1", posted_at=posted, conn=conn)
    tracker.add_post(without, "tiktok", "a", "https://t/2", posted_at=posted, conn=conn)

    pending = tracker.pending_submissions("2026-11-15T12:10:00+00:00", conn=conn)
    assert [p["id"] for p in pending] == [p1]
    assert pending[0]["minutes_left"] == 20.0 and pending[0]["overdue"] is False

    # czas w innej strefie: 13:45+01:00 == 12:45 UTC
    late = tracker.pending_submissions("2026-11-15T13:45:00+01:00", conn=conn)
    assert late[0]["minutes_left"] == -15.0 and late[0]["overdue"] is True

    tracker.mark_submitted(p1, "2026-11-15T12:12:00+00:00", conn=conn)
    assert tracker.pending_submissions("2026-11-15T12:20:00+00:00", conn=conn) == []
    row = conn.execute("SELECT submitted_to_campaign_at FROM posts WHERE id = ?", (p1,)).fetchone()
    assert row[0] == "2026-11-15T12:12:00+00:00"


def test_summary_and_views(conn):
    assert tracker.summary(conn=conn)["approval_rate"] is None
    c1 = tracker.add_candidate(cand(100, score=5.0), VOD, conn=conn)
    c2 = tracker.add_candidate(cand(500, score=2.5), VOD, conn=conn)
    a = tracker.add_clip(c1, clip(score=9), conn=conn)
    b = tracker.add_clip(c2, clip(score=3), conn=conn)
    c = tracker.add_clip(None, clip(), conn=conn)
    d = tracker.add_clip(None, clip(), conn=conn)
    tracker.set_clip_status(a, "approved", conn=conn)
    tracker.set_clip_status(b, "rejected", "nic sie nie dzieje", conn=conn)
    tracker.set_clip_status(c, "approved", conn=conn)
    tracker.set_clip_status(d, "pending_approval", conn=conn)
    p1 = tracker.add_post(a, "youtube", "a", "https://y/1", conn=conn)
    p2 = tracker.add_post(c, "tiktok", "a", "https://t/1", conn=conn)
    tracker.update_views(p1, 10000, earned_usd=15.0, campaign_status="approved", conn=conn)
    tracker.update_views(p2, 2500, conn=conn)
    tracker.update_views(p1, 12000, conn=conn)         # zarobek zostaje, gdy nie podany

    s = tracker.summary(conn=conn)
    assert s["candidates"] == 2 and s["clips"] == 4 and s["posts"] == 2
    assert s["by_status"]["published"] == 2
    assert s["by_status"]["rejected"] == 1
    assert s["by_status"]["pending_approval"] == 1
    assert s["by_status"]["approved"] == 0
    assert s["approval_rate"] == pytest.approx(2 / 3)
    assert s["total_views"] == 14500
    assert s["total_earned_usd"] == 15.0

    rows = tracker.export_decisions(conn=conn)
    assert rows == [
        {"score": 5.0, "llm_score": 9, "status": "published", "reject_reason": None},
        {"score": 2.5, "llm_score": 3, "status": "rejected", "reject_reason": "nic sie nie dzieje"},
        {"score": None, "llm_score": 8, "status": "published", "reject_reason": None},
    ]
