from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from clipper import tracker
from clipper.campaigns import Campaign
from clipper.models import ClipMeta, RenderedClip
from clipper.publish import manual, youtube


def meta(title="Cop chase ends in the ocean"):
    return ClipMeta(title=title, description="He drove off the pier.", hashtags=["gtavi", "#fail"], score=8)


@pytest.fixture
def data(tmp_path, monkeypatch):
    monkeypatch.setenv("CLIPPER_DATA_DIR", str(tmp_path / "data"))
    return tmp_path / "data"


def test_package_writes_clip_and_caption(data, tmp_path):
    clip = tmp_path / "clip_7.mp4"
    clip.write_bytes(b"MP4")
    camp = Campaign(name="lysium", url="https://example.com/c/1", required_hashtags=["Lysium"],
                    required_mentions=["lysiumrp"], required_text="Play at lysium.gg",
                    submit_deadline_minutes=30)
    folder = manual.package(7, clip, meta(), camp)
    assert folder == data / "to_post" / "7"
    assert (folder / "clip_7.mp4").read_bytes() == b"MP4"
    caption = (folder / "caption.txt").read_text(encoding="utf-8")
    lines = caption.splitlines()
    assert lines[0] == "Cop chase ends in the ocean"
    assert "He drove off the pier. Play at lysium.gg @lysiumrp" in lines
    assert "#gtavi #fail #lysium" in lines
    assert "Wymagane hashtagi: #Lysium" in caption
    assert "Wymagane wzmianki: @lysiumrp" in caption
    assert "w ciagu 30 minut" in caption
    assert "https://example.com/c/1" in caption
    # drugi raz nie dubluje i nie wywraca sie
    manual.package(7, clip, meta(), camp)
    assert (folder / "caption.txt").read_text(encoding="utf-8") == caption


def test_package_without_campaign(data, tmp_path):
    clip = tmp_path / "c.mp4"
    clip.write_bytes(b"MP4")
    caption = (manual.package(8, clip, meta()) / "caption.txt").read_text(encoding="utf-8")
    assert "#gtavi #fail" in caption and "30 minut" in caption and "Kampania:" not in caption


def test_record_post_returns_deadline(data):
    conn = tracker.connect(data / "t.db")
    try:
        rc = RenderedClip(path=Path("c.mp4"), duration=30, channel="s", t_start=0, meta=meta(),
                          campaign="lysium-gta-rp")
        clip_id = tracker.add_clip(None, rc, conn=conn)
        before = datetime.now(timezone.utc).replace(microsecond=0)
        deadline = manual.record_post(clip_id, "tiktok", "moje", "https://tiktok.com/v/1", conn=conn)
        assert deadline.tzinfo is not None
        assert timedelta(minutes=30) <= deadline - before <= timedelta(minutes=30, seconds=5)
        row = conn.execute("SELECT * FROM posts").fetchone()
        assert (row["platform"], row["account"], row["url"]) == ("tiktok", "moje", "https://tiktok.com/v/1")
        assert row["campaign"] == "lysium-gta-rp"
        assert tracker.get_clip(clip_id, conn=conn)["status"] == "published"
        assert len(tracker.pending_submissions(conn=conn)) == 1
    finally:
        conn.close()


def test_youtube_title_and_description():
    assert youtube.build_title("Short title") == "Short title #Shorts"
    assert youtube.build_title("x" * 92) == "x" * 92 + " #Shorts"
    assert youtube.build_title("x" * 93) == "x" * 93             # sufiks sie nie miesci
    assert youtube.build_title("y" * 150) == "y" * 100
    assert youtube.build_title("Already #shorts") == "Already #shorts"
    assert youtube.build_description(meta()) == "He drove off the pier.\n\n#gtavi #fail"
    assert set(youtube.SCOPES) == {"https://www.googleapis.com/auth/youtube.upload",
                                   "https://www.googleapis.com/auth/youtube.readonly"}


@pytest.fixture
def no_google(monkeypatch, tmp_path):
    """Pusty ROOT (brak tokenu w cache) i blokada wszystkiego, co mogloby isc w siec."""
    monkeypatch.setattr(youtube, "ROOT", tmp_path)

    def forbidden(*a, **kw):
        raise AssertionError("test nie moze dotykac API Google")

    import google_auth_oauthlib.flow as flow
    import googleapiclient.discovery as discovery
    monkeypatch.setattr(flow.InstalledAppFlow, "from_client_secrets_file", forbidden)
    monkeypatch.setattr(discovery, "build", forbidden)


def test_youtube_upload_missing_secrets_is_clear(no_google, monkeypatch, tmp_path):
    clip = tmp_path / "c.mp4"
    clip.write_bytes(b"MP4")
    monkeypatch.setenv("YOUTUBE_CLIENT_SECRETS", "secrets/nie_ma.json")
    with pytest.raises(youtube.YouTubeConfigError) as exc:
        youtube.upload(clip, meta())
    msg = str(exc.value)
    assert "nie_ma.json" in msg and "YouTube Data API v3" in msg and "Desktop app" in msg

    monkeypatch.setenv("YOUTUBE_CLIENT_SECRETS", "")
    with pytest.raises(youtube.YouTubeConfigError, match="YOUTUBE_CLIENT_SECRETS"):
        youtube.upload(clip, meta())
    with pytest.raises(youtube.YouTubeConfigError):
        youtube.views("abc123")


def test_youtube_upload_argument_checks(no_google, tmp_path):
    with pytest.raises(ValueError):
        youtube.upload(tmp_path / "c.mp4", meta(), privacy="publiczny")
    with pytest.raises(FileNotFoundError):
        youtube.upload(tmp_path / "nie_ma.mp4", meta())


def test_youtube_upload_body_defaults_to_private(monkeypatch, tmp_path):
    clip = tmp_path / "c.mp4"
    clip.write_bytes(b"MP4")
    captured = {}

    class FakeRequest:
        def next_chunk(self, num_retries=0):
            return None, {"id": "VID123"}

    class FakeVideos:
        def insert(self, part, body, media_body):
            captured.update(part=part, body=body)
            return FakeRequest()

    class FakeService:
        def videos(self):
            return FakeVideos()

    monkeypatch.setattr(youtube, "_service", lambda account: FakeService())
    url = youtube.upload(clip, meta())
    assert url == "https://youtube.com/shorts/VID123"
    body = captured["body"]
    assert body["status"] == {"privacyStatus": "private", "selfDeclaredMadeForKids": False}
    assert body["snippet"]["categoryId"] == "20"
    assert body["snippet"]["title"] == "Cop chase ends in the ocean #Shorts"
    assert body["snippet"]["tags"] == ["gtavi", "fail"]

    youtube.upload(clip, meta(), privacy="public")
    assert captured["body"]["status"]["privacyStatus"] == "public"
