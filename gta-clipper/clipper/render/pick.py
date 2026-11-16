"""Wybor okna do publikacji bez LLM: granice na pauzach w mowie wokol spike'a czatu."""
from __future__ import annotations

from clipper.models import Word

PAUSE = 0.4            # przerwa miedzy slowami uznawana za granice zdania
BEFORE_PEAK = 25.0     # akcja dzieje sie PRZED reakcja czatu
HARD_MAX_LEN = 45.0    # twardy sufit: dluzsze klipy wypadaja slabo
AFTER_PEAK = 3.0       # minimum po spike'u
AFTER_PEAK_SILENT = 8.0
START_TOLERANCE = 8.0  # dalej niz tyle od celu nie szukamy granicy startu
PAD_IN = 0.15          # oddech przed pierwszym slowem
PAD_OUT = 0.30         # i po ostatnim


def _fit(s: float, e: float, dur: float, min_len: float, max_len: float) -> tuple[float, float]:
    """Wciska okno w [0, dur] i w zakres dlugosci [min_len, max_len]."""
    if dur <= min_len:
        return 0.0, max(dur, 0.0)      # segment krotszy niz minimum: bierzemy caly
    s = min(max(s, 0.0), dur)
    e = min(max(e, s), dur)
    if e - s > max_len:
        e = s + max_len
    if e - s < min_len:
        e = s + min_len
        if e > dur:
            e = dur
            s = e - min_len
    return round(s, 3), round(e, 3)


def pick_window(words: list[Word], seg_duration: float, *, peak: float,
                min_len: float = 18.0, max_len: float = 35.0, lead: float = 2.0) -> tuple[float, float]:
    """Zwraca (start, koniec) w sekundach segmentu.

    `peak` to pozycja spike'a czatu w segmencie. `lead` to minimalny zapas przed
    spike'iem: okno nie moze zaczac sie pozniej niz `peak - lead`.
    """
    max_len = min(float(max_len), HARD_MAX_LEN)
    min_len = min(float(min_len), max_len)
    dur = max(float(seg_duration), 0.0)
    peak = min(max(float(peak), 0.0), dur)
    target = max(0.0, peak - BEFORE_PEAK)
    words = sorted(words, key=lambda w: w.start)

    if not words:
        return _fit(target, peak + AFTER_PEAK_SILENT, dur, min_len, max_len)

    # Granice: start = poczatek slowa po pauzie, koniec = koniec slowa przed pauza.
    starts: list[float] = []
    ends: list[float] = []
    for i, w in enumerate(words):
        prev_end = words[i - 1].end if i else 0.0
        if i == 0 or w.start - prev_end >= PAUSE:
            starts.append(max(prev_end, w.start - PAD_IN, 0.0))
        nxt = words[i + 1].start if i + 1 < len(words) else dur
        if i + 1 == len(words) or nxt - w.end >= PAUSE:
            ends.append(min(max(nxt, w.end), w.end + PAD_OUT))

    latest_start = max(0.0, peak - lead)
    ok = [s for s in starts if s <= latest_start and abs(s - target) <= START_TOLERANCE]
    start = min(ok, key=lambda s: abs(s - target)) if ok else min(target, latest_start)

    lo = max(peak + AFTER_PEAK, start + min_len)
    hi = start + max_len
    in_range = [e for e in ends if lo <= e <= hi]
    if in_range:
        end = in_range[0]               # pierwsza pauza po spike'u: klip krotki i zwarty
    elif lo > hi or any(e > hi for e in ends):
        end = hi                        # gadaja bez przerwy: tniemy na max_len
    else:
        end = max(lo, peak + AFTER_PEAK_SILENT)   # po spike'u juz nikt nie mowi
    return _fit(start, end, dur, min_len, max_len)
