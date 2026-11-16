"""Prawdziwe profile kampanii z config/campaigns, pola z briefow i wypalanie napisu."""
from pathlib import Path

import pytest

from clipper import campaigns, tracker, watch
from clipper.campaigns import Campaign
from clipper.config import Layout
from clipper.models import ClipMeta, RenderedClip, Word
from clipper.publish import manual
from clipper.render.captions import OVERLAY_SIZE, OVERLAY_Y, TITLE_SIZE, build_ass, title_anchor
from clipper.watch import Watcher


def _clip(meta, channel="lysium"):
    return RenderedClip(path=Path("c.mp4"), duration=30.0, channel=channel, t_start=0.0, meta=meta)


def test_real_profiles_load():
    all_ = campaigns.load_all()
    lysium, lacy, marlon = all_["lysium-gta-rp"], all_["lacy-pool"], all_["marlon-diamonds"]
    assert lysium.status == "open" and lysium.type == "cpm" and lysium.rate("x") == 1.5
    assert lysium.overlay_text == "twitch.tv/lysium" and lysium.drafts_preapproval
    assert lysium.bio_link == "twitch.tv/Lysium" and lysium.allowed_sources == ["lysium"]
    assert (lysium.min_payout, lysium.max_payout) == (1.5, 150.0)
    assert lysium.platforms == ["tiktok", "instagram", "youtube", "x"]
    assert lacy.type == "pool" and lacy.min_total_views == 1_000_000 and not lacy.ai_allowed
    assert lacy.caption_must_mention == ["Lacy"] and lacy.required_hashtags == ["Lacy"]
    assert lacy.allowed_sources == ["lacy"]
    assert marlon.status == "skip" and marlon.platforms == ["tiktok", "instagram"]
    for name in ("lysium-gta-rp", "lacy-pool", "marlon-diamonds"):
        assert all_[name].checked_on == "2026-11-16"


def test_marlon_profile_blocks_everything():
    marlon = campaigns.load("marlon-diamonds")
    meta = campaigns.apply(marlon, ClipMeta(title="Wild chase", description="x", hashtags=["gta"], score=8))
    problems = campaigns.validate(marlon, _clip(meta, "marlon"), "tiktok")
    assert any("nie jest otwarta" in p for p in problems)


def test_caption_must_mention_apply_and_validate():
    camp = Campaign(name="t", caption_must_mention=["Lacy"])
    meta = ClipMeta(title="Wild moment", description="Funny one.", hashtags=[], score=7)
    assert any("Lacy" in p for p in campaigns.validate(camp, _clip(meta), "tiktok"))
    fixed = campaigns.apply(camp, meta)
    assert fixed.description == "Funny one. Lacy"
    assert campaigns.validate(camp, _clip(fixed), "tiktok") == []
    assert campaigns.apply(camp, fixed) == fixed                       # idempotentne
    in_title = ClipMeta(title="LACY at the pool", description="d", hashtags=[], score=7)
    assert campaigns.apply(camp, in_title).description == "d"          # tytul wystarczy, wielkosc liter bez znaczenia


def test_from_dict_rejects_unknown_type():
    with pytest.raises(ValueError):
        campaigns.from_dict("x", {"type": "weird"})


def _dialogues(path):
    return [line.split(",", 9) for line in Path(path).read_text(encoding="utf-8").splitlines()
            if line.startswith("Dialogue:")]


def test_overlay_in_ass_position_and_no_overlap(tmp_path):
    words = [Word(float(i), i + 0.5, f"w{i}") for i in range(10)]
    for n, lay in enumerate([Layout(), Layout(facecam=(0, 0, 320, 180), facecam_ratio=0.35)]):
        an, y = title_anchor(lay)
        out = build_ass(words, tmp_path / f"o{n}.ass", t0=0.0, t1=10.0, title="Cop Gets Rammed By Partner",
                        title_an=an, title_y=y, overlay_text="twitch.tv/lysium")
        rows = [r for r in _dialogues(out) if r[3] == "Overlay"]
        assert len(rows) == 1
        assert rows[0][1] == "0:00:00.00" and rows[0][2] == "0:00:10.00"
        assert f"\\an2\\pos(540,{OVERLAY_Y})" in rows[0][9] and rows[0][9].endswith("twitch.tv/lysium")
        # pasy pionowe: napis nie wchodzi na slowa (srodek y=1200, rozmiar 110) ani na tytul
        overlay_top = OVERLAY_Y - OVERLAY_SIZE * 1.3
        assert overlay_top > 1200 + 110 / 2 + 60
        title_bottom = y + (2 * TITLE_SIZE * 1.3 if an == 8 else TITLE_SIZE * 1.3)
        assert title_bottom < overlay_top
    none = build_ass(words, tmp_path / "n.ass", t0=0.0, t1=10.0)
    assert not [r for r in _dialogues(none) if r[3] == "Overlay"]


@pytest.fixture
def data(tmp_path, monkeypatch):
    monkeypatch.setenv("CLIPPER_DATA_DIR", str(tmp_path / "data"))
    return tmp_path / "data"


def test_package_drafts_preapproval_first_line(data, tmp_path):
    clip = tmp_path / "c.mp4"
    clip.write_bytes(b"MP4")
    meta = ClipMeta(title="T", description="d", hashtags=["gta"], score=7)
    camp = Campaign(name="l", drafts_preapproval=True, bio_link="twitch.tv/Lysium")
    lines = (manual.package(3, clip, meta, camp) / "caption.txt").read_text(encoding="utf-8").splitlines()
    assert lines[0] == manual.DRAFT_FIRST and "NAJPIERW" in lines[0]
    assert any("twitch.tv/Lysium" in ln for ln in lines[:3])
    plain = (manual.package(4, clip, meta, Campaign(name="p")) / "caption.txt").read_text(encoding="utf-8")
    assert "NAJPIERW" not in plain and plain.splitlines()[0] == "T"


def test_watcher_notification_has_draft_warning(monkeypatch, tmp_path, data):
    notes = []
    monkeypatch.setattr(watch.pipeline, "apply_decisions", lambda: [(5, "approved")])
    monkeypatch.setattr(watch.approve, "notify",
                        lambda title, message, priority=3: notes.append(message) or "id")
    monkeypatch.setattr(tracker, "pending_submissions", lambda *a, **k: [])
    clip = tmp_path / "c.mp4"
    clip.write_bytes(b"MP4")
    meta = ClipMeta(title="Tytul", description="opis", hashtags=["gta"], score=7)
    camp = Campaign(name="l", drafts_preapproval=True, bio_link="twitch.tv/Lysium")
    manual.package(5, clip, meta, camp)
    Watcher().run_once()
    msg = notes[0]
    assert msg.startswith(manual.DRAFT_FIRST) and "twitch.tv/Lysium" in msg
    assert "Opis do wklejenia:\nTytul" in msg and "=" * 40 not in msg
