#!/usr/bin/env bash
# Lay the Korean explanation under the picture and put the ENGLISH lines in the band.
#
# The band in the explainer film is a transcript. Here it is a teleprompter: the sentence to say
# out loud at that moment, in the language it has to be said in. English only, so it can be set in
# the product's own face, larger than a caption, one line at a time.
#
#   scripts/mix_pitch.sh  →  .demo-logs/full/dockrisk-full-guide.mp4
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/.demo-logs/full"
TTS="$ROOT/.demo-logs/tts-full"
SCRIPT="$ROOT/docs/demo/explainer/narration-ko-full.md"
FINAL="$OUT/dockrisk-full-guide.mp4"
BAND=150          # taller than a caption band: this is meant to be read, not glanced at
PIC=$((1080 - BAND))

[[ -f "$OUT/picture.mp4" ]] || { echo "no picture cut — run scripts/record_pitch.sh first" >&2; exit 1; }
dur() { ffprobe -v error -show_entries format=duration -of csv=p=0 "$1"; }

echo "==> voice track"
: > "$OUT/vo_concat.txt"; : > "$OUT/beats.tsv"
n=0
while read -r name; do
  n=$((n+1)); seg="$OUT/$name.mp4"; [[ -f "$seg" ]] || continue
  vo=$(ls "$TTS"/ko-$(printf '%02d' "$n")-*.wav 2>/dev/null | head -1)
  clip_len=$(dur "$seg"); piece="$OUT/vo_seg_$(printf '%02d' "$n").wav"
  if [[ -n "$vo" ]]; then
    ffmpeg -nostdin -loglevel error -y -i "$vo" -af "aresample=48000,apad" -ac 2 -t "$clip_len" "$piece"
  else
    ffmpeg -nostdin -loglevel error -y -f lavfi -i anullsrc=r=48000:cl=stereo -t "$clip_len" "$piece"
  fi
  echo "file '$piece'" >> "$OUT/vo_concat.txt"
  printf '%02d\t%s\t%s\n' "$n" "$name" "$clip_len" >> "$OUT/beats.tsv"
  printf '    %-14s %6.1fs\n' "$name" "$clip_len"
done < "$OUT/order.txt"
ffmpeg -nostdin -loglevel error -y -f concat -safe 0 -i "$OUT/vo_concat.txt" -c copy "$OUT/voice.wav"

echo "==> teleprompter cues and chapters"
python3 - "$SCRIPT" "$OUT" <<'PY'
import pathlib, re, sys
script, out = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
say, titles, num = {}, {}, None
for line in script.read_text(encoding="utf-8").splitlines():
    h = re.match(r"^###\s+(\d{2})\s*·\s*(.+?)\s*$", line.strip())
    if h:
        num = h.group(1); titles[num] = h.group(2); say.setdefault(num, []); continue
    if num and line.startswith(">"):
        t = line.lstrip("> ").replace("**", "").strip()
        if t:
            say[num].append(t)

rows = [l.split("\t") for l in (out / "beats.tsv").read_text().strip().splitlines()]
srt, chapters, clock, i = [], [], 0.0, 0
def ts(x):
    ms = int(round(x * 1000))
    return f"{ms//3600000:02d}:{ms//60000%60:02d}:{ms//1000%60:02d},{ms%1000:03d}"
for numstr, _name, lenstr in rows:
    span = float(lenstr)
    chapters.append((clock, clock + span, f"{numstr} {titles.get(numstr,'')}"))
    lines = say.get(numstr, [])
    if lines:
        # share the beat out by sentence length: a long line needs longer on screen
        # split long Korean lines into caption-sized cues
        import re as _re
        cues = []
        for ln in lines:
            for part in _re.split(r"(?<=[.!?])\s+", ln):
                part = part.strip()
                if not part: continue
                if cues and len(cues[-1]) + len(part) + 1 <= 52: cues[-1] += " " + part
                else: cues.append(part)
        lines = cues
        total = sum(len(l) for l in lines) or 1
        t = 0.0
        for l in lines:
            d = (span - 0.8) * len(l) / total
            i += 1
            srt.append(f"{i}\n{ts(clock+t)} --> {ts(clock+t+d)}\n{l}\n")
            t += d
    clock += span
(out / "captions-ko.srt").write_text("\n".join(srt), encoding="utf-8")
meta = [";FFMETADATA1"]
for a, b, title in chapters:
    meta += ["[CHAPTER]", "TIMEBASE=1/1000", f"START={int(a*1000)}", f"END={int(b*1000)}", f"title={title}"]
(out / "chapters.txt").write_text("\n".join(meta) + "\n", encoding="utf-8")
print(f"    {i} lines to say · {len(chapters)} chapters · {clock:.0f}s")
PY

echo "==> rendering the band"
WORK="$OUT/band"; rm -rf "$WORK"; mkdir -p "$WORK/frames"
python3 - "$OUT/captions-ko.srt" "$WORK" "$BAND" <<'PY'
import pathlib, re, sys
from PIL import Image, ImageDraw, ImageFont
srt, work, band = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2]), int(sys.argv[3])
W = 1920
CANVAS, INK, RULE, DIM = (0xF3, 0xF2, 0xEE), (0x1A, 0x1A, 0x17), (0xE3, 0xE1, 0xDA), (0x75, 0x74, 0x6C)
# Dark band, light type: this strip is the thing to look at, not a caption to ignore.
def face(size):
    for p in ("/System/Library/Fonts/AppleSDGothicNeo.ttc",):   # Korean; IBM Plex has no Hangul
        if pathlib.Path(p).exists():
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()
BIG, SMALL = face(38), face(19)
def parse(text):
    out = []
    for blk in re.split(r"\n\s*\n", text.strip()):
        ls = [l for l in blk.splitlines() if l.strip()]
        if len(ls) < 3: continue
        m = re.match(r"(\d+):(\d+):(\d+),(\d+)\s*-->\s*(\d+):(\d+):(\d+),(\d+)", ls[1])
        if not m: continue
        g = [int(x) for x in m.groups()]
        out.append((g[0]*3600+g[1]*60+g[2]+g[3]/1000, g[4]*3600+g[5]*60+g[6]+g[7]/1000, " ".join(ls[2:])))
    return out
def wrap(d, text, maxw, f):
    words, lines, cur = text.split(" "), [], ""
    for w in words:
        t = f"{cur} {w}".strip()
        if d.textlength(t, font=f) > maxw and cur: lines.append(cur); cur = w
        else: cur = t
    if cur: lines.append(cur)
    return lines[:2]
def render(text, path):
    im = Image.new("RGB", (W, band), CANVAS); d = ImageDraw.Draw(im)
    d.line([(0, 0), (W, 0)], fill=RULE, width=2)
    
    if text:
        lines = wrap(d, text, W - 200, BIG); lh = 50
        y = (band - lh * len(lines)) / 2 + 6
        for ln in lines:
            d.text(((W - d.textlength(ln, font=BIG)) / 2, y), ln, font=BIG, fill=INK); y += lh
    im.save(path, optimize=True)
cues = parse(srt.read_text(encoding="utf-8"))
blank = work / "frames" / "blank.png"; render("", blank)
segs, clock = [], 0.0
for i, (a, b, text) in enumerate(cues):
    if a > clock + 0.02: segs.append((a - clock, blank))
    p = work / "frames" / f"c{i:04d}.png"; render(text, p)
    segs.append((b - a, p)); clock = b
with (work / "band.tsv").open("w") as f:
    for d_, p in segs: f.write(f"{max(d_, 0.05):.3f}\t{p}\n")
print(f"    {len(cues)} lines, {len(segs)} band segments")
PY

echo "==> assembling"
: > "$WORK/segs.txt"; i=0
while IFS=$'\t' read -r d png; do
  i=$((i + 1)); seg="$WORK/seg_$(printf '%04d' "$i").mp4"
  ffmpeg -nostdin -loglevel error -y -loop 1 -framerate 30 -i "$png" -t "$d" \
    -vf "scale=1920:${BAND},format=yuv420p" -c:v libx264 -preset veryfast -crf 20 "$seg"
  echo "file '$seg'" >> "$WORK/segs.txt"
done < "$WORK/band.tsv"
ffmpeg -nostdin -loglevel error -y -f concat -safe 0 -i "$WORK/segs.txt" -c copy "$WORK/band_full.mp4"

echo "==> muxing"
ffmpeg -nostdin -loglevel error -y -i "$OUT/picture.mp4" -i "$WORK/band_full.mp4" -i "$OUT/voice.wav" \
  -i "$OUT/chapters.txt" -map_metadata 3 -filter_complex \
  "[0:v]scale=1920:${PIC}:force_original_aspect_ratio=decrease,pad=1920:${PIC}:(ow-iw)/2:(oh-ih)/2:color=0xF3F2EE[p];[p][1:v]vstack=inputs=2,format=yuv420p[v]" \
  -map "[v]" -map 2:a -c:v libx264 -preset medium -crf 23 -c:a aac -b:a 160k -shortest "$FINAL"
D=$(dur "$FINAL"); S=$(ffprobe -v error -show_entries format=size -of csv=p=0 "$FINAL")
printf '==> %s\n' "$FINAL"
python3 -c "print(f'    {int($D//60)}m {int($D%60):02d}s · {$S/1e6:.0f} MB · 한국어 자막 · 챕터 35개')"
