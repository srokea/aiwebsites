"""Profile kampanii klipperskich: config/campaigns/<nazwa>.yaml.

Profil opisuje zasady jednej kampanii (stawka, wymagane tagi, dlugosc klipu...).
`apply` dopisuje wymagane elementy do metadanych, `validate` sprawdza gotowy klip
przed publikacja. Puste pole = zasada nieznana albo brak ograniczenia.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field, fields
from pathlib import Path

import yaml

from .config import CONFIG_DIR
from .models import ClipMeta, RenderedClip

log = logging.getLogger(__name__)

STATUSES = ("open", "paused", "ended", "skip")      # skip = kampania nie pasuje, nie publikujemy
TYPES = ("cpm", "pool")


@dataclass(slots=True)
class Campaign:
    name: str
    url: str = ""
    platforms: list[str] = field(default_factory=list)        # puste = dowolna
    rate_per_1k: dict[str, float] | float = 0.0               # USD za 1000 wyswietlen
    min_payout: float | None = None
    max_payout: float | None = None
    min_seconds: float | None = None
    max_seconds: float | None = None
    required_hashtags: list[str] = field(default_factory=list)
    required_mentions: list[str] = field(default_factory=list)
    required_text: str = ""
    disclosure: str = "#ad"                                   # tekst wypalany na poczatku wideo
    allowed_sources: list[str] = field(default_factory=list)  # loginy kanalow; puste = dowolny
    banned: list[str] = field(default_factory=list)
    audience_requirement: str = ""
    submit_deadline_minutes: int = 30
    notes: str = ""
    checked_on: str = ""
    status: str = "open"
    type: str = "cpm"                                         # cpm = stawka za 1000 wyswietlen; pool = pula dzielona
    min_total_views: int | None = None                        # pula: prog sumy wyswietlen, zeby wejsc do podzialu
    ai_allowed: bool = True                                   # False = tresci generowane AI zakazane
    overlay_text: str | None = None                           # maly napis wypalany przez caly klip (np. adres kanalu)
    caption_must_mention: list[str] = field(default_factory=list)  # slowa obowiazkowe w tytule/opisie
    drafts_preapproval: bool = False                          # klip najpierw jako draft w Content Rewards
    bio_link: str | None = None                               # link, ktory ma byc w bio konta (informacyjnie)

    def rate(self, platform: str) -> float:
        """Stawka za 1000 wyswietlen na danej platformie (0.0, gdy nieznana)."""
        if isinstance(self.rate_per_1k, dict):
            return float(self.rate_per_1k.get(platform.lower(), 0.0))
        return float(self.rate_per_1k or 0.0)


def campaigns_dir() -> Path:
    return CONFIG_DIR / "campaigns"


def _str_list(value) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        return [value] if value.strip() else []
    return [str(v).strip() for v in value if str(v).strip()]


def _opt_float(value) -> float | None:
    return None if value in (None, "") else float(value)


def from_dict(name: str, raw: dict) -> Campaign:
    raw = dict(raw or {})
    known = {f.name for f in fields(Campaign)}
    for key in sorted(set(raw) - known):
        log.warning("Kampania %s: nieznane pole %r w YAML, pomijam", name, key)
    rate = raw.get("rate_per_1k")
    if isinstance(rate, dict):
        rate = {str(k).lower(): float(v) for k, v in rate.items()}
    else:
        rate = float(rate or 0.0)
    status = str(raw.get("status") or "open").strip().lower()
    if status not in STATUSES:
        raise ValueError(f"Kampania {name}: status {status!r} spoza {STATUSES}")
    ctype = str(raw.get("type") or "cpm").strip().lower()
    if ctype not in TYPES:
        raise ValueError(f"Kampania {name}: type {ctype!r} spoza {TYPES}")
    overlay = str(raw.get("overlay_text") or "").strip() or None
    bio = str(raw.get("bio_link") or "").strip() or None
    min_views = raw.get("min_total_views")
    return Campaign(
        name=str(raw.get("name") or name),
        url=str(raw.get("url") or ""),
        platforms=[p.lower() for p in _str_list(raw.get("platforms"))],
        rate_per_1k=rate,
        min_payout=_opt_float(raw.get("min_payout")),
        max_payout=_opt_float(raw.get("max_payout")),
        min_seconds=_opt_float(raw.get("min_seconds")),
        max_seconds=_opt_float(raw.get("max_seconds")),
        required_hashtags=_str_list(raw.get("required_hashtags")),
        required_mentions=_str_list(raw.get("required_mentions")),
        required_text=str(raw.get("required_text") or "").strip(),
        disclosure=str(raw["disclosure"]) if raw.get("disclosure") is not None else "#ad",
        allowed_sources=[s.lower() for s in _str_list(raw.get("allowed_sources"))],
        banned=_str_list(raw.get("banned")),
        audience_requirement=str(raw.get("audience_requirement") or "").strip(),
        submit_deadline_minutes=int(raw.get("submit_deadline_minutes") or 30),
        notes=str(raw.get("notes") or "").strip(),
        checked_on=str(raw.get("checked_on") or ""),
        status=status,
        type=ctype,
        min_total_views=None if min_views in (None, "") else int(min_views),
        ai_allowed=bool(raw["ai_allowed"]) if raw.get("ai_allowed") is not None else True,
        overlay_text=overlay,
        caption_must_mention=_str_list(raw.get("caption_must_mention")),
        drafts_preapproval=bool(raw.get("drafts_preapproval") or False),
        bio_link=bio,
    )


def load(name: str, directory: Path | None = None) -> Campaign:
    path = (directory or campaigns_dir()) / f"{name}.yaml"
    if not path.is_file():
        raise FileNotFoundError(f"Nie ma profilu kampanii: {path}")
    raw = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    if not isinstance(raw, dict):
        raise ValueError(f"Profil kampanii {path} nie jest slownikiem YAML")
    return from_dict(name, raw)


def load_all(directory: Path | None = None) -> dict[str, Campaign]:
    """Wszystkie profile oprocz plikow zaczynajacych sie od '_' (szablony)."""
    d = directory or campaigns_dir()
    out: dict[str, Campaign] = {}
    if not d.is_dir():
        return out
    for path in sorted(d.glob("*.yaml")):
        if path.name.startswith("_"):
            continue
        out[path.stem] = load(path.stem, d)
    return out


def _tag(value: str) -> str:
    return value.strip().lstrip("#").strip().lower()


def _mention(value: str) -> str:
    return "@" + value.strip().lstrip("@").strip()


def apply(campaign: Campaign, meta: ClipMeta) -> ClipMeta:
    """Kopia metadanych z dopisanymi wymaganymi hashtagami, wzmiankami i tekstem.
    Idempotentne: drugie wywolanie niczego nie dubluje."""
    hashtags = list(meta.hashtags)
    have = {_tag(h) for h in hashtags}
    for req in campaign.required_hashtags:
        t = _tag(req)
        if t and t not in have:
            hashtags.append(t)
            have.add(t)

    description = meta.description or ""
    extra: list[str] = []
    if campaign.required_text and campaign.required_text.lower() not in description.lower():
        extra.append(campaign.required_text)
    for req in campaign.required_mentions:
        m = _mention(req)
        if m.lower() not in description.lower() and m not in extra:
            extra.append(m)
    in_text = f"{meta.title or ''} {description}".lower()
    for word in campaign.caption_must_mention:
        if word.lower() not in in_text and word not in extra:
            extra.append(word)
    if extra:
        description = (description.rstrip() + " " + " ".join(extra)).strip()

    return ClipMeta(title=meta.title, description=description, hashtags=hashtags,
                    score=meta.score, reason=meta.reason)


def validate(campaign: Campaign, clip: RenderedClip, platform: str) -> list[str]:
    """Lista problemow po polsku. Pusta lista = klip spelnia znane zasady kampanii."""
    problems: list[str] = []
    platform = platform.strip().lower()

    if campaign.status != "open":
        problems.append(f"Kampania {campaign.name} nie jest otwarta (status: {campaign.status}); "
                        "nie publikuj do niej klipow.")
    if campaign.platforms and platform not in campaign.platforms:
        problems.append(f"Platforma {platform} nie jest dozwolona w kampanii "
                        f"(dozwolone: {', '.join(campaign.platforms)}).")
    if campaign.min_seconds is not None and clip.duration < campaign.min_seconds:
        problems.append(f"Klip za krotki: {clip.duration:.0f} s, minimum {campaign.min_seconds:.0f} s.")
    if campaign.max_seconds is not None and clip.duration > campaign.max_seconds:
        problems.append(f"Klip za dlugi: {clip.duration:.0f} s, maksimum {campaign.max_seconds:.0f} s.")
    if campaign.allowed_sources and clip.channel.lower() not in campaign.allowed_sources:
        problems.append(f"Kanal {clip.channel} nie jest na liscie dozwolonych zrodel kampanii.")

    meta = clip.meta
    if meta is None:
        if (campaign.required_hashtags or campaign.required_mentions or campaign.required_text
                or campaign.caption_must_mention):
            problems.append("Klip nie ma metadanych, a kampania wymaga hashtagow/wzmianek/tekstu.")
        return problems

    have = {_tag(h) for h in meta.hashtags}
    description = (meta.description or "").lower()
    for req in campaign.required_hashtags:
        if _tag(req) and _tag(req) not in have:
            problems.append(f"Brakuje wymaganego hashtagu #{_tag(req)}.")
    for req in campaign.required_mentions:
        if _mention(req).lower() not in description:
            problems.append(f"Brakuje wymaganej wzmianki {_mention(req)} w opisie.")
    if campaign.required_text and campaign.required_text.lower() not in description:
        problems.append(f"Opis nie zawiera wymaganego tekstu: \"{campaign.required_text}\".")

    title_desc = f"{meta.title or ''} {meta.description or ''}".lower()
    for word in campaign.caption_must_mention:
        if word.lower() not in title_desc:
            problems.append(f"Tytul ani opis nie wspominaja wymaganego slowa \"{word}\".")

    haystack = " ".join([meta.title or "", meta.description or "", " ".join(meta.hashtags)]).lower()
    for bad in campaign.banned:
        if bad.lower() in haystack:
            problems.append(f"Zakazana fraza \"{bad}\" w tytule, opisie lub hashtagach.")
    return problems
