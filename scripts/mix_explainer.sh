#!/usr/bin/env bash
# Lay the Korean narration under the explainer cut, caption it, and chapter it.
#
# Three things the pitch film's mixer does not do:
#   · captions in Korean, so the band needs a face with Hangul (IBM Plex has none — Apple SD
#     Gothic Neo does). Like burn_subs.sh, the band is rendered as frames and stacked UNDER a
#     shortened picture rather than laid over it: this film is full of small numbers and the
#     caption must never sit on top of the thing being explained.
#   · two caption lines, because Korean sentences do not fit in one.
#   · chapter marks, because an eight-minute orientation is something you come back to and
#     skip around in.
#
#   scripts/mix_explainer.sh   →  .demo-logs/explainer/dockrisk-explainer-ko.mp4
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/.demo-logs/explainer"
TTS="$ROOT/.demo-logs/tts-ko"
SCRIPT="$ROOT/docs/demo/explainer/narration-ko.md"
FINAL="$OUT/dockrisk-explainer-ko.mp4"
BAND=150
PIC=$((1080 - BAND))

[[ -f "$OUT/picture.mp4" ]] || { echo "no picture cut — run scripts/record_explainer.sh first" >&2; exit 1; }

dur() { ffprobe -v error -show_entries format=duration -of csv=p=0 "$1"; }

echo "==> building the voice track"
: > "$OUT/vo_concat.txt"
: > "$OUT/beats.tsv"
n=0
while read -r name; do
  n=$((n+1))
  seg="$OUT/$name.mp4"
  [[ -f "$seg" ]] || continue
  vo=$(ls "$TTS"/ko-$(printf '%02d' "$n")-*.wav 2>/dev/null | head -1)
  clip_len=$(dur "$seg")
  piece="$OUT/vo_seg_$(printf '%02d' "$n").wav"
  if [[ -n "$vo" ]]; then
    ffmpeg -nostdin -loglevel error -y -i "$vo" \
      -af "aresample=48000,apad" -ac 2 -t "$clip_len" "$piece"
  else
    ffmpeg -nostdin -loglevel error -y -f lavfi -i anullsrc=r=48000:cl=stereo -t "$clip_len" "$piece"
  fi
  echo "file '$piece'" >> "$OUT/vo_concat.txt"
  printf '%02d\t%s\t%s\n' "$n" "$name" "$clip_len" >> "$OUT/beats.tsv"
  printf '    %-14s %6.1fs  %s\n' "$name" "$clip_len" "$( [[ -n "$vo" ]] && basename "$vo" || echo '(silence)')"
done < "$OUT/order.txt"

ffmpeg -nostdin -loglevel error -y -f concat -safe 0 -i "$OUT/vo_concat.txt" -c copy "$OUT/voice.wav"

echo "==> writing captions and chapters"
python3 - "$SCRIPT" "$OUT" <<'PY'
import pathlib, re, sys

script, out = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])

# the spoken text per beat, straight from the script the voice was made from
beats, num, said = {}, None, []
titles = {}
for line in script.read_text(encoding="utf-8").splitlines():
    h = re.match(r"^###\s+(\d{2})\s*·\s*(.+?)\s*$", line.strip())
    if h:
        if num:
            beats[num] = said
        num, said = h.group(1), []
        titles[num] = h.group(2)
        continue
    if line.startswith(">") and num:
        t = line.lstrip("> ").replace("**", "").strip()
        if t:
            said.append(t)
if num:
    beats[num] = said

rows = [l.split("\t") for l in (out / "beats.tsv").read_text().strip().splitlines()]

def cues_for(lines, span):
    """Split a beat into caption-sized cues, timed by how much of the beat each one is.

    Sentences are the unit — the voice pauses there, so a cue boundary there is invisible.
    A cue is grown until adding the next sentence would overflow two lines."""
    sentences = []
    for ln in lines:
        parts = re.split(r"(?<=[.!?])\s+", ln)
        sentences += [p.strip() for p in parts if p.strip()]
    cues, cur = [], ""
    for s in sentences:
        if cur and len(cur) + len(s) + 1 > 58:
            cues.append(cur); cur = s
        else:
            cur = f"{cur} {s}".strip()
    if cur:
        cues.append(cur)
    total = sum(len(c) for c in cues) or 1
    t, out_ = 0.0, []
    for c in cues:
        d = span * len(c) / total
        out_.append((t, t + d, c))
        t += d
    return out_

srt, chapters, clock, i = [], [], 0.0, 0
for numstr, _name, lenstr in rows:
    span = float(lenstr)
    chapters.append((clock, clock + span, f"{numstr} {titles.get(numstr,'')}"))
    # the last ~1.4s of every shot is the held pad, where the voice has already stopped
    for a, b, text in cues_for(beats.get(numstr, []), max(span - 1.4, 1.0)):
        i += 1
        def ts(x):
            ms = int(round(x * 1000))
            return f"{ms//3600000:02d}:{ms//60000%60:02d}:{ms//1000%60:02d},{ms%1000:03d}"
        srt.append(f"{i}\n{ts(clock+a)} --> {ts(clock+b)}\n{text}\n")
    clock += span

(out / "captions-ko.srt").write_text("\n".join(srt), encoding="utf-8")

meta = [";FFMETADATA1"]
for a, b, title in chapters:
    meta += ["[CHAPTER]", "TIMEBASE=1/1000", f"START={int(a*1000)}", f"END={int(b*1000)}", f"title={title}"]
(out / "chapters.txt").write_text("\n".join(meta) + "\n", encoding="utf-8")
print(f"    {i} cues · {len(chapters)} chapters · {clock:.0f}s")
PY

echo "==> rendering the caption band"
WORK="$OUT/band"; rm -rf "$WORK"; mkdir -p "$WORK/frames"
python3 - "$OUT/captions-ko.srt" "$WORK" "$BAND" <<'PY'
import pathlib, re, sys
from PIL import Image, ImageDraw, ImageFont

srt, work, band = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2]), int(sys.argv[3])
W = 1920
CANVAS, INK, RULE = (0xF3, 0xF2, 0xEE), (0x1A, 0x1A, 0x17), (0xE3, 0xE1, 0xDA)

# IBM Plex, the product's face, has no Hangul. This is the system's Korean face.
face = ImageFont.truetype("/System/Library/Fonts/AppleSDGothicNeo.ttc", 38)

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
        out.append((g[0]*3600+g[1]*60+g[2]+g[3]/1000, g[4]*3600+g[5]*60+g[6]+g[7]/1000, " ".join(lines[2:])))
    return out

def wrap(d, text, maxw):
    """Break on spaces only — Korean particles must stay attached to their word."""
    words, lines, cur = text.split(" "), [], ""
    for w in words:
        t = f"{cur} {w}".strip()
        if d.textlength(t, font=face) > maxw and cur:
            lines.append(cur); cur = w
        else:
            cur = t
    if cur:
        lines.append(cur)
    return lines[:2]

def render(text, path):
    im = Image.new("RGB", (W, band), CANVAS)
    d = ImageDraw.Draw(im)
    d.line([(0, 0), (W, 0)], fill=RULE, width=2)
    if text:
        lines = wrap(d, text, W - 200)
        lh = 50
        y = (band - lh * len(lines)) / 2
        for ln in lines:
            d.text(((W - d.textlength(ln, font=face)) / 2, y), ln, font=face, fill=INK)
            y += lh
    im.save(path, optimize=True)

cues = parse(srt.read_text(encoding="utf-8"))
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

echo "==> assembling the band"
: > "$WORK/segs.txt"
i=0
while IFS=$'\t' read -r d png; do
  i=$((i + 1))
  seg="$WORK/seg_$(printf '%04d' "$i").mp4"
  ffmpeg -nostdin -loglevel error -y -loop 1 -framerate 30 -i "$png" -t "$d" \
    -vf "scale=1920:${BAND},format=yuv420p" -c:v libx264 -preset veryfast -crf 22 "$seg"
  echo "file '$seg'" >> "$WORK/segs.txt"
done < "$WORK/band.tsv"
ffmpeg -nostdin -loglevel error -y -f concat -safe 0 -i "$WORK/segs.txt" -c copy "$WORK/band_full.mp4"

echo "==> muxing picture + band + voice + chapters"
ffmpeg -nostdin -loglevel error -y -i "$OUT/picture.mp4" -i "$WORK/band_full.mp4" -i "$OUT/voice.wav" \
  -i "$OUT/chapters.txt" -map_metadata 3 -filter_complex \
  "[0:v]scale=1920:${PIC}:force_original_aspect_ratio=decrease,pad=1920:${PIC}:(ow-iw)/2:(oh-ih)/2:color=0xF3F2EE[p];[p][1:v]vstack=inputs=2,format=yuv420p[v]" \
  -map "[v]" -map 2:a -c:v libx264 -preset medium -crf 23 -c:a aac -b:a 160k -shortest "$FINAL"

D=$(dur "$FINAL"); S=$(ffprobe -v error -show_entries format=size -of csv=p=0 "$FINAL")
printf '==> %s\n' "$FINAL"
python3 -c "print(f'    {int($D//60)}m {int($D%60):02d}s · {$S/1e6:.0f} MB · 자막 포함 · 챕터 18개')"
