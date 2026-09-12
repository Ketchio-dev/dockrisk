#!/usr/bin/env bash
# The rehearsal film: what you do on stage, and what you say while doing it.
#
# Different from record_explainer.sh in one way that matters. The explainer teaches the product;
# this teaches the performance. So the caption band carries the ENGLISH sentence to speak at that
# moment, while the Korean voice explains why the beat exists and what to watch for. You listen in
# one language and read the one you have to deliver.
#
#   python3 scripts/tts_ko.py --engine fish --script docs/demo/explainer/pitch-ko.md \
#       --out .demo-logs/tts-pitch --ref docs/demo/voice/ko-ref-trimmed.wav --ref-text "..."
#   scripts/record_pitch.sh
#   scripts/mix_pitch.sh
#
# Beats follow docs/demo/runbook.md, which is the order you will actually click on Sunday.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
A=localhost:8000
W=http://localhost:3000
CARDS="file://$ROOT/docs/demo/explainer/cards.html"
QCARD="file://$ROOT/docs/demo/explainer/pitch-cards.html"
STILL="$ROOT/docs/demo/explainer/stills/dock-waiting.png"
TTS="$ROOT/.demo-logs/tts-pitch"
OUT="$ROOT/.demo-logs/pitch"
FPS=12
PAD=1.6          # a beat you are meant to read along with needs longer on screen than one you watch
rm -rf "$OUT"; mkdir -p "$OUT"
: > "$OUT/order.txt"

[[ -d "$TTS" ]] || { echo "no narration — run scripts/tts_ko.py --script docs/demo/explainer/pitch-ko.md --out .demo-logs/tts-pitch" >&2; exit 1; }
curl -sf "$A/health" >/dev/null || { echo "API down — scripts/demo.sh" >&2; exit 1; }
curl -sf "$W" >/dev/null || { echo "web down — scripts/demo.sh" >&2; exit 1; }

p() { curl -s -X POST -H 'content-type: application/json' "$@"; }
snap() { curl -s $A/snapshot 2>/dev/null; }
SEEK=300; ROLL=25
pause() { p $A/sim/control -d '{"running":false}' >/dev/null; }
seek()  { p $A/sim/control -d "{\"speed\":$SEEK,\"running\":true}" >/dev/null; }
roll()  { p $A/sim/control -d "{\"speed\":$ROLL,\"running\":true}" >/dev/null; }
until_t() {
  local t
  for i in $(seq 1 400); do
    t=$(snap | jq -r '.sim.sim_ts[11:16]' 2>/dev/null || echo 00:00)
    [[ "$t" > "$1" ]] && return 0
    sleep 1
  done
  echo "!! timeout waiting for $1 (stuck at ${t:-?}) — past the end of the scenario?" >&2; exit 1
}
secs_for() {
  local n f d
  n=$(printf '%02d' "$1")
  f=$(ls "$TTS"/ko-$n-*.wav 2>/dev/null | head -1)
  [[ -n "$f" ]] || { echo "!! no narration for beat $n" >&2; echo 14; return; }
  d=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$f")
  python3 -c "import sys; print(f'{float(sys.argv[1]) + $PAD:.1f}')" "$d"
}
clip() {
  local n=$1 name=$2 url=$3 w=$4 h=$5 pre=${6:-}
  local secs; secs=$(secs_for "$n")
  echo "    beat $n  $name  ${secs}s"
  ( cd "$ROOT/apps/web" && node scripts/clip.mjs "$OUT" "$name" "$url" "$w" "$h" "$secs" "$FPS" "$pre" ) || true
  echo "$name" >> "$OUT/order.txt"
}
card() { clip "$1" "$2" "$4" 1440 900 "
    (() => { const s = document.querySelectorAll('.slide')[$3]; window.scrollTo(0, s.offsetTop); })()"; }
# A still is not a page, so it becomes its own segment here rather than a set of JPEG frames.
still() {
  local n=$1 name=$2 img=$3
  local secs; secs=$(secs_for "$n")
  echo "    beat $n  $name  ${secs}s  (still)"
  bash "$ROOT/scripts/kenburns.sh" "$img" "$secs" "$OUT/$name.mp4" 30
  echo "$name" >> "$OUT/order.txt"
  echo "$name" >> "$OUT/prebuilt.txt"
}
OPEN_HERO="
  (() => {
    const r = [...document.querySelectorAll('button')].find(b => /^Driver84\\b/.test(b.textContent.trim()));
    if (r) r.click(); else console.error('no Driver84 row');
  })()"
scroll_to() {
  echo "
  (() => {
    const h = [...document.querySelectorAll('h2,h3')].find(x => /$1/i.test(x.textContent));
    if (h) h.scrollIntoView({block:'start'}); else console.error('no section $1');
  })()"
}
: > "$OUT/prebuilt.txt"

echo "==> resetting the scenario"
p $A/sim/reset -d '{}' >/dev/null
for i in $(seq 1 120); do
  ts=$(curl -s $A/sim/clock 2>/dev/null | jq -r '"\(.sim_ts) \(.resetting // 0)"' 2>/dev/null || echo "? 1")
  d=${ts:0:10}; hm=${ts:11:5}; flag=${ts##* }
  [[ "$flag" == "0" && "$d" == "2026-09-08" && "$hm" < "08:00" ]] && { echo "    scenario at $d $hm"; break; }
  sleep 1
done
[[ "${d:-}" == "2026-09-08" ]] || { echo "!! simulator never rebuilt the scenario" >&2; exit 1; }
pause

echo "==> 1/3  the opening and the finding"
still 1 01-dock "$STILL"
clip  2 02-data "$W/data" 1440 900

echo "==> 2/3  the desk (live)"
# Wait for the truck to be physically inside the property, not merely for a visit row to exist.
# The row is created on approach and property_entered_ts fills later; taking the row as arrival
# once put the hero at the dock at 11:49 instead of 09:25, and the money beat filmed $0.00.
# Wait for the hero to be physically at the facility. /snapshot carries the visit's state, not a
# property_entered_ts — an earlier version filtered on a field that is not there, never matched,
# and spun at 300x until the whole scenario had run out. Poll on state, and stop at 10:30 either
# way so a miss costs seconds instead of the run.
seek
V=""
for i in $(seq 1 240); do
  V=$(snap | jq -r '[.visits[]?|select(.driver_name=="Driver84" and (.state=="PROPERTY_ENTERED" or .state=="CHECKED_IN" or .state=="AT_DOCK"))][0].visit_id // empty' 2>/dev/null || true)
  [[ -n "$V" ]] && break
  now=$(snap | jq -r '.sim.sim_ts[11:16] // "00:00"' 2>/dev/null || echo 00:00)
  [[ "$now" > "10:30" ]] && break
  sleep 1
done
[[ -n "$V" ]] || { echo "!! Driver84 never reached the dock (clock ${now:-?})" >&2; exit 1; }
pause
ENTERED=$(snap | jq -r "[.visits[]?|select(.visit_id==$V)][0].clock_start_ts // empty")
[[ -n "$ENTERED" ]] || ENTERED=$(snap | jq -r '.sim.sim_ts')
echo "    hero visit: $V  billing clock $ENTERED"
roll; clip 3 03-board "$W/" 1440 900; pause
clip 4 04-daybar "$W/" 1440 900 "$OPEN_HERO"
# Roughly an hour and a half into the wait: the collision is visible, the charge has not started.
MID=$(python3 -c "
import datetime as dt
t = dt.datetime.fromisoformat('$ENTERED') + dt.timedelta(minutes=95)
print(t.strftime('%H:%M'))")
seek; until_t "$MID"; pause
clip 5 05-verdict "$W/" 1440 900 "$OPEN_HERO"

p $A/visits/$V/driver-event -d '{"kind":"arrival_class","actor":"Driver84","payload":{"value":"on_time"}}' >/dev/null
clip 6 06-driver "$W/driver/Driver84" 430 900
p $A/visits/$V/driver-event -d '{"kind":"checked_in","actor":"Driver84","payload":{"at":"arrival"}}' >/dev/null

clip 7 07-rescue "$W/" 1440 900 "
  (() => {
    const row = [...document.querySelectorAll('button')].find(b => /^Driver84\\b/.test(b.textContent.trim()));
    if (row) row.click();
    setTimeout(() => {
      const b = [...document.querySelectorAll('button')].find(x => /relief driver/i.test(x.textContent));
      if (b) b.click(); else console.error('no relief button');
    }, 900);
  })()"

echo "==> 3/3  the money, the AI, the limits"
roll; sleep 5; pause
p $A/visits/$V/driver-event -d '{"kind":"service_complete","actor":"Driver84"}' >/dev/null
# Release far enough past the free time that a full 15-minute increment is billable. Anchored to
# this visit's own billing clock rather than a wall time, so a scenario that drifts still films money.
CS="$ENTERED"
REL=$(python3 -c "
import datetime as dt
t = dt.datetime.fromisoformat('$CS') + dt.timedelta(minutes=142)
print(t.strftime('%H:%M'))")
echo "    billing clock $CS -> releasing after $REL"
seek; until_t "$REL"; pause
p $A/visits/$V/driver-event -d '{"kind":"released","actor":"Driver84"}' >/dev/null
sleep 3
AMT=$(curl -s "$A/charges" | jq -r "[.[]|select(.visit_id==$V)][0].amount // 0")
python3 -c "import sys; sys.exit(0 if float('$AMT') > 0 else 1)" || {
  echo "!! the hero's charge came out \$$AMT — the money beat would film a zero." >&2; exit 1; }
echo "    hero charge: \$$AMT"

clip 8 08-packet  "$W/evidence/$V" 1440 900
clip 9 09-policy  "$W/policies" 1440 900
card 10 10-limits 5 "$CARDS"
card 11 11-questions 0 "$QCARD"

echo "==> stitching"
LIST="$OUT/concat.txt"; : > "$LIST"
while read -r name; do
  if grep -qx "$name" "$OUT/prebuilt.txt" 2>/dev/null; then
    echo "file '$OUT/$name.mp4'" >> "$LIST"; continue          # the still is already a segment
  fi
  d="$OUT/$name"
  [[ -d "$d" ]] && [[ -n "$(ls "$d" 2>/dev/null)" ]] || { echo "!! skipping empty clip $name" >&2; continue; }
  ffmpeg -nostdin -loglevel error -y -framerate $FPS -i "$d/f%05d.jpg" \
    -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0xF3F2EE,format=yuv420p" \
    -c:v libx264 -preset medium -crf 19 -r 30 "$OUT/$name.mp4"
  echo "file '$OUT/$name.mp4'" >> "$LIST"
done < "$OUT/order.txt"

ffmpeg -nostdin -loglevel error -y -f concat -safe 0 -i "$LIST" -c copy "$OUT/picture.mp4"
DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT/picture.mp4")
printf '==> picture cut: %.0f s (%dm %02ds)\n' "$DUR" \
  "$(python3 -c "print(int($DUR//60))")" "$(python3 -c "print(int($DUR%60))")"
echo "    now run: scripts/mix_pitch.sh"
