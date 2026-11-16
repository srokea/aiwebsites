"""Graf filtrow ffmpeg: kadr 9:16 (kamerka nad gameplayem albo zoom na rozmytym tle)."""
from __future__ import annotations

from clipper.config import Layout

FPS = 30
ZOOM = 1.5                 # szerokosc pierwszego planu = 150% szerokosci kadru
AUDIO_FILTER = "loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000"
AUDIO_ARGS = ["-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2"]


def _even(v: float) -> int:
    return max(2, int(round(v / 2)) * 2)


def _rect(rect: tuple[int, int, int, int] | None, src_w: int, src_h: int, what: str) -> tuple[int, int, int, int]:
    """Prostokat przyciety do kadru zrodla; None = caly kadr."""
    if rect is None:
        return 0, 0, src_w, src_h
    x, y, w, h = (int(v) for v in rect)
    if x >= src_w or y >= src_h:
        raise ValueError(f"Prostokat '{what}' {rect} lezy poza zrodlem {src_w}x{src_h}")
    x, y = max(x, 0), max(y, 0)
    w = min(w, src_w - x)
    h = min(h, src_h - y)
    if w < 2 or h < 2:
        raise ValueError(f"Prostokat '{what}' {rect} nie miesci sie w zrodle {src_w}x{src_h}")
    return x, y, w, h


def _cover(rect: tuple[int, int, int, int], full: bool, w: int, h: int) -> str:
    """Wycinek -> skala 'cover' -> srodkowy crop do w x h."""
    x, y, rw, rh = rect
    crop = "" if full else f"crop={rw}:{rh}:{x}:{y},"
    return f"{crop}scale={w}:{h}:force_original_aspect_ratio=increase:flags=bicubic,crop={w}:{h},setsar=1"


def build_filter(src_w: int, src_h: int, layout: Layout, ass_name: str | None,
                 out_w: int = 1080, out_h: int = 1920, fonts_dir: str | None = "fonts") -> str:
    """filter_complex dajacy `[v]`. `ass_name` i `fonts_dir` to sciezki WZGLEDNE wobec
    cwd ffmpeg (bez dwukropka dysku i backslashy, wiec bez escapowania)."""
    if src_w < 2 or src_h < 2:
        raise ValueError(f"Zly rozmiar zrodla: {src_w}x{src_h}")
    game = _rect(layout.gameplay, src_w, src_h, "gameplay")
    game_full = layout.gameplay is None
    chains: list[str] = []

    if layout.facecam:
        if not 0.1 <= layout.facecam_ratio <= 0.9:
            raise ValueError(f"facecam_ratio poza zakresem: {layout.facecam_ratio}")
        cam = _rect(layout.facecam, src_w, src_h, "facecam")
        top_h = _even(out_h * layout.facecam_ratio)
        bot_h = out_h - top_h
        chains.append(f"[0:v]fps={FPS},split=2[c0][g0]")
        chains.append(f"[c0]{_cover(cam, False, out_w, top_h)}[cam]")
        chains.append(f"[g0]{_cover(game, game_full, out_w, bot_h)}[game]")
        chains.append("[cam][game]vstack=inputs=2[base]")
    else:
        gx, gy, gw, gh = game
        fg_h = min(_even(out_w * ZOOM * gh / gw), out_h)
        fg_w = _even(fg_h * gw / gh)
        crop = "" if game_full else f"crop={gw}:{gh}:{gx}:{gy},"
        # Tlo liczone w 1/4 rozdzielczosci: rozmycie wychodzi mocniejsze i duzo tansze.
        bw, bh = _even(out_w / 4), _even(out_h / 4)
        chains.append(f"[0:v]fps={FPS},split=2[b0][f0]")
        chains.append(
            f"[b0]scale={bw}:{bh}:force_original_aspect_ratio=increase:flags=fast_bilinear,"
            f"crop={bw}:{bh},boxblur=8:2,colorchannelmixer=rr=0.5:gg=0.5:bb=0.5,"
            f"scale={out_w}:{out_h}:flags=bilinear,setsar=1[bg]"
        )
        chains.append(
            f"[f0]{crop}scale={fg_w}:{fg_h}:flags=bicubic,crop={min(fg_w, out_w)}:{fg_h},setsar=1[fg]"
        )
        chains.append("[bg][fg]overlay=(W-w)/2:(H-h)/2[base]")

    tail = ""
    if ass_name:
        if any(c in ass_name for c in ":\\'[],; "):
            raise ValueError(f"Nazwa pliku ASS musi byc prosta i wzgledna: {ass_name!r}")
        tail = f"ass={ass_name}"
        if fonts_dir:
            tail += f":fontsdir={fonts_dir}"
        tail += ","
    chains.append(f"[base]{tail}format=yuv420p[v]")
    return ";".join(chains)
