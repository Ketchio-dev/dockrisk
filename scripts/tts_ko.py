#!/usr/bin/env python3
"""Speak docs/demo/explainer/narration-ko.md.

Two engines, because the first cut sounded like a kiosk:

  --engine say    macOS built-in. Instant, no model, but `say` emits 22 kHz compact voices
                  and it is audible. Nine Korean voices are installed; the newer six are a
                  different synthesizer from Yuna and read slower at the same nominal rate.
                  Names must be locale-qualified ("Eddy (Korean (South Korea))") or `say`
                  silently picks the English voice of the same name and writes a 0-second file.

  --engine fish   mlx-audio running fish-audio-s2-pro against a reference recording, the same
                  model the submission film uses. 44.1 kHz, and it speaks in whoever the
                  reference is. A Korean reference is worth thirty seconds of the presenter's
                  time: cloning Korean off an English sample carries the English mouth into it.

    python3 scripts/tts_ko.py                                   # macOS Yuna
    python3 scripts/tts_ko.py --engine say --voice "Reed (Korean (South Korea))"
    python3 scripts/tts_ko.py --engine fish --ref docs/demo/voice/ko-ref.m4a \
        --ref-text "$(cat docs/demo/voice/ko-ref.txt)"

Writes one wav per beat to .demo-logs/tts-ko/, named for its beat number, which is what
scripts/record_explainer.sh reads to decide how long each shot runs. Re-record the film after
changing the voice: the shots are cut to the length of the sentence played over them.
"""
from __future__ import annotations

import argparse
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SCRIPT = ROOT / "docs" / "demo" / "explainer" / "narration-ko.md"
OUT = ROOT / ".demo-logs" / "tts-ko"
FISH_MODEL = "mlx-community/fish-audio-s2-pro"


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


def norm(src: pathlib.Path, dst: pathlib.Path) -> None:
    """48 kHz stereo at a broadcast-ish loudness, so the mix never renegotiates the stream."""
    subprocess.run(["ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-i", str(src),
                    "-af", "aresample=48000,loudnorm=I=-16:TP=-1.5:LRA=11", "-ac", "2", str(dst)], check=True)


def seconds(p: pathlib.Path) -> float:
    return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                                 "-of", "csv=p=0", str(p)], capture_output=True, text=True).stdout.strip())


def say_one(text: str, out_wav: pathlib.Path, voice: str, rate: int) -> None:
    aiff = out_wav.with_suffix(".aiff")
    subprocess.run(["say", "-v", voice, "-r", str(rate), "-o", str(aiff), text], check=True)
    if not aiff.exists() or aiff.stat().st_size < 2000:
        raise SystemExit(f"`say -v {voice!r}` produced nothing. Korean voices other than Yuna need the "
                         f"locale in the name, e.g. \"Reed (Korean (South Korea))\" — run `say -v '?' | grep ko_KR`.")
    norm(aiff, out_wav)
    aiff.unlink()


def fish_one(text: str, out_wav: pathlib.Path, ref: pathlib.Path, ref_text: str, temperature: float) -> None:
    from mlx_audio.tts.generate import generate_audio
    stem = out_wav.with_suffix("")
    generate_audio(text=text, model=FISH_MODEL, ref_audio=str(ref), ref_text=ref_text,
                   file_prefix=str(stem), audio_format="wav", join_audio=True, save=True,
                   verbose=False, temperature=temperature)
    raw = stem.with_suffix(".wav")
    if not raw.exists():
        raise SystemExit(f"fish-audio wrote nothing for {out_wav.name}")
    tmp = stem.with_name(stem.name + "-raw.wav")
    raw.rename(tmp)
    norm(tmp, out_wav)
    tmp.unlink()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--engine", choices=("say", "fish"), default="say")
    ap.add_argument("--voice", default="Yuna", help='macOS voice; non-Yuna Korean voices need the locale in the name')
    ap.add_argument("--rate", type=int, default=175, help="words per minute (say only)")
    ap.add_argument("--ref", type=pathlib.Path, help="reference recording (fish only)")
    ap.add_argument("--ref-text", default="", help="exactly what the reference says (fish only)")
    ap.add_argument("--temperature", type=float, default=0.6, help="steadier than the 0.7 default; this is narration")
    ap.add_argument("--only", help="regenerate just these beats, e.g. 05 or 05,09")
    a = ap.parse_args()

    if not SCRIPT.exists():
        print(f"no script at {SCRIPT}", file=sys.stderr)
        return 1
    if a.engine == "fish":
        if not a.ref or not a.ref.exists():
            print("--engine fish needs --ref pointing at a reference recording", file=sys.stderr)
            return 1
        if not a.ref_text.strip():
            print("--engine fish needs --ref-text: what the reference actually says, word for word", file=sys.stderr)
            return 1

    OUT.mkdir(parents=True, exist_ok=True)
    wanted = {s.strip().zfill(2) for s in a.only.split(",")} if a.only else None
    if not wanted:
        for f in OUT.glob("ko-*.wav"):
            f.unlink()

    total = 0.0
    bs = beats()
    for num, slug, text in bs:
        if wanted and num not in wanted:
            f = OUT / f"ko-{num}-beat.wav"
            if f.exists():
                total += seconds(f)
            continue
        wav = OUT / f"ko-{num}-beat.wav"
        if a.engine == "say":
            say_one(text, wav, a.voice, a.rate)
        else:
            fish_one(text, wav, a.ref, a.ref_text, a.temperature)
        d = seconds(wav)
        total += d
        print(f"  {num}  {d:5.1f}s  {slug}   ({len(text)} chars)")

    who = a.voice if a.engine == "say" else f"clone of {a.ref.name}"
    print(f"\n{len(bs)} beats · {total:.0f}s ({int(total // 60)}m {int(total % 60):02d}s) · {a.engine}: {who}")
    print("re-record the film next — shots are cut to the voice: scripts/record_explainer.sh")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
