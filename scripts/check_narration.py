#!/usr/bin/env python3
"""Read the synthesized narration back and score it against the script.

Apple's on-device transcriber was the first thing to hand and it put words in the
clone's mouth it never said — "watch the verdict change" came back as "watch the
body change", which reads as a broken clone and is not one. Whisper Large v3 gets
it right, so verification runs here instead, and the harness compares against the
script the audio was generated from rather than against an ear.

    uv run --with mlx-audio --with mlx-whisper python scripts/check_narration.py
"""
from __future__ import annotations

import pathlib
import re
import sys
import warnings

warnings.filterwarnings("ignore")

ROOT = pathlib.Path(__file__).resolve().parent.parent
TTS = ROOT / ".demo-logs" / "tts"
MODEL = "mlx-community/whisper-large-v3-mlx"

# Pairs a transcriber cannot separate without meaning. Not defects.
HOMOPHONES = [
    {"wait", "weight"}, {"ate", "aid", "eight"}, {"bill", "build"},
    {"packet", "package"}, {"their", "there"}, {"to", "two", "too"},
    {"its", "it's"}, {"hours", "ours"},
]

NUMBERS = {
    "thirty-seven": "37", "thirty": "30", "seven": "7", "fifteen": "15",
    "fourteen": "14", "forty-nine": "49", "fifty-five": "55", "one": "1",
    "two": "2", "three": "3", "four": "4", "five": "5", "six": "6",
    "eight": "8", "nine": "9", "ten": "10", "eleven": "11", "twelve": "12",
    "hundred": "100", "thousand": "1000", "fifty-six": "56", "twenty": "20",
    "eighteen": "18", "seventy-five": "75", "one-twenty": "120",
}


def words(s: str) -> list[str]:
    s = s.lower()
    s = re.sub(r"[^a-z0-9'\- ]+", " ", s)
    out = []
    for w in s.split():
        out.append(NUMBERS.get(w, w))
    return out


def same(a: str, b: str) -> bool:
    if a == b:
        return True
    for grp in HOMOPHONES:
        if a in grp and b in grp:
            return True
    return False


def diff(ref: list[str], hyp: list[str]) -> list[tuple[str, str]]:
    """Levenshtein alignment, returning only the substitutions that matter."""
    n, m = len(ref), len(hyp)
    d = [[0] * (m + 1) for _ in range(n + 1)]
    for i in range(n + 1):
        d[i][0] = i
    for j in range(m + 1):
        d[0][j] = j
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            cost = 0 if same(ref[i - 1], hyp[j - 1]) else 1
            d[i][j] = min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
    i, j, out = n, m, []
    while i > 0 and j > 0:
        if d[i][j] == d[i - 1][j - 1] + (0 if same(ref[i - 1], hyp[j - 1]) else 1):
            if not same(ref[i - 1], hyp[j - 1]):
                out.append((ref[i - 1], hyp[j - 1]))
            i, j = i - 1, j - 1
        elif d[i][j] == d[i - 1][j] + 1:
            out.append((ref[i - 1], "—")); i -= 1
        else:
            out.append(("—", hyp[j - 1])); j -= 1
    while i > 0:
        out.append((ref[i - 1], "—")); i -= 1
    while j > 0:
        out.append(("—", hyp[j - 1])); j -= 1
    return list(reversed(out))


def main() -> int:
    sys.path.insert(0, str(ROOT / "scripts"))
    from tts_narration import blocks
    import mlx_whisper

    bs = blocks()
    bad = 0
    for i, (slug, text) in enumerate(bs, 1):
        f = TTS / f"vo-{i:02d}-{slug}.wav"
        if not f.exists():
            print(f"[{i:2}] MISSING {f.name}")
            bad += 1
            continue
        hyp = mlx_whisper.transcribe(str(f), path_or_hf_repo=MODEL, language="en")["text"]
        r, h = words(text), words(hyp)
        subs = [(a, b) for a, b in diff(r, h) if a != "—" and b != "—"]
        drops = [a for a, b in diff(r, h) if b == "—"]
        wer = (len(subs) + len(drops)) / max(len(r), 1)
        flag = "ok " if wer < 0.03 else "!! "
        if wer >= 0.03:
            bad += 1
        print(f"{flag}[{i:2}] {f.name:28} {len(r):3}w  WER {wer*100:5.1f}%")
        for a, b in subs[:6]:
            print(f"        said '{a}' -> heard '{b}'")
        if drops:
            print(f"        dropped: {' '.join(drops[:8])}")
    print(f"\n{len(bs) - bad}/{len(bs)} blocks clean")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
