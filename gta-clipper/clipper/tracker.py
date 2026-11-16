"""Baza SQLite: kandydaci -> klipy -> posty. Jedno zrodlo prawdy o tym, co
zostalo wyciete, zaakceptowane, opublikowane i ile zarobilo.

Wszystkie znaczniki czasu to napisy ISO-8601 w UTC. Kazda funkcja przyjmuje
opcjonalne `conn`; bez niego otwiera i zamyka domyslna baze sama.
"""
from __future__ import annotations

import json
import logging
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator

from .config import data_dir
from .models import Candidate, RenderedClip

log = logging.getLogger(__name__)

CLIP_STATUSES = ("rendered", "pending_approval", "approved", "rejected", "published", "blocked")
DEDUPE_WINDOW_S = 30.0           # dwa kandydaty blizej niz 30 s to ten sam moment
SUBMIT_DEADLINE_MIN = 30.0       # tyle minut od publikacji jest na zgloszenie linku do kampanii

_SCHEMA = """
CREATE TABLE IF NOT EXISTS candidates (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    channel     TEXT NOT NULL,
    source_url  TEXT NOT NULL,
    t_peak      REAL NOT NULL,
    t_start     REAL NOT NULL,
    t_end       REAL NOT NULL,
    score       REAL NOT NULL,
    source      TEXT NOT NULL DEFAULT 'chat',
    sample_json TEXT NOT NULL DEFAULT '[]',
    created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_candidates_src ON candidates(channel, source_url, t_peak);

CREATE TABLE IF NOT EXISTS clips (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    candidate_id  INTEGER REFERENCES candidates(id),
    path          TEXT NOT NULL,
    duration      REAL,
    title         TEXT,
    description   TEXT,
    hashtags_json TEXT NOT NULL DEFAULT '[]',
    llm_score     INTEGER,
    campaign      TEXT,
    status        TEXT NOT NULL DEFAULT 'rendered',
    reject_reason TEXT,
    created_at    TEXT NOT NULL,
    decided_at    TEXT
);
CREATE INDEX IF NOT EXISTS idx_clips_status ON clips(status);

CREATE TABLE IF NOT EXISTS posts (
    id                       INTEGER PRIMARY KEY AUTOINCREMENT,
    clip_id                  INTEGER NOT NULL REFERENCES clips(id),
    platform                 TEXT NOT NULL,
    account                  TEXT NOT NULL DEFAULT '',
    url                      TEXT NOT NULL UNIQUE,
    posted_at                TEXT NOT NULL,
    submitted_to_campaign_at TEXT,
    campaign                 TEXT,
    views                    INTEGER NOT NULL DEFAULT 0,
    views_checked_at         TEXT,
    earned_usd               REAL NOT NULL DEFAULT 0,
    campaign_status          TEXT
);
"""


def _iso(when: datetime | str | None = None) -> str:
    """Normalizuje czas do napisu ISO-8601 w UTC (None = teraz)."""
    if when is None:
        when = datetime.now(timezone.utc)
    elif isinstance(when, str):
        when = datetime.fromisoformat(when)
    if when.tzinfo is None:
        when = when.replace(tzinfo=timezone.utc)   # naiwny czas traktujemy jako UTC
    return when.astimezone(timezone.utc).isoformat(timespec="seconds")


def _parse(ts: str) -> datetime:
    return datetime.fromisoformat(_iso(ts))


def connect(path: Path | str | None = None) -> sqlite3.Connection:
    """Otwiera baze (domyslnie data_dir()/clipper.db) i zaklada schemat, jesli go nie ma."""
    db_path = Path(path) if path is not None else data_dir() / "clipper.db"
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path), timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.executescript(_SCHEMA)
    conn.commit()
    return conn


@contextmanager
def _db(conn: sqlite3.Connection | None) -> Iterator[sqlite3.Connection]:
    """Transakcja na podanym polaczeniu albo na wlasnym, zamykanym po uzyciu."""
    own = conn is None
    c = connect() if own else conn
    try:
        with c:                      # commit przy sukcesie, rollback przy wyjatku
            yield c
    finally:
        if own:
            c.close()


def add_candidate(cand: Candidate, source_url: str, *, conn: sqlite3.Connection | None = None) -> int:
    """Zapisuje kandydata. Jesli dla tego samego kanalu i zrodla istnieje juz kandydat
    w odleglosci do 30 s od t_peak, zwraca jego id (ten sam VOD przetworzony drugi raz)."""
    with _db(conn) as c:
        row = c.execute(
            "SELECT id FROM candidates WHERE channel = ? AND source_url = ? "
            "AND ABS(t_peak - ?) <= ? ORDER BY ABS(t_peak - ?) LIMIT 1",
            (cand.channel, source_url, cand.t_peak, DEDUPE_WINDOW_S, cand.t_peak),
        ).fetchone()
        if row:
            log.info("Kandydat %s @%.0fs juz istnieje (id=%s), pomijam duplikat",
                     cand.channel, cand.t_peak, row["id"])
            return int(row["id"])
        cur = c.execute(
            "INSERT INTO candidates (channel, source_url, t_peak, t_start, t_end, score, source, "
            "sample_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (cand.channel, source_url, cand.t_peak, cand.t_start, cand.t_end, cand.score,
             cand.source, json.dumps(list(cand.sample), ensure_ascii=False), _iso()),
        )
        return int(cur.lastrowid)


def add_clip(candidate_id: int | None, clip: RenderedClip, *, status: str = "rendered",
             conn: sqlite3.Connection | None = None) -> int:
    """Zapisuje wyrenderowany klip razem z metadanymi z mozgu (jesli sa)."""
    _check_status(status)
    meta = clip.meta
    with _db(conn) as c:
        cur = c.execute(
            "INSERT INTO clips (candidate_id, path, duration, title, description, hashtags_json, "
            "llm_score, campaign, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (candidate_id, str(clip.path), clip.duration,
             meta.title if meta else None,
             meta.description if meta else None,
             json.dumps(list(meta.hashtags) if meta else [], ensure_ascii=False),
             meta.score if meta else None,
             clip.campaign, status, _iso()),
        )
        return int(cur.lastrowid)


def _check_status(status: str) -> None:
    if status not in CLIP_STATUSES:
        raise ValueError(f"Nieznany status klipu: {status!r} (dozwolone: {', '.join(CLIP_STATUSES)})")


def set_clip_status(clip_id: int, status: str, reject_reason: str | None = None, *,
                    conn: sqlite3.Connection | None = None) -> None:
    """Zmienia status klipu. Decyzja czlowieka (approved/rejected) ustawia decided_at."""
    _check_status(status)
    with _db(conn) as c:
        if status in ("approved", "rejected"):
            cur = c.execute(
                "UPDATE clips SET status = ?, reject_reason = ?, decided_at = ? WHERE id = ?",
                (status, (reject_reason or None) if status == "rejected" else None, _iso(), clip_id),
            )
        elif reject_reason:
            # np. blocked z powodem z walidacji kampanii
            cur = c.execute("UPDATE clips SET status = ?, reject_reason = ? WHERE id = ?",
                            (status, reject_reason, clip_id))
        else:
            cur = c.execute("UPDATE clips SET status = ? WHERE id = ?", (status, clip_id))
        if cur.rowcount == 0:
            raise KeyError(f"Nie ma klipu o id={clip_id}")


def get_clip(clip_id: int, *, conn: sqlite3.Connection | None = None) -> dict | None:
    with _db(conn) as c:
        row = c.execute("SELECT * FROM clips WHERE id = ?", (clip_id,)).fetchone()
        return dict(row) if row else None


def add_post(clip_id: int, platform: str, account: str, url: str, *, campaign: str | None = None,
             posted_at: datetime | str | None = None, conn: sqlite3.Connection | None = None) -> int:
    """Zapisuje opublikowany post i oznacza klip jako published. Ten sam URL drugi raz
    zwraca istniejace id. Kampania domyslnie dziedziczona z klipu."""
    with _db(conn) as c:
        existing = c.execute("SELECT id FROM posts WHERE url = ?", (url,)).fetchone()
        if existing:
            log.info("Post %s juz jest w bazie (id=%s)", url, existing["id"])
            return int(existing["id"])
        clip = c.execute("SELECT campaign FROM clips WHERE id = ?", (clip_id,)).fetchone()
        if clip is None:
            raise KeyError(f"Nie ma klipu o id={clip_id}")
        cur = c.execute(
            "INSERT INTO posts (clip_id, platform, account, url, posted_at, campaign) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (clip_id, platform, account, url, _iso(posted_at), campaign or clip["campaign"]),
        )
        c.execute("UPDATE clips SET status = 'published' WHERE id = ?", (clip_id,))
        return int(cur.lastrowid)


def mark_submitted(post_id: int, when: datetime | str | None = None, *,
                   conn: sqlite3.Connection | None = None) -> None:
    """Link zostal zgloszony do kampanii."""
    with _db(conn) as c:
        cur = c.execute("UPDATE posts SET submitted_to_campaign_at = ? WHERE id = ?",
                        (_iso(when), post_id))
        if cur.rowcount == 0:
            raise KeyError(f"Nie ma posta o id={post_id}")


def update_views(post_id: int, views: int, earned_usd: float | None = None,
                 campaign_status: str | None = None, *,
                 conn: sqlite3.Connection | None = None) -> None:
    """Aktualizuje licznik wyswietlen; zarobek i status w kampanii tylko gdy podane."""
    with _db(conn) as c:
        cur = c.execute(
            "UPDATE posts SET views = ?, views_checked_at = ?, "
            "earned_usd = COALESCE(?, earned_usd), campaign_status = COALESCE(?, campaign_status) "
            "WHERE id = ?",
            (int(views), _iso(), earned_usd, campaign_status, post_id),
        )
        if cur.rowcount == 0:
            raise KeyError(f"Nie ma posta o id={post_id}")


def pending_submissions(now: datetime | str | None = None, *,
                        deadline_minutes: float = SUBMIT_DEADLINE_MIN,
                        conn: sqlite3.Connection | None = None) -> list[dict]:
    """Posty z kampania, ktorych link nie zostal jeszcze zgloszony. Kazdy wiersz ma
    `minutes_left` (ujemne = po terminie) i `overdue`. Najpilniejsze na poczatku."""
    now_dt = _parse(_iso(now))
    with _db(conn) as c:
        rows = c.execute(
            "SELECT p.*, c.title AS clip_title FROM posts p JOIN clips c ON c.id = p.clip_id "
            "WHERE p.submitted_to_campaign_at IS NULL AND p.campaign IS NOT NULL AND p.campaign != '' "
            "ORDER BY p.posted_at"
        ).fetchall()
    out = []
    for r in rows:
        elapsed_min = (now_dt - _parse(r["posted_at"])).total_seconds() / 60.0
        left = round(deadline_minutes - elapsed_min, 1)
        out.append({**dict(r), "minutes_left": left, "overdue": left < 0})
    return out


def summary(*, conn: sqlite3.Connection | None = None) -> dict:
    """Liczniki wg statusu, odsetek akceptacji, suma wyswietlen i zarobku.

    approval_rate = (approved + published) / (approved + published + rejected);
    None, gdy nie bylo jeszcze zadnej decyzji."""
    with _db(conn) as c:
        by_status = {s: 0 for s in CLIP_STATUSES}
        for r in c.execute("SELECT status, COUNT(*) AS n FROM clips GROUP BY status"):
            by_status[r["status"]] = r["n"]
        n_cand = c.execute("SELECT COUNT(*) FROM candidates").fetchone()[0]
        p = c.execute("SELECT COUNT(*) AS n, COALESCE(SUM(views), 0) AS v, "
                      "COALESCE(SUM(earned_usd), 0) AS e FROM posts").fetchone()
    accepted = by_status["approved"] + by_status["published"]
    decided = accepted + by_status["rejected"]
    return {
        "candidates": n_cand,
        "clips": sum(by_status.values()),
        "by_status": by_status,
        "approval_rate": (accepted / decided) if decided else None,
        "posts": p["n"],
        "total_views": int(p["v"]),
        "total_earned_usd": round(float(p["e"]), 2),
    }


def export_decisions(*, conn: sqlite3.Connection | None = None) -> list[dict]:
    """Wiersze (score, llm_score, status, reject_reason) dla klipow po decyzji czlowieka:
    material do strojenia progow detektora i mozgu."""
    with _db(conn) as c:
        rows = c.execute(
            "SELECT k.score AS score, c.llm_score AS llm_score, c.status AS status, "
            "c.reject_reason AS reject_reason FROM clips c "
            "LEFT JOIN candidates k ON k.id = c.candidate_id "
            "WHERE c.status IN ('approved', 'rejected', 'published') ORDER BY c.id"
        ).fetchall()
    return [dict(r) for r in rows]
