from pathlib import Path

import pytest

from clipper import campaigns
from clipper.campaigns import Campaign
from clipper.models import ClipMeta, RenderedClip


def make_campaign(**kw):
    base = dict(
        name="test", platforms=["tiktok", "youtube"], rate_per_1k={"tiktok": 1.5, "youtube": 1.0},
        min_seconds=15, max_seconds=60, required_hashtags=["#Lysium", "gtarp"],
        required_mentions=["lysiumrp"], required_text="Play at lysium.gg",
        allowed_sources=["streamer"], banned=["leak"],
    )
    base.update(kw)
    return Campaign(**base)


def make_clip(meta=None, duration=30.0, channel="streamer"):
    return RenderedClip(path=Path("c.mp4"), duration=duration, channel=channel, t_start=0.0, meta=meta)


def good_meta():
    return campaigns.apply(make_campaign(),
                           ClipMeta(title="Cop chase gone wrong", description="Wild chase.",
                                    hashtags=["gta"], score=7))


def test_apply_adds_required_and_is_idempotent():
    camp = make_campaign()
    meta = ClipMeta(title="T", description="Opis.", hashtags=["gta", "GtaRP"], score=7, reason="r")
    once = campaigns.apply(camp, meta)
    assert once.hashtags == ["gta", "GtaRP", "lysium"]          # gtarp juz bylo (inna wielkosc liter)
    assert once.description == "Opis. Play at lysium.gg @lysiumrp"
    assert (once.title, once.score, once.reason) == ("T", 7, "r")
    assert meta.hashtags == ["gta", "GtaRP"] and meta.description == "Opis."   # oryginal nietkniety
    assert campaigns.apply(camp, once) == once


def test_validate_ok():
    assert campaigns.validate(make_campaign(), make_clip(good_meta()), "TikTok") == []


@pytest.mark.parametrize("camp_kw, clip_kw, platform, needle", [
    ({}, {"duration": 10}, "tiktok", "za krotki"),
    ({}, {"duration": 90}, "tiktok", "za dlugi"),
    ({}, {}, "instagram", "Platforma instagram"),
    ({}, {"channel": "ktos_inny"}, "tiktok", "dozwolonych zrodel"),
    ({"status": "paused"}, {}, "tiktok", "nie jest otwarta"),
    ({"status": "ended"}, {}, "tiktok", "nie jest otwarta"),
])
def test_validate_clip_level_problems(camp_kw, clip_kw, platform, needle):
    problems = campaigns.validate(make_campaign(**camp_kw), make_clip(good_meta(), **clip_kw), platform)
    assert len(problems) == 1 and needle in problems[0]


def test_validate_missing_required_and_banned():
    meta = ClipMeta(title="Huge LEAK moment", description="Nic.", hashtags=["gta"], score=5)
    problems = campaigns.validate(make_campaign(), make_clip(meta), "tiktok")
    text = "\n".join(problems)
    assert "#lysium" in text and "#gtarp" in text
    assert "@lysiumrp" in text
    assert "Play at lysium.gg" in text
    assert 'Zakazana fraza "leak"' in text
    assert len(problems) == 5


def test_validate_without_meta():
    problems = campaigns.validate(make_campaign(), make_clip(None), "tiktok")
    assert len(problems) == 1 and "metadanych" in problems[0]
    assert campaigns.validate(Campaign(name="luzna"), make_clip(None), "tiktok") == []


def test_rate():
    assert make_campaign().rate("TikTok") == 1.5
    assert make_campaign().rate("instagram") == 0.0
    assert Campaign(name="x", rate_per_1k=0.7).rate("youtube") == 0.7


def test_example_profiles_load():
    lys = campaigns.load("lysium-gta-rp")
    assert lys.rate("tiktok") == 1.5 and lys.max_payout == 150 and lys.status == "open"
    assert lys.min_payout == 1.5 and lys.min_seconds is None and lys.required_hashtags == []
    assert lys.url.startswith("https://contentrewards.com/c/campaigns/")
    assert lys.checked_on == "2026-11-16"
    assert lys.disclosure == "#ad" and lys.submit_deadline_minutes == 30

    tok = campaigns.load("tokyo-girl-gta6")
    assert tok.rate("youtube") == 0.7 and (tok.min_payout, tok.max_payout) == (2, 35)
    assert tok.status == "open" and "SPRAWDZ" in tok.notes

    everything = campaigns.load_all()
    assert {"lysium-gta-rp", "tokyo-girl-gta6"} <= set(everything)
    assert not any(name.startswith("_") for name in everything)
    assert campaigns.load("_template").status == "paused"      # szablon tez jest poprawnym YAML


def test_load_errors_and_custom_dir(tmp_path):
    with pytest.raises(FileNotFoundError):
        campaigns.load("nie-ma-takiej", tmp_path)
    (tmp_path / "zla.yaml").write_text("status: zamknieta\n", encoding="utf-8")
    with pytest.raises(ValueError):
        campaigns.load("zla", tmp_path)
    (tmp_path / "ok.yaml").write_text(
        "platforms: [TikTok]\nrate_per_1k: {TikTok: 2}\nrequired_hashtags: lysium\n", encoding="utf-8")
    camp = campaigns.load("ok", tmp_path)
    assert camp.name == "ok" and camp.platforms == ["tiktok"] and camp.rate("tiktok") == 2.0
    assert camp.required_hashtags == ["lysium"]
    assert campaigns.load_all(tmp_path / "brak") == {}
