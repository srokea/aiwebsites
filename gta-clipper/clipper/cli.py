"""Wiersz polecen: clipper vod | live | decisions | publish | posted | remind | status."""
from __future__ import annotations

import argparse
import json
import logging
import sys
from datetime import datetime, timezone

from . import config

log = logging.getLogger("clipper")


def _fmt(t: float) -> str:
    t = int(t)
    return f"{t // 3600}:{t % 3600 // 60:02d}:{t % 60:02d}"


def cmd_vod(a: argparse.Namespace) -> int:
    from . import cut, pipeline
    from .detect import signals, spikes
    from .sources import vod

    info = vod.vod_info(a.url)
    channel = a.channel or info["channel"]
    st = config.streamer(channel)
    log.info("VOD %s | %s | %s | %s", info["id"], channel, _fmt(info["duration"]), info["title"])

    chat = vod.download_chat(a.url, config.subdir("chat") / f"{info['id']}.json")
    cfg = spikes.DetectorConfig(z_threshold=a.z)
    cands = spikes.detect(chat, channel, cfg, preroll=st.preroll, postroll=st.postroll)
    log.info("Czat: %d wiadomosci, kandydatow: %d (prog z=%.1f)", len(chat), len(cands), a.z)

    # drugi sygnal: klipy widzow z Helix. Nigdy nie psuje sciezki VOD.
    clips: list[dict] | None = None
    try:
        clips = signals.vod_clips(info["id"], channel)
    except Exception as exc:
        log.warning("Klipy widzow niedostepne (%s: %s); jade tylko na czacie",
                    type(exc).__name__, exc)

    if a.compare:
        if clips is None:
            log.error("--compare wymaga klipow widzow z Twitcha (sprawdz klucze w .env)")
            return 2
        rep = signals.compare(cands, clips)
        print(f"Klipow widzow z tego VOD: {rep['clips_total']}, sprawdzono top {rep['checked']}")
        print(f"Zgodnosc czatu z klipami: {len(rep['hits'])}/{rep['checked']} = {rep['hit_rate']:.0%}")
        for label, rows in (("TRAFIONE", rep["hits"]), ("PUDLA", rep["misses"])):
            for r in rows:
                print(f"  {label:8} {_fmt(r['vod_offset'])}  {r['views']:>4} wyswietlen  {r['title'][:60]}")
        return 0

    if clips:
        clip_cands = signals.clip_candidates(clips, channel, st.preroll, st.postroll)
        log.info("Klipy widzow: %d, po zlaniu: %d", len(clips), len(clip_cands))
        cands = signals.merge(cands, clip_cands)

    chosen = spikes.top(cands, a.top) if a.top else cands
    labels = {"chat": "chat", "viewer_clip": "viewer_clip", "both": "both"}
    for c in chosen:
        print(f"  {_fmt(c.t_peak)}  [{labels.get(c.source, c.source)}] z={c.score:5.1f}  "
              f"{' | '.join(c.sample[:4])[:90]}")
    if a.dry_run:
        return 0

    for c in chosen:
        try:
            seg = cut.segment_for(c, vod_url=a.url)
            pipeline.process(c, seg.path, a.url, send=not a.no_send, force=a.force)
        except Exception:
            # jeden zly kandydat nie moze zatrzymac calego VOD-a
            log.exception("Kandydat %s @%s nie przeszedl pipeline'u", channel, _fmt(c.t_peak))
    return 0


def cmd_live(a: argparse.Namespace) -> int:
    from . import pipeline
    from .sources import live

    def on_candidate(cand, path) -> None:
        try:
            pipeline.process(cand, path, f"live:{cand.channel}:{datetime.now(timezone.utc):%Y%m%d}",
                             send=not a.no_send)
        except Exception:
            log.exception("Kandydat live %s nie przeszedl pipeline'u", cand.channel)

    channels = a.channels or list(config.streamers())
    if not channels:
        log.error("Podaj kanaly albo wpisz je do config/streamers.yaml")
        return 2
    watcher = None
    if not a.no_watch:
        from .watch import Watcher
        watcher = Watcher()
        watcher.start()
    try:
        live.LiveSession(channels, on_candidate).run()
    finally:
        if watcher is not None:
            watcher.stop()
    return 0


def cmd_watch(a: argparse.Namespace) -> int:
    """Straznik w pierwszym planie: decyzje z telefonu i przypomnienia o terminie kampanii."""
    import time

    from .watch import Watcher

    watcher = Watcher(interval=a.interval, remind_every=a.remind_every)
    watcher.start()
    print("Straznik dziala. Ctrl+C konczy.")
    try:
        while watcher.is_alive():
            time.sleep(1)
    except KeyboardInterrupt:
        print("Koniec.")
    finally:
        watcher.stop()
    return 1 if watcher.config_error else 0


def cmd_decisions(a: argparse.Namespace) -> int:
    from . import pipeline

    done = pipeline.apply_decisions()
    for clip_id, decision in done:
        print(f"#{clip_id}: {decision}")
    if not done:
        print("Brak nowych decyzji.")
    return 0


def cmd_publish(a: argparse.Namespace) -> int:
    """Upload na YouTube. Tylko klipy zatwierdzone przez czlowieka."""
    from . import approve, pipeline, tracker
    from .publish import youtube

    row = tracker.get_clip(a.clip_id)
    if row is None:
        log.error("Nie ma klipu #%s", a.clip_id)
        return 2
    if row["status"] != "approved":
        log.error("Klip #%s ma status '%s'. Publikuje tylko zatwierdzone (approved).",
                  a.clip_id, row["status"])
        return 2
    privacy = "public" if a.public else ("unlisted" if a.unlisted else "private")
    url = youtube.upload(row["path"], pipeline.meta_from_row(row), privacy=privacy, account=a.account)
    tracker.add_post(a.clip_id, "youtube", a.account, url)
    print(url)
    if row.get("campaign") and a.public:
        approve.notify("Zglos link do kampanii (30 min)",
                       f"Klip #{a.clip_id} -> {row['campaign']}\n{url}", priority=4)
    return 0


def cmd_posted(a: argparse.Namespace) -> int:
    """Zapisuje post wrzucony recznie (TikTok/Instagram) i przypomina o zgloszeniu linku."""
    from . import approve, tracker
    from .publish import manual

    deadline = manual.record_post(a.clip_id, a.platform, a.account, a.url)
    row = tracker.get_clip(a.clip_id) or {}
    print(f"Zapisane. Termin zgloszenia do kampanii: {deadline:%H:%M} UTC")
    if row.get("campaign"):
        try:
            approve.notify("Zglos link do kampanii (30 min)",
                           f"Klip #{a.clip_id} -> {row['campaign']}\n{a.url}", priority=4)
        except approve.NtfyConfigError as e:
            log.warning("%s", e)
    return 0


def cmd_submitted(a: argparse.Namespace) -> int:
    from . import tracker

    conn = tracker.connect()
    row = conn.execute("SELECT id FROM posts WHERE url = ?", (a.url,)).fetchone()
    conn.close()
    if row is None:
        log.error("Nie ma posta o tym adresie. Najpierw: clipper posted ...")
        return 2
    tracker.mark_submitted(row["id"])
    print("Oznaczone jako zgloszone do kampanii.")
    return 0


def cmd_remind(a: argparse.Namespace) -> int:
    """Przypomina o postach, ktorych link nie zostal jeszcze zgloszony do kampanii."""
    from . import approve, tracker

    pend = tracker.pending_submissions()
    for p in pend:
        p = dict(p)
        left = p.get("minutes_left", p.get("minutes_remaining"))
        print(f"post #{p.get('id')} {p.get('platform')} {p.get('url')} | zostalo {left} min")
        if a.notify:
            approve.notify("Niezgloszony link do kampanii", f"{p.get('url')}\nZostalo {left} min", 5)
    if not pend:
        print("Wszystkie linki zgloszone.")
    return 0


def cmd_auth(a: argparse.Namespace) -> int:
    """Jednorazowe logowanie do YouTube; pokazuje kanal, na ktory beda szly uploady."""
    from .publish import youtube

    print("Kanal:", youtube.whoami(a.account))
    return 0


def cmd_status(a: argparse.Namespace) -> int:
    from . import tracker

    print(json.dumps(tracker.summary(), indent=2, ensure_ascii=False))
    return 0


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="clipper", description="Kliper streamow: czat -> klipy 9:16")
    p.add_argument("--log", default="INFO")
    sub = p.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("vod", help="klipy z nagrania (VOD) na Twitchu")
    s.add_argument("url")
    s.add_argument("--channel", help="nadpisz kanal (profil z streamers.yaml)")
    s.add_argument("--top", type=int, default=5, help="ile najlepszych kandydatow (0 = wszyscy)")
    s.add_argument("--z", type=float, default=3.0, help="prog spike'a (z-score)")
    s.add_argument("--dry-run", action="store_true", help="tylko lista kandydatow")
    s.add_argument("--compare", action="store_true",
                   help="porownaj czat z klipami widzow (bez renderowania)")
    s.add_argument("--no-send", action="store_true", help="nie wysylaj na telefon")
    s.add_argument("--force", action="store_true", help="renderuj ponownie istniejace")
    s.set_defaults(fn=cmd_vod)

    s = sub.add_parser("live", help="klipowanie na zywo")
    s.add_argument("channels", nargs="*")
    s.add_argument("--no-send", action="store_true")
    s.add_argument("--no-watch", action="store_true",
                   help="nie uruchamiaj straznika decyzji i przypomnien w tle")
    s.set_defaults(fn=cmd_live)

    s = sub.add_parser("watch", help="straznik: decyzje z telefonu + przypomnienia o kampanii")
    s.add_argument("--interval", type=float, default=20.0, help="co ile sekund pobierac decyzje")
    s.add_argument("--remind-every", type=float, default=300.0,
                   help="co ile sekund sprawdzac niezgloszone linki")
    s.set_defaults(fn=cmd_watch)

    s = sub.add_parser("decisions", help="pobierz decyzje z telefonu (ntfy)")
    s.set_defaults(fn=cmd_decisions)

    s = sub.add_parser("publish", help="upload zatwierdzonego klipu na YouTube")
    s.add_argument("clip_id", type=int)
    s.add_argument("--public", action="store_true", help="domyslnie upload jest prywatny")
    s.add_argument("--unlisted", action="store_true", help="niepubliczny: widoczny tylko z linkiem")
    s.add_argument("--account", default="default")
    s.set_defaults(fn=cmd_publish)

    s = sub.add_parser("posted", help="zapisz post wrzucony recznie (TikTok/Instagram)")
    s.add_argument("clip_id", type=int)
    s.add_argument("platform", choices=["tiktok", "instagram", "youtube", "x"])
    s.add_argument("url")
    s.add_argument("--account", default="default")
    s.set_defaults(fn=cmd_posted)

    s = sub.add_parser("submitted", help="oznacz link jako zgloszony do kampanii")
    s.add_argument("url")
    s.set_defaults(fn=cmd_submitted)

    s = sub.add_parser("remind", help="pokaz niezgloszone linki")
    s.add_argument("--notify", action="store_true")
    s.set_defaults(fn=cmd_remind)

    s = sub.add_parser("auth", help="zaloguj do YouTube i pokaz kanal")
    s.add_argument("--account", default="default")
    s.set_defaults(fn=cmd_auth)

    s = sub.add_parser("status", help="podsumowanie z trackera")
    s.set_defaults(fn=cmd_status)

    a = p.parse_args(argv)
    config.setup_logging(a.log)
    return a.fn(a)


if __name__ == "__main__":
    sys.exit(main())
