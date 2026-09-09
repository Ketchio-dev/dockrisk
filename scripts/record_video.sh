#!/usr/bin/env bash
# The 4-minute submission film. Unlike scripts/record_backup.sh, which freezes one
# still per beat, this records the product in MOTION (apps/web/scripts/clip.mjs drives
# Chrome's screencast) while the scenario is driven through the API underneath, then
# cuts deck slides around it and stitches everything with ffmpeg.
#
# Structure (docs/demo/narration.md holds the words that run over it):
#   0:00-0:45  the problem      — deck slides 1, 2, 3, 5
#   0:45-3:45  the product      — the live app, one continuous scenario
#   3:45-4:05  the close        — deck slides 13, 16
#
# Needs the local stack (scripts/demo.sh), Google Chrome, ffmpeg, and
# `cd apps/web && npm install --no-save puppeteer-core` once.
#   scripts/record_video.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
A=localhost:8000
W=http://localhost:3000
DECK="file://$ROOT/docs/demo/deck/index.html"
OUT="$ROOT/.demo-logs/video"
FPS=12
rm -rf "$OUT"; mkdir -p "$OUT"
: > "$OUT/order.txt"

p() { curl -s -X POST -H 'content-type: application/json' "$@"; }
snap() { curl -s $A/snapshot 2>/dev/null; }
# Two speeds on purpose. SEEK races between beats; ROLL is slow enough that a
# 20-second clip advances the scenario by minutes, not by an hour — the first cut
# was shot at 240 and every beat had blown past its moment by the time Chrome
# finished booting.
SEEK=300
ROLL=25
pause()  { p $A/sim/control -d '{"running":false}' >/dev/null; }
seek()   { p $A/sim/control -d "{\"speed\":$SEEK,\"running\":true}"  >/dev/null; }
roll()   { p $A/sim/control -d "{\"speed\":$ROLL,\"running\":true}"  >/dev/null; }

# Wait for the simulated clock to pass HH:MM.
until_t() {
  for i in $(seq 1 400); do
    t=$(snap | jq -r '.sim.sim_ts[11:16]' 2>/dev/null || echo 00:00)
    [[ "$t" > "$1" ]] && return 0
    sleep 1
  done
  echo "!! timeout waiting for $1 (stuck at ${t:-?})" >&2
}

# clip <name> <url> <w> <h> <seconds> [prescript]
clip() {
  local name=$1 url=$2 w=$3 h=$4 secs=$5 pre=${6:-}
  ( cd "$ROOT/apps/web" && node scripts/clip.mjs "$OUT" "$name" "$url" "$w" "$h" "$secs" "$FPS" "$pre" ) || true
  echo "$name" >> "$OUT/order.txt"
}

# A deck slide, with its reveal animation replayed just after recording starts so
# the day bar draws on camera instead of being already finished.
deck() {
  local name=$1 idx=$2 secs=$3
  clip "$name" "$DECK" 1440 900 "$secs" "
    (() => {
      const s = document.querySelectorAll('.slide')[$idx];
      document.body.style.scrollBehavior = 'auto';
      document.body.scrollTop = s.offsetTop;
      s.classList.remove('visible');
      setTimeout(() => s.classList.add('visible'), 1200);
    })()"
}

echo "==> 0/3  resetting the scenario"
for i in $(seq 1 30); do snap | jq -e '.assignments|length>0' >/dev/null 2>&1 && break; sleep 1; done
p $A/sim/reset -d '{}' >/dev/null
for i in $(seq 1 90); do
  t=$(snap | jq -r '.sim.sim_ts[11:16]' 2>/dev/null || echo 99:99)
  [[ "$t" < "08:00" ]] && break
  sleep 1
done
seek

echo "==> 1/3  the problem (deck)"
deck 01-title    0  10
deck 02-two      1  13
deck 03-numbers  2  12
deck 04-clocks   4  10

echo "==> 2/3  the product (live)"
until_t 09:30; pause
V=$(snap | jq -r '.visits[]|select(.driver_name=="Driver84")|.visit_id' | head -1)
[[ -n "$V" ]] || { echo "!! no Driver84 visit — is the scenario seeded?" >&2; exit 1; }
echo "    hero visit: $V"

roll
clip 05-board "$W/" 1440 900 20
pause

# Board rows are buttons whose label starts with the driver name — open the hero's.
clip 06-clocks "$W/" 1440 900 20 "
  (() => {
    const r = [...document.querySelectorAll('button')].find(b => /^Driver84\\b/.test(b.textContent.trim()));
    if (r) r.click(); else console.error('no Driver84 row');
  })()"

p $A/visits/$V/driver-event -d '{"kind":"arrival_class","actor":"Driver84","payload":{"value":"on_time"}}' >/dev/null
clip 07-driver "$W/driver/Driver84" 430 900 20
p $A/visits/$V/driver-event -d '{"kind":"checked_in","actor":"Driver84","payload":{"at":"arrival"}}' >/dev/null

seek; until_t 11:05; pause; roll
clip 08-collision "$W/" 1440 900 30
pause

clip 09-rescue "$W/" 1440 900 25 "
  (() => {
    const b = [...document.querySelectorAll('button')].find(x => /relief driver/i.test(x.textContent));
    if (b) b.click();
  })()"

B=$(snap | jq -r '.assignments[]|select(.driver_name=="Driver84" and .status=="accepted")|.bill_number' | head -1)
AID=$(p $A/assignments -d "{\"bill_number\":\"$B\",\"driver_name\":\"Driver8\",\"unit\":\"B9001\",\"status\":\"offered\",\"reason\":{\"via\":\"rescue\",\"pickup_by_start\":\"2026-09-08 13:00:00\",\"pickup_by_end\":\"2026-09-08 13:30:00\"}}" | jq -r '.assignment_id')
clip 10-offer "$W/driver/Driver8" 430 900 20
p $A/assignments/$AID/status -d '{"status":"accepted","actor":"Driver8"}' >/dev/null

roll; sleep 6; pause
p $A/visits/$V/driver-event -d '{"kind":"service_complete","actor":"Driver84"}' >/dev/null
seek; until_t 12:12; pause
p $A/visits/$V/driver-event -d '{"kind":"released","actor":"Driver84"}' >/dev/null
seek; until_t 12:20; pause
clip 11-charge "$W/" 1440 900 20
clip 12-packet "$W/evidence/$V" 1440 900 25

echo "==> 3/3  the close (deck)"
deck 13-limits 12 10
deck 14-close  15 10

echo "==> stitching"
LIST="$OUT/concat.txt"; : > "$LIST"
while read -r name; do
  d="$OUT/$name"
  [[ -d "$d" ]] && [[ -n "$(ls "$d" 2>/dev/null)" ]] || { echo "!! skipping empty clip $name" >&2; continue; }
  # Each clip becomes its own constant-rate segment on a warm canvas, so the
  # 430-wide phone clips sit centred instead of being stretched to 16:9.
  ffmpeg -nostdin -loglevel error -y -framerate $FPS -i "$d/f%05d.jpg" \
    -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0xF3F2EE,format=yuv420p" \
    -c:v libx264 -preset medium -crf 19 -r 30 "$OUT/$name.mp4"
  echo "file '$OUT/$name.mp4'" >> "$LIST"
done < "$OUT/order.txt"

ffmpeg -nostdin -loglevel error -y -f concat -safe 0 -i "$LIST" -c copy "$ROOT/docs/demo/submission.mp4"
DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$ROOT/docs/demo/submission.mp4")
printf '==> docs/demo/submission.mp4  %.1f s\n' "$DUR"
