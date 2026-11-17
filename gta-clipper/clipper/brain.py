"""Mozg: lokalny LLM przez Ollame. Dostaje transkrypt i probke czatu, zwraca
tytul, opis, hashtagi i ocene momentu. Bez Ollamy pipeline dziala dalej na
metadanych zastepczych.
"""
from __future__ import annotations

import json
import logging
import re

import requests

from .config import env
from .models import ClipMeta

log = logging.getLogger(__name__)

TIMEOUT_S = 120
MAX_TITLE = 40
MAX_EMOJI = 2
MAX_TAGS = 6
MAX_MODEL_TAGS = 2
BASE_TAGS = ["gta6", "gtavi", "gta", "shorts"]
# GTA RP (NoPixel itp.) dziala dzis na GTA V, wiec tagi gta6/gtavi bylyby wprowadzaniem w blad.
RP_BASE_TAGS = ["gtarp", "nopixel", "gta", "shorts"]
MAX_TRANSCRIPT_CHARS = 5000      # zeby zmiescic sie w num_ctx=4096
MAX_CHAT_LINES = 40
ATTEMPTS = 2

SYSTEM_PROMPT = """You are an editor of short vertical gaming clips (TikTok, YouTube Shorts).
You get what the streamer said (transcript) and how the live chat reacted during one moment of a stream.
Decide whether the moment is worth posting and write its metadata.

Return ONLY a JSON object with exactly these keys:
- "title": at most 40 characters, a scroll-stopping hook shown on screen for the whole clip. Make the viewer NEED to see what happens: tension, surprise or a funny contrast ("He Did NOT Expect That Cop", "Worst Getaway Driver Ever", "Lacy Got Betrayed Instantly"). Concrete, punchy, everyday words; up to 1 word in CAPS for emphasis; at most 1 emoji (usually none). It must stay TRUE to what happens: no fake events. Use the streamer's name when it makes the hook stronger.
- "description": 1-2 sentences.
- "hashtags": 0 to 2 specific hashtags about this very moment (a vehicle, a place, an activity), lowercase, without the '#' sign, no spaces. No generic ones (gta, gaming, twitch, funny, viral) and never gtav or gta5: the game is GTA VI.
- "score": integer 0-10. Is this a genuinely funny, impressive or shareable moment (7-10), an average one (4-6), or junk such as silence, menus, waiting, small talk (0-3)?
- "reason": one short sentence explaining the score.

Example titles (style only, do not copy):
- "Cop Gets Rammed By His Own Partner"
- "When the getaway car won't start"
- "Taxi Driver vs Armored Truck"
- "Jet Ski Jump Over the Bridge Fails"

Rules:
- The clip starts on the action, so describe what happens, not an introduction.
- Do not invent events, names or quotes that are not supported by the transcript or the chat.
- If the transcript is empty, rely on the chat reaction and keep the title generic but true, e.g. "Chat went crazy at this GTA VI moment".
- Never mention leaks or leaked content.
- Write title and description in the language requested by the user message."""

GENERIC_TAGS = {
    "gta", "gta6", "gtavi", "shorts", "short", "gaming", "gamer", "games", "game", "twitch", "clips", "clip",
    "streamer", "stream", "streaming", "funny", "viral", "fyp", "foryou", "foryoupage", "youtube",
    "youtubeshorts", "video", "videos", "lol", "fail", "fails", "meme", "memes", "trending", "gameplay",
    "grandtheftauto", "grandtheftautovi", "rockstar", "rockstargames", "ps5", "xbox", "pc",
}
ALLOWED_CAPS = {"GTA", "GTA6", "GTAVI", "VI", "LSPD", "NPC", "FBI", "SWAT", "ATM", "VIP", "RPG"}
_EMOJI_RE = re.compile("[\U0001F000-\U0001FAFF←-⯿️‍]")
_WORD_RE = re.compile(r"[^\W\d_]{2,}")


def _url() -> str:
    return env("OLLAMA_URL", "http://localhost:11434").rstrip("/")


def _model() -> str:
    return env("OLLAMA_MODEL", "qwen2.5:7b")


def available() -> bool:
    """Czy Ollama odpowiada."""
    try:
        return requests.get(f"{_url()}/api/tags", timeout=3).status_code == 200
    except requests.RequestException as exc:
        log.info("Ollama niedostepna pod %s: %s", _url(), exc)
        return False


def _wrong_game_tag(tag: str) -> bool:
    """gtav / gta5 i pochodne: to nie jest GTA VI."""
    return tag.startswith("gta5") or (tag.startswith("gtav") and not tag.startswith("gtavi"))


def finish_tags(raw, *, rp: bool = False, extra_tags: list[str] | None = None) -> list[str]:
    """Hashtagi budowane w kodzie, niezaleznie od odpowiedzi modelu: baza gta6/gtavi/gta/shorts
    (dla streamerow RP: gtarp/nopixel/gta/shorts), stale tagi streamera, najwyzej 2 tagi od modelu. Razem 4-6, bez #."""
    def clean(item) -> str:
        return re.sub(r"[^\w]", "", str(item).lower(), flags=re.UNICODE)

    if isinstance(raw, str):
        raw = re.split(r"[,\s]+", raw)
    tags = list(RP_BASE_TAGS if rp else BASE_TAGS)
    for item in extra_tags or []:
        tag = clean(item)
        if tag and tag not in tags and len(tags) < MAX_TAGS and not _wrong_game_tag(tag) and "leak" not in tag:
            tags.append(tag)
    added = 0
    for item in raw if isinstance(raw, list) else []:
        tag = clean(item)
        if (not tag or tag in tags or tag in GENERIC_TAGS or tag == "gtarp" or _wrong_game_tag(tag)
                or "leak" in tag or tag.startswith("gta6") or tag.startswith("gtavi")):
            continue
        if added >= MAX_MODEL_TAGS or len(tags) >= MAX_TAGS:
            break
        tags.append(tag)
        added += 1
    return tags


def normalise_title(title: str, limit: int = MAX_TITLE) -> str:
    """Tytul <= limit znakow (ciecie na granicy slowa), max 2 emoji, bez krzyczenia wielkimi literami."""
    title = " ".join(str(title).split()).strip("\"'` ")
    kept, n = [], 0
    for ch in title:                      # emoji ponad limit wypadaja
        if _EMOJI_RE.match(ch):
            n += 1
            if n > MAX_EMOJI:
                continue
        kept.append(ch)
    title = " ".join("".join(kept).split())

    def shouted(w: str) -> bool:
        return w.isupper() and w not in ALLOWED_CAPS

    # Krzyk = jakies wielkie slowo dluzsze niz 3 litery; wtedy cale wielkie slowa ida na Title Case.
    if any(len(w) > 3 and shouted(w) for w in _WORD_RE.findall(title)):
        title = _WORD_RE.sub(lambda m: m.group(0).capitalize() if shouted(m.group(0)) else m.group(0), title)

    if len(title) > limit:
        space = title[:limit + 1].rfind(" ")
        title = title[:space] if space > 0 else title[:limit]
        title = title.rstrip(" ,;:-")
    return title


def fallback(channel: str, game: str = "GTA VI", reason: str = "fallback: brak LLM",
             rp: bool = False, extra_tags: list[str] | None = None) -> ClipMeta:
    """Metadane zastepcze, gdy LLM nie dziala."""
    name = channel[:1].upper() + channel[1:] if channel else "Stream"
    chan_tag = re.sub(r"[^a-z0-9_]", "", channel.lower())
    return ClipMeta(
        title=normalise_title(f"{name} {game} moment"),
        description=f"{name} playing {game} live on stream.",
        hashtags=finish_tags([chan_tag] if chan_tag else [], rp=rp, extra_tags=extra_tags),
        score=5,
        reason=reason,
    )


def _build_prompt(transcript: str, chat_sample: list[str], channel: str, game: str, lang: str) -> str:
    transcript = (transcript or "").strip()
    if len(transcript) > MAX_TRANSCRIPT_CHARS:
        transcript = transcript[-MAX_TRANSCRIPT_CHARS:]     # koncowka jest blizej reakcji czatu
    chat = [str(m).strip()[:200] for m in (chat_sample or []) if str(m).strip()][:MAX_CHAT_LINES]
    return (
        f"Streamer: {channel}\nGame: {game}\nOutput language: {lang}\n\n"
        f"TRANSCRIPT (what the streamer said):\n{transcript or '(empty)'}\n\n"
        "CHAT (messages around the peak):\n" + ("\n".join(f"- {m}" for m in chat) or "(empty)")
    )


def _extract_json(text: str) -> dict | None:
    """Wyciaga obiekt JSON z odpowiedzi: zdejmuje ploty ``` i tekst dookola."""
    if not text:
        return None
    text = re.sub(r"```(?:json)?", "", text, flags=re.IGNORECASE).strip()
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end <= start:
        return None
    try:
        data = json.loads(text[start:end + 1])
    except json.JSONDecodeError:
        return None
    return data if isinstance(data, dict) else None


def _to_meta(data: dict, base: ClipMeta, rp: bool = False,
             extra_tags: list[str] | None = None) -> ClipMeta | None:
    """Sklada ClipMeta z odpowiedzi modelu; brakujace pola bierze z zastepczych.
    None = odpowiedz bez tytulu i bez oceny, czyli smiec."""
    title = str(data.get("title") or "").strip()
    raw_score = data.get("score")
    if not title and raw_score is None:
        return None
    try:
        score = int(round(float(raw_score)))
    except (TypeError, ValueError):
        score = base.score
    score = max(0, min(10, score))

    title = " ".join(title.split()) or base.title
    description = " ".join(str(data.get("description") or "").split()) or base.description
    if "leak" in title.lower():
        log.warning("LLM wspomnial o leakach w tytule (%r), podmieniam na ogolny", title)
        title = base.title
    if "leak" in description.lower():
        log.warning("LLM wspomnial o leakach w opisie, podmieniam na ogolny")
        description = base.description
    title = normalise_title(title) or base.title
    return ClipMeta(
        title=title,
        description=description,
        hashtags=finish_tags(data.get("hashtags"), rp=rp, extra_tags=extra_tags),
        score=score,
        reason=str(data.get("reason") or "").strip(),
    )


def describe(transcript: str, chat_sample: list[str], channel: str,
             game: str = "GTA VI", lang: str = "en", rp: bool = False,
             extra_tags: list[str] | None = None) -> ClipMeta:
    """Tytul, opis, hashtagi i ocena momentu. Nigdy nie rzuca wyjatku z powodu LLM:
    gdy Ollama nie odpowiada albo dwa razy zwroci smieci, oddaje metadane zastepcze.
    `rp`: streamer roleplayowy (hashtag gtarp); `extra_tags`: stale tagi z profilu streamera."""
    base = fallback(channel, game, rp=rp, extra_tags=extra_tags)
    payload = {
        "model": _model(),
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": _build_prompt(transcript, chat_sample, channel, game, lang)},
        ],
        "format": "json",
        "stream": False,
        "options": {"temperature": 0.4, "num_ctx": 4096},
        "keep_alive": "2m",          # karta 12 GB dzielona z Whisperem
    }
    for attempt in range(1, ATTEMPTS + 1):
        try:
            resp = requests.post(f"{_url()}/api/chat", json=payload, timeout=TIMEOUT_S)
            resp.raise_for_status()
            content = (resp.json().get("message") or {}).get("content", "")
        except (requests.ConnectionError, requests.Timeout) as exc:
            log.warning("Ollama nieosiagalna (%s), uzywam metadanych zastepczych", exc)
            return base
        except (requests.RequestException, ValueError) as exc:
            log.warning("Ollama: blad odpowiedzi (proba %d/%d): %s", attempt, ATTEMPTS, exc)
            continue
        data = _extract_json(content)
        meta = _to_meta(data, base, rp, extra_tags) if data is not None else None
        if meta is not None:
            return meta
        log.warning("Ollama: nieczytelna odpowiedz (proba %d/%d): %.200r", attempt, ATTEMPTS, content)
    log.warning("LLM nie dal poprawnej odpowiedzi, uzywam metadanych zastepczych dla %s", channel)
    return base


def unload() -> bool:
    """Prosi Ollame o zwolnienie modelu z VRAM (przed uruchomieniem Whispera)."""
    try:
        resp = requests.post(f"{_url()}/api/generate",
                             json={"model": _model(), "keep_alive": 0}, timeout=15)
        resp.raise_for_status()
        return True
    except requests.RequestException as exc:
        log.warning("Nie udalo sie zwolnic modelu Ollamy: %s", exc)
        return False
