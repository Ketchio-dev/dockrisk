#!/usr/bin/env bash
# The whole product, screen by screen, for someone who has never seen it and has to present it.
#
# record_explainer.sh tells the story in eighteen beats. This one is the manual: thirty-five
# beats covering every screen, every control the presenter will touch on stage, the two AI
# moments, the limits, and what to do when the demo dies. Longer on purpose.
#
#   uv run --with mlx-audio python scripts/tts_ko.py --engine fish \
#       --script docs/demo/explainer/narration-ko-full.md --out .demo-logs/tts-full \
#       --ref docs/demo/voice/ko-ref-trimmed.wav --ref-text "..."
#   scripts/record_full.sh
#   scripts/mix_full.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
A=localhost:8000
W=http://localhost:3000
CARDS="file://$ROOT/docs/demo/explainer/cards.html"
DECK="file://$ROOT/docs/demo/deck/index.html"
STILL="$ROOT/docs/demo/explainer/stills/dock-waiting.png"
TTS="$ROOT/.demo-logs/tts-full"
OUT="$ROOT/.demo-logs/full"
FPS=12
PAD=1.5
rm -rf "$OUT"; mkdir -p "$OUT"
: > "$OUT/order.txt"; : > "$OUT/prebuilt.txt"

[[ -d "$TTS" ]] || { echo "no narration — run tts_ko.py --script narration-ko-full.md --out .demo-logs/tts-full" >&2; exit 1; }
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
  echo "!! timeout waiting for $1 (stuck at ${t:-?})" >&2; exit 1
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
card() { clip "$1" "$2" "$CARDS" 1440 900 "
    (() => { const s = document.querySelectorAll('.slide')[$3]; window.scrollTo(0, s.offsetTop); })()"; }
# The deck scrolls its body, not the window — window.scrollTo silently does nothing here.
deck() { clip "$1" "$2" "$DECK" 1440 900 "
    (() => { const s = document.querySelectorAll('.slide')[$3];
             document.body.style.scrollBehavior='auto'; document.body.scrollTop = s.offsetTop;
             s.classList.add('visible'); s.querySelectorAll('.reveal').forEach(r=>r.classList.add('visible')); })()"; }
still() {
  local n=$1 name=$2 img=$3
  local secs; secs=$(secs_for "$n")
  echo "    beat $n  $name  ${secs}s  (still)"
  bash "$ROOT/scripts/kenburns.sh" "$img" "$secs" "$OUT/$name.mp4" 30
  echo "$name" >> "$OUT/order.txt"; echo "$name" >> "$OUT/prebuilt.txt"
}
OPEN_HERO="
  (() => { const r = [...document.querySelectorAll('button')].find(b => /^Driver84\\b/.test(b.textContent.trim()));
           if (r) r.click(); else console.error('no Driver84 row'); })()"
scroll_to() {
  echo "
  (() => { const h = [...document.querySelectorAll('h2,h3')].find(x => /$1/i.test(x.textContent));
           if (h) h.scrollIntoView({block:'start'}); else console.error('no section $1'); })()"
}
click_after() {   # click a button matching $1 after $2 ms, on camera
  echo "
  (() => { setTimeout(() => {
      const b = [...document.querySelectorAll('button')].find(x => $1.test(x.textContent.trim()));
      if (b) b.click(); else console.error('no button $1');
    }, $2); })()"
}

echo "==> resetting"
p $A/sim/reset -d '{}' >/dev/null
for i in $(seq 1 120); do
  ts=$(curl -s $A/sim/clock 2>/dev/null | jq -r '"\(.sim_ts) \(.resetting // 0)"' 2>/dev/null || echo "? 1")
  d=${ts:0:10}; hm=${ts:11:5}; flag=${ts##* }
  [[ "$flag" == "0" && "$d" == "2026-09-08" && "$hm" < "08:00" ]] && { echo "    scenario at $d $hm"; break; }
  sleep 1
done
[[ "${d:-}" == "2026-09-08" ]] || { echo "!! simulator never rebuilt" >&2; exit 1; }
pause

echo "==> 1/5  what it is (1-7)"
still 1 01-open "$STILL"
card  2 02-what    0
card  3 03-does    1
deck  4 04-brief   13        # "Every required component, and the..."
clip  5 05-data    "$W/data" 1440 900
clip  6 06-found   "$W/data" 1440 900 "$(scroll_to 'How long trucks waited')"
deck  7 07-screens 8

echo "==> 2/5  the desk (8-16)"
seek
V=""
for i in $(seq 1 240); do
  V=$(snap | jq -r '[.visits[]?|select(.driver_name=="Driver84" and (.state=="PROPERTY_ENTERED" or .state=="CHECKED_IN" or .state=="AT_DOCK"))][0].visit_id // empty' 2>/dev/null || true)
  [[ -n "$V" ]] && break
  now=$(snap | jq -r '.sim.sim_ts[11:16] // "00:00"' 2>/dev/null || echo 00:00)
  [[ "$now" > "10:30" ]] && break
  sleep 1
done
[[ -n "$V" ]] || { echo "!! hero never reached the dock" >&2; exit 1; }
pause
ENTERED=$(snap | jq -r "[.visits[]?|select(.visit_id==$V)][0].clock_start_ts // empty")
[[ -n "$ENTERED" ]] || ENTERED=$(snap | jq -r '.sim.sim_ts')
echo "    hero visit $V · billing clock $ENTERED"

roll; clip 8 08-topbar "$W/" 1440 900; pause
clip  9 09-board  "$W/" 1440 900
clip 10 10-daybar "$W/" 1440 900 "$OPEN_HERO"
MID=$(python3 -c "
import datetime as dt
print((dt.datetime.fromisoformat('$ENTERED') + dt.timedelta(minutes=95)).strftime('%H:%M'))")
seek; until_t "$MID"; pause
clip 11 11-verdict "$W/" 1440 900 "$OPEN_HERO"
clip 12 12-predict "$W/" 1440 900 "$OPEN_HERO"
clip 13 13-map     "$W/" 1440 900
clip 14 14-sat     "$W/" 1440 900 "$(click_after '/^Satellite$/i' 3500)"
clip 15 15-511     "$W/" 1440 900 "$(click_after '/511 live/i' 3500)"
clip 16 16-trace   "$W/" 1440 900 "$OPEN_HERO"

echo "==> 3/5  the driver (17-22)"
clip 17 17-drivers "$W/driver" 1440 900
clip 18 18-hours   "$W/driver/Driver84" 430 900
p $A/visits/$V/driver-event -d '{"kind":"arrival_class","actor":"Driver84","payload":{"value":"on_time"}}' >/dev/null
clip 19 19-checkin "$W/driver/Driver84" 430 900
p $A/visits/$V/driver-event -d '{"kind":"checked_in","actor":"Driver84","payload":{"at":"arrival"}}' >/dev/null

RESCUE="
  (() => { const row = [...document.querySelectorAll('button')].find(b => /^Driver84\\b/.test(b.textContent.trim()));
           if (row) row.click();
           setTimeout(() => { const b = [...document.querySelectorAll('button')].find(x => /relief driver/i.test(x.textContent));
                              if (b) b.click(); else console.error('no relief button'); }, 900); })()"
clip 20 20-rescue "$W/" 1440 900 "$RESCUE"
clip 21 21-dock   "$W/" 1440 900 "$RESCUE"
clip 22 22-offer  "$W/" 1440 900 "$RESCUE"

echo "==> 4/5  the money (23-29)"
roll; sleep 5; pause
p $A/visits/$V/driver-event -d '{"kind":"service_complete","actor":"Driver84"}' >/dev/null
REL=$(python3 -c "
import datetime as dt
print((dt.datetime.fromisoformat('$ENTERED') + dt.timedelta(minutes=142)).strftime('%H:%M'))")
seek; until_t "$REL"; pause
p $A/visits/$V/driver-event -d '{"kind":"released","actor":"Driver84"}' >/dev/null
sleep 3
AMT=$(curl -s "$A/charges" | jq -r "[.[]|select(.visit_id==$V)][0].amount // 0")
python3 -c "import sys; sys.exit(0 if float('$AMT') > 0 else 1)" || {
  echo "!! hero charge came out \$$AMT — the money beat would film a zero" >&2; exit 1; }
echo "    hero charge \$$AMT"

clip 23 23-charge  "$W/" 1440 900 "$(scroll_to 'Detention charges')"
card 24 24-long    5
clip 25 25-packet  "$W/evidence/$V" 1440 900
clip 26 26-notice  "$W/evidence/$V" 1440 900 "$(scroll_to 'Notice to the customer')"
clip 27 27-policy  "$W/policies" 1440 900
clip 28 28-exposure "$W/data" 1440 900
clip 29 29-backtest "$W/data" 1440 900 "$(scroll_to 'DockRisk had been running')"

echo "==> 5/5  how and honest (30-35)"
card 30 30-stack   3
deck 31 31-ai      10
card 32 32-real    4
card 33 33-limits  5
deck 34 34-recover 15
card 35 35-close   0

echo "==> stitching"
LIST="$OUT/concat.txt"; : > "$LIST"
while read -r name; do
  if grep -qx "$name" "$OUT/prebuilt.txt" 2>/dev/null; then
    echo "file '$OUT/$name.mp4'" >> "$LIST"; continue
  fi
  d="$OUT/$name"
  [[ -d "$d" ]] && [[ -n "$(ls "$d" 2>/dev/null)" ]] || { echo "!! empty clip $name" >&2; continue; }
  ffmpeg -nostdin -loglevel error -y -framerate $FPS -i "$d/f%05d.jpg" \
    -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0xF3F2EE,format=yuv420p" \
    -c:v libx264 -preset medium -crf 19 -r 30 "$OUT/$name.mp4"
  echo "file '$OUT/$name.mp4'" >> "$LIST"
done < "$OUT/order.txt"
ffmpeg -nostdin -loglevel error -y -f concat -safe 0 -i "$LIST" -c copy "$OUT/picture.mp4"
DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT/picture.mp4")
printf '==> picture cut: %.0f s (%dm %02ds)\n' "$DUR" \
  "$(python3 -c "print(int($DUR//60))")" "$(python3 -c "print(int($DUR%60))")"
echo "    now run: scripts/mix_full.sh"
