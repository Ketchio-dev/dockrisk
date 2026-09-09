#!/usr/bin/env bash
# Burn docs/demo/submission.srt into the film, on its own band.
#
# Two reasons this does not use ffmpeg's subtitles/ass filter: this Homebrew build
# ships without libass or libfreetype, so those filters do not exist at all; and
# captions laid over the picture would sit on the dispatch board, which is small
# type and dense numbers — the thing a judge is meant to be reading. So the band is
# rendered as frames in the product's own face (IBM Plex Sans) and stacked under a
# slightly shorter picture. Nothing on screen is ever covered.
#
#   docs/demo/submission-captioned.mp4   burned in, plays anywhere
#   docs/demo/submission.mp4 + .srt      clean picture, sidecar for YouTube's toggle
#
#   scripts/burn_subs.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IN="$ROOT/docs/demo/submission.mp4"
SRT="$ROOT/docs/demo/submission.srt"
OUT="$ROOT/docs/demo/submission-captioned.mp4"
BAND=110
PIC=$((1080 - BAND))
WORK="$ROOT/.demo-logs/subs"
FONT_DIR=/tmp/plexfonts/ibm-plex-sans/fonts/complete/ttf

[[ -f "$IN"  ]] || { echo "no film — run record_video.sh && mix_video.sh" >&2; exit 1; }
[[ -f "$SRT" ]] || { echo "no subtitles — run scripts/subtitles.py" >&2; exit 1; }

rm -rf "$WORK"; mkdir -p "$WORK/frames"

echo "==> rendering the caption band"
python3 - "$SRT" "$WORK" "$BAND" "$FONT_DIR" <<'PY'
import pathlib, re, sys
from PIL import Image, ImageDraw, ImageFont

srt, work, band, fontdir = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2]), int(sys.argv[3]), sys.argv[4]
W = 1920
CANVAS = (0xF3, 0xF2, 0xEE)   # the product's paper
INK    = (0x1A, 0x1A, 0x17)
RULE   = (0xE3, 0xE1, 0xDA)

face = None
for name in ("IBMPlexSans-Text.ttf", "IBMPlexSans-Regular.ttf", "IBMPlexSans-Medium.ttf"):
    p = pathlib.Path(fontdir) / name
    if p.exists():
        face = ImageFont.truetype(str(p), 36)
        print(f"    face: {name}")
        break
if face is None:
    face = ImageFont.truetype("/System/Library/Fonts/HelveticaNeue.ttc", 36)
    print("    face: HelveticaNeue (IBM Plex not found)")

def parse(text):
    out = []
    for blk in re.split(r"\n\s*\n", text.strip()):
        lines = [l for l in blk.splitlines() if l.strip()]
        if len(lines) < 3:
            continue
        m = re.match(r"(\d+):(\d+):(\d+),(\d+)\s*-->\s*(\d+):(\d+):(\d+),(\d+)", lines[1])
        if not m:
            continue
        g = [int(x) for x in m.groups()]
        out.append((g[0]*3600 + g[1]*60 + g[2] + g[3]/1000,
                    g[4]*3600 + g[5]*60 + g[6] + g[7]/1000,
                    " ".join(lines[2:])))
    return out

cues = parse(srt.read_text(encoding="utf-8"))

def render(text, path):
    im = Image.new("RGB", (W, band), CANVAS)
    d = ImageDraw.Draw(im)
    d.line([(0, 0), (W, 0)], fill=RULE, width=2)   # a hairline, the way the product separates things
    if text:
        bb = d.textbbox((0, 0), text, font=face)
        d.text(((W - (bb[2] - bb[0])) / 2, (band - (bb[3] - bb[1])) / 2 - bb[1]),
               text, font=face, fill=INK)
    im.save(path, optimize=True)

blank = work / "frames" / "blank.png"
render("", blank)

segs, clock = [], 0.0
for i, (a, b, text) in enumerate(cues):
    if a > clock + 0.02:
        segs.append((a - clock, blank))
    p = work / "frames" / f"c{i:04d}.png"
    render(text, p)
    segs.append((b - a, p))
    clock = b

with (work / "band.tsv").open("w") as f:
    for d_, p in segs:
        f.write(f"{max(d_, 0.05):.3f}\t{p}\n")

print(f"    {len(cues)} cues, {len(segs)} band segments")
PY

echo "==> assembling"
# The concat demuxer's `duration` on still images drifts — the first pass came out
# five seconds long against a 186.5s film. Encode each cue as its own exact-length
# segment instead, the same way the picture clips are built, then join them.
: > "$WORK/segs.txt"
i=0
while IFS=$'\t' read -r dur png; do
  i=$((i + 1))
  seg="$WORK/seg_$(printf '%04d' "$i").mp4"
  ffmpeg -nostdin -loglevel error -y -loop 1 -framerate 30 -i "$png" -t "$dur" \
    -vf "scale=1920:${BAND},format=yuv420p" -c:v libx264 -preset veryfast -crf 20 "$seg"
  echo "file '$seg'" >> "$WORK/segs.txt"
done < "$WORK/band.tsv"
ffmpeg -nostdin -loglevel error -y -f concat -safe 0 -i "$WORK/segs.txt" -c copy "$WORK/band_full.mp4"

ffmpeg -nostdin -loglevel error -y -i "$IN" -i "$WORK/band_full.mp4" -filter_complex \
  "[0:v]scale=1920:${PIC}:force_original_aspect_ratio=decrease,pad=1920:${PIC}:(ow-iw)/2:(oh-ih)/2:color=0xF3F2EE[p];[p][1:v]vstack=inputs=2,format=yuv420p[v]" \
  -map "[v]" -map 0:a -c:v libx264 -preset medium -crf 20 -c:a copy "$OUT"

D=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT")
S=$(ffprobe -v error -show_entries format=size -of csv=p=0 "$OUT")
printf '==> %s\n' "$OUT"
python3 -c "print(f'    {$D:.1f}s · {$S/1e6:.1f} MB')"
