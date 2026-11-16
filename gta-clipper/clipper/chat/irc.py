"""Anonimowy nasluch czatu Twitcha po IRC (tylko odczyt, bez hasla)."""
from __future__ import annotations

import logging
import random
import socket
import ssl
import threading
import time
from typing import Callable

from clipper.models import ChatMessage

log = logging.getLogger(__name__)

HOST = "irc.chat.twitch.tv"
PORT = 6697
READ_TIMEOUT = 1.0          # krotki timeout odczytu, zeby stop() dzialal szybko
CONNECT_TIMEOUT = 15.0
IDLE_TIMEOUT = 400.0        # Twitch pinguje co ok. 5 min; dluzsza cisza = martwe lacze
MAX_BACKOFF = 60.0
JOIN_BATCH = 20             # limit JOIN-ow na 10 s dla anonimowego klienta
JOIN_PAUSE = 11.0

_TAG_ESCAPES = {":": ";", "s": " ", "\\": "\\", "r": "\r", "n": "\n"}


def _unescape_tag(value: str) -> str:
    if "\\" not in value:
        return value
    out: list[str] = []
    i, n = 0, len(value)
    while i < n:
        c = value[i]
        if c == "\\":
            i += 1
            if i < n:                       # samotny backslash na koncu wypada
                out.append(_TAG_ESCAPES.get(value[i], value[i]))
        else:
            out.append(c)
        i += 1
    return "".join(out)


def _parse_tags(raw: str) -> dict[str, str]:
    tags: dict[str, str] = {}
    for item in raw.split(";"):
        if not item:
            continue
        key, _, value = item.partition("=")
        tags[key] = _unescape_tag(value)
    return tags


def _split(line: str) -> tuple[dict[str, str], str, str, list[str]] | None:
    """Rozbija linie IRC na (tagi, prefiks, komenda, parametry)."""
    line = line.rstrip("\r\n")
    tags: dict[str, str] = {}
    prefix = ""
    if line.startswith("@"):
        raw, _, line = line[1:].partition(" ")
        tags = _parse_tags(raw)
        line = line.lstrip(" ")
    if line.startswith(":"):
        prefix, _, line = line[1:].partition(" ")
        line = line.lstrip(" ")
    if not line:
        return None
    head, sep, trailing = line.partition(" :")
    parts = head.split()
    if not parts:
        return None
    params = parts[1:]
    if sep:
        params.append(trailing)
    return tags, prefix, parts[0].upper(), params


def parse_line(line: str, t: float) -> tuple[str, ChatMessage] | None:
    """PRIVMSG -> kind="msg", USERNOTICE -> kind="system", reszta -> None."""
    parsed = _split(line)
    if parsed is None:
        return None
    tags, prefix, command, params = parsed
    if command not in ("PRIVMSG", "USERNOTICE") or not params:
        return None
    if not params[0].startswith("#"):
        return None                          # szepty itp. nas nie interesuja
    channel = params[0][1:].lower()
    text = params[1] if len(params) > 1 else ""
    nick = prefix.partition("!")[0]

    if command == "PRIVMSG":
        # /me przychodzi jako CTCP ACTION
        if text.startswith("\x01ACTION") and text.endswith("\x01"):
            text = text[len("\x01ACTION"):-1].strip()
        user = tags.get("display-name") or nick
        return channel, ChatMessage(t=t, user=user, text=text, kind="msg")

    user = tags.get("display-name") or tags.get("login") or nick
    system = tags.get("system-msg", "")
    full = " ".join(p for p in (system, text) if p) or tags.get("msg-id", "")
    return channel, ChatMessage(t=t, user=user, text=full, kind="system")


class _Reconnect(Exception):
    """Lacze trzeba zestawic od nowa."""


class TwitchChat:
    """Jedno polaczenie dla wszystkich kanalow. `clock()` daje `t` wiadomosci."""

    def __init__(self, channels: list[str],
                 on_message: Callable[[str, ChatMessage], None],
                 clock: Callable[[], float],
                 host: str = HOST, port: int = PORT, use_tls: bool = True) -> None:
        self.channels = [c.strip().lstrip("#").lower() for c in channels if c.strip()]
        self.on_message = on_message
        self.clock = clock
        self.host = host
        self.port = port
        self.use_tls = use_tls
        self._stop = threading.Event()
        self._sock: socket.socket | None = None

    def stop(self) -> None:
        self._stop.set()

    def run(self) -> None:
        """Petla blokujaca; wraca dopiero po stop()."""
        if not self.channels:
            log.warning("czat: brak kanalow, nie ma czego sluchac")
            return
        backoff = 1.0
        while not self._stop.is_set():
            started = time.monotonic()
            try:
                self._session()
            except (OSError, _Reconnect) as exc:     # ssl.SSLError to tez OSError
                log.warning("czat: polaczenie zerwane: %s", exc or type(exc).__name__)
            finally:
                self._close()
            if self._stop.is_set():
                break
            if time.monotonic() - started > 60.0:
                backoff = 1.0                        # sesja dzialala, zaczynamy od nowa
            log.info("czat: ponowne laczenie za %.0f s", backoff)
            self._stop.wait(backoff)
            backoff = min(backoff * 2, MAX_BACKOFF)
        log.info("czat: zatrzymany")

    # -- wnetrze --------------------------------------------------------------

    def _connect(self) -> socket.socket:
        sock = socket.create_connection((self.host, self.port), timeout=CONNECT_TIMEOUT)
        try:
            if self.use_tls:
                ctx = ssl.create_default_context()
                sock = ctx.wrap_socket(sock, server_hostname=self.host)
            sock.settimeout(READ_TIMEOUT)
        except BaseException:
            sock.close()
            raise
        return sock

    def _close(self) -> None:
        sock, self._sock = self._sock, None
        if sock is not None:
            try:
                sock.close()
            except OSError as exc:
                log.debug("czat: blad przy zamykaniu gniazda: %s", exc)

    def _send(self, line: str) -> None:
        if self._sock is None:
            raise _Reconnect("brak gniazda")
        self._sock.sendall((line + "\r\n").encode("utf-8"))

    def _session(self) -> None:
        self._sock = self._connect()
        nick = f"justinfan{random.randint(10000, 99999999)}"
        self._send("CAP REQ :twitch.tv/tags twitch.tv/commands")
        self._send(f"NICK {nick}")
        log.info("czat: polaczono jako %s, kanaly: %s", nick, ", ".join(self.channels))

        # JOIN-y partiami; kolejne partie dosylamy w trakcie czytania
        batches = [self.channels[i:i + JOIN_BATCH]
                   for i in range(0, len(self.channels), JOIN_BATCH)]
        next_join = time.monotonic()
        last_data = time.monotonic()
        buf = b""
        while not self._stop.is_set():
            now = time.monotonic()
            if batches and now >= next_join:
                self._send("JOIN " + ",".join("#" + c for c in batches.pop(0)))
                next_join = now + JOIN_PAUSE
            try:
                data = self._sock.recv(65536)
            except (socket.timeout, ssl.SSLWantReadError):
                if time.monotonic() - last_data > IDLE_TIMEOUT:
                    raise _Reconnect("cisza na laczu")
                continue
            if not data:
                raise _Reconnect("serwer zamknal polaczenie")
            last_data = time.monotonic()
            buf += data
            *lines, buf = buf.split(b"\n")
            for raw in lines:
                line = raw.decode("utf-8", errors="replace").rstrip("\r")
                if line:
                    self._handle(line)

    def _handle(self, line: str) -> None:
        if line.startswith("PING"):
            self._send("PONG" + line[4:])
            return
        if line.startswith(":tmi.twitch.tv RECONNECT"):
            raise _Reconnect("serwer poprosil o RECONNECT")
        if line.startswith(":tmi.twitch.tv NOTICE") and "Login authentication failed" in line:
            raise _Reconnect("logowanie odrzucone")
        try:
            parsed = parse_line(line, self.clock())
        except Exception:
            log.exception("czat: nie udalo sie sparsowac linii: %r", line)
            return
        if parsed is None:
            return
        try:
            self.on_message(*parsed)
        except Exception:
            # blad odbiorcy nie moze zabic nasluchu, ale ma byc widoczny w logu
            log.exception("czat: blad w on_message")
