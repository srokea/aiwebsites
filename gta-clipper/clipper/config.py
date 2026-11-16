"""Konfiguracja: .env + pliki YAML z config/."""
from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

import yaml
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
CONFIG_DIR = ROOT / "config"

load_dotenv(ROOT / ".env")


def env(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


def data_dir() -> Path:
    d = Path(env("CLIPPER_DATA_DIR", str(ROOT / "data")))
    d.mkdir(parents=True, exist_ok=True)
    return d


def subdir(name: str) -> Path:
    d = data_dir() / name
    d.mkdir(parents=True, exist_ok=True)
    return d


SIGNALS = ("chat", "viewer_clips")


@dataclass(slots=True)
class Layout:
    """Staly kadr per streamer. Wspolrzedne w pikselach zrodla (x, y, w, h).
    facecam=None -> sam gameplay, wysrodkowany crop na rozmytym tle."""
    facecam: tuple[int, int, int, int] | None = None
    gameplay: tuple[int, int, int, int] | None = None
    facecam_ratio: float = 0.35      # jaka czesc wysokosci 9:16 zajmuje kamerka


@dataclass(slots=True)
class Streamer:
    name: str                        # login na Twitchu, male litery
    platform: str = "twitch"
    preroll: float = 20.0            # ile sekund przed spike'iem zaczac
    postroll: float = 45.0           # ile sekund po spike'u skonczyc
    quality: str = "720p,720p60,best"
    lang: str = "en"
    layout: Layout = field(default_factory=Layout)
    campaign: str | None = None      # nazwa profilu z config/campaigns/
    tags: list[str] = field(default_factory=list)   # stale hashtagi streamera (bez #), opcjonalne
    rp: bool = False                 # streamer roleplayowy -> hashtag gtarp
    signals: list[str] = field(default_factory=lambda: list(SIGNALS))   # zrodla kandydatow w live


@lru_cache(maxsize=1)
def streamers() -> dict[str, Streamer]:
    path = CONFIG_DIR / "streamers.yaml"
    raw = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    out: dict[str, Streamer] = {}
    for name, cfg in (raw.get("streamers") or {}).items():
        cfg = dict(cfg or {})
        lay = cfg.pop("layout", None) or {}
        layout = Layout(
            facecam=tuple(lay["facecam"]) if lay.get("facecam") else None,
            gameplay=tuple(lay["gameplay"]) if lay.get("gameplay") else None,
            facecam_ratio=float(lay.get("facecam_ratio", 0.35)),
        )
        cfg["tags"] = [str(t) for t in (cfg.get("tags") or [])]
        cfg["rp"] = bool(cfg.get("rp", False))
        cfg["signals"] = [str(x) for x in (cfg.get("signals") or SIGNALS)]
        bad = [x for x in cfg["signals"] if x not in SIGNALS]
        if bad:
            raise ValueError(f"streamers.yaml: {name}: nieznane signals {bad}, dozwolone {list(SIGNALS)}")
        out[name.lower()] = Streamer(name=name.lower(), layout=layout, **cfg)
    return out


def streamer(name: str) -> Streamer:
    """Zwraca profil streamera albo domyslny, gdy nie ma go w YAML."""
    return streamers().get(name.lower()) or Streamer(name=name.lower())


def setup_logging(level: str = "INFO") -> None:
    log_file = subdir("logs") / "clipper.log"
    logging.basicConfig(
        level=level,
        format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
        handlers=[logging.StreamHandler(), logging.FileHandler(log_file, encoding="utf-8")],
        force=True,
    )
