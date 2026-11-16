"""Zrodlo VOD: metadane, replay czatu i pobieranie fragmentow wideo z Twitcha.

Czas `t` to sekundy od poczatku nagrania.
"""
from __future__ import annotations

import glob
import importlib.util
import json
import logging
import os
import re
import shutil
import subprocess
import sys
import time
from dataclasses import asdict
from pathlib import Path
from typing import Iterable

import requests

from clipper.models import ChatMessage

log = logging.getLogger(__name__)

_TWITCH_VOD_RE = re.compile(
    r"^https?://(?:www\.|m\.)?twitch\.tv/(?:[A-Za-z0-9_]+/)?v(?:ideos)?/(\d+)/?(?:[?#].*)?$"
)

GQL_URL = "https://gql.twitch.tv/gql"
GQL_CLIENT_ID = "kimne78kx3ncx6brgo4mv6wki5h1ko"   # publiczny Client-ID strony twitch.tv
GQL_COMMENTS_HASH = "b70a3591ff0f4e0313d126c6a1502d79a1c02baebb288227c582044aa76adf6a"

PROGRESS_EVERY = 5000
_SYSTEM_HINTS = ("sub", "gift", "raid", "bits", "cheer", "ritual", "announcement", "notice")


# --------------------------------------------------------------------------- #
# Narzedzia pomocnicze
# --------------------------------------------------------------------------- #

def _stderr_tail(text: str | None, lines: int = 15) -> str:
    return "\n".join((text or "").strip().splitlines()[-lines:])


def ytdlp_cmd() -> list[str]:
    """Zwraca poczatek komendy yt-dlp: exe z PATH, exe z winget albo modul w venv."""
    exe = shutil.which("yt-dlp")
    if exe:
        return [exe]
    # winget dopisuje do PATH dopiero w nowej powloce, wiec szukamy recznie
    local = os.environ.get("LOCALAPPDATA")
    if local:
        base = Path(local) / "Microsoft" / "WinGet"
        candidates = [str(base / "Links" / "yt-dlp.exe")]
        candidates += sorted(glob.glob(str(base / "Packages" / "yt-dlp.yt-dlp_*" / "yt-dlp.exe")))
        for cand in candidates:
            if Path(cand).is_file():
                return [cand]
    if importlib.util.find_spec("yt_dlp") is not None:
        return [sys.executable, "-m", "yt_dlp"]
    raise RuntimeError(
        "Nie znaleziono yt-dlp (ani na PATH, ani w WinGet, ani jako modul yt_dlp w venv)"
    )


def _run_ytdlp(args: list[str], *, capture_stdout: bool = False) -> str:
    cmd = ytdlp_cmd() + args
    log.debug("Uruchamiam: %s", cmd)
    proc = subprocess.run(
        cmd,
        stdout=subprocess.PIPE if capture_stdout else subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if proc.returncode != 0:
        raise RuntimeError(
            f"yt-dlp zakonczyl sie kodem {proc.returncode}: {_stderr_tail(proc.stderr)}"
        )
    return proc.stdout or ""


# --------------------------------------------------------------------------- #
# URL i metadane
# --------------------------------------------------------------------------- #

def parse_vod_url(url: str) -> tuple[str, str]:
    """(platforma, id_wideo) dla adresu VOD-a z Twitcha. Inne adresy -> ValueError."""
    m = _TWITCH_VOD_RE.match((url or "").strip())
    if not m:
        raise ValueError(f"Nieobslugiwany adres VOD: {url!r}")
    return "twitch", m.group(1)


def vod_info(url: str) -> dict:
    """Metadane VOD-a: id, channel (login, male litery), title, duration (s)."""
    _, video_id = parse_vod_url(url)
    raw = json.loads(_run_ytdlp(["-J", "--no-warnings", "--no-playlist", url], capture_stdout=True))
    channel = raw.get("uploader_id") or raw.get("uploader") or raw.get("channel") or ""
    return {
        "id": video_id,
        "channel": str(channel).lower(),
        "title": raw.get("title") or "",
        "duration": float(raw.get("duration") or 0.0),
    }


# --------------------------------------------------------------------------- #
# Czat
# --------------------------------------------------------------------------- #

def load_chat(path: Path) -> list[ChatMessage]:
    """Wczytuje czat z pliku cache (lista slownikow)."""
    raw = json.loads(Path(path).read_text(encoding="utf-8"))
    return [
        ChatMessage(
            t=float(d["t"]),
            user=str(d.get("user", "")),
            text=str(d.get("text", "")),
            kind=str(d.get("kind", "msg")),
        )
        for d in raw
    ]


def save_chat(messages: Iterable[ChatMessage], path: Path) -> Path:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".part")
    tmp.write_text(
        json.dumps([asdict(m) for m in messages], ensure_ascii=False), encoding="utf-8"
    )
    tmp.replace(path)
    return path


def _kind_from_type(message_type: str | None, has_bits: bool = False) -> str:
    mt = (message_type or "").lower()
    if has_bits or any(h in mt for h in _SYSTEM_HINTS):
        return "system"
    return "msg"


def _chat_via_chat_downloader(url: str) -> list[ChatMessage]:
    """Sciezka podstawowa: biblioteka chat_downloader."""
    from chat_downloader import ChatDownloader

    out: list[ChatMessage] = []
    downloader = ChatDownloader()
    try:
        # domyslnie biblioteka ponawia 15 razy z rosnaca przerwa i czeka na Enter:
        # przy zepsutym API Twitcha wisialaby kilkanascie minut, zanim wejdzie GQL
        chat = downloader.get_chat(url, max_attempts=2, interruptible_retry=False)
        for item in chat:
            t = item.get("time_in_seconds")
            if t is None:
                continue
            author = item.get("author") or {}
            user = author.get("name") or author.get("display_name") or ""
            kind = _kind_from_type(item.get("message_type"), bool(item.get("bits")))
            out.append(ChatMessage(t=float(t), user=str(user), text=str(item.get("message") or ""), kind=kind))
            if len(out) % PROGRESS_EVERY == 0:
                log.info("Czat (chat_downloader): %d wiadomosci, t=%.0f s", len(out), out[-1].t)
    finally:
        downloader.close()
    return out


def _gql_comments_page(session: requests.Session, video_id: str, *, cursor: str | None,
                       offset: float | None) -> dict:
    variables: dict = {"videoID": video_id}
    if cursor is not None:
        variables["cursor"] = cursor
    else:
        variables["contentOffsetSeconds"] = int(offset or 0)
    payload = [{
        "operationName": "VideoCommentsByOffsetOrCursor",
        "variables": variables,
        "extensions": {"persistedQuery": {"version": 1, "sha256Hash": GQL_COMMENTS_HASH}},
    }]
    last_err: Exception | None = None
    for attempt in range(4):
        try:
            resp = session.post(GQL_URL, json=payload, timeout=30)
            if resp.status_code >= 500 or resp.status_code == 429:
                raise RuntimeError(f"HTTP {resp.status_code}: {resp.text[:200]}")
            if resp.status_code != 200:
                # blad klienta: ponawianie nic nie da
                raise ValueError(f"Twitch GQL HTTP {resp.status_code}: {resp.text[:300]}")
            body = resp.json()
            entry = body[0] if isinstance(body, list) else body
            if entry.get("errors"):
                raise ValueError(f"Twitch GQL zwrocil bledy: {entry['errors']}")
            video = (entry.get("data") or {}).get("video")
            if video is None:
                raise ValueError(f"Twitch GQL: brak wideo {video_id} (usuniete albo prywatne)")
            return video.get("comments") or {}
        except ValueError:
            raise
        except (requests.RequestException, RuntimeError) as exc:
            last_err = exc
            log.warning("Twitch GQL: proba %d nieudana (%s), ponawiam", attempt + 1, exc)
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"Twitch GQL: nie udalo sie pobrac strony komentarzy: {last_err}")


def _gql_node_to_message(node: dict) -> ChatMessage:
    message = node.get("message") or {}
    text = "".join((frag or {}).get("text") or "" for frag in (message.get("fragments") or []))
    commenter = node.get("commenter") or {}
    user = commenter.get("login") or commenter.get("displayName") or ""
    notice = message.get("userNoticeParams") or {}
    kind = "system" if notice.get("msgID") else "msg"
    return ChatMessage(t=float(node.get("contentOffsetSeconds") or 0), user=str(user), text=text, kind=kind)


def _chat_via_gql(video_id: str) -> list[ChatMessage]:
    """Sciezka zapasowa: publiczny endpoint GQL Twitcha.

    Najpierw stronicowanie kursorem. Twitch potrafi odrzucac zapytania z kursorem
    (wymaga tokenu integralnosci), wtedy przechodzimy na stronicowanie offsetem
    czasu z deduplikacja po id komentarza.
    """
    session = requests.Session()
    session.headers.update({"Client-ID": GQL_CLIENT_ID, "Content-Type": "application/json"})
    out: list[ChatMessage] = []
    seen: set[str] = set()
    next_log = PROGRESS_EVERY

    def add_edges(edges: list[dict]) -> tuple[int, float]:
        added, last_t = 0, -1.0
        for edge in edges:
            node = edge.get("node") or {}
            last_t = max(last_t, float(node.get("contentOffsetSeconds") or 0))
            cid = node.get("id")
            if cid in seen:
                continue
            if cid:
                seen.add(cid)
            out.append(_gql_node_to_message(node))
            added += 1
        return added, last_t

    def progress() -> None:
        nonlocal next_log
        if len(out) >= next_log:
            log.info("Czat (GQL): %d wiadomosci, t=%.0f s", len(out), out[-1].t)
            next_log = (len(out) // PROGRESS_EVERY + 1) * PROGRESS_EVERY

    use_cursor = True
    cursor: str | None = None
    offset = 0.0
    try:
        while True:
            if use_cursor and cursor is not None:
                try:
                    page = _gql_comments_page(session, video_id, cursor=cursor, offset=None)
                except ValueError as exc:
                    log.warning("Twitch GQL odrzucil kursor (%s); przechodze na offset czasu", exc)
                    use_cursor = False
                    continue
            else:
                page = _gql_comments_page(session, video_id, cursor=None, offset=offset)

            edges = page.get("edges") or []
            if not edges:
                break
            added, last_t = add_edges(edges)
            progress()
            has_next = bool((page.get("pageInfo") or {}).get("hasNextPage"))
            if not has_next:
                break
            if use_cursor:
                cursor = edges[-1].get("cursor")
                if not cursor:
                    use_cursor = False
            if not use_cursor:
                # ta sama sekunda moze miec wiecej wiadomosci niz jedna strona:
                # gdy nic nowego nie przybylo, przeskakujemy o sekunde dalej
                new_offset = float(int(last_t))
                if added == 0 or new_offset <= offset:
                    new_offset = offset + 1
                offset = new_offset
    finally:
        session.close()
    out.sort(key=lambda m: m.t)
    return out


def download_chat(url: str, out_json: Path) -> list[ChatMessage]:
    """Pobiera caly replay czatu VOD-a i zapisuje cache w `out_json`.

    Jesli plik cache juz istnieje, czat jest wczytywany z niego.
    """
    out_json = Path(out_json)
    if out_json.exists() and out_json.stat().st_size > 0:
        log.info("Czat z cache: %s", out_json)
        return load_chat(out_json)

    _, video_id = parse_vod_url(url)
    messages: list[ChatMessage] | None = None
    try:
        messages = _chat_via_chat_downloader(url)
        if not messages:
            log.warning("chat_downloader zwrocil 0 wiadomosci; probuje bezposrednio przez GQL")
            messages = None
    except Exception as exc:  # stara biblioteka: kazdy blad oznacza przejscie na GQL
        log.warning("chat_downloader nie zadzialal (%s: %s); probuje bezposrednio przez GQL",
                    type(exc).__name__, exc)
    if messages is None:
        messages = _chat_via_gql(video_id)

    messages.sort(key=lambda m: m.t)
    save_chat(messages, out_json)
    log.info("Czat pobrany: %d wiadomosci, zapisano do %s", len(messages), out_json)
    return messages


# --------------------------------------------------------------------------- #
# Wideo
# --------------------------------------------------------------------------- #

def _max_height_from_quality(quality: str | None) -> int | None:
    """"720p,720p60,best" -> 720. Sama "best"/"source" -> brak limitu (None)."""
    heights = [int(m.group(1)) for m in re.finditer(r"(\d{3,4})p", quality or "")]
    return max(heights) if heights else None


def _format_selector(max_height: int | None) -> str:
    if not max_height:
        return "b/bv*+ba"
    h = int(max_height)
    # ostatnie "/b": gdy nie ma nic <= limitu, bierzemy najlepsze dostepne
    return f"b[height<={h}]/bv*[height<={h}]+ba/b"


def _fmt_ts(seconds: float) -> str:
    return f"{max(0.0, float(seconds)):.3f}"


def _download(url: str, out: Path, max_height: int | None, extra: list[str]) -> Path:
    parse_vod_url(url)
    out = Path(out)
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = out.with_name(out.stem + ".dl.mp4")
    if tmp.exists():
        tmp.unlink()
    args = [
        "--no-playlist", "--no-progress", "--force-overwrites", "--no-part",
        "-f", _format_selector(max_height),
        "--merge-output-format", "mp4",
        *extra,
        "-o", str(tmp).replace("%", "%%"),
        url,
    ]
    ffmpeg = shutil.which("ffmpeg")
    if ffmpeg:
        args = ["--ffmpeg-location", str(Path(ffmpeg).parent)] + args
    try:
        _run_ytdlp(args)
        if not tmp.exists() or tmp.stat().st_size == 0:
            raise RuntimeError(f"yt-dlp nie utworzyl pliku wyjsciowego: {tmp}")
        tmp.replace(out)
    finally:
        if tmp.exists():
            tmp.unlink()
    return out


def download_range(url: str, t_start: float, t_end: float, out: Path,
                   quality: str = "720p,720p60,best") -> Path:
    """Pobiera tylko zakres [t_start, t_end] VOD-a do pliku mp4."""
    if t_end <= t_start:
        raise ValueError(f"Pusty zakres: t_start={t_start}, t_end={t_end}")
    log.info("Pobieram zakres %.1f-%.1f s z %s -> %s", t_start, t_end, url, out)
    section = f"*{_fmt_ts(t_start)}-{_fmt_ts(t_end)}"
    return _download(
        url, out, _max_height_from_quality(quality),
        ["--download-sections", section, "--force-keyframes-at-cuts"],
    )


def download_full(url: str, out: Path, max_height: int = 720) -> Path:
    """Pobiera caly VOD (gdy z jednego nagrania jest wielu kandydatow)."""
    log.info("Pobieram caly VOD %s -> %s (max %sp)", url, out, max_height)
    return _download(url, out, max_height, ["--concurrent-fragments", "4"])
