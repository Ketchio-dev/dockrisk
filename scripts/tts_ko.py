#!/usr/bin/env python3
"""Speak docs/demo/explainer/narration-ko.md with the macOS Korean voice.

The submission film clones the presenter's own voice (scripts/tts_narration.py), because a
pitch should sound like a person. This one is an orientation video he is making for himself,
so a clear neutral narrator beats a cross-lingual clone of a fourteen-second English sample.
Yuna ships with macOS and reads Korean numerals correctly, which matters here — the script is
full of them.

    python3 scripts/tts_ko.py

Writes one wav per beat to .demo-logs/tts-ko/, named for its beat number, which is what
scripts/record_explainer.sh reads to decide how long each shot runs.
"""
from __future__ import annotations

import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SCRIPT = ROOT / "docs" / "demo" / "explainer" / "narration-ko.md"
OUT = ROOT / ".demo-logs" / "tts-ko"
VOICE = "Yuna"
RATE = 175          # words per minute; 180 was a shade brisk for a screen you are reading along with


def beats() -> list[tuple[str, str, str]]:
    """(number, slug, spoken text) per beat, read straight out of the script so the two never drift."""
    out: list[tuple[str, str, str]] = []
    num = slug = None
    said: list[str] = []
    for line in SCRIPT.read_text(encoding="utf-8").splitlines():
        h = re.match(r"^###\s+(\d{2})\s*·\s*(.+?)\s*$", line.strip())
        if h:
            if num and said:
                out.append((num, slug, " ".join(said)))
            num, slug, said = h.group(1), h.group(2), []
            continue
        if line.startswith(">") and num:
            t = line.lstrip("> ").replace("**", "")     # emphasis is for the reader, not the voice
            if t.strip():
                said.append(t.strip())
    if num and said:
        out.append((num, slug, " ".join(said)))
    return out


def slugify(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-") or "beat"


def main() -> int:
    if not SCRIPT.exists():
        print(f"no script at {SCRIPT}", file=sys.stderr)
        return 1
    OUT.mkdir(parents=True, exist_ok=True)
    for f in OUT.glob("ko-*.wav"):
        f.unlink()

    total = 0.0
    for num, slug, text in beats():
        name = f"ko-{num}-{slugify(slug)}"
        aiff, wav = OUT / f"{name}.aiff", OUT / f"{name}.wav"
        subprocess.run(["say", "-v", VOICE, "-r", str(RATE), "-o", str(aiff), text], check=True)
        # 48 kHz stereo from the start, so the mix never has to renegotiate the stream.
        subprocess.run(["ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-i", str(aiff),
                        "-af", "aresample=48000,loudnorm=I=-16:TP=-1.5:LRA=11", "-ac", "2", str(wav)], check=True)
        aiff.unlink()
        d = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                                  "-of", "csv=p=0", str(wav)], capture_output=True, text=True).stdout.strip())
        total += d
        print(f"  {num}  {d:5.1f}s  {slug}   ({len(text)} chars)")

    print(f"\n{len(beats())} beats · {total:.0f}s total ({int(total // 60)}m {int(total % 60):02d}s) · {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
