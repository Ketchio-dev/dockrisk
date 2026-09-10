#!/usr/bin/env bash
# The submission film. Records the product in MOTION (apps/web/scripts/clip.mjs drives
# Chrome's screencast) while the scenario is driven through the API underneath, cuts
# deck slides around it, and stitches with ffmpeg.
#
# Clip lengths are NOT guessed. Each is read from the narration track it plays under
# (.demo-logs/tts/vo-NN-*.wav), so the picture follows the voice rather than the other
# way round. Generate narration first:
#   uv run --with mlx-audio python scripts/tts_narration.py
#
# Beats, one per narration block (docs/demo/narration.md):
#   01 identity   deck  ·  02 two clocks  deck  ·  03 the 37-minute gap  deck
#   04 board      live  ·  05 three clocks live ·  06 the verdict        live
#   07 driver app live  ·  08 rescue      live  ·  09 offer accepted     live
#   10 the charge live  ·  11 evidence    live  ·  12 replay             live
#   13 limits     deck  ·  14 close       deck
#
# Needs the local stack (scripts/demo.sh), Google Chrome, ffmpeg, and
# `cd apps/web && npm install --no-save puppeteer-core` once.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
A=localhost:8000
W=http://localhost:3000
DECK="file://$ROOT/docs/demo/deck/index.html"
TTS="$ROOT/.demo-logs/tts"
OUT="$ROOT/.demo-logs/video"
FPS=12
PAD=1.2            # picture held after the voice stops, so a cut never clips a word
rm -rf "$OUT"; mkdir -p "$OUT"
: > "$OUT/order.txt"

p() { curl -s -X POST -H 'content-type: application/json' "$@"; }
snap() { curl -s $A/snapshot 2>/dev/null; }

# Two clock speeds on purpose: SEEK races between beats, ROLL is slow enough that a
# 20-second clip advances the scenario by minutes rather than by an hour.
SEEK=300
ROLL=25
pause() { p $A/sim/control -d '{"running":false}' >/dev/null; }
seek()  { p $A/sim/control -d "{\"speed\":$SEEK,\"running\":true}" >/dev/null; }
roll()  { p $A/sim/control -d "{\"speed\":$ROLL,\"running\":true}" >/dev/null; }

until_t() {
  for i in $(seq 1 400); do
    t=$(snap | jq -r '.sim.sim_ts[11:16]' 2>/dev/null || echo 00:00)
    [[ "$t" > "$1" ]] && return 0
    sleep 1
  done
  echo "!! timeout waiting for $1 (stuck at ${t:-?})" >&2
}

secs_for() {
  local n f d
  n=$(printf '%02d' "$1")
  f=$(ls "$TTS"/vo-$n-*.wav 2>/dev/null | head -1)
  if [[ -z "$f" ]]; then echo "!! no narration for beat $n" >&2; echo 12; return; fi
  d=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$f")
  python3 -c "import sys; print(f'{float(sys.argv[1]) + $PAD:.1f}')" "$d"
}

# clip <beat> <name> <url> <w> <h> [prescript]
clip() {
  local n=$1 name=$2 url=$3 w=$4 h=$5 pre=${6:-}
  local secs; secs=$(secs_for "$n")
  echo "    beat $n  $name  ${secs}s"
  ( cd "$ROOT/apps/web" && node scripts/clip.mjs "$OUT" "$name" "$url" "$w" "$h" "$secs" "$FPS" "$pre" ) || true
  echo "$name" >> "$OUT/order.txt"
}

# A deck slide, with its reveal replayed just after recording starts so the day bar
# draws on camera instead of arriving already finished.
deck() {
  local n=$1 name=$2 idx=$3
  clip "$n" "$name" "$DECK" 1440 900 "
    (() => {
      const s = document.querySelectorAll('.slide')[$idx];
      document.body.style.scrollBehavior = 'auto';
      document.body.scrollTop = s.offsetTop;
      s.classList.remove('visible');
      setTimeout(() => s.classList.add('visible'), 1200);
    })()"
}

OPEN_HERO="
  (() => {
    const r = [...document.querySelectorAll('button')].find(b => /^Driver84\\b/.test(b.textContent.trim()));
    if (r) r.click(); else console.error('no Driver84 row');
  })()"

echo "==> resetting the scenario"
for i in $(seq 1 30); do snap | jq -e '.assignments|length>0' >/dev/null 2>&1 && break; sleep 1; done
p $A/sim/reset -d '{}' >/dev/null
# Wait for the SCENARIO clock, not a bare hour. A reset used to delete the clock row,
# after which every reader fell back to wall time — and a wall clock that happens to
# read 07:59 looks exactly like a rebuilt scenario at 07:30. Watch the date and the
# resetting flag instead.
for i in $(seq 1 120); do
  ts=$(curl -s $A/sim/clock 2>/dev/null | jq -r '"\(.sim_ts) \(.resetting // 0)"' 2>/dev/null || echo "? 1")
  d=${ts:0:10}; hm=${ts:11:5}; flag=${ts##* }
  [[ "$flag" == "0" && "$d" == "2026-09-08" && "$hm" < "08:00" ]] && { echo "    scenario at $d $hm"; break; }
  sleep 1
done
[[ "${d:-}" == "2026-09-08" ]] || { echo "!! simulator never rebuilt the scenario (clock reads ${ts:-?})" >&2; exit 1; }
# The deck needs no simulator, and letting it run at SEEK through three clips
# (plus a Chrome boot each) burned five simulated hours before the live section
# even started — by which point the hero's visit had closed.
pause

echo "==> 1/4  who and what (deck)"
deck 1 01-identity 0
deck 2 02-clocks   1
deck 3 03-gap      4

echo "==> 2/4  the product (live)"
seek; until_t 09:30; pause
V=$(snap | jq -r '.visits[]|select(.driver_name=="Driver84")|.visit_id' | head -1)
[[ -n "$V" ]] || { echo "!! no Driver84 visit" >&2; exit 1; }
echo "    hero visit: $V"

roll; clip 4 04-board "$W/" 1440 900; pause
clip 5 05-three "$W/" 1440 900 "$OPEN_HERO"

seek; until_t 11:05; pause
roll; clip 6 06-verdict "$W/" 1440 900 "$OPEN_HERO"; pause

p $A/visits/$V/driver-event -d '{"kind":"arrival_class","actor":"Driver84","payload":{"value":"on_time"}}' >/dev/null
clip 7 07-driver "$W/driver/Driver84" 430 900
p $A/visits/$V/driver-event -d '{"kind":"checked_in","actor":"Driver84","payload":{"at":"arrival"}}' >/dev/null

clip 8 08-rescue "$W/" 1440 900 "
  (() => {
    const row = [...document.querySelectorAll('button')].find(b => /^Driver84\\b/.test(b.textContent.trim()));
    if (row) row.click();
    setTimeout(() => {
      const b = [...document.querySelectorAll('button')].find(x => /relief driver/i.test(x.textContent));
      if (b) b.click(); else console.error('no relief button');
    }, 900);
  })()"

B=$(snap | jq -r '.assignments[]|select(.driver_name=="Driver84" and .status=="accepted")|.bill_number' | head -1)
AID=$(p $A/assignments -d "{\"bill_number\":\"$B\",\"driver_name\":\"Driver8\",\"unit\":\"B9001\",\"status\":\"offered\",\"reason\":{\"via\":\"rescue\",\"pickup_by_start\":\"2026-09-08 13:00:00\",\"pickup_by_end\":\"2026-09-08 13:30:00\"}}" | jq -r '.assignment_id')
clip 9 09-offer "$W/driver/Driver8" 430 900
p $A/assignments/$AID/status -d '{"status":"accepted","actor":"Driver8"}' >/dev/null

roll; sleep 5; pause
p $A/visits/$V/driver-event -d '{"kind":"service_complete","actor":"Driver84"}' >/dev/null
seek; until_t 12:12; pause
p $A/visits/$V/driver-event -d '{"kind":"released","actor":"Driver84"}' >/dev/null
seek; until_t 12:20; pause

clip 10 10-charge "$W/" 1440 900
clip 11 11-packet "$W/evidence/$V" 1440 900

echo "==> 3/4  the hour, and the proof (live)"
# 12 is the shift argument: open the hero row, where the prediction now names the
# shift it used ("morning (08-12) arrivals here, n=11") rather than a flat average.
clip 12 12-shift "$W/" 1440 900 "$OPEN_HERO"
clip 13 13-replay "$W/data" 1440 900

echo "==> 4/4  close (deck)"
deck 14 14-close 15

echo "==> stitching"
LIST="$OUT/concat.txt"; : > "$LIST"
while read -r name; do
  d="$OUT/$name"
  [[ -d "$d" ]] && [[ -n "$(ls "$d" 2>/dev/null)" ]] || { echo "!! skipping empty clip $name" >&2; continue; }
  # Each clip is its own segment on the product's warm canvas, so the 430-wide phone
  # clips sit centred instead of being stretched to 16:9.
  ffmpeg -nostdin -loglevel error -y -framerate $FPS -i "$d/f%05d.jpg" \
    -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0xF3F2EE,format=yuv420p" \
    -c:v libx264 -preset medium -crf 19 -r 30 "$OUT/$name.mp4"
  echo "file '$OUT/$name.mp4'" >> "$LIST"
done < "$OUT/order.txt"

ffmpeg -nostdin -loglevel error -y -f concat -safe 0 -i "$LIST" -c copy "$OUT/picture.mp4"
DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT/picture.mp4")
printf '==> picture cut: %.1f s  (%s)\n' "$DUR" "$OUT/picture.mp4"
echo "    now run: scripts/mix_video.sh"
