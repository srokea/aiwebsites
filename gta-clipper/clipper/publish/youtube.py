"""Upload na YouTube Shorts przez YouTube Data API v3 (OAuth aplikacji desktopowej).

Domyslna widocznosc to "private" celowo: publiczny upload wymaga jawnego
privacy="public" od wywolujacego.
"""
from __future__ import annotations

import logging
import os
import re
from pathlib import Path

from ..config import ROOT, env
from ..models import ClipMeta

log = logging.getLogger(__name__)

SCOPES = [
    "https://www.googleapis.com/auth/youtube.upload",
    "https://www.googleapis.com/auth/youtube.readonly",
]
AUTH_PORT = 8765                         # staly port serwera zwrotnego OAuth (latwo przekierowac)
MAX_TITLE = 100
MAX_DESCRIPTION = 5000
SHORTS_SUFFIX = " #Shorts"
PRIVACY = ("private", "unlisted", "public")


class YouTubeConfigError(RuntimeError):
    """Brak albo bledna konfiguracja dostepu do YouTube."""


def _secrets_path() -> Path:
    raw = env("YOUTUBE_CLIENT_SECRETS")
    if not raw:
        raise YouTubeConfigError("Brak YOUTUBE_CLIENT_SECRETS w .env. " + _HOWTO)
    path = Path(raw)
    if not path.is_absolute():
        path = ROOT / path
    if not path.is_file():
        raise YouTubeConfigError(f"Nie ma pliku OAuth dla YouTube: {path}. " + _HOWTO)
    return path


_HOWTO = (
    "Jak go zdobyc: 1) wejdz na console.cloud.google.com i utworz projekt, "
    "2) APIs & Services -> Library -> wlacz \"YouTube Data API v3\", "
    "3) APIs & Services -> Credentials -> Create credentials -> OAuth client ID -> typ \"Desktop app\", "
    "4) pobierz JSON i zapisz jako secrets/youtube_client_secret.json, "
    "5) w .env ustaw YOUTUBE_CLIENT_SECRETS=secrets/youtube_client_secret.json. "
    "Przy pierwszym uploadzie otworzy sie przegladarka z prosba o zgode."
)


def _token_path(account: str) -> Path:
    safe = re.sub(r"[^A-Za-z0-9_.-]", "_", account) or "default"
    return ROOT / "secrets" / f"youtube_token_{safe}.json"


def _credentials(account: str):
    """Token z cache, odswiezony w razie potrzeby; inaczej pelna zgoda w przegladarce."""
    token_path = _token_path(account)
    creds = None
    if token_path.is_file():
        from google.oauth2.credentials import Credentials
        creds = Credentials.from_authorized_user_file(str(token_path), SCOPES)
    if creds and creds.valid:
        return creds
    if creds and creds.expired and creds.refresh_token:
        from google.auth.exceptions import RefreshError
        from google.auth.transport.requests import Request
        try:
            creds.refresh(Request())
        except RefreshError as exc:
            log.warning("Token YouTube (%s) nie dal sie odswiezyc: %s; potrzebna ponowna zgoda",
                        account, exc)
            creds = None
    else:
        creds = None
    if creds is None:
        secrets = _secrets_path()            # czytelny blad, zanim cokolwiek pojdzie w siec
        from google_auth_oauthlib.flow import InstalledAppFlow
        # Przy zdalnym VS Code zmienna BROWSER wskazuje helper browser.cmd, ktory obcina URL
        # na pierwszym '&' (Google: "Missing client_id") i otwiera go na innym komputerze.
        # Bez niej przegladarka otwiera sie na tym PC, gdzie dziala serwer zwrotny.
        os.environ.pop("BROWSER", None)
        log.info("YouTube: otwieram przegladarke po zgode dla konta %s (port %d)", account, AUTH_PORT)
        flow = InstalledAppFlow.from_client_secrets_file(str(secrets), SCOPES)
        creds = flow.run_local_server(
            port=AUTH_PORT,
            authorization_prompt_message="LINK DO LOGOWANIA: {url}",
            success_message="Gotowe, kliper ma dostep do kanalu. Mozesz zamknac te karte.",
        )
    token_path.parent.mkdir(parents=True, exist_ok=True)
    token_path.write_text(creds.to_json(), encoding="utf-8")
    return creds


def _service(account: str):
    creds = _credentials(account)
    from googleapiclient.discovery import build
    return build("youtube", "v3", credentials=creds, cache_discovery=False)


def build_title(title: str) -> str:
    """Tytul do 100 znakow, z ' #Shorts' na koncu, jesli sie miesci."""
    title = " ".join((title or "").replace("<", "").replace(">", "").split())
    if "#shorts" in title.lower():
        return title[:MAX_TITLE]
    if len(title) + len(SHORTS_SUFFIX) <= MAX_TITLE:
        return title + SHORTS_SUFFIX
    return title[:MAX_TITLE]


def build_description(meta: ClipMeta) -> str:
    tags = " ".join("#" + h.lstrip("#") for h in meta.hashtags if h.strip("# "))
    text = "\n\n".join(p for p in ((meta.description or "").strip(), tags) if p)
    return text.replace("<", "").replace(">", "")[:MAX_DESCRIPTION]


def upload(path: Path | str, meta: ClipMeta, *, privacy: str = "private", account: str = "default") -> str:
    """Wysyla klip i zwraca adres https://youtube.com/shorts/<id>."""
    if privacy not in PRIVACY:
        raise ValueError(f"privacy musi byc jednym z {PRIVACY}, a jest {privacy!r}")
    path = Path(path)
    if not path.is_file():
        raise FileNotFoundError(f"Nie ma pliku do wyslania: {path}")
    service = _service(account)
    from googleapiclient.http import MediaFileUpload

    body = {
        "snippet": {
            "title": build_title(meta.title),
            "description": build_description(meta),
            "tags": [h.lstrip("#") for h in meta.hashtags if h.strip("# ")],
            "categoryId": "20",              # Gaming
        },
        "status": {"privacyStatus": privacy, "selfDeclaredMadeForKids": False},
    }
    media = MediaFileUpload(str(path), mimetype="video/mp4", chunksize=8 * 1024 * 1024, resumable=True)
    request = service.videos().insert(part="snippet,status", body=body, media_body=media)
    response = None
    while response is None:
        status, response = request.next_chunk(num_retries=3)
        if status:
            log.info("YouTube upload %s: %d%%", path.name, int(status.progress() * 100))
    video_id = response["id"]
    url = f"https://youtube.com/shorts/{video_id}"
    log.info("YouTube: wyslano %s jako %s (%s)", path.name, url, privacy)
    return url


def whoami(account: str = "default") -> str:
    """Loguje (w razie potrzeby otwiera przegladarke) i zwraca nazwe kanalu, na ktory pojda uploady."""
    response = _service(account).channels().list(part="snippet", mine=True).execute()
    items = response.get("items") or []
    if not items:
        raise YouTubeConfigError("To konto Google nie ma kanalu YouTube. Zaloguj sie kontem kanalu.")
    return f"{items[0]['snippet']['title']} (id {items[0]['id']})"


def views(video_id: str, *, account: str = "default") -> int:
    """Liczba wyswietlen filmu."""
    response = _service(account).videos().list(part="statistics", id=video_id).execute()
    items = response.get("items") or []
    if not items:
        raise LookupError(f"YouTube nie zna filmu {video_id} (usuniety albo inne konto?)")
    return int(items[0]["statistics"].get("viewCount", 0))
