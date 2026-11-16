"""Detektor skokow aktywnosci czatu. Wspolny dla trybu VOD (wsadowo) i live
(strumieniowo): liczy wazona sume wiadomosci w oknach i porownuje ja z
kroczaca srednia z poprzednich okien.
"""
from __future__ import annotations

import logging
import math
import re
from collections import deque
from dataclasses import dataclass, field
from statistics import fmean, pstdev
from typing import Iterable

from clipper.models import Candidate, ChatMessage

log = logging.getLogger(__name__)


# --- Wagi wiadomosci ---------------------------------------------------------

# Boty: ich wiadomosci nie licza sie wcale.
BOT_USERS = frozenset({
    "nightbot", "streamelements", "moobot", "fossabot", "streamlabs", "soundalerts",
})

# Tokeny hype'u: cale slowa/frazy, bez rozrozniania wielkosci liter.
# Zeby dodac nowy, wystarczy dopisac go tutaj.
HYPE_TOKENS: tuple[str, ...] = (
    "LMAO", "LMFAO", "LOL", "LUL", "KEKW", "OMEGALUL", "LULW", "ICANT",
    "CLIP IT", "CLIP THAT", "CLIP", "WTF", "OMG", "NO WAY", "NOWAY", "HOLY",
    "POG", "POGGERS", "PogChamp",
    # polskie
    "JPRDL", "KURWA", "CO XD",
)

# Tokeny, w ktorych wielkosc liter ma znaczenie. Pojedyncze "W" i "L" lapiemy
# tylko jako wielkie litery, bo male "w" to zwykly polski przyimek.
HYPE_TOKENS_CASE_SENSITIVE: tuple[str, ...] = ("W", "L")

# Wzorce regex (cale tokeny, bez rozrozniania wielkosci liter).
HYPE_PATTERNS: tuple[str, ...] = (
    r"xd+",                 # XD, XDD, XDDDD
    r"a?(?:ha){2,}h?",      # haha, hahaha, ahahah
)

# Wzorce dopasowywane gdziekolwiek w tekscie (emoji, serie znakow).
HYPE_ANYWHERE: tuple[str, ...] = (
    "\U0001F480",           # czaszka
    "\U0001F62D",           # placz
    "\U0001F602",           # lzy smiechu
    r"[?!]{3,}",            # ??? / !!! / ?!?!
)

BASE_WEIGHT = 1.0
HYPE_WEIGHT = 2.0
CAPS_BONUS = 0.5
CAPS_MIN_LETTERS = 4
MAX_WEIGHT = 3.0
MAX_PER_USER = 2            # ile wiadomosci jednego usera liczy sie w oknie


def _token_re(tokens: Iterable[str]) -> str:
    parts = []
    # dluzsze najpierw, zeby "CLIP IT" wygralo z "CLIP"
    for tok in sorted(tokens, key=len, reverse=True):
        parts.append(r"\s+".join(re.escape(p) for p in tok.split()))
    return "|".join(parts)


def _build_hype_res() -> tuple[re.Pattern[str], re.Pattern[str]]:
    words = "|".join(p for p in (_token_re(HYPE_TOKENS), *HYPE_PATTERNS) if p)
    insensitive = re.compile(
        rf"(?<!\w)(?:{words})(?!\w)|{'|'.join(HYPE_ANYWHERE)}", re.IGNORECASE)
    sensitive = re.compile(rf"(?<!\w)(?:{_token_re(HYPE_TOKENS_CASE_SENSITIVE)})(?!\w)")
    return insensitive, sensitive


_HYPE_RE, _HYPE_CS_RE = _build_hype_res()


def has_hype(text: str) -> bool:
    return bool(_HYPE_RE.search(text) or _HYPE_CS_RE.search(text))


def weight(msg: ChatMessage) -> float:
    """Waga pojedynczej wiadomosci (0 = nie liczy sie do skoku)."""
    if msg.kind == "system":
        return 0.0
    text = msg.text.strip()
    if not text or text.startswith("!"):
        return 0.0
    if msg.user.strip().lower() in BOT_USERS:
        return 0.0
    w = HYPE_WEIGHT if has_hype(text) else BASE_WEIGHT
    letters = [c for c in text if c.isalpha()]
    if len(letters) >= CAPS_MIN_LETTERS and all(c.isupper() for c in letters):
        w += CAPS_BONUS
    return min(w, MAX_WEIGHT)


# --- Detektor ----------------------------------------------------------------

@dataclass
class DetectorConfig:
    window: float = 10.0            # dlugosc okna w sekundach
    baseline_windows: int = 30      # tlo = poprzednie 30 okien (5 min)
    z_threshold: float = 3.0
    min_weighted: float = 8.0       # prog bezwzgledny, zeby martwy czat nie strzelal
    merge_gap: float = 30.0         # blizsze skoki zlewaja sie w jeden
    cooldown: float = 60.0          # odstep miedzy kolejnymi kandydatami
    min_baseline_windows: int = 6   # tyle okien tla trzeba, zeby w ogole wykrywac
    sample_size: int = 15


@dataclass
class _Pending:
    """Wykryty skok, ktory czeka, czy nie dojdzie do niego mocniejszy sasiad."""
    t_peak: float
    score: float
    sample: list[str]
    last_spike: float               # srodek ostatniego okna-skoku w tej grupie


@dataclass
class _Window:
    msgs: list[tuple[float, str]] = field(default_factory=list)   # (waga, tekst)
    per_user: dict[str, int] = field(default_factory=dict)
    value: float = 0.0


class SpikeDetector:
    def __init__(self, channel: str, cfg: DetectorConfig | None = None,
                 preroll: float = 20.0, postroll: float = 45.0) -> None:
        self.channel = channel
        self.cfg = cfg or DetectorConfig()
        if self.cfg.window <= 0:
            raise ValueError("window musi byc dodatnie")
        self.preroll = preroll
        self.postroll = postroll
        self._idx = 0                               # indeks otwartego okna
        self._win = _Window()
        self._baseline: deque[float] = deque(maxlen=self.cfg.baseline_windows)
        self._zero_run = 0                          # ile pustych okien z rzedu
        self._pending: _Pending | None = None
        self._last_emitted: float | None = None

    # -- API ------------------------------------------------------------------

    def feed(self, msg: ChatMessage) -> list[Candidate]:
        """Dodaje wiadomosc. Zwraca kandydatow, ktorzy wlasnie stali sie ostateczni."""
        out = self._advance(self._index(msg.t))
        w = weight(msg)
        win = self._win
        if w > 0:
            # tlumienie spamu: ten sam user liczy sie najwyzej MAX_PER_USER razy
            key = msg.user.strip().lower()
            seen = win.per_user.get(key, 0)
            win.per_user[key] = seen + 1
            if seen >= MAX_PER_USER:
                w = 0.0
        win.value += w
        if msg.kind != "system":
            win.msgs.append((w, msg.text))
        return out

    def tick(self, now: float) -> list[Candidate]:
        """Przesuwa czas bez wiadomosci (live, cichy czat)."""
        return self._advance(self._index(now))

    def flush(self) -> list[Candidate]:
        """Koniec strumienia: zamyka otwarte okno i oddaje to, co czekalo."""
        out = self._close_window()
        self._idx += 1
        if self._pending is not None:
            out.extend(self._emit())
        return out

    # -- wnetrze --------------------------------------------------------------

    def _index(self, t: float) -> int:
        return max(0, int(math.floor(t / self.cfg.window)))

    def _advance(self, target: int) -> list[Candidate]:
        """Zamyka wszystkie okna przed `target` (puste tez, z wartoscia 0)."""
        out: list[Candidate] = []
        while self._idx < target:
            if (self._pending is None and not self._win.msgs and self._win.value == 0
                    and self._zero_run >= self.cfg.baseline_windows):
                # dluga cisza: tlo to same zera, nie ma co mielic okna po oknie
                self._idx = target
                break
            out.extend(self._close_window())
            self._idx += 1
        return out

    def _close_window(self) -> list[Candidate]:
        cfg = self.cfg
        win, self._win = self._win, _Window()
        value = win.value
        center = (self._idx + 0.5) * cfg.window
        out: list[Candidate] = []

        base_value = value
        if len(self._baseline) >= max(1, cfg.min_baseline_windows):
            mean = fmean(self._baseline)
            sd = max(pstdev(self._baseline), 1.0)
            z = (value - mean) / sd
            if z >= cfg.z_threshold and value >= cfg.min_weighted:
                log.debug("%s: skok t=%.0f wartosc=%.1f z=%.2f", self.channel, center, value, z)
                # do tla skok wchodzi przyciety do progu, zeby jeden wybuch nie
                # zagluszyl nastepnych, a trwala zmiana poziomu i tak sie przebila
                base_value = min(value, mean + cfg.z_threshold * sd)
                p = self._pending
                if p is not None and center - p.last_spike <= cfg.merge_gap:
                    p.last_spike = center
                    if z > p.score:
                        p.t_peak, p.score, p.sample = center, z, self._sample(win)
                else:
                    if p is not None:
                        out.extend(self._emit())
                    self._pending = _Pending(center, z, self._sample(win), center)

        self._baseline.append(base_value)
        self._zero_run = self._zero_run + 1 if value == 0 else 0

        # nastepne okno bedzie juz za daleko, zeby sie zlac -> oddajemy
        p = self._pending
        if p is not None and center + cfg.window - p.last_spike > cfg.merge_gap:
            out.extend(self._emit())
        return out

    def _sample(self, win: _Window) -> list[str]:
        n = self.cfg.sample_size
        if n <= 0:
            return []
        # najpierw najciezsze, a wybrane oddajemy w kolejnosci z czatu
        order = sorted(range(len(win.msgs)), key=lambda i: -win.msgs[i][0])[:n]
        return [win.msgs[i][1] for i in sorted(order)]

    def _emit(self) -> list[Candidate]:
        p, self._pending = self._pending, None
        if p is None:
            return []
        cfg = self.cfg
        if self._last_emitted is not None and p.t_peak - self._last_emitted < cfg.cooldown:
            log.info("%s: skok t=%.0f pominiety (cooldown po t=%.0f)",
                     self.channel, p.t_peak, self._last_emitted)
            return []
        self._last_emitted = p.t_peak
        half = cfg.window / 2
        cand = Candidate(
            channel=self.channel,
            t_peak=p.t_peak,
            score=p.score,
            t_start=max(0.0, p.t_peak - half - self.preroll),
            t_end=p.t_peak + half + self.postroll,
            sample=p.sample,
            source="chat",
        )
        log.info("%s: kandydat t=%.0f z=%.1f", self.channel, cand.t_peak, cand.score)
        return [cand]


def detect(messages: Iterable[ChatMessage], channel: str,
           cfg: DetectorConfig | None = None,
           preroll: float = 20.0, postroll: float = 45.0) -> list[Candidate]:
    """Tryb wsadowy: caly czat naraz."""
    det = SpikeDetector(channel, cfg, preroll=preroll, postroll=postroll)
    out: list[Candidate] = []
    for msg in sorted(messages, key=lambda m: m.t):
        out.extend(det.feed(msg))
    out.extend(det.flush())
    return out


def top(cands: Iterable[Candidate], n: int) -> list[Candidate]:
    """n najmocniejszych kandydatow, posortowanych po czasie."""
    best = sorted(cands, key=lambda c: c.score, reverse=True)[:max(0, n)]
    return sorted(best, key=lambda c: c.t_peak)
