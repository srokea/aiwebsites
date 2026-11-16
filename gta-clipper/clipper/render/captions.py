"""Napisy ASS: jedno slowo naraz, duze, zolte, z czarnym obrysem i szybkim pop-in."""
from __future__ import annotations

import logging
from functools import lru_cache
from pathlib import Path

from clipper.config import ROOT, Layout
from clipper.models import Word

log = logging.getLogger(__name__)

FONTS_DIR = ROOT / "assets" / "fonts"
CAPTION_FONT_FILE = FONTS_DIR / "DrugaCzcionka.ttf"     # ta sama czcionka co napisy w starym generatorze
DEFAULT_FONT = "NeoGramExtendedW00-Black"                # nazwa rodziny z tego pliku

MAX_GAP = 0.6          # slowo wisi najwyzej tyle po swoim koncu
GROUP_PAUSE = 0.4      # przerwa, ktora zawsze zamyka grupe slow
POP_MS = 80
POP_FROM = 70          # procent skali na starcie animacji
OUTLINE = 6
SHADOW = 3
SIDE_MARGIN = 50       # minimalny odstep napisu od krawedzi kadru
DISCLOSURE_STYLE = "Disclosure"
TITLE_STYLE = "Title"
TITLE_SIZE = 78
TITLE_MAX_LINES = 2
TITLE_Y_BLUR = 410         # srodek tytulu przy rozmytym tle (nad pierwszym planem)
TITLE_BELOW_SEAM = 40      # tytul przy kamerce: gorna krawedz tyle px pod szwem
OVERLAY_STYLE = "Overlay"
OVERLAY_SIZE = 44
OVERLAY_Y = 1780           # dol napisu (an=2); pod napisami slow (y~1200) i daleko od tytulu u gory
DISCLOSURE_GAP = 20        # minimalny odstep tytulu od oznaczenia reklamy


@lru_cache(maxsize=8)
def font_family(path: Path = CAPTION_FONT_FILE) -> str:
    """Prawdziwa nazwa rodziny z pliku TTF (fontTools, a jak go nie ma to Pillow)."""
    try:
        from fontTools.ttLib import TTFont
    except ImportError:
        from PIL import ImageFont
        return ImageFont.truetype(str(path), 40).getname()[0]
    font = TTFont(str(path), lazy=True)
    try:
        name = font["name"].getBestFamilyName()
    finally:
        font.close()
    if not name:
        raise ValueError(f"Brak nazwy rodziny w foncie {path}")
    return name


@lru_cache(maxsize=8)
def _font_file_for(family: str) -> Path | None:
    for p in sorted(FONTS_DIR.glob("*.ttf")):
        if font_family(p) == family:
            return p
    return None


@lru_cache(maxsize=4096)
def _text_width(text: str, family: str, size: int) -> float | None:
    """Szerokosc tekstu w px. Gorne oszacowanie: libass rysuje litery nieco mniejsze
    niz Pillow przy tym samym rozmiarze. None, gdy nie mamy pliku tej czcionki."""
    path = _font_file_for(family)
    if path is None:
        return None
    from PIL import ImageFont
    return float(ImageFont.truetype(str(path), size).getlength(text))


@lru_cache(maxsize=4096)
def _glyph_ok(char: str, family: str) -> bool:
    """Czy czcionka ma glif dla znaku (brakujacy renderuje sie jak .notdef)."""
    path = _font_file_for(family)
    if path is None:
        return True
    from PIL import ImageFont
    font = ImageFont.truetype(str(path), 40)

    def sig(c: str):
        mask = font.getmask(c)
        return mask.size, bytes(mask)
    return sig(char) != sig("􏿿")


def burnable_text(text: str, family: str = DEFAULT_FONT) -> str:
    """Tekst do wypalenia: bez emoji i znakow, ktorych czcionka nie umie narysowac.
    Zwykle litery (takze z ogonkami) zostaja nawet bez glifu, zeby nie psuc slow."""
    out = []
    for ch in text:
        if ch in "️‍":
            continue
        if ord(ch) >= 0x2190 and not _glyph_ok(ch, family):
            continue
        out.append(ch)
    return " ".join("".join(out).split())


def _line_height(family: str, size: int) -> float:
    path = _font_file_for(family)
    if path is None:
        return size * 1.2
    from PIL import ImageFont
    asc, desc = ImageFont.truetype(str(path), size).getmetrics()
    return float(asc + desc)


def wrap_title(text: str, family: str, size: int, max_w: float,
               max_lines: int = TITLE_MAX_LINES) -> tuple[list[str], int]:
    """Lamie tytul po szerokosci na najwyzej `max_lines` linii. Gdy sie nie miesci,
    zmniejsza czcionke. Zwraca (linie, rozmiar)."""
    words = text.split()
    if not words:
        return [], size

    def width(t: str, sz: int) -> float:
        w = _text_width(t, family, sz)
        return w if w is not None else len(t) * sz * 0.6

    cur = size
    while True:
        lines: list[str] = []
        for word in words:
            if lines and width(lines[-1] + " " + word, cur) <= max_w:
                lines[-1] += " " + word
            else:
                lines.append(word)
        if len(lines) <= max_lines and all(width(ln, cur) <= max_w for ln in lines):
            return lines, cur
        if cur <= 30:
            return lines[:max_lines], cur        # awaryjnie, nie powinno sie zdarzyc przy 40 znakach
        cur -= 4


def title_anchor(layout: Layout, height: int = 1920) -> tuple[int, int]:
    """(alignment ASS, y) tytulu: rozmyte tlo -> srodek na y=480; kamerka -> tuz pod szwem."""
    if layout.facecam:
        seam = int(round(height * layout.facecam_ratio / 2)) * 2
        return 8, seam + TITLE_BELOW_SEAM
    return 5, TITLE_Y_BLUR


def _disclosure_bottom(height: int, size: int) -> float:
    disc_size = max(36, round(size * 0.4))
    return round(height * 0.09) + disc_size * 1.3 + 3


def title_events(text: str, length: float, *, width: int = 1080, height: int = 1920,
                 font: str = DEFAULT_FONT, size: int = TITLE_SIZE, an: int = 5, y: int = TITLE_Y_BLUR,
                 avoid_top: float | None = None, caption_size: int = 110) -> tuple[list[str], tuple[float, float]]:
    """Zdarzenie ASS z tytulem na caly klip. `avoid_top`: gdy jest oznaczenie reklamy,
    tytul nie wchodzi na jego pas. Zwraca (zdarzenia, (gora, dol) tytulu w px)."""
    text = burnable_text(text, font)
    if not text or length <= 0:
        return [], (0.0, 0.0)
    max_w = width - 2 * SIDE_MARGIN - 2 * OUTLINE
    lines, fs = wrap_title(text, font, size, max_w)
    block = len(lines) * _line_height(font, fs)
    top = y if an == 8 else y - block / 2
    if avoid_top is not None and top < avoid_top:
        top = avoid_top
        y = round(top if an == 8 else top + block / 2)
    body = "\\N".join(ass_escape(ln) for ln in lines)
    tags = f"\\an{an}\\pos({width // 2},{y})" + (f"\\fs{fs}" if fs != size else "")
    ev = f"Dialogue: 2,{ass_time(0)},{ass_time(length)},{TITLE_STYLE},,0,0,0,,{{{tags}}}{body}"
    return [ev], (top, top + block)


def ass_escape(text: str) -> str:
    """Znaki specjalne ASS: klamry otwieraja tagi, backslash zaczyna \\N, \\h itd."""
    text = text.replace("\\", "/").replace("\r", " ").replace("\n", " ")
    return text.replace("{", "(").replace("}", ")")


def ass_time(t: float) -> str:
    cs = max(0, int(round(t * 100)))
    h, rem = divmod(cs, 360000)
    m, rem = divmod(rem, 6000)
    s, cs = divmod(rem, 100)
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"


def disclosure_events(text: str, duration: float = 3.0) -> list[str]:
    """Maly napis u gory kadru przez pierwsze sekundy (oznaczenie reklamy, np. "#ad")."""
    text = ass_escape(text.strip())
    if not text or duration <= 0:
        return []
    return [f"Dialogue: 1,{ass_time(0)},{ass_time(duration)},{DISCLOSURE_STYLE},,0,0,0,,{text}"]


def overlay_events(text: str, length: float, *, width: int = 1080, y: int = OVERLAY_Y) -> list[str]:
    """Staly, maly napis (np. adres kanalu) na caly klip, srodek-dol kadru."""
    text = burnable_text(ass_escape(text.strip()))
    if not text or length <= 0:
        return []
    return [f"Dialogue: 1,{ass_time(0)},{ass_time(length)},{OVERLAY_STYLE},,0,0,0,,"
            f"{{\\an2\\pos({width // 2},{y})}}{text}"]


def _groups(words: list[Word], max_words: int) -> list[list[Word]]:
    out: list[list[Word]] = []
    for w in words:
        if out and len(out[-1]) < max_words and w.start - out[-1][-1].end < GROUP_PAUSE:
            out[-1].append(w)
        else:
            out.append([w])
    return out


def build_ass(words: list[Word], out: Path, *, t0: float, t1: float, width: int = 1080,
              height: int = 1920, y: int = 1200, font: str = DEFAULT_FONT, size: int = 110,
              max_words: int = 1, disclosure: str | None = None, title: str | None = None,
              title_an: int = 5, title_y: int = TITLE_Y_BLUR,
              overlay_text: str | None = None) -> Path:
    """Zapisuje plik ASS dla okna [t0, t1]; czasy przesuniete tak, ze t0 = 0.
    `title`: bialy tytul od pierwszej klatki (bez wielkich liter), pozycja z `title_anchor`."""
    if t1 <= t0:
        raise ValueError(f"Puste okno napisow: t0={t0} t1={t1}")
    length = t1 - t0
    inside = sorted((w for w in words if t0 <= w.start < t1 and w.text.strip()),
                    key=lambda w: w.start)
    groups = _groups(inside, max(1, int(max_words)))
    disc_size = max(36, round(size * 0.4))

    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {width}
PlayResY: {height}
WrapStyle: 2
ScaledBorderAndShadow: yes
YCbCr Matrix: None

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Word,{font},{size},&H0000FFFF,&H0000FFFF,&H00000000,&H78000000,0,0,0,0,100,100,0,0,1,{OUTLINE},{SHADOW},5,0,0,0,1
Style: {DISCLOSURE_STYLE},{font},{disc_size},&H00FFFFFF,&H00FFFFFF,&H00000000,&H78000000,0,0,0,0,100,100,0,0,1,3,1,8,40,40,{round(height * 0.09)},1
Style: {OVERLAY_STYLE},{font},{OVERLAY_SIZE},&H00FFFFFF,&H00FFFFFF,&H00000000,&H78000000,0,0,0,0,100,100,0,0,1,3,1,2,40,40,0,1
Style: {TITLE_STYLE},{font},{TITLE_SIZE},&H00FFFFFF,&H00FFFFFF,&H00000000,&H78000000,0,0,0,0,100,100,0,0,1,{OUTLINE},{SHADOW},8,{SIDE_MARGIN},{SIDE_MARGIN},0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    lines: list[str] = []
    max_w = width - 2 * SIDE_MARGIN - 2 * OUTLINE
    for i, grp in enumerate(groups):
        start = grp[0].start - t0
        end = grp[-1].end - t0 + MAX_GAP
        if i + 1 < len(groups):
            end = min(end, groups[i + 1][0].start - t0)
        end = min(end, length)
        if end - start < 0.05:
            end = start + 0.05
        # Kropki i przecinki na koncu wygladaja zle przy jednym slowie; "?" i "!" zostaja.
        text = " ".join(w.text.strip() for w in grp).upper().rstrip(".,;:") or grp[0].text.strip()
        tags = f"\\an5\\pos({width // 2},{y})"
        w_px = _text_width(text, font, size)
        if w_px and w_px > max_w:
            tags += f"\\fs{max(20, int(size * max_w / w_px))}"   # dlugie slowo: mniejsza czcionka
        tags += f"\\fscx{POP_FROM}\\fscy{POP_FROM}\\t(0,{POP_MS},\\fscx100\\fscy100)"
        lines.append(f"Dialogue: 0,{ass_time(start)},{ass_time(end)},Word,,0,0,0,,{{{tags}}}{ass_escape(text)}")
    if disclosure:
        lines.extend(disclosure_events(disclosure, min(3.0, length)))
    if overlay_text:
        lines.extend(overlay_events(overlay_text, length, width=width))
    if title:
        avoid = _disclosure_bottom(height, size) + DISCLOSURE_GAP if disclosure else None
        ev, _ = title_events(title, length, width=width, height=height, font=font, an=title_an,
                             y=title_y, avoid_top=avoid, caption_size=size)
        lines.extend(ev)

    out = Path(out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(header + "\n".join(lines) + "\n", encoding="utf-8")
    log.debug("ASS zapisany: %s (%d slow, %d zdarzen)", out, len(inside), len(lines))
    return out
