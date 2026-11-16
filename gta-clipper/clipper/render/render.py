"""Render pionowego klipu 9:16 z napisami: jedno wywolanie ffmpeg na klip.

Test reczny:
    python -m clipper.render.render <wideo> [--facecam x,y,w,h] [--peak SEKUNDY]
"""
from __future__ import annotations

import argparse
import json
import logging
import re
import shutil
import subprocess
import tempfile
import time
from dataclasses import asdict
from functools import lru_cache
from pathlib import Path

from clipper.config import Layout, subdir
from clipper.models import Candidate, RenderedClip, Segment, Word

from .captions import FONTS_DIR, build_ass, title_anchor
from .layout import AUDIO_ARGS, AUDIO_FILTER, build_filter
from .pick import pick_window
from .transcribe import transcribe, words_text

log = logging.getLogger(__name__)

OUT_W, OUT_H = 1080, 1920
NVENC_ARGS = ["-c:v", "h264_nvenc", "-preset", "p5", "-rc", "vbr", "-cq", "23", "-b:v", "0"]
X264_ARGS = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "21"]
ASS_NAME = "captions.ass"


def _tail(text: str, lines: int = 12) -> str:
    return "\n".join((text or "").strip().splitlines()[-lines:])


def _run(cmd: list[str], *, cwd: Path | None = None, what: str) -> subprocess.CompletedProcess:
    proc = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if proc.returncode != 0:
        raise RuntimeError(f"{what} nie powiodlo sie (kod {proc.returncode}):\n{_tail(proc.stderr)}")
    return proc


def probe(path: Path) -> dict:
    """Zwraca width, height, duration, has_audio pliku wideo."""
    proc = _run(
        ["ffprobe", "-v", "error", "-show_entries",
         "format=duration:stream=codec_type,width,height,avg_frame_rate", "-of", "json", str(path)],
        what=f"ffprobe {path.name}",
    )
    info = json.loads(proc.stdout)
    video = next((s for s in info.get("streams", []) if s.get("codec_type") == "video"), None)
    if video is None:
        raise RuntimeError(f"Plik bez strumienia wideo: {path}")
    num, _, den = (video.get("avg_frame_rate") or "0/1").partition("/")
    fps = float(num) / float(den or 1) if float(den or 1) else 0.0
    return {
        "width": int(video["width"]),
        "height": int(video["height"]),
        "fps": fps,
        "duration": float(info["format"]["duration"]),
        "has_audio": any(s.get("codec_type") == "audio" for s in info.get("streams", [])),
    }


@lru_cache(maxsize=1)
def _nvenc_usable() -> bool:
    """Prawdziwa proba: krotki testowy encode na h264_nvenc (sama lista enkoderow nie wystarcza)."""
    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-f", "lavfi",
           "-i", "color=c=black:s=256x256:r=30:d=0.2", "-c:v", "h264_nvenc", "-f", "null", "-"]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8",
                              errors="replace", timeout=30)
    except (OSError, subprocess.TimeoutExpired) as exc:
        log.warning("Test NVENC nie wystartowal (%s); uzywam libx264", exc)
        return False
    if proc.returncode != 0:
        log.warning("NVENC niedostepny, uzywam libx264: %s", _tail(proc.stderr, 2))
        return False
    log.info("NVENC dostepny (h264_nvenc)")
    return True


def _safe(name: str) -> str:
    return re.sub(r"[^A-Za-z0-9_-]+", "_", name).strip("_") or "clip"


def _ffmpeg_cmd(src: Path, dst: Path, start: float, length: float, vf: str,
                has_audio: bool, encoder: list[str]) -> list[str]:
    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
           "-ss", f"{start:.3f}", "-t", f"{length:.3f}", "-i", str(src)]
    if has_audio:
        graph = f"{vf};[0:a]{AUDIO_FILTER}[a]"
    else:
        # Zrodlo bez dzwieku: dokladamy cisze, bo platformy chca sciezki audio.
        cmd += ["-f", "lavfi", "-t", f"{length:.3f}", "-i", "anullsrc=r=48000:cl=stereo"]
        graph = f"{vf};[1:a]anull[a]"
    cmd += ["-filter_complex", graph, "-map", "[v]", "-map", "[a]", *encoder, "-pix_fmt", "yuv420p",
            *AUDIO_ARGS, "-t", f"{length:.3f}", "-movflags", "+faststart", str(dst)]
    return cmd


def render_clip(segment: Segment, layout: Layout, *, lang: str | None = "en",
                disclosure: str | None = None, window: tuple[float, float] | None = None,
                out_dir: Path | None = None, words: list[Word] | None = None,
                title: str | None = None, overlay_text: str | None = None) -> RenderedClip:
    """Segment (poziomy, 60-90 s) -> gotowy klip 1080x1920 z napisami + plik .json obok.

    `words`: gotowa transkrypcja segmentu (czasy od poczatku pliku); bez niej render
    transkrybuje sam. `title`: bialy tytul wypalony u gory przez caly klip."""
    cand = segment.candidate
    src = Path(segment.path).resolve()
    info = probe(src)
    dur = info["duration"]

    t = time.perf_counter()
    if words is None:
        words = transcribe(src, lang)
        t_transcribe = time.perf_counter() - t
        log.info("Transkrypcja: %.1f s (%d slow, segment %.1f s)", t_transcribe, len(words), dur)
    else:
        t_transcribe = 0.0
        log.info("Transkrypcja z zewnatrz: %d slow (segment %.1f s)", len(words), dur)

    if window is None:
        w0, w1 = pick_window(words, dur, peak=cand.t_peak - cand.t_start)
    else:
        w0, w1 = max(0.0, float(window[0])), min(dur, float(window[1]))
    if w1 - w0 < 0.5:
        raise ValueError(f"Za krotkie okno klipu: {w0:.2f}-{w1:.2f} s (segment {dur:.2f} s)")
    length = w1 - w0

    channel = _safe(cand.channel)
    out_dir = Path(out_dir) if out_dir else subdir("clips") / channel
    out_dir.mkdir(parents=True, exist_ok=True)
    t_start = cand.t_start + w0
    dst = (out_dir / f"{channel}_{int(t_start)}.mp4").resolve()

    # Katalog roboczy = cwd ffmpeg; w filtrze sa tylko wzgledne sciezki (captions.ass, fonts).
    work = Path(tempfile.mkdtemp(prefix="render_", dir=subdir("work")))
    try:
        title_an, title_y = title_anchor(layout, OUT_H)
        build_ass(words, work / ASS_NAME, t0=w0, t1=w1, width=OUT_W, height=OUT_H, disclosure=disclosure,
                  title=title, title_an=title_an, title_y=title_y, overlay_text=overlay_text)
        shutil.copytree(FONTS_DIR, work / "fonts")
        vf = build_filter(info["width"], info["height"], layout, ASS_NAME, OUT_W, OUT_H, fonts_dir="fonts")

        nvenc = _nvenc_usable()
        t = time.perf_counter()
        try:
            _run(_ffmpeg_cmd(src, dst, w0, length, vf, info["has_audio"], NVENC_ARGS if nvenc else X264_ARGS),
                 cwd=work, what=f"ffmpeg render {dst.name}")
        except RuntimeError as exc:
            if not nvenc:
                raise
            log.warning("Render na NVENC padl, powtarzam na libx264: %s", exc)
            nvenc = False
            _run(_ffmpeg_cmd(src, dst, w0, length, vf, info["has_audio"], X264_ARGS),
                 cwd=work, what=f"ffmpeg render {dst.name} (libx264)")
        t_encode = time.perf_counter() - t
    finally:
        shutil.rmtree(work, ignore_errors=True)

    out_dur = probe(dst)["duration"]
    encoder = "h264_nvenc" if nvenc else "libx264"
    log.info("Encode: %.1f s (%s, klip %.1f s, %.1fx realtime) -> %s",
             t_encode, encoder, out_dur, out_dur / t_encode if t_encode else 0.0, dst)

    sidecar = {
        "clip": dst.name,
        "channel": cand.channel,
        "t_start": t_start,
        "duration": out_dur,
        "window": [w0, w1],
        "segment": str(src),
        "transcript": words_text(words, w0, w1),
        "words": [{"start": round(w.start - w0, 3), "end": round(w.end - w0, 3), "text": w.text}
                  for w in words if w0 <= w.start < w1],
        "lang": lang,
        "disclosure": disclosure,
        "title": title,
        "overlay_text": overlay_text,
        "candidate": asdict(cand),
        "timings": {"transcribe_s": round(t_transcribe, 2), "encode_s": round(t_encode, 2), "encoder": encoder},
    }
    dst.with_suffix(".json").write_text(json.dumps(sidecar, ensure_ascii=False, indent=2), encoding="utf-8")
    return RenderedClip(path=dst, duration=out_dur, channel=cand.channel, t_start=t_start)


def _rect_arg(value: str) -> tuple[int, int, int, int]:
    parts = [p for p in value.split(",") if p.strip()]
    if len(parts) != 4:
        raise argparse.ArgumentTypeError("oczekiwano x,y,w,h")
    return tuple(int(p) for p in parts)  # type: ignore[return-value]


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Reczny test renderu 9:16")
    ap.add_argument("video", type=Path)
    ap.add_argument("--facecam", type=_rect_arg, help="x,y,w,h kamerki w pikselach zrodla")
    ap.add_argument("--gameplay", type=_rect_arg, help="x,y,w,h gameplayu w pikselach zrodla")
    ap.add_argument("--ratio", type=float, default=0.35, help="czesc wysokosci na kamerke")
    ap.add_argument("--peak", type=float, help="pozycja spike'a w pliku (s)")
    ap.add_argument("--window", help="start,koniec w sekundach (pomija automatyczny wybor)")
    ap.add_argument("--lang", default="en")
    ap.add_argument("--disclosure", help='np. "#ad"')
    ap.add_argument("--channel", default="test")
    ap.add_argument("--out-dir", type=Path)
    args = ap.parse_args(argv)

    logging.basicConfig(level="INFO", format="%(asctime)s %(levelname)-7s %(name)s: %(message)s")
    dur = probe(args.video)["duration"]
    peak = args.peak if args.peak is not None else max(dur / 2, dur - 8.0)
    cand = Candidate(channel=args.channel, t_peak=peak, score=0.0, t_start=0.0, t_end=dur,
                     sample=["test reczny"], source="manual")
    window = None
    if args.window:
        a, _, b = args.window.partition(",")
        window = (float(a), float(b))
    clip = render_clip(
        Segment(candidate=cand, path=args.video),
        Layout(facecam=args.facecam, gameplay=args.gameplay, facecam_ratio=args.ratio),
        lang=args.lang or None, disclosure=args.disclosure, window=window, out_dir=args.out_dir,
    )
    print(f"{clip.path}  ({clip.duration:.2f} s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
