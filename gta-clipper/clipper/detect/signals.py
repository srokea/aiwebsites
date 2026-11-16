"""Drugi sygnal: klipy widzow z Twitch Helix. Klip zrobiony przez widza to
najlepsza etykieta "tu sie cos stalo", wiec laczymy go ze skokami czatu.

Czas `t` to sekundy od poczatku nagrania (jak w reszcie pakietu).
"""
from __future__ import annotations

import logging
import math
import re
import time
from dataclasses import replace
from datetime import datetime, timedelta, timezone

import requests

from clipper.config import env
from clipper.models import Candidate

log = logging.getLogger(__name__)

TOKEN_URL = "https://id.twitch.tv/oauth2/token"
HELIX = "https://api.twitch.tv/helix"
TIMEOUT = 20
MAX_PAGES = 10                 # 10 x 100 klipow wystarczy na jeden VOD
CLIP_MERGE_GAP = 30.0          # klipy blizsze niz tyle sekund zlewamy w jeden
CHAT_BOOST = 3.0               # premia za zgodnosc czatu i klipu widza
RATE_LIMIT_MAX_WAIT = 60.0
VOD_END_MARGIN = timedelta(minutes=30)   # klipy powstaja tez chwile po koncu streamu

_token: dict = {"value": None, "expires": 0.0}


class TwitchApiError(RuntimeError):
    """Blad API Twitcha (zle klucze, limit, nieoczekiwana odpowiedz)."""


# --- HTTP --------------------------------------------------------------------

def _request(method: str, url: str, **kw) -> requests.Response:
    """Jedno zapytanie z timeoutem; na 429 czeka do Ratelimit-Reset i ponawia raz."""
    for attempt in range(2):
        resp = requests.request(method, url, timeout=TIMEOUT, **kw)
        if resp.status_code != 429 or attempt == 1:
            return resp
        try:
            reset = float(resp.headers.get("Ratelimit-Reset", ""))
            wait = reset - time.time()
        except ValueError:
            wait = 5.0
        wait = min(max(wait, 1.0), RATE_LIMIT_MAX_WAIT)
        log.warning("Twitch API: limit zapytan (429), czekam %.0f s", wait)
        time.sleep(wait)
    return resp  # pragma: no cover


def reset_token() -> None:
    _token["value"], _token["expires"] = None, 0.0


def get_token() -> str:
    """Token aplikacji (client credentials), trzymany w pamieci do wygasniecia."""
    if _token["value"] and time.time() < _token["expires"]:
        return _token["value"]
    client_id, secret = env("TWITCH_CLIENT_ID"), env("TWITCH_CLIENT_SECRET")
    if not client_id or not secret:
        raise TwitchApiError(
            "Brak TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET w .env (klucze z dev.twitch.tv)")
    try:
        resp = _request("POST", TOKEN_URL, data={
            "client_id": client_id, "client_secret": secret,
            "grant_type": "client_credentials"})
    except requests.RequestException as exc:
        raise TwitchApiError(f"Twitch: nie udalo sie pobrac tokenu ({type(exc).__name__})") from exc
    if resp.status_code != 200:
        raise TwitchApiError(
            f"Twitch: token odrzucony (HTTP {resp.status_code}); sprawdz klucze w .env")
    body = resp.json()
    _token["value"] = body["access_token"]
    # zapas 60 s, zeby nie trafic na token wygasajacy w trakcie zapytania
    _token["expires"] = time.time() + float(body.get("expires_in", 3600)) - 60
    log.info("Twitch: token OK")
    return _token["value"]


def _helix(path: str, params: dict) -> dict:
    for attempt in range(2):
        headers = {"Client-ID": env("TWITCH_CLIENT_ID"), "Authorization": f"Bearer {get_token()}"}
        try:
            resp = _request("GET", f"{HELIX}/{path}", params=params, headers=headers)
        except requests.RequestException as exc:
            raise TwitchApiError(f"Twitch Helix /{path}: {type(exc).__name__}") from exc
        if resp.status_code == 401 and attempt == 0:
            reset_token()          # token mogl wygasnac wczesniej niz zakladalismy
            continue
        if resp.status_code != 200:
            raise TwitchApiError(
                f"Twitch Helix /{path}: HTTP {resp.status_code}: {resp.text[:200]}")
        return resp.json()
    raise TwitchApiError(f"Twitch Helix /{path}: brak autoryzacji")  # pragma: no cover


# --- Pomocnicze --------------------------------------------------------------

_DUR_RE = re.compile(r"(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$")


def parse_duration(text: str) -> float:
    """"1h2m3s" -> 3723.0."""
    m = _DUR_RE.match((text or "").strip())
    if not m or not any(m.groups()):
        raise ValueError(f"Nieznany format czasu trwania: {text!r}")
    h, mi, s = (int(g or 0) for g in m.groups())
    return float(h * 3600 + mi * 60 + s)


def _parse_time(text: str) -> datetime:
    return datetime.fromisoformat(text.replace("Z", "+00:00"))


def _rfc3339(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def user_id(login: str) -> str:
    data = _helix("users", {"login": login.lower()}).get("data") or []
    if not data:
        raise TwitchApiError(f"Twitch: nie ma kanalu {login!r}")
    return str(data[0]["id"])


def _clip_row(c: dict) -> dict:
    return {
        "vod_offset": c.get("vod_offset"),
        "duration": float(c.get("duration") or 0.0),
        "view_count": int(c.get("view_count") or 0),
        "title": c.get("title") or "",
        "url": c.get("url") or "",
        "created_at": c.get("created_at") or "",
        "video_id": str(c.get("video_id") or ""),
    }


def _fetch_clips(broadcaster_id: str, started_at: str, ended_at: str | None) -> list[dict]:
    out: list[dict] = []
    cursor: str | None = None
    for _ in range(MAX_PAGES):
        params = {"broadcaster_id": broadcaster_id, "first": 100, "started_at": started_at}
        if ended_at:
            params["ended_at"] = ended_at
        if cursor:
            params["after"] = cursor
        body = _helix("clips", params)
        out.extend(body.get("data") or [])
        cursor = (body.get("pagination") or {}).get("cursor")
        if not cursor:
            break
    else:
        log.warning("Twitch clips: ucieto po %d stronach", MAX_PAGES)
    return out


# --- Pobieranie klipow -------------------------------------------------------

def vod_clips(video_id: str, channel: str, started_at: str | None = None,
              ended_at: str | None = None) -> list[dict]:
    """Klipy widzow zrobione z danego VOD-a (tylko z ustawionym vod_offset)."""
    if not started_at or not ended_at:
        vids = _helix("videos", {"id": video_id}).get("data") or []
        if not vids:
            raise TwitchApiError(f"Twitch: nie ma VOD-a {video_id}")
        created = _parse_time(vids[0]["created_at"])
        length = timedelta(seconds=parse_duration(vids[0]["duration"]))
        started_at = started_at or _rfc3339(created)
        ended_at = ended_at or _rfc3339(created + length + VOD_END_MARGIN)
    raw = _fetch_clips(user_id(channel), started_at, ended_at)
    out = [_clip_row(c) for c in raw
           if str(c.get("video_id") or "") == str(video_id) and c.get("vod_offset") is not None]
    log.info("Twitch: %d klipow widzow z VOD %s (z %d w zakresie dat)",
             len(out), video_id, len(raw))
    return out


def recent_clips(channel: str, since_minutes: int = 30) -> list[dict]:
    """Klipy z ostatnich N minut (live). vod_offset moze byc jeszcze pusty."""
    since = datetime.now(timezone.utc) - timedelta(minutes=since_minutes)
    raw = _fetch_clips(user_id(channel), _rfc3339(since), None)
    return [_clip_row(c) for c in raw]


# --- Kandydaci ---------------------------------------------------------------

def clip_candidates(clips: list[dict], channel: str, preroll: float, postroll: float,
                    min_views: int = 1) -> list[Candidate]:
    """Kandydaci z klipow widzow; klipy z offsetami w obrebie 30 s zlewamy (suma wyswietlen)."""
    usable = [c for c in clips
              if c.get("vod_offset") is not None and int(c.get("view_count") or 0) >= min_views]
    usable.sort(key=lambda c: float(c["vod_offset"]))

    groups: list[list[dict]] = []
    for c in usable:
        if groups and float(c["vod_offset"]) - float(groups[-1][-1]["vod_offset"]) <= CLIP_MERGE_GAP:
            groups[-1].append(c)
        else:
            groups.append([c])

    out: list[Candidate] = []
    for g in groups:
        views = sum(int(c.get("view_count") or 0) for c in g)
        best = max(g, key=lambda c: int(c.get("view_count") or 0))
        t_start = min(max(0.0, float(c["vod_offset"]) - preroll / 2) for c in g)
        t_end = max(float(c["vod_offset"]) + float(c.get("duration") or 0) + postroll / 2 for c in g)
        off = float(best["vod_offset"])
        out.append(Candidate(
            channel=channel,
            t_peak=off + float(best.get("duration") or 0) / 2,
            score=math.log2(1 + views),
            t_start=t_start,
            t_end=t_end,
            sample=[best.get("title") or ""],
            source="viewer_clip",
        ))
    return out


def merge(chat_cands: list[Candidate], clip_cands: list[Candidate],
          window: float = 45.0) -> list[Candidate]:
    """Laczy oba sygnaly. Zgodnosc czatu i klipu = premia; klipy bez czatu zostaja."""
    used: set[int] = set()
    out: list[Candidate] = []
    for ch in chat_cands:
        match = None
        for i, cl in enumerate(clip_cands):
            if abs(cl.t_peak - ch.t_peak) <= window and (
                    match is None
                    or abs(cl.t_peak - ch.t_peak) < abs(clip_cands[match].t_peak - ch.t_peak)):
                match = i
        if match is None:
            out.append(ch)
            continue
        cl = clip_cands[match]
        used.add(match)
        out.append(replace(
            ch,
            score=ch.score + CHAT_BOOST,
            t_start=min(ch.t_start, cl.t_start),
            sample=list(ch.sample) + [s for s in cl.sample if s],
            source="both",
        ))
    for i, cl in enumerate(clip_cands):
        if i not in used:
            out.append(cl)
    return sorted(out, key=lambda c: c.t_peak)


def compare(chat_cands: list[Candidate], clips: list[dict], window: float = 45.0) -> dict:
    """Do strojenia progu: ile z 10 najczesciej ogladanych klipow widzow wykryl czat."""
    placed = [c for c in clips if c.get("vod_offset") is not None]
    top = sorted(placed, key=lambda c: int(c.get("view_count") or 0), reverse=True)[:10]
    hits: list[dict] = []
    misses: list[dict] = []
    for c in top:
        peak = float(c["vod_offset"]) + float(c.get("duration") or 0) / 2
        near = [ch for ch in chat_cands if abs(ch.t_peak - peak) <= window]
        row = {"vod_offset": float(c["vod_offset"]), "views": int(c.get("view_count") or 0),
               "title": c.get("title") or ""}
        (hits if near else misses).append(row)
    return {
        "clips_total": len(placed),
        "checked": len(top),
        "hits": hits,
        "misses": misses,
        "hit_rate": (len(hits) / len(top)) if top else 0.0,
    }
