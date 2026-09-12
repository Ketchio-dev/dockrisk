#!/usr/bin/env bash
# One still, slowly pushed in, as a clip. The proxy offers image generation but no working video
# model, and a screen recorder cannot film a truck standing at a dock — so the one shot this film
# needs from the real world is a generated still with motion added here, under our control.
#
#   scripts/kenburns.sh <image> <seconds> <out.mp4> [fps]
set -euo pipefail
IMG=$1; SECS=$2; OUT=$3; FPS=${4:-30}
FRAMES=$(python3 -c "print(int($SECS * $FPS))")
# zoompan wants a big input or the pan stairsteps; scale up first, ease the zoom, then letterbox
# onto the product's paper so the clip sits in the film without a seam.
ffmpeg -nostdin -loglevel error -y -loop 1 -i "$IMG" -t "$SECS" -r "$FPS" \
  -vf "scale=3840:-2,zoompan=z='min(1.0001+0.00035*on,1.12)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=$FRAMES:s=1920x1080:fps=$FPS,\
scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0xF3F2EE,format=yuv420p" \
  -c:v libx264 -preset medium -crf 19 "$OUT"
