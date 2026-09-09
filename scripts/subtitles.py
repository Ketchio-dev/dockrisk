#!/usr/bin/env python3
"""Cut subtitles for the submission film.

Timing is measured, not guessed: Whisper reads each synthesized narration track
and returns segment boundaries, which are then offset by where that beat's clip
starts in the finished cut. The WORDS come from docs/demo/narration.md, never from
the transcriber — the script is what was said, and an ASR reading of it would only
introduce errors into text we already have exactly.

Writes docs/demo/submission.srt.

    uv run --with mlx-audio --with mlx-whisper python scripts/subtitles.py
"""
from __future__ import annotations

import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
TTS = ROOT / ".demo-logs" / "tts"
VIDEO = ROOT / ".demo-logs" / "video"
SRT = ROOT / "docs" / "demo" / "submission.srt"
MODEL = "mlx-community/whisper-large-v3-mlx"
MAX_CHARS = 62          # one line a viewer can read in a glance


def dur(path: pathlib.Path) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
        capture_output=True, text=True, check=True)
    return float(out.stdout.strip())


def ts(t: float) -> str:
    if t < 0:
        t = 0.0
    h, rem = divmod(t, 3600)
    m, s = divmod(rem, 60)
    return f"{int(h):02}:{int(m):02}:{int(s):02},{int((s % 1) * 1000):03}"


def sentences(text: str) -> list[str]:
    """Split a beat into cue-sized pieces: sentence first, then on a comma if still long."""
    out: list[str] = []
    # tts_narration turns "[pause]" into " ... " so the synthesizer breathes instead of
    # reading it. That ellipsis must not become a caption of its own.
    text = re.sub(r"\s*\.\.\.\s*", " ", text)
    for part in re.split(r"(?<=[.!?])\s+", text.strip()):
        part = part.strip()
        if not part or not re.search(r"[A-Za-z0-9]", part):
            continue
        if len(part) <= MAX_CHARS:
            out.append(part)
            continue
        # Break on punctuation first (comma, em dash, semicolon, colon); a sentence
        # with none of those still has to fit, so fall through to word boundaries.
        pieces = re.split(r"(?<=[,;:])\s+|\s+—\s+", part)
        chunk = ""
        for piece in pieces:
            while len(piece) > MAX_CHARS:
                cut = piece.rfind(" ", 0, MAX_CHARS)
                if cut <= 0:
                    break
                if chunk:
                    out.append(chunk.strip())
                    chunk = ""
                out.append(piece[:cut].strip())
                piece = piece[cut + 1:]
            if chunk and len(chunk) + len(piece) + 1 > MAX_CHARS:
                out.append(chunk.strip())
                chunk = piece
            else:
                chunk = f"{chunk} {piece}".strip()
        if chunk:
            out.append(chunk.strip())
    return out


def main() -> int:
    sys.path.insert(0, str(ROOT / "scripts"))
    from tts_narration import blocks
    import mlx_whisper

    order = (VIDEO / "order.txt").read_text().split()
    bs = blocks()
    if len(order) != len(bs):
        print(f"!! {len(order)} clips vs {len(bs)} narration blocks — re-record first", file=sys.stderr)
        return 1

    cues: list[tuple[float, float, str]] = []
    clock = 0.0
    for i, (name, (slug, text)) in enumerate(zip(order, bs), 1):
        clip_len = dur(VIDEO / f"{name}.mp4")
        vo = sorted(TTS.glob(f"vo-{i:02d}-*.wav"))
        lines = sentences(text)
        if vo and lines:
            # Whisper's segment boundaries tell us where speech actually falls inside
            # the beat; the text laid over them is the script's, not the transcript's.
            segs = mlx_whisper.transcribe(str(vo[0]), path_or_hf_repo=MODEL, language="en")["segments"]
            spans = [(s["start"], s["end"]) for s in segs] or [(0.0, dur(vo[0]))]
            # Distribute our cue lines across the measured spans proportionally.
            total = sum(len(x) for x in lines) or 1
            speech_start, speech_end = spans[0][0], spans[-1][1]
            span = max(speech_end - speech_start, 0.5)
            at = speech_start
            for line in lines:
                share = span * len(line) / total
                cues.append((clock + at, clock + min(at + share, clip_len), line))
                at += share
        clock += clip_len

    with SRT.open("w", encoding="utf-8") as f:
        for n, (a, b, line) in enumerate(cues, 1):
            f.write(f"{n}\n{ts(a)} --> {ts(max(b, a + 0.6))}\n{line}\n\n")

    print(f"{len(cues)} cues -> {SRT}")
    print(f"last cue ends at {ts(cues[-1][1])} · film is {ts(clock)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
