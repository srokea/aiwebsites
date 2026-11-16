"""Tryb live: kroczacy bufor nagrania streamu + petla laczaca czat z detektorem.

Recorder: streamlink --stdout | ffmpeg -f segment zapisuje segmenty .ts (po
`segment_seconds` s) do data/buffer/<kanal>/. Stare segmenty sa kasowane
(`prune`), wiec dysk jest ograniczony do ok. `keep_seconds` nagrania.

Mapowanie czasu (waznie): `clock()` liczy sekundy od pojawienia sie pierwszego
pliku segmentu (nie od startu procesu, bo streamlink otwiera strumien kilka
sekund). Pozycje segmentow bierzemy z listy CSV, ktora ffmpeg dopisuje po
zamknieciu kazdego segmentu (nazwa,start,koniec) - dzieki temu nie ma dryfu
od nominalnej dlugosci, a lista mowi tez, ktore segmenty sa juz zamkniete.

Restarty: watchdog restartuje streamlink+ffmpeg po padzie (offline, siec) z
narastajacym opoznieniem. Kazdy start to nowa "sesja": numeracja segmentow
jedzie dalej (-segment_start_number), a pozycja sesji na osi `clock()` to
moment pojawienia sie jej pierwszego pliku. Os czasu jest wiec ciagla (luka po
padzie to po prostu dziura), a `extract` odmawia zakresow, ktore przecinaja
granice sesji albo dziure.
"""
from __future__ import annotations

import logging
import subprocess
import sys
import threading
import time
from collections import deque
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Callable

from clipper import config
from clipper.detect import signals
from clipper.detect.spikes import SpikeDetector
from clipper.models import Candidate, ChatMessage

log = logging.getLogger(__name__)

SEG_PATTERN = "seg_%06d.ts"
POLL_INTERVAL = 0.5
RESTART_BACKOFF_MIN = 5.0
RESTART_BACKOFF_MAX = 120.0
DEDUPE_WINDOW = 45.0     # kandydaci blizsi niz tyle sekund to ten sam moment
WARN_EVERY = 600.0       # tyle sekund miedzy powtorzonymi ostrzezeniami o klipach
TOLERANCE = 0.5          # tyle sekund przed poczatkiem bufora wybaczamy bez bledu


class ExtractError(RuntimeError):
    """Nie da sie wyciac zakresu z bufora."""


class RangeExpired(ExtractError):
    """Poczatek zakresu jest juz poza buforem (skasowany albo przed startem)."""


class RangeNotReady(ExtractError):
    """Koniec zakresu jest jeszcze w przyszlosci / w niezamknietym segmencie."""


class RangeBroken(ExtractError):
    """Zakres przecina granice sesji albo dziure w segmentach."""


@dataclass
class _Seg:
    index: int
    path: Path
    start: float             # pozycja na osi clock()
    end: float
    session: int


@dataclass
class _Session:
    sid: int
    base_index: int
    list_path: Path
    started: float = field(default_factory=time.monotonic)
    t_offset: float | None = None      # pozycja pierwszego pliku na osi clock()
    media_origin: float | None = None  # czas medialny poczatku pierwszego segmentu
    list_rows: int = 0                 # ile wierszy listy juz wczytano
    streamlink: subprocess.Popen | None = None
    ffmpeg: subprocess.Popen | None = None
    logs: list = field(default_factory=list)


def _tail(path: Path, lines: int = 8) -> str:
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""
    return "\n".join(text.strip().splitlines()[-lines:])


class Recorder:
    def __init__(self, channel: str, quality: str = "720p,720p60,best",
                 segment_seconds: int = 10, keep_seconds: int = 900,
                 buffer_dir: Path | None = None) -> None:
        self.channel = channel.lower().lstrip("#")
        self.quality = quality
        self.segment_seconds = int(segment_seconds)
        self.keep_seconds = int(keep_seconds)
        self.dir = Path(buffer_dir) if buffer_dir else config.subdir("buffer") / self.channel
        self.dir.mkdir(parents=True, exist_ok=True)

        self._lock = threading.RLock()
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._t0: float | None = None
        self._wall_t0: datetime | None = None    # czas UTC odpowiadajacy clock()==0
        self._segments: dict[int, _Seg] = {}
        self._sessions: dict[int, _Session] = {}
        self._current: _Session | None = None
        self._next_sid = 0

    # -- czas i stan ----------------------------------------------------------

    @property
    def started(self) -> bool:
        """Czy pojawil sie juz pierwszy segment (czyli clock() cos znaczy)."""
        return self._t0 is not None

    def clock(self) -> float:
        t0 = self._t0
        return 0.0 if t0 is None else time.monotonic() - t0

    def t_at(self, when: datetime) -> float:
        """Czas scienny (UTC) -> pozycja na osi clock(). Przed startem nagrania: ValueError.

        Os clock() jest ciagla takze po restartach (luka to dziura), wiec jedno
        przesuniecie wystarcza dla wszystkich sesji."""
        wall = self._wall_t0
        if wall is None:
            raise ValueError(f"{self.channel}: nagranie jeszcze sie nie zaczelo")
        if when.tzinfo is None:
            when = when.replace(tzinfo=timezone.utc)
        return (when - wall).total_seconds()

    def buffer_start(self) -> float | None:
        """Poczatek najstarszego segmentu w buforze na osi clock() (None gdy pusto)."""
        with self._lock:
            return min((s.start for s in self._segments.values()), default=None)

    def is_alive(self) -> bool:
        s = self._current
        return bool(s and s.streamlink and s.ffmpeg
                    and s.streamlink.poll() is None and s.ffmpeg.poll() is None)

    def buffer_end(self) -> float:
        """Koniec ostatniego zamknietego segmentu na osi clock() (0.0 gdy pusto)."""
        with self._lock:
            self._scan()
            return max((s.end for s in self._segments.values()), default=0.0)

    def buffer_seconds(self) -> float:
        with self._lock:
            return sum(s.end - s.start for s in self._segments.values())

    def buffer_mb(self) -> float:
        total = 0
        with self._lock:
            paths = [s.path for s in self._segments.values()]
        for p in paths:
            try:
                total += p.stat().st_size
            except OSError:
                pass            # segment wlasnie skasowany
        return total / 1e6

    # -- start / stop ---------------------------------------------------------

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            raise RuntimeError("Recorder juz dziala")
        self._stop.clear()
        with self._lock:
            for pattern in ("seg_*.ts", "list_*.csv"):
                for p in self.dir.glob(pattern):
                    try:
                        p.unlink()
                    except OSError as exc:
                        log.warning("%s: nie moge skasowac starego pliku %s: %s",
                                    self.channel, p, exc)
            self._segments.clear()
            self._sessions.clear()
            self._t0 = None
            self._wall_t0 = None
            self._next_sid = 0
            self._spawn()
        self._thread = threading.Thread(target=self._monitor, name=f"rec-{self.channel}",
                                        daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=30)
        with self._lock:
            for sess in list(self._sessions.values()):
                self._terminate(sess)
            self._scan()

    def _spawn(self) -> None:
        """Uruchamia nowa sesje (streamlink | ffmpeg). Wolac pod _lock."""
        existing = [int(p.stem.split("_")[1]) for p in self.dir.glob("seg_*.ts")
                    if p.stem.split("_")[1].isdigit()]
        known = [s.index for s in self._segments.values()]
        base = max(existing + known, default=-1) + 1
        sid = self._next_sid
        self._next_sid += 1
        sess = _Session(sid=sid, base_index=base, list_path=self.dir / f"list_{sid}.csv")

        url = f"https://twitch.tv/{self.channel}"
        sl_cmd = [sys.executable, "-m", "streamlink", "--stdout", "--twitch-disable-ads",
                  "--retry-streams", "30", "--retry-open", "3", url, self.quality]
        ff_cmd = ["ffmpeg", "-hide_banner", "-loglevel", "warning", "-i", "pipe:0",
                  "-c", "copy", "-f", "segment", "-segment_time", str(self.segment_seconds),
                  "-reset_timestamps", "1", "-strftime", "0",
                  "-segment_start_number", str(base),
                  "-segment_list", sess.list_path.name, "-segment_list_type", "csv",
                  SEG_PATTERN]
        flags = subprocess.CREATE_NEW_PROCESS_GROUP if sys.platform == "win32" else 0
        sl_log = open(self.dir / f"streamlink_{sid}.log", "wb")
        ff_log = open(self.dir / f"ffmpeg_{sid}.log", "wb")
        sess.logs = [sl_log, ff_log]
        try:
            sess.streamlink = subprocess.Popen(sl_cmd, stdout=subprocess.PIPE, stderr=sl_log,
                                               stdin=subprocess.DEVNULL, creationflags=flags)
            sess.ffmpeg = subprocess.Popen(ff_cmd, stdin=sess.streamlink.stdout, stderr=ff_log,
                                           stdout=subprocess.DEVNULL, cwd=self.dir,
                                           creationflags=flags)
        except Exception:
            self._terminate(sess)
            raise
        sess.streamlink.stdout.close()      # rura nalezy teraz do ffmpega
        self._sessions[sid] = sess
        self._current = sess
        log.info("%s: start nagrywania, sesja %d, segmenty od %d (%s)",
                 self.channel, sid, base, self.quality)

    def _terminate(self, sess: _Session) -> None:
        """Konczy oba procesy: najpierw streamlink (ffmpeg dostaje EOF i domyka segment)."""
        sl, ff = sess.streamlink, sess.ffmpeg
        if sl is not None and sl.poll() is None:
            sl.terminate()
        if ff is not None:
            try:
                ff.wait(timeout=8)
            except subprocess.TimeoutExpired:
                log.warning("%s: ffmpeg nie skonczyl sam, zabijam", self.channel)
                ff.terminate()
                try:
                    ff.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    ff.kill()
                    ff.wait()
        if sl is not None:
            try:
                sl.wait(timeout=5)
            except subprocess.TimeoutExpired:
                sl.kill()
                sl.wait()
        for f in sess.logs:
            try:
                f.close()
            except OSError as exc:
                log.debug("%s: blad zamykania logu: %s", self.channel, exc)
        sess.logs = []

    # -- watchdog -------------------------------------------------------------

    def _monitor(self) -> None:
        backoff = RESTART_BACKOFF_MIN
        while not self._stop.wait(POLL_INTERVAL):
            try:
                with self._lock:
                    self._scan()
                    sess = self._current
                    dead = sess is not None and (
                        (sess.streamlink and sess.streamlink.poll() is not None)
                        or (sess.ffmpeg and sess.ffmpeg.poll() is not None))
                    if not dead:
                        continue
                    codes = (sess.streamlink.poll(), sess.ffmpeg.poll())
                    self._terminate(sess)
                    self._scan()            # domkniety ostatni segment
                    log.warning("%s: nagrywanie padlo (streamlink=%s, ffmpeg=%s)\n%s\n%s",
                                self.channel, codes[0], codes[1],
                                _tail(self.dir / f"streamlink_{sess.sid}.log"),
                                _tail(self.dir / f"ffmpeg_{sess.sid}.log"))
                    if time.monotonic() - sess.started > 60:
                        backoff = RESTART_BACKOFF_MIN
                log.info("%s: restart za %.0f s", self.channel, backoff)
                if self._stop.wait(backoff):
                    return
                backoff = min(backoff * 2, RESTART_BACKOFF_MAX)
                with self._lock:
                    self._spawn()
            except Exception:
                log.exception("%s: blad watchdoga nagrywania", self.channel)

    # -- lista segmentow ------------------------------------------------------

    def _scan(self) -> None:
        """Wczytuje nowe zamkniete segmenty z list CSV. Wolac pod _lock."""
        for sess in self._sessions.values():
            if sess.t_offset is None:
                first = self.dir / (SEG_PATTERN % sess.base_index)
                if first.exists():
                    now = time.monotonic()
                    if self._t0 is None:
                        self._t0 = now
                        self._wall_t0 = datetime.now(timezone.utc)
                    sess.t_offset = now - self._t0
                    log.info("%s: sesja %d, pierwszy segment na t=%.1f s",
                             self.channel, sess.sid, sess.t_offset)
            if sess.t_offset is None:
                continue
            try:
                text = sess.list_path.read_text(encoding="utf-8")
            except FileNotFoundError:
                continue
            except OSError as exc:
                log.warning("%s: nie moge czytac listy segmentow: %s", self.channel, exc)
                continue
            rows = text.split("\n")[:-1]        # ostatni (niepelny) wiersz odpada
            for row in rows[sess.list_rows:]:
                sess.list_rows += 1
                try:
                    name, start_s, end_s = row.strip().rsplit(",", 2)
                    start, end = float(start_s), float(end_s)
                    index = int(Path(name).stem.split("_")[1])
                except ValueError:
                    log.warning("%s: nieczytelny wiersz listy: %r", self.channel, row)
                    continue
                if sess.media_origin is None:
                    sess.media_origin = start
                a = sess.t_offset + (start - sess.media_origin)
                b = sess.t_offset + (end - sess.media_origin)
                self._segments[index] = _Seg(index, self.dir / Path(name).name, a, b, sess.sid)

    def register_segment(self, index: int, path: Path, start: float, end: float,
                         session: int = 0) -> None:
        """Reczne dodanie zamknietego segmentu (testy, odbudowa bufora)."""
        with self._lock:
            if self._t0 is None:
                self._t0 = time.monotonic() - end
                self._wall_t0 = datetime.now(timezone.utc) - timedelta(seconds=end)
            self._segments[index] = _Seg(index, Path(path), start, end, session)

    # -- sprzatanie -----------------------------------------------------------

    def prune(self) -> int:
        """Kasuje segmenty starsze niz keep_seconds (liczone indeksem). Zwraca ile."""
        with self._lock:      # extract trzyma ten sam zamek, wiec nic nie zniknie w trakcie
            self._scan()
            if not self._segments:
                return 0
            limit = max(self._segments) - self.keep_seconds // max(1, self.segment_seconds) + 1
            old = [i for i in self._segments if i < limit]
            for i in old:
                seg = self._segments.pop(i)
                try:
                    seg.path.unlink()
                except FileNotFoundError:
                    pass
                except OSError as exc:
                    log.warning("%s: nie moge skasowac %s: %s", self.channel, seg.path, exc)
            return len(old)

    # -- wycinanie ------------------------------------------------------------

    def extract(self, t_start: float, t_end: float, out: Path, clamp: bool = False) -> Path:
        """Skleja zamkniete segmenty pokrywajace [t_start, t_end] do mp4 (-c copy).

        Ciecie bez rekodowania zaczyna sie na klatce kluczowej przed t_start, wiec
        wycinek moze byc dluzszy o jedna GOP (ok. 2 s). Bledy: RangeExpired (poczatek
        skasowany; z clamp=True poczatek jest przycinany do bufora), RangeNotReady
        (koniec jeszcze nie nagrany - wywolujacy czeka), RangeBroken (inne sesje/dziura).
        """
        out = Path(out)
        if t_end <= t_start:
            raise ValueError(f"Pusty zakres: {t_start} .. {t_end}")
        t_start = max(0.0, t_start)
        with self._lock:
            self._scan()
            segs = sorted(self._segments.values(), key=lambda s: s.index)
            if not segs:
                raise RangeNotReady(f"{self.channel}: bufor jest pusty")
            if t_end > segs[-1].end + 0.01:
                raise RangeNotReady(f"{self.channel}: koniec {t_end:.1f} s dalej niz "
                                    f"zamkniety bufor ({segs[-1].end:.1f} s)")
            need = [s for s in segs if s.end > t_start and s.start < t_end]
            if not need:
                raise RangeExpired(f"{self.channel}: zakres {t_start:.1f}-{t_end:.1f} s "
                                   f"poza buforem")
            if need[0].start - t_start > TOLERANCE:
                if clamp and need[0].session == need[-1].session:
                    log.warning("%s: poczatek %.1f s poza buforem, przycinam do %.1f s",
                                self.channel, t_start, need[0].start)
                    t_start = need[0].start
                else:
                    raise RangeExpired(f"{self.channel}: poczatek {t_start:.1f} s jest przed "
                                       f"buforem (od {need[0].start:.1f} s)")
            if len({s.session for s in need}) > 1:
                raise RangeBroken(f"{self.channel}: zakres {t_start:.1f}-{t_end:.1f} s "
                                  f"przecina granice sesji nagrywania")
            for a, b in zip(need, need[1:]):
                if b.index != a.index + 1 or b.start - a.end > 1.0:
                    raise RangeBroken(f"{self.channel}: dziura w segmentach miedzy "
                                      f"{a.index} a {b.index}")
            missing = [s.path for s in need if not s.path.is_file()]
            if missing:
                raise RangeExpired(f"{self.channel}: brak plikow segmentow: {missing[0].name}")

            out.parent.mkdir(parents=True, exist_ok=True)
            list_file = out.with_name(out.stem + ".concat.txt")
            tmp = out.with_name(out.stem + ".part.mp4")
            lines = []
            for s in need:
                p = str(s.path.resolve()).replace("\\", "/").replace("'", "'\\''")
                lines.append(f"file '{p}'")
            list_file.write_text("\n".join(lines) + "\n", encoding="utf-8")
            cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                   "-f", "concat", "-safe", "0",
                   "-ss", f"{max(0.0, t_start - need[0].start):.3f}", "-i", str(list_file),
                   "-t", f"{t_end - t_start:.3f}", "-c", "copy",
                   "-bsf:a", "aac_adtstoasc",
                   "-movflags", "+faststart", str(tmp)]
            try:
                proc = subprocess.run(cmd, capture_output=True, text=True,
                                      encoding="utf-8", errors="replace")
                if proc.returncode != 0:
                    raise ExtractError(f"ffmpeg (concat) kod {proc.returncode}: "
                                       f"{proc.stderr.strip()[-500:]}")
                if not tmp.exists() or tmp.stat().st_size == 0:
                    raise ExtractError(f"ffmpeg nie utworzyl pliku: {tmp}")
                tmp.replace(out)
            finally:
                for p in (list_file, tmp):
                    try:
                        p.unlink()
                    except FileNotFoundError:
                        pass
                    except OSError as exc:
                        log.warning("nie moge skasowac %s: %s", p, exc)
        return out


# --- Petla live ----------------------------------------------------------------

class LiveSession:
    """Recorder + SpikeDetector na kanal, jedno wspolne polaczenie z czatem."""

    def __init__(self, channels: list[str], on_candidate: Callable[[Candidate, Path], None],
                 *, recorder_factory: Callable | None = None,
                 chat_factory: Callable | None = None,
                 status_interval: float = 60.0, prune_interval: float = 30.0,
                 clip_poll: float = 60.0, clip_lag: float = 5.0,
                 clips_fetcher: Callable[[str, int], list[dict]] | None = None) -> None:
        self.channels = [c.strip().lstrip("#").lower() for c in channels if c.strip()]
        self.on_candidate = on_candidate
        self.status_interval = status_interval
        self.prune_interval = prune_interval
        self._stop = threading.Event()
        self._lock = threading.Lock()                # chroni detektory i liczniki
        self._pool = ThreadPoolExecutor(max_workers=2, thread_name_prefix="extract")

        make_rec = recorder_factory or (
            lambda name: Recorder(name, quality=config.streamer(name).quality))
        self.recorders = {c: make_rec(c) for c in self.channels}
        self.detectors = {}
        for c in self.channels:
            cfg = config.streamer(c)
            self.detectors[c] = SpikeDetector(c, preroll=cfg.preroll, postroll=cfg.postroll)
        self._recent: dict[str, deque[float]] = {c: deque() for c in self.channels}
        self._cand_count = {c: 0 for c in self.channels}
        self._chat_factory = chat_factory
        self._chat = None
        # klipy widzow (Twitch Helix) jako drugi sygnal
        self.clip_poll = clip_poll
        self.clip_lag = clip_lag
        self._fetch_clips = clips_fetcher or (
            lambda ch, minutes: signals.recent_clips(ch, since_minutes=minutes))
        self._signals = {c: tuple(config.streamer(c).signals) for c in self.channels}
        self._clip_channels = [c for c in self.channels if "viewer_clips" in self._signals[c]]
        self._seen_clips: dict[str, set[str]] = {c: set() for c in self.channels}
        self._next_clip_poll = {c: 0.0 for c in self.channels}
        self._last_clip_warn: dict[str, float] = {}
        self._clip_count = {c: 0 for c in self.channels}
        self._emitted: dict[str, list[float]] = {c: [] for c in self.channels}   # t_peak wyslanych

    def stop(self) -> None:
        self._stop.set()
        if self._chat is not None:
            self._chat.stop()

    # -- czat -----------------------------------------------------------------

    def _on_message(self, channel: str, msg: ChatMessage) -> None:
        rec = self.recorders.get(channel)
        if rec is None or not rec.started:
            return                                   # nic jeszcze nie nagrano
        msg.t = rec.clock()                          # czas wedlug nagrania tego kanalu
        now = time.monotonic()
        with self._lock:
            dq = self._recent[channel]
            dq.append(now)
            while dq and now - dq[0] > 60:
                dq.popleft()
            cands = (self.detectors[channel].feed(msg)
                     if "chat" in self._signals[channel] else [])
        self._submit(channel, cands)

    def _submit(self, channel: str, cands: list[Candidate]) -> None:
        for cand in cands:
            with self._lock:
                self._cand_count[channel] += 1
                self._emitted[channel] = (self._emitted[channel] + [cand.t_peak])[-50:]
            try:
                self._pool.submit(self._finish, channel, cand)
            except RuntimeError:
                log.warning("%s: sesja zamykana, pomijam kandydata t=%.0f", channel, cand.t_peak)

    # -- wycinanie kandydata --------------------------------------------------

    def _finish(self, channel: str, cand: Candidate) -> Path | None:
        """Czeka az bufor siegnie t_end, wycina i wola on_candidate."""
        rec = self.recorders[channel]
        deadline = time.monotonic() + max(0.0, cand.t_end - rec.clock()) + 60.0
        while rec.buffer_end() < cand.t_end:
            if self._stop.is_set() or time.monotonic() > deadline:
                log.warning("%s: bufor nie doszedl do t=%.0f, rezygnuje z kandydata",
                            channel, cand.t_end)
                return None
            self._stop.wait(1.0)
        stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        out = config.subdir("segments") / channel / f"{channel}_live_{stamp}.mp4"
        try:
            rec.extract(cand.t_start, cand.t_end, out, clamp=True)
        except Exception:
            log.exception("%s: nie udalo sie wyciac kandydata t=%.0f", channel, cand.t_peak)
            return None
        log.info("%s: wycinek gotowy: %s", channel, out)
        try:
            self.on_candidate(cand, out)
        except Exception:
            log.exception("%s: blad w on_candidate", channel)
        return out

    # -- petla glowna ---------------------------------------------------------

    def _tick(self) -> None:
        for c in self.channels:
            rec = self.recorders[c]
            if not rec.started:
                continue
            if "chat" not in self._signals[c]:
                continue
            with self._lock:
                cands = self.detectors[c].tick(rec.clock())
            self._submit(c, cands)

    # -- klipy widzow ---------------------------------------------------------

    def _warn_clips(self, channel: str, msg: str, *args) -> None:
        """Jedno ostrzezenie o klipach na kanal na WARN_EVERY sekund."""
        now = time.monotonic()
        last = self._last_clip_warn.get(channel)
        if last is None or now - last >= WARN_EVERY:
            self._last_clip_warn[channel] = now
            log.warning(msg, *args)

    def _poll_clips(self, now: float | None = None) -> None:
        """Pobiera nowe klipy widzow dla kanalow, ktorych termin nadszedl. Nie rzuca."""
        now = time.monotonic() if now is None else now
        for c in self._clip_channels:
            rec = self.recorders[c]
            if not rec.started or now < self._next_clip_poll[c]:
                continue
            self._next_clip_poll[c] = now + self.clip_poll
            try:
                clips = self._fetch_clips(c, 10)
            except Exception as exc:
                self._warn_clips(c, "%s: klipy widzow niedostepne, jade tylko na czacie (%s: %s)",
                                 c, type(exc).__name__, exc)
                continue
            for clip in clips:
                key = clip.get("url") or f"{clip.get('created_at')}|{clip.get('title')}"
                if key in self._seen_clips[c]:
                    continue
                self._seen_clips[c].add(key)
                try:
                    self._handle_clip(c, clip)
                except Exception:
                    log.exception("%s: blad obrobki klipu widza %s", c, key)

    def _handle_clip(self, channel: str, clip: dict) -> None:
        rec = self.recorders[channel]
        created = clip.get("created_at") or ""
        if not created:
            log.info("%s: klip widza bez daty, pomijam", channel)
            return
        end = rec.t_at(signals._parse_time(created)) - self.clip_lag
        dur = float(clip.get("duration") or 0.0)
        start = end - dur
        if end <= 0:
            log.info("%s: klip widza sprzed startu nagrania (t=%.0f), pomijam", channel, end)
            return
        buf_start = rec.buffer_start()
        if buf_start is not None and end < buf_start:
            log.info("%s: klip widza (t=%.0f-%.0f) juz poza buforem (od %.0f), pomijam",
                     channel, start, end, buf_start)
            return
        cfg = config.streamer(channel)
        row = {"vod_offset": start, "duration": dur, "title": clip.get("title") or "",
               "view_count": int(clip.get("view_count") or 0)}
        cand = signals.clip_candidates([row], channel, cfg.preroll, cfg.postroll, min_views=0)[0]
        with self._lock:
            near = any(abs(t - cand.t_peak) <= DEDUPE_WINDOW for t in self._emitted[channel])
            pending = self.detectors[channel]._pending
            if (not near and pending is not None
                    and abs(pending.t_peak - cand.t_peak) <= DEDUPE_WINDOW):
                pending.score += signals.CHAT_BOOST     # skok czatu jeszcze czeka na emisje
                near = True
            if not near:
                self._clip_count[channel] += 1
        if near:
            log.info("%s: moment t=%.0f potwierdzony przez widzow (klip \"%s\"), "
                     "bez drugiego kandydata", channel, cand.t_peak,
                     cand.sample[0] if cand.sample else "")
            return
        log.info("%s: klip widza -> kandydat t=%.0f (wyswietlenia: %d)",
                 channel, cand.t_peak, row["view_count"])
        self._submit(channel, [cand])

    def _status(self) -> None:
        for c in self.channels:
            rec = self.recorders[c]
            with self._lock:
                dq = self._recent[c]
                now = time.monotonic()
                while dq and now - dq[0] > 60:
                    dq.popleft()
                per_min, cands = len(dq), self._cand_count[c]
                clips_n = self._clip_count[c]
            log.info("%s: zywy=%s bufor=%.0f s (%.0f MB) czat=%d wiad./min kandydaci=%d "
                     "klipy_widzow=%d",
                     c, "tak" if rec.is_alive() else "NIE", rec.buffer_seconds(),
                     rec.buffer_mb(), per_min, cands, clips_n)

    def _clip_loop(self) -> None:
        while not self._stop.wait(1.0):
            self._poll_clips()

    def run(self) -> None:
        from clipper.chat.irc import TwitchChat

        for rec in self.recorders.values():
            rec.start()
        make_chat = self._chat_factory or (
            lambda chans, cb, clock: TwitchChat(chans, cb, clock))
        self._chat = make_chat(self.channels, self._on_message, lambda: 0.0)
        chat_thread = threading.Thread(target=self._chat.run, name="chat", daemon=True)
        chat_thread.start()
        clip_thread = None
        if self._clip_channels:
            clip_thread = threading.Thread(target=self._clip_loop, name="clips", daemon=True)
            clip_thread.start()
        next_status = time.monotonic() + self.status_interval
        next_prune = time.monotonic() + self.prune_interval
        try:
            while not self._stop.wait(1.0):
                self._tick()
                now = time.monotonic()
                if now >= next_prune:
                    next_prune = now + self.prune_interval
                    for c, rec in self.recorders.items():
                        try:
                            rec.prune()
                        except Exception:
                            log.exception("%s: blad prune", c)
                if now >= next_status:
                    next_status = now + self.status_interval
                    self._status()
        except KeyboardInterrupt:
            log.info("Ctrl+C, zatrzymuje sesje live")
        finally:
            self.stop()
            chat_thread.join(timeout=5)
            if clip_thread is not None:
                clip_thread.join(timeout=25)
            self._pool.shutdown(wait=True, cancel_futures=True)
            for rec in self.recorders.values():
                try:
                    rec.stop()
                except Exception:
                    log.exception("blad przy zatrzymywaniu nagrywania")
