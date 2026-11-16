"""Ciecie wideo ffmpeg-iem: sonda, wycinki, wybor enkodera, segment dla kandydata."""
from __future__ import annotations

import json
import logging
import subprocess
from functools import lru_cache
from pathlib import Path

from clipper import config
from clipper.models import Candidate, Segment

log = logging.getLogger(__name__)


def _stderr_tail(text: str | None, lines: int = 15) -> str:
    return "\n".join((text or "").strip().splitlines()[-lines:])


def _run(cmd: list[str]) -> subprocess.CompletedProcess:
    log.debug("Uruchamiam: %s", cmd)
    proc = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if proc.returncode != 0:
        raise RuntimeError(
            f"{Path(cmd[0]).name} zakonczyl sie kodem {proc.returncode}: {_stderr_tail(proc.stderr)}"
        )
    return proc


def _parse_rate(rate: str | None) -> float:
    if not rate or rate in ("0/0", "N/A"):
        return 0.0
    if "/" in rate:
        num, den = rate.split("/", 1)
        return float(num) / float(den) if float(den) else 0.0
    return float(rate)


def probe(path: Path) -> dict:
    """width, height, duration, fps, has_audio wedlug ffprobe."""
    path = Path(path)
    if not path.is_file():
        raise FileNotFoundError(f"Brak pliku wideo: {path}")
    proc = _run([
        "ffprobe", "-v", "error", "-print_format", "json",
        "-show_format", "-show_streams", str(path),
    ])
    data = json.loads(proc.stdout)
    streams = data.get("streams") or []
    video = next((s for s in streams if s.get("codec_type") == "video"), None)
    if video is None:
        raise RuntimeError(f"Plik nie ma strumienia wideo: {path}")
    duration = (data.get("format") or {}).get("duration") or video.get("duration") or 0.0
    fps = _parse_rate(video.get("avg_frame_rate")) or _parse_rate(video.get("r_frame_rate"))
    return {
        "width": int(video.get("width") or 0),
        "height": int(video.get("height") or 0),
        "duration": float(duration),
        "fps": round(fps, 3),
        "has_audio": any(s.get("codec_type") == "audio" for s in streams),
    }


@lru_cache(maxsize=1)
def has_nvenc() -> bool:
    """Czy h264_nvenc jest na liscie enkoderow ORAZ faktycznie dziala (test 1 klatki)."""
    try:
        listed = subprocess.run(
            ["ffmpeg", "-hide_banner", "-encoders"],
            capture_output=True, text=True, encoding="utf-8", errors="replace",
        )
    except OSError as exc:
        log.warning("Nie udalo sie uruchomic ffmpeg przy sprawdzaniu NVENC: %s", exc)
        return False
    if listed.returncode != 0 or "h264_nvenc" not in listed.stdout:
        log.info("NVENC niedostepny: brak h264_nvenc na liscie enkoderow")
        return False
    test = subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error",
         "-f", "lavfi", "-i", "color=c=black:s=256x256:r=30",
         "-frames:v", "1", "-c:v", "h264_nvenc", "-f", "null", "-"],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    if test.returncode != 0:
        log.info("NVENC jest na liscie, ale test kodowania sie nie powiodl: %s",
                 _stderr_tail(test.stderr, 3))
        return False
    log.info("NVENC dostepny")
    return True


def video_encoder_args(quality: int = 23) -> list[str]:
    if has_nvenc():
        return ["-c:v", "h264_nvenc", "-preset", "p5", "-cq", str(quality)]
    return ["-c:v", "libx264", "-preset", "veryfast", "-crf", str(quality)]


def cut(src: Path, t_start: float, t_end: float, out: Path, reencode: bool = False) -> Path:
    """Wycina [t_start, t_end] z lokalnego pliku.

    Domyslnie kopiowanie strumieni (szybkie, ciecie na klatkach kluczowych);
    reencode=True koduje h264 i tnie co do klatki.
    """
    src, out = Path(src), Path(out)
    if not src.is_file():
        raise FileNotFoundError(f"Brak pliku zrodlowego: {src}")
    t_start = max(0.0, float(t_start))
    duration = float(t_end) - t_start
    if duration <= 0:
        raise ValueError(f"Pusty zakres: t_start={t_start}, t_end={t_end}")
    out.parent.mkdir(parents=True, exist_ok=True)

    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
           "-ss", f"{t_start:.3f}", "-i", str(src), "-t", f"{duration:.3f}"]
    if reencode:
        cmd += [*video_encoder_args(), "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k"]
    else:
        cmd += ["-c", "copy", "-avoid_negative_ts", "make_zero"]
    cmd += ["-movflags", "+faststart", str(out)]
    try:
        _run(cmd)
    except Exception:
        # nie zostawiamy urwanego pliku, bo segment_for uznalby go za gotowy
        if out.exists():
            out.unlink()
        raise
    if not out.exists() or out.stat().st_size == 0:
        raise RuntimeError(f"ffmpeg nie utworzyl pliku wyjsciowego: {out}")
    return out


def segment_for(candidate: Candidate, *, vod_url: str | None = None,
                local_file: Path | None = None, offset: float = 0.0) -> Segment:
    """Tworzy poziomy wycinek dla kandydata w segments/<kanal>/<kanal>_<t_start>.mp4.

    vod_url -> pobranie samego zakresu z VOD-a; local_file -> ciecie pliku lokalnego,
    gdzie `offset` to `t`, w ktorym zaczyna sie ten plik (bufor live).
    """
    if (vod_url is None) == (local_file is None):
        raise ValueError("Podaj dokladnie jedno z: vod_url albo local_file")
    channel = candidate.channel.lower()
    out = config.subdir("segments") / channel / f"{channel}_{int(candidate.t_start)}.mp4"
    if out.exists() and out.stat().st_size > 0:
        log.info("Segment juz istnieje, pomijam: %s", out)
        return Segment(candidate=candidate, path=out)
    out.parent.mkdir(parents=True, exist_ok=True)

    if vod_url is not None:
        from clipper.sources import vod

        vod.download_range(vod_url, candidate.t_start, candidate.t_end, out,
                           quality=config.streamer(channel).quality)
    else:
        start = candidate.t_start - offset
        end = candidate.t_end - offset
        if end <= 0:
            raise ValueError(
                f"Kandydat ({candidate.t_start:.1f}-{candidate.t_end:.1f} s) lezy przed poczatkiem "
                f"pliku lokalnego (offset={offset:.1f} s)"
            )
        if start < 0:
            log.warning("Poczatek kandydata jest przed poczatkiem pliku; przycinam o %.1f s", -start)
            start = 0.0
        cut(Path(local_file), start, end, out)
    log.info("Segment gotowy: %s", out)
    return Segment(candidate=candidate, path=out)
