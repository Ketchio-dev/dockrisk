#!/usr/bin/env python3
"""Speak docs/demo/narration.md in the presenter's own voice.

The reference is his real recording (docs/demo/voice/take2.m4a); every block of the
script is then synthesized against it, so the film can be re-cut and re-narrated
without asking him back into a quiet room each time. Blocks are written one file
per beat and named for their timecode, which is what scripts/mix_video.sh lays
against the picture.

    uv run --with mlx-audio python scripts/tts_narration.py

Needs the reference prepared once:
    ffmpeg -i docs/demo/voice/take2.m4a -ss 0 -t 14 \
      -af "highpass=f=80,afftdn=nf=-28,loudnorm=I=-19:TP=-2:LRA=11,aresample=24000" \
      -ac 1 .demo-logs/tts/ref.wav
"""
from __future__ import annotations

import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
TTS = ROOT / ".demo-logs" / "tts"
REF = TTS / "ref.wav"
MODEL = "mlx-community/fish-audio-s2-pro"

# What he actually says in ref.wav — the intended words, not the ASR's reading of them.
REF_TEXT = (
    "A truck sitting at a loading dock is burning two clocks at once, and the industry only "
    "watches one of them. I'm Junsu, and this is DockRisk, a detention and hours-of-service "
    "exception desk for city dispatch in Southern Ontario."
)


def blocks() -> list[tuple[str, str]]:
    """(slug, text) per beat, read straight out of the script so the two never drift."""
    md = (ROOT / "docs" / "demo" / "narration.md").read_text(encoding="utf-8")
    out: list[tuple[str, str]] = []
    current: str | None = None
    said: list[str] = []
    for line in md.splitlines():
        # "### 0:24–0:35 · 격차" and "### [REF] 0:00–0:12" both start a beat; the
        # title after · is optional, and the first draft's regex required it, which
        # silently swallowed the opening block and glued three closing ones together.
        h = re.match(r"^###\s+(?:\[REF\]\s*)?(\d{1,2}:\d{2})\s*[–-]\s*\d{1,2}:\d{2}\s*(?:·\s*(.*))?$", line.strip())
        if h:
            if current and said:
                out.append((current, " ".join(said)))
            start = h.group(1).replace(":", "")
            title = (h.group(2) or "").strip()
            current, said = f"{start}-{_slug(title) if title else 'beat'}", []
            continue
        if line.startswith(">") and current:
            # "[pause]" is a direction to the reader, not a word. The synthesizer
            # would say it out loud; a sentence break makes it draw breath instead.
            t = re.sub(r"\s*\[pause\]\s*", " ... ", line.lstrip("> "))
            t = t.replace("**", "")           # markdown emphasis is for the reader, not the voice
            said.append(t.strip())
    if current and said:
        out.append((current, " ".join(said)))
    return out


def _slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower().strip()).strip("-") or "beat"


def main() -> int:
    if not REF.exists():
        print(f"missing reference: {REF} (see the docstring)", file=sys.stderr)
        return 1
    from mlx_audio.tts.generate import generate_audio

    bs = blocks()
    if not bs:
        print("no narration blocks parsed — did narration.md change shape?", file=sys.stderr)
        return 1

    print(f"{len(bs)} blocks -> {TTS}")
    for i, (slug, text) in enumerate(bs, 1):
        prefix = f"vo-{i:02d}-{slug}"
        words = len(text.split())
        print(f"  [{i:2}/{len(bs)}] {prefix}  ({words} words)")
        generate_audio(
            text=text,
            model=MODEL,
            ref_audio=str(REF),
            ref_text=REF_TEXT,
            file_prefix=str(TTS / prefix),
            audio_format="wav",
            join_audio=True,
            save=True,
            verbose=False,
            temperature=0.6,   # steadier than the 0.7 default; this is narration, not conversation
        )
    print("done")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
