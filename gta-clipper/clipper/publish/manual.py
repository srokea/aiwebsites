"""TikTok / Instagram: publikacja reczna z telefonu. `package` szykuje folder
z wideo i gotowym opisem, `record_post` zapisuje wklejony link w trackerze.
"""
from __future__ import annotations

import logging
import shutil
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

from .. import campaigns, tracker
from ..campaigns import Campaign
from ..config import subdir
from ..models import ClipMeta

log = logging.getLogger(__name__)


DRAFT_FIRST = "NAJPIERW wyslij jako DRAFT w Content Rewards i poczekaj na akceptacje, dopiero potem publikuj"
PREAMBLE_END = "=" * 40       # koniec ostrzezen na poczatku caption.txt; dalej zaczyna sie opis do wklejenia


def bio_reminder(campaign: Campaign) -> str:
    return f"Sprawdz, czy w bio konta jest link: {campaign.bio_link}"


def package(clip_id: int, clip_path: Path | str, meta: ClipMeta, campaign: Campaign | None = None) -> Path:
    """Tworzy to_post/<clip_id>/ z plikiem mp4 i caption.txt. Zwraca sciezke folderu."""
    clip_path = Path(clip_path)
    if campaign is not None:
        meta = campaigns.apply(campaign, meta)       # dopisz wymagane tagi/wzmianki/tekst
    folder = subdir("to_post") / str(clip_id)
    folder.mkdir(parents=True, exist_ok=True)
    shutil.copy2(clip_path, folder / clip_path.name)

    tags = " ".join("#" + h.lstrip("#") for h in meta.hashtags if h.strip("# "))
    deadline = campaign.submit_deadline_minutes if campaign else 30
    lines: list[str] = []
    if campaign is not None and (campaign.drafts_preapproval or campaign.bio_link):
        if campaign.drafts_preapproval:
            lines.append(DRAFT_FIRST)
        if campaign.bio_link:
            lines.append(bio_reminder(campaign))
        lines.append(PREAMBLE_END)
    lines += [meta.title, "", meta.description, "", tags, "", "-" * 40,
             "POWYZEJ: tekst do wklejenia jako opis posta. PONIZEJ: notatki, nie wklejaj."]
    if campaign is not None:
        lines.append(f"Kampania: {campaign.name} ({campaign.url})")
        if campaign.required_hashtags:
            lines.append("Wymagane hashtagi: "
                         + " ".join("#" + h.lstrip("#") for h in campaign.required_hashtags))
        if campaign.required_mentions:
            lines.append("Wymagane wzmianki: "
                         + " ".join("@" + m.lstrip("@") for m in campaign.required_mentions))
        if campaign.required_text:
            lines.append(f"Wymagany tekst w opisie: {campaign.required_text}")
        if campaign.disclosure:
            lines.append(f"Oznaczenie wspolpracy: {campaign.disclosure}")
        lines.append(f"PAMIETAJ: link do posta trzeba zglosic do kampanii w ciagu {deadline} minut "
                     "od publikacji, inaczej wyswietlenia moga nie zostac policzone.")
        lines.append(f"Po publikacji zapisz link: clipper posted {clip_id} <platforma> <url>")
    else:
        lines.append("Klip bez kampanii. Jesli zglaszasz go do kampanii, zrob to w ciagu "
                     f"{deadline} minut od publikacji.")
    (folder / "caption.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")
    log.info("Klip %s gotowy do recznej publikacji: %s", clip_id, folder)
    return folder


def record_post(clip_id: int, platform: str, account: str, url: str, *,
                conn: sqlite3.Connection | None = None) -> datetime:
    """Zapisuje post w trackerze i zwraca termin (UTC) zgloszenia linku do kampanii."""
    posted_at = datetime.now(timezone.utc).replace(microsecond=0)
    tracker.add_post(clip_id, platform, account, url, posted_at=posted_at, conn=conn)
    minutes = int(tracker.SUBMIT_DEADLINE_MIN)
    clip = tracker.get_clip(clip_id, conn=conn)
    name = clip["campaign"] if clip else None
    if name:
        try:
            minutes = campaigns.load(name).submit_deadline_minutes
        except FileNotFoundError:
            log.warning("Klip %s ma kampanie %r bez profilu YAML, przyjmuje termin %d min",
                        clip_id, name, minutes)
    deadline = posted_at + timedelta(minutes=minutes)
    log.info("Post %s zapisany; link zglos do kampanii przed %s", url, deadline.isoformat())
    return deadline
