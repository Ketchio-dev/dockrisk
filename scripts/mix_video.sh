#!/usr/bin/env bash
# Lay the narration under the picture cut and write docs/demo/submission.mp4.
#
# Every clip in .demo-logs/video/order.txt was recorded to the length of its own
# narration track plus PAD, so the two line up by construction: beat N's voice starts
# where beat N's picture starts. This assembles one continuous audio track by padding
# each line out to its clip's exact duration, then muxes it against the video.
#
#   scripts/mix_video.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/.demo-logs/video"
TTS="$ROOT/.demo-logs/tts"
FINAL="$ROOT/docs/demo/submission.mp4"

[[ -f "$OUT/picture.mp4" ]] || { echo "no picture cut — run scripts/record_video.sh first" >&2; exit 1; }

dur() { ffprobe -v error -show_entries format=duration -of csv=p=0 "$1"; }

echo "==> building the voice track"
: > "$OUT/vo_concat.txt"
n=0
while read -r name; do
  n=$((n+1))
  seg="$OUT/$name.mp4"
  [[ -f "$seg" ]] || continue
  vo=$(ls "$TTS"/vo-$(printf '%02d' "$n")-*.wav 2>/dev/null | head -1)
  clip_len=$(dur "$seg")
  piece="$OUT/vo_seg_$(printf '%02d' "$n").wav"
  if [[ -n "$vo" ]]; then
    # 48k stereo everywhere so concat never renegotiates the stream, then pad the
    # tail with silence out to the clip's exact length.
    ffmpeg -nostdin -loglevel error -y -i "$vo" \
      -af "aresample=48000,apad,loudnorm=I=-16:TP=-1.5:LRA=11" -ac 2 -t "$clip_len" "$piece"
  else
    ffmpeg -nostdin -loglevel error -y -f lavfi -i anullsrc=r=48000:cl=stereo -t "$clip_len" "$piece"
  fi
  echo "file '$piece'" >> "$OUT/vo_concat.txt"
  printf '    %-14s clip %6.1fs  voice %s\n' "$name" "$clip_len" "$( [[ -n "$vo" ]] && basename "$vo" || echo '(silence)')"
done < "$OUT/order.txt"

ffmpeg -nostdin -loglevel error -y -f concat -safe 0 -i "$OUT/vo_concat.txt" -c copy "$OUT/voice.wav"

echo "==> muxing"
ffmpeg -nostdin -loglevel error -y -i "$OUT/picture.mp4" -i "$OUT/voice.wav" \
  -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -b:a 192k -shortest "$FINAL"

V=$(dur "$OUT/picture.mp4"); A=$(dur "$OUT/voice.wav"); F=$(dur "$FINAL")
printf '==> %s\n' "$FINAL"
printf '    picture %.1fs · voice %.1fs · final %.1fs (%dm %02ds)\n' "$V" "$A" "$F" \
  "$(python3 -c "print(int($F//60))")" "$(python3 -c "print(int($F%60))")"
python3 -c "
f=$F
print('    ' + ('규정 3-5분 안' if 180 <= f <= 300 else f'!! 규정 밖 ({f:.0f}s)'))"
