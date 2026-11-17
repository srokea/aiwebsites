"""Transkrypcja faster-whisper z czasami slow. Model ladowany leniwie, raz na proces."""
from __future__ import annotations

import gc
import importlib.util
import logging
import os
import time
from pathlib import Path

from clipper.config import env
from clipper.models import Word

log = logging.getLogger(__name__)

_model = None
_model_key: tuple[str, str, str] | None = None
_dll_ready = False
_cuda_broken = False          # po nieudanej probie CUDA nie probujemy w kolko

CPU_FALLBACK = ("small", "cpu", "int8")


def _add_cuda_dll_dirs() -> None:
    """Windows: ctranslate2 potrzebuje cuDNN/cuBLAS. Sa w kole torcha (torch/lib)
    albo w paczkach nvidia-*; dopisujemy te katalogi do sciezki szukania DLL."""
    global _dll_ready
    if _dll_ready or os.name != "nt":
        return
    _dll_ready = True
    dirs: list[Path] = []
    spec = importlib.util.find_spec("torch")
    if spec and spec.origin:
        dirs.append(Path(spec.origin).parent / "lib")
    nv = importlib.util.find_spec("nvidia")
    if nv and nv.submodule_search_locations:
        for base in nv.submodule_search_locations:
            dirs.extend(Path(base).glob("*/bin"))
    for d in dirs:
        if d.is_dir():
            os.add_dll_directory(str(d))
            os.environ["PATH"] = str(d) + os.pathsep + os.environ.get("PATH", "")
            log.debug("Dodano katalog DLL: %s", d)


def _wanted() -> tuple[str, str, str]:
    if _cuda_broken:
        return CPU_FALLBACK
    return (
        env("WHISPER_MODEL", "large-v3-turbo"),
        env("WHISPER_DEVICE", "cuda"),
        env("WHISPER_COMPUTE", "float16"),
    )


def _load(key: tuple[str, str, str]):
    global _model, _model_key
    if _model is not None and _model_key == key:
        return _model
    unload()
    from faster_whisper import WhisperModel

    name, device, compute = key
    if device == "cuda":
        _add_cuda_dll_dirs()
    t = time.perf_counter()
    _model = WhisperModel(name, device=device, compute_type=compute)
    _model_key = key
    log.info("Whisper zaladowany: model=%s device=%s compute=%s (%.1f s)",
             name, device, compute, time.perf_counter() - t)
    return _model


def unload() -> None:
    """Zwalnia model (i VRAM), zeby LLM mial miejsce na karcie."""
    global _model, _model_key
    if _model is None:
        return
    _model = None
    _model_key = None
    gc.collect()
    log.info("Whisper zwolniony z pamieci")


def current_backend() -> tuple[str, str, str] | None:
    """(model, device, compute) aktualnie zaladowanego modelu albo None."""
    return _model_key


def _run(key: tuple[str, str, str], path: Path, lang: str | None) -> list[Word]:
    model = _load(key)
    segments, _info = model.transcribe(
        str(path), language=lang, word_timestamps=True,
        # bez VAD: przy glosnej grze wycinal ~90% mowy streamera (test 17.11, Lacy);
        # zmyslenia w ciszy odsiewa no_speech_prob nizej
        vad_filter=False, condition_on_previous_text=False,
    )
    words: list[Word] = []
    for seg in segments:            # generator: wlasciwa praca dzieje sie tutaj
        if seg.no_speech_prob > 0.6 and seg.avg_logprob < -0.8:
            continue                # typowe zmyslenia Whispera w ciszy ("You", "Thank you")
        for w in seg.words or []:
            text = (w.word or "").strip()
            if text:
                words.append(Word(start=float(w.start), end=float(w.end), text=text))
    return words


def transcribe(path: Path, lang: str | None = "en") -> list[Word]:
    """Zwraca slowa z czasami (sekundy od poczatku pliku)."""
    global _cuda_broken
    path = Path(path)
    if not path.is_file():
        raise FileNotFoundError(f"Brak pliku do transkrypcji: {path}")
    key = _wanted()
    t = time.perf_counter()
    try:
        words = _run(key, path, lang)
    except Exception as exc:
        if key[1] != "cuda":
            raise
        # Blad CUDA wychodzi czasem dopiero przy pierwszym dekodowaniu (brak DLL cuDNN/cuBLAS).
        log.warning("Whisper na CUDA nie dziala (%s: %s); przechodze na CPU int8, model '%s'",
                    type(exc).__name__, exc, CPU_FALLBACK[0])
        _cuda_broken = True
        unload()
        words = _run(CPU_FALLBACK, path, lang)
    log.info("Transkrypcja %s: %d slow w %.1f s (%s)",
             path.name, len(words), time.perf_counter() - t, "/".join(_model_key or key))
    return words


def words_text(words: list[Word], t0: float, t1: float) -> str:
    """Czysty tekst slow, ktore zaczynaja sie w przedziale [t0, t1)."""
    return " ".join(w.text for w in words if t0 <= w.start < t1)
