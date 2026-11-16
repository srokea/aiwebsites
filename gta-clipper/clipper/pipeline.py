"""Wspolny pipeline dla trybu VOD i live:
kandydat + wycinek -> render 9:16 -> opis z LLM -> zasady kampanii -> akceptacja ntfy.

Nic tutaj nie publikuje. Publikacja jest osobnym, jawnym krokiem (cli: decisions / publish).
"""
from __future__ import annotations

import importlib
import json
import logging
from pathlib import Path

from . import approve, brain, campaigns, config, tracker
from .models import Candidate, ClipMeta, RenderedClip, Segment

log = logging.getLogger(__name__)

MIN_LLM_SCORE = 4          # ponizej tego klip nie idzie na telefon (zostaje w bazie jako rejected)


def _existing_clip(candidate_id: int) -> dict | None:
    conn = tracker.connect()
    try:
        row = conn.execute("SELECT * FROM clips WHERE candidate_id = ? ORDER BY id DESC LIMIT 1",
                           (candidate_id,)).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def _sidecar(clip_path: Path) -> dict:
    """Renderer zapisuje obok klipu JSON z transkrypcja okna."""
    for p in (clip_path.with_suffix(".json"), Path(str(clip_path) + ".json")):
        if p.exists():
            return json.loads(p.read_text(encoding="utf-8"))
    return {}


def meta_from_row(row: dict) -> ClipMeta:
    return ClipMeta(
        title=row.get("title") or "",
        description=row.get("description") or "",
        hashtags=json.loads(row.get("hashtags_json") or "[]"),
        score=int(row.get("llm_score") or 0),
    )


def process(cand: Candidate, segment_path: Path, source_url: str, *,
            send: bool = True, force: bool = False) -> int | None:
    """Przetwarza jednego kandydata. Zwraca id klipu albo None, gdy pominiety."""
    # Modul clipper.render.transcribe zaslania funkcja `transcribe` z clipper.render, wiec importlib.
    tr = importlib.import_module("clipper.render.transcribe")
    rd = importlib.import_module("clipper.render.render")
    pick = importlib.import_module("clipper.render.pick")

    st = config.streamer(cand.channel)
    cand_id = tracker.add_candidate(cand, source_url)
    if not force and _existing_clip(cand_id):
        log.info("Kandydat %s @%.0fs ma juz klip, pomijam", cand.channel, cand.t_peak)
        return None

    campaign = campaigns.load(st.campaign) if st.campaign else None
    disclosure = campaign.disclosure if campaign else None

    # Kolejnosc (karta 12 GB): Whisper -> okno -> LLM -> render. Tytul musi istniec przed renderem,
    # bo jest wypalany w kadrze. Whisper schodzi z VRAM przed LLM, LLM przed kolejnym Whisperem.
    seg_path = Path(segment_path)
    seg_dur = rd.probe(seg_path.resolve())["duration"]
    words = tr.transcribe(seg_path.resolve(), st.lang)
    tr.unload()
    w0, w1 = pick.pick_window(words, seg_dur, peak=cand.t_peak - cand.t_start)
    transcript = tr.words_text(words, w0, w1)         # tylko to, co faktycznie jest w klipie

    meta = brain.describe(transcript, list(cand.sample), cand.channel, lang=st.lang,
                          rp=st.rp, extra_tags=st.tags)
    brain.unload()

    clip: RenderedClip = rd.render_clip(Segment(cand, seg_path), st.layout, lang=st.lang,
                                        disclosure=disclosure, window=(w0, w1), words=words,
                                        title=meta.title,
                                        overlay_text=campaign.overlay_text if campaign else None)

    problems: list[str] = []
    if campaign:
        meta = campaigns.apply(campaign, meta)
        clip.campaign = campaign.name
    clip.meta = meta
    if campaign:
        for platform in campaign.platforms or ["youtube"]:
            problems += [f"{platform}: {p}" for p in campaigns.validate(campaign, clip, platform)]
        problems = sorted(set(problems))

    clip_id = tracker.add_clip(cand_id, clip, status="rendered")
    log.info("Klip #%s: %s (%.0fs, ocena LLM %s) -> %s",
             clip_id, meta.title, clip.duration, meta.score, clip.path)

    if problems:
        tracker.set_clip_status(clip_id, "blocked", "; ".join(problems))
        log.warning("Klip #%s zablokowany przez zasady kampanii: %s", clip_id, "; ".join(problems))
        return clip_id
    if meta.score < MIN_LLM_SCORE:
        tracker.set_clip_status(clip_id, "rejected", f"auto: ocena LLM {meta.score} ({meta.reason})")
        log.info("Klip #%s odrzucony automatycznie (ocena LLM %s)", clip_id, meta.score)
        return clip_id
    if not send:
        return clip_id

    extra = (f"{cand.channel} | spike {cand.score:.1f} | LLM {meta.score}/10"
             + (f" | kampania: {campaign.name}" if campaign else ""))
    try:
        approve.send_for_approval(clip_id, clip.path, meta, extra)
        tracker.set_clip_status(clip_id, "pending_approval")
    except approve.NtfyConfigError as e:
        log.warning("ntfy nieskonfigurowane, klip #%s zostaje jako 'rendered': %s", clip_id, e)
    return clip_id


def apply_decisions() -> list[tuple[int, str]]:
    """Pobiera decyzje z ntfy i zapisuje je w bazie. Zatwierdzone klipy pakuje do to_post/."""
    from .publish import manual

    state = config.data_dir() / "ntfy_since.txt"
    since = state.read_text(encoding="utf-8").strip() if state.exists() else "all"
    out: list[tuple[int, str]] = []
    last_id = None
    for clip_id, decision, msg_id, reason in approve.poll_decisions(since):
        last_id = msg_id or last_id
        row = tracker.get_clip(clip_id)
        if row is None:
            log.warning("Decyzja dla nieznanego klipu #%s, pomijam", clip_id)
            continue
        if row["status"] in ("published", "approved", "rejected"):
            continue                              # decyzja juz zapisana
        tracker.set_clip_status(clip_id, decision, reason or None)
        out.append((clip_id, decision))
        if decision == "approved":
            camp = campaigns.load(row["campaign"]) if row.get("campaign") else None
            folder = manual.package(clip_id, row["path"], meta_from_row(row), camp)
            log.info("Klip #%s zatwierdzony, paczka do wrzucenia: %s", clip_id, folder)
        else:
            log.info("Klip #%s odrzucony: %s", clip_id, reason or "-")
    if last_id:
        state.write_text(last_id, encoding="utf-8")
    return out
