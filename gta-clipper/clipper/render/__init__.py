"""Render: transkrypcja -> wybor okna -> napisy ASS -> pionowy klip 9:16 (jedno wywolanie ffmpeg)."""
from .render import render_clip
from .transcribe import transcribe

__all__ = ["render_clip", "transcribe"]
