"""Wspolne typy danych. To jest kontrakt miedzy modulami: nie zmieniaj pol bez
aktualizacji wszystkich modulow, ktore z nich korzystaja.

Czas `t` to zawsze sekundy od poczatku nagrania (VOD) albo od startu sesji
nagrywania (live). Dzieki temu detektor i cutter sa wspolne dla obu trybow.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path


@dataclass(slots=True)
class ChatMessage:
    t: float                 # sekundy od poczatku nagrania / sesji
    user: str
    text: str
    kind: str = "msg"        # "msg" = zwykla wiadomosc, "system" = sub/raid/bity (USERNOTICE)


@dataclass(slots=True)
class Candidate:
    channel: str
    t_peak: float            # srodek okna ze spike'iem
    score: float             # sila spike'a (z-score po wagach)
    t_start: float           # poczatek wycinka (juz z pre-rollem)
    t_end: float             # koniec wycinka
    sample: list[str] = field(default_factory=list)   # kilkanascie wiadomosci z okna
    source: str = "chat"     # "chat" | "viewer_clip" | "audio"


@dataclass(slots=True)
class Word:
    start: float
    end: float
    text: str


@dataclass(slots=True)
class Segment:
    """Wycinek wideo wokol kandydata (60-90 s, poziomy, oryginalna jakosc)."""
    candidate: Candidate
    path: Path


@dataclass(slots=True)
class ClipMeta:
    title: str
    description: str
    hashtags: list[str]
    score: int               # 0-10, ocena mozgu
    reason: str = ""


@dataclass(slots=True)
class RenderedClip:
    path: Path               # gotowy plik 1080x1920
    duration: float
    channel: str
    t_start: float           # start w nagraniu zrodlowym
    meta: ClipMeta | None = None
    campaign: str | None = None
