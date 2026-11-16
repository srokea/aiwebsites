"""Akceptacja przez czlowieka: klip leci na telefon przez ntfy z przyciskami
OK / Odrzuc, a decyzje wracaja tematem `<topic>-reply`.

Decyzje mozna tez wpisac recznie w aplikacji ntfy na temacie odpowiedzi:
"ok 12" albo "no 12 za nudne" (reszta to powod odrzucenia).
"""
from __future__ import annotations

import base64
import json
import logging
import re
import subprocess
from pathlib import Path

import requests

from .config import env, subdir
from .models import ClipMeta

log = logging.getLogger(__name__)

MAX_ATTACHMENT_BYTES = 1_800_000            # zmierzone 15.11.2026: ntfy.sh przyjmuje 1 MB, odrzuca 3 MB (HTTP 413)
PREVIEW_TARGET_BYTES = 1_400_000            # docelowy rozmiar podgladu
TIMEOUT_S = 120

_DECISION_RE = re.compile(r"^\s*(ok|yes|tak|no|nie)\s+#?(\d+)\b[\s:,-]*(.*)$", re.IGNORECASE | re.DOTALL)
_APPROVE_WORDS = {"ok", "yes", "tak"}


class NtfyConfigError(RuntimeError):
    """Brak konfiguracji ntfy."""


def _base() -> str:
    return env("NTFY_URL", "https://ntfy.sh").rstrip("/")


def _topic() -> str:
    topic = env("NTFY_TOPIC")
    if not topic:
        raise NtfyConfigError(
            "Brak NTFY_TOPIC. Ustaw w pliku .env losowy, trudny do zgadniecia temat, "
            "np. NTFY_TOPIC=gta-klipy-x7k2p9, i zasubskrybuj go w aplikacji ntfy na telefonie "
            "(oraz temat <topic>-reply, jesli chcesz wpisywac decyzje recznie)."
        )
    return topic


def reply_topic() -> str:
    return f"{_topic()}-reply"


def _header(value: str) -> str:
    """Wartosc naglowka bezpieczna dla latin-1: jedna linia, a znaki spoza ASCII
    kodowane wg RFC 2047 (tak jak opisuje dokumentacja ntfy)."""
    value = " ".join(str(value).split())
    try:
        value.encode("ascii")
        return value
    except UnicodeEncodeError:
        return "=?UTF-8?B?" + base64.b64encode(value.encode("utf-8")).decode("ascii") + "?="


def _actions(clip_id: int) -> str:
    url = f"{_base()}/{reply_topic()}"
    return (f"http, OK, {url}, method=POST, body=ok {clip_id}, clear=true; "
            f"http, Odrzuc, {url}, method=POST, body=no {clip_id}, clear=true")


def _duration(path: Path) -> float:
    """Dlugosc pliku w sekundach (ffprobe); 60 s, gdy nie da sie odczytac."""
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                        "-of", "csv=p=0", str(path)], capture_output=True, text=True)
    try:
        return float(r.stdout.strip()) or 60.0
    except ValueError:
        log.warning("Nie udalo sie odczytac dlugosci %s, przyjmuje 60 s", path)
        return 60.0


def make_preview(clip_path: Path, clip_id: int) -> Path:
    """Mniejsza wersja klipu (540x960) do podgladu na telefonie."""
    out = subdir("previews") / f"{clip_id}_preview.mp4"
    # Bitrate liczony z dlugosci klipu, zeby podglad zmiescil sie w limicie zalacznika ntfy.
    dur = _duration(clip_path)
    total_kbps = PREVIEW_TARGET_BYTES * 8 / dur / 1000
    v_kbps = max(80, int(total_kbps - 40))
    cmd = [
        "ffmpeg", "-y", "-loglevel", "error", "-i", str(clip_path),
        "-vf", "scale=360:640,fps=24", "-c:v", "libx264", "-preset", "veryfast",
        "-b:v", f"{v_kbps}k", "-maxrate", f"{v_kbps}k", "-bufsize", f"{v_kbps * 2}k",
        "-c:a", "aac", "-ac", "1", "-b:a", "32k", "-movflags", "+faststart", str(out),
    ]
    log.info("Klip %s za duzy na ntfy, robie podglad: %s", clip_id, out)
    subprocess.run(cmd, check=True)
    return out


def send_for_approval(clip_id: int, clip_path: Path, meta: ClipMeta, extra: str = "") -> str:
    """Wysyla klip do akceptacji. Zwraca id wiadomosci ntfy."""
    topic = _topic()
    clip_path = Path(clip_path)
    attachment: Path | None = clip_path
    note = ""
    if clip_path.stat().st_size > MAX_ATTACHMENT_BYTES:
        attachment = make_preview(clip_path, clip_id)
        if attachment.stat().st_size > MAX_ATTACHMENT_BYTES:
            log.warning("Podglad klipu %s nadal przekracza limit ntfy (%d B), wysylam bez wideo",
                        clip_id, attachment.stat().st_size)
            attachment = None
            note = f"Wideo za duze na ntfy, obejrzyj lokalnie: {clip_path}"

    tags = " ".join("#" + h.lstrip("#") for h in meta.hashtags)
    parts = [meta.description, tags, f"ocena {meta.score}/10", meta.reason, extra, note]
    message = " | ".join(p.strip() for p in parts if p and p.strip())
    headers = {
        "Title": _header(f"[{clip_id}] {meta.title}"),
        "X-Message": _header(message),
        "Tags": "clapper",
        "Priority": "3",
        "Actions": _actions(clip_id),
    }
    url = f"{_base()}/{topic}"
    if attachment is not None:
        headers["Filename"] = _header(f"clip_{clip_id}.mp4")
        with attachment.open("rb") as fh:
            resp = requests.put(url, data=fh, headers=headers, timeout=TIMEOUT_S)
    else:
        resp = requests.put(url, data=b"", headers=headers, timeout=TIMEOUT_S)
    resp.raise_for_status()
    msg_id = str(resp.json().get("id", ""))
    log.info("Klip %s wyslany do akceptacji (ntfy id=%s)", clip_id, msg_id)
    return msg_id


def parse_decision(text: str) -> tuple[int, str, str] | None:
    """'ok 12' -> (12, 'approved', ''), 'no 12 za nudne' -> (12, 'rejected', 'za nudne')."""
    m = _DECISION_RE.match(text or "")
    if not m:
        return None
    decision = "approved" if m.group(1).lower() in _APPROVE_WORDS else "rejected"
    reason = " ".join(m.group(3).split()) if decision == "rejected" else ""
    return int(m.group(2)), decision, reason


def poll_decisions(since: str = "all") -> list[tuple[int, str, str, str]]:
    """Pobiera decyzje z tematu odpowiedzi: (clip_id, 'approved'|'rejected', id wiadomosci,
    powod odrzucenia albo ''). Jako `since` podaj id ostatniej obsluzonej wiadomosci,
    zeby nie czytac tych samych decyzji drugi raz."""
    url = f"{_base()}/{reply_topic()}/json"
    resp = requests.get(url, params={"poll": "1", "since": since}, timeout=30)
    resp.raise_for_status()
    out: list[tuple[int, str, str, str]] = []
    for line in resp.text.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
        except json.JSONDecodeError:
            log.warning("ntfy: pomijam nieczytelna linie: %.120r", line)
            continue
        if not isinstance(msg, dict) or msg.get("event") != "message":
            continue
        parsed = parse_decision(str(msg.get("message", "")))
        if parsed is None:
            log.info("ntfy: wiadomosc %s nie jest decyzja: %.80r", msg.get("id"), msg.get("message"))
            continue
        clip_id, decision, reason = parsed
        out.append((clip_id, decision, str(msg.get("id", "")), reason))
    return out


def notify(title: str, message: str, priority: int = 3) -> str:
    """Zwykle powiadomienie (np. przypomnienie o zgloszeniu linku do kampanii)."""
    resp = requests.post(
        f"{_base()}/{_topic()}",
        data=message.encode("utf-8"),
        headers={"Title": _header(title), "Priority": str(int(priority))},
        timeout=30,
    )
    resp.raise_for_status()
    return str(resp.json().get("id", ""))
