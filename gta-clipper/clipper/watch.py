"""Straznik w tle: sam odbiera decyzje z telefonu (ntfy) i pilnuje terminu zgloszenia
linku do kampanii. Dzieki temu podczas launchu nic nie trzeba wpisywac recznie
(`clipper decisions`, `clipper remind`).

Nic tutaj nie publikuje. Wysyla tylko powiadomienia na telefon.
"""
from __future__ import annotations

import logging
import threading
import time

import requests

from . import approve, config, pipeline, tracker
from .publish.manual import PREAMBLE_END

log = logging.getLogger(__name__)

REPEAT_REMINDER_S = 600.0        # to samo przypomnienie o tym samym poscie najwyzej co 10 minut
URGENT_MINUTES = 10.0            # ponizej tylu minut do terminu priorytet 4, po terminie 5


def _split_caption(folder) -> tuple[str, str]:
    """(ostrzezenia z poczatku caption.txt, opis do wklejenia nad linia z kreskami)."""
    path = folder / "caption.txt"
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as e:
        log.warning("Nie moge odczytac %s: %s", path, e)
        return "", ""
    pre = ""
    if PREAMBLE_END in text:
        pre, text = text.split(PREAMBLE_END, 1)
    head = text.split("-" * 40, 1)[0]
    return pre.strip(), head.strip()


def _caption_text(folder) -> str:
    """Czesc caption.txt do wklejenia jako opis (bez ostrzezen i notatek)."""
    return _split_caption(folder)[1]


class Watcher:
    def __init__(self, interval: float = 20.0, remind_every: float = 300.0) -> None:
        self.interval = interval
        self.remind_every = remind_every
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._last_remind: float | None = None           # czas (monotonic) ostatniego przegladu
        self._reminded: dict[int, float] = {}            # id posta -> kiedy ostatnio przypomniano
        self._unsent: list[int] = []                     # zatwierdzone klipy bez wyslanego powiadomienia
        self.config_error: approve.NtfyConfigError | None = None

    # --- jeden obieg -------------------------------------------------------

    def run_once(self) -> None:
        """Jeden tick: decyzje, powiadomienia o gotowych klipach, przypomnienia.
        Bledy sieci sa logowane i ponawiane w nastepnym ticku; NtfyConfigError leci wyzej."""
        try:
            for clip_id, decision in pipeline.apply_decisions():
                if decision == "approved":
                    self._unsent.append(clip_id)
                else:
                    log.info("Klip #%s odrzucony z telefonu", clip_id)
        except requests.RequestException as e:
            log.warning("Odbior decyzji z ntfy nie wyszedl, ponowie za %.0f s: %s", self.interval, e)

        self._notify_ready()

        now = time.monotonic()
        if self._last_remind is None or now - self._last_remind >= self.remind_every:
            self._last_remind = now
            self._remind(now)

    def _notify_ready(self) -> None:
        while self._unsent:
            clip_id = self._unsent[0]
            folder = config.subdir("to_post") / str(clip_id)
            warning, caption = _split_caption(folder)
            message = (warning + "\n\n") if warning else ""
            message += (f"Klip #{clip_id} gotowy do wrzucenia.\n"
                       f"Folder: {folder}\n"
                       f"Opis do wklejenia:\n{caption}\n\n"
                       f"Po publikacji zapisz: clipper posted {clip_id} tiktok <url>")
            attach = None
            clips = sorted(folder.glob("*.mp4"))
            if clips:
                try:
                    attach = approve.upload_full_clip(clips[0])
                    message += f"\n\nPelny klip (72 h): {attach}"
                except (requests.RequestException, OSError) as e:
                    log.warning("Upload pelnego klipu #%s nie wyszedl, wysylam bez linku: %s", clip_id, e)
            try:
                approve.notify(f"Klip #{clip_id} gotowy do postu", message, priority=4, attach_url=attach)
            except requests.RequestException as e:
                log.warning("Powiadomienie o klipie #%s nie poszlo, ponowie: %s", clip_id, e)
                return
            self._unsent.pop(0)

    def _remind(self, now: float) -> None:
        try:
            pending = tracker.pending_submissions()
        except Exception:
            log.exception("Nie moge odczytac niezgloszonych postow")
            return
        alive = {p["id"] for p in pending}
        for pid in [k for k in self._reminded if k not in alive]:
            del self._reminded[pid]                      # zgloszone, zapomnij
        for p in pending:
            pid = p["id"]
            last = self._reminded.get(pid)
            if last is not None and now - last < REPEAT_REMINDER_S:
                continue
            left = p["minutes_left"]
            if left < 0:
                priority, title = 5, "SPOZNIONE zgloszenie linku do kampanii"
                msg = f"Termin minal {abs(left):.0f} min temu."
            else:
                priority = 4 if left < URGENT_MINUTES else 3
                title = "Zglos link do kampanii"
                msg = f"Zostalo {left:.0f} min."
            body = (f"{msg}\nKampania: {p.get('campaign')}\n{p.get('url')}\n"
                    f"Po zgloszeniu: clipper submitted {p.get('url')}")
            try:
                approve.notify(title, body, priority=priority)
            except requests.RequestException as e:
                log.warning("Przypomnienie o poscie #%s nie poszlo, ponowie: %s", pid, e)
                continue
            self._reminded[pid] = now

    # --- watek -------------------------------------------------------------

    def _loop(self) -> None:
        while not self._stop.is_set():
            try:
                self.run_once()
            except approve.NtfyConfigError as e:
                self.config_error = e
                log.error("Straznik zatrzymany, ntfy nieskonfigurowane: %s", e)
                return
            except Exception:
                log.exception("Blad w strazniku, probuje dalej za %.0f s", self.interval)
            self._stop.wait(self.interval)

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._loop, name="clipper-watch", daemon=True)
        self._thread.start()
        log.info("Straznik wystartowal (decyzje co %.0f s, przypomnienia co %.0f s)",
                 self.interval, self.remind_every)

    def stop(self) -> None:
        self._stop.set()
        if self._thread and self._thread is not threading.current_thread():
            self._thread.join(timeout=10)
        self._thread = None

    def is_alive(self) -> bool:
        return bool(self._thread and self._thread.is_alive())
