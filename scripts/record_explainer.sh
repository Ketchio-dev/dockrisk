#!/usr/bin/env bash
# The explainer film: what we built, from nothing, in Korean, for the person who built it.
#
# Same machinery as scripts/record_video.sh — Chrome's screencast records the product in
# motion while the scenario is driven through the API underneath — but eighteen beats
# instead of fourteen, Korean concept cards instead of the pitch deck, and no three-minute
# ceiling to fight. Each shot runs exactly as long as the sentence played over it.
#
# Narration first:
#   python3 scripts/tts_ko.py
# Then this, with the local stack up (scripts/demo.sh):
#   scripts/record_explainer.sh
# Then:
#   scripts/mix_explainer.sh
#
# Beats (docs/demo/explainer/narration-ko.md):
#   01 무엇          card  ·  02 두 개의 시계  card  ·  03 진짜 문제     card
#   04 받은 데이터    /data ·  05 찾아낸 숫자   /data ·  06 보드          live
#   07 데이 바        live  ·  08 판정과 명령   live  ·  09 지도와 511    live
#   10 기사 앱        live  ·  11 대체 기사     live  ·  12 청구 초안     live
#   13 증거 패킷      live  ·  14 정책          live  ·  15 근거 페이지   /data
#   16 구조          card  ·  17 진짜와 시뮬   card  ·  18 못 하는 것    card
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
A=localhost:8000
W=http://localhost:3000
CARDS="file://$ROOT/docs/demo/explainer/cards.html"
TTS="$ROOT/.demo-logs/tts-ko"
OUT="$ROOT/.demo-logs/explainer"
FPS=12
PAD=1.4            # picture held after the voice stops; a touch longer than the pitch film,
                   # because this one is meant to be read along with rather than watched
rm -rf "$OUT"; mkdir -p "$OUT"
: > "$OUT/order.txt"

[[ -d "$TTS" ]] || { echo "no narration — run: python3 scripts/tts_ko.py" >&2; exit 1; }
curl -sf "$A/health" >/dev/null || { echo "API is down — run: scripts/demo.sh" >&2; exit 1; }
curl -sf "$W" >/dev/null       || { echo "web is down — run: scripts/demo.sh" >&2; exit 1; }

p() { curl -s -X POST -H 'content-type: application/json' "$@"; }
snap() { curl -s $A/snapshot 2>/dev/null; }

SEEK=300           # racing between beats
ROLL=25            # slow enough that a 25-second shot advances minutes, not hours
pause() { p $A/sim/control -d '{"running":false}' >/dev/null; }
seek()  { p $A/sim/control -d "{\"speed\":$SEEK,\"running\":true}" >/dev/null; }
roll()  { p $A/sim/control -d "{\"speed\":$ROLL,\"running\":true}" >/dev/null; }

# Fatal on timeout. The scenario ends of its own accord around 12:25 — every truck done —
# so a target past that can never arrive, and a warning that lets the script carry on just
# films the wrong moment. It stops instead.
until_t() {
  local t
  for i in $(seq 1 400); do
    t=$(snap | jq -r '.sim.sim_ts[11:16]' 2>/dev/null || echo 00:00)
    [[ "$t" > "$1" ]] && return 0
    sleep 1
  done
  echo "!! timeout waiting for $1 (stuck at ${t:-?}) — is the target past the end of the scenario?" >&2
  exit 1
}

secs_for() {
  local n f d
  n=$(printf '%02d' "$1")
  f=$(ls "$TTS"/ko-$n-*.wav 2>/dev/null | head -1)
  [[ -n "$f" ]] || { echo "!! no narration for beat $n" >&2; echo 14; return; }
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

# A concept card. Its index into cards.html, not its beat number — the cards are the six
# conceptual beats in script order (01 02 03 16 17 18).
card() {
  local n=$1 name=$2 idx=$3
  clip "$n" "$name" "$CARDS" 1440 900 "
    (() => { const s = document.querySelectorAll('.slide')[$idx]; window.scrollTo(0, s.offsetTop); })()"
}

OPEN_HERO="
  (() => {
    const r = [...document.querySelectorAll('button')].find(b => /^Driver84\\b/.test(b.textContent.trim()));
    if (r) r.click(); else console.error('no Driver84 row');
  })()"

# Scroll a named section of the right-hand panel into view. The panel scrolls on its own,
# so window.scrollTo does nothing here.
scroll_to() {
  echo "
  (() => {
    const h = [...document.querySelectorAll('h2,h3')].find(x => /$1/i.test(x.textContent));
    if (h) h.scrollIntoView({block:'start'}); else console.error('no section $1');
  })()"
}

echo "==> resetting the scenario"
p $A/sim/reset -d '{}' >/dev/null
for i in $(seq 1 120); do
  ts=$(curl -s $A/sim/clock 2>/dev/null | jq -r '"\(.sim_ts) \(.resetting // 0)"' 2>/dev/null || echo "? 1")
  d=${ts:0:10}; hm=${ts:11:5}; flag=${ts##* }
  [[ "$flag" == "0" && "$d" == "2026-09-08" && "$hm" < "08:00" ]] && { echo "    scenario at $d $hm"; break; }
  sleep 1
done
[[ "${d:-}" == "2026-09-08" ]] || { echo "!! simulator never rebuilt the scenario (clock reads ${ts:-?})" >&2; exit 1; }
pause

echo "==> 1/4  the problem (cards) and the data"
card 1 01-what    0
card 2 02-clocks  1
card 3 03-gap     2
clip  4 04-data   "$W/data" 1440 900
clip  5 05-number "$W/data" 1440 900 "$(scroll_to 'exposure|Detention exposure|노출')"

echo "==> 2/4  the desk (live)"
seek; until_t 09:30; pause
V=$(snap | jq -r '.visits[]|select(.driver_name=="Driver84")|.visit_id' | head -1)
[[ -n "$V" ]] || { echo "!! no Driver84 visit" >&2; exit 1; }
echo "    hero visit: $V"

roll; clip 6 06-board "$W/" 1440 900; pause
clip 7 07-daybar "$W/" 1440 900 "$OPEN_HERO"

seek; until_t 11:05; pause
roll; clip 8 08-verdict "$W/" 1440 900 "$OPEN_HERO"; pause

# The satellite toggle mid-shot: the prescript is not awaited past its timers, so the click
# lands on camera instead of before the recording starts.
clip 9 09-map "$W/" 1440 900 "
  (() => {
    setTimeout(() => {
      const b = [...document.querySelectorAll('button')].find(x => /^Satellite\$/i.test(x.textContent.trim()));
      if (b) b.click(); else console.error('no satellite toggle');
    }, 4000);
  })()"

echo "==> 3/4  the driver, the rescue, the money (live)"
p $A/visits/$V/driver-event -d '{"kind":"arrival_class","actor":"Driver84","payload":{"value":"on_time"}}' >/dev/null
clip 10 10-driver "$W/driver/Driver84" 430 900
p $A/visits/$V/driver-event -d '{"kind":"checked_in","actor":"Driver84","payload":{"at":"arrival"}}' >/dev/null

clip 11 11-rescue "$W/" 1440 900 "
  (() => {
    const row = [...document.querySelectorAll('button')].find(b => /^Driver84\\b/.test(b.textContent.trim()));
    if (row) row.click();
    setTimeout(() => {
      const b = [...document.querySelectorAll('button')].find(x => /relief driver/i.test(x.textContent));
      if (b) b.click(); else console.error('no relief button');
    }, 900);
  })()"

# Close the stop so there is a charge to talk about. The billing clock starts at the 10:00
# appointment and two hours of it are free, so releasing at 12:12 leaves twelve billable
# minutes — which the fifteen-minute floor rounds to nothing, and the first cut of this film
# spent its money beat pointing at $0.00. Release at 12:22: twenty-two minutes over, floored
# to fifteen, $18.75. It cannot go much later — the scenario runs out at about 12:25.
roll; sleep 5; pause
p $A/visits/$V/driver-event -d '{"kind":"service_complete","actor":"Driver84"}' >/dev/null
seek; until_t 12:22; pause
p $A/visits/$V/driver-event -d '{"kind":"released","actor":"Driver84"}' >/dev/null
sleep 3

AMT=$(curl -s "$A/charges" | jq -r "[.[]|select(.visit_id==$V)][0].amount // 0")
python3 -c "import sys; sys.exit(0 if float('$AMT') > 0 else 1)" || {
  echo "!! the hero's charge came out \$$AMT — the money beat would film a zero." >&2
  echo "   Release later (the free two hours must be exceeded by a full 15-minute increment)." >&2
  exit 1
}
echo "    hero charge: \$$AMT"

clip 12 12-charge "$W/" 1440 900 "$(scroll_to 'Detention charges')"
clip 13 13-packet "$W/evidence/$V" 1440 900

echo "==> 4/4  policy, proof, and the honest part"
clip 14 14-policy  "$W/policies" 1440 900
clip 15 15-backtest "$W/data" 1440 900 "$(scroll_to 'DockRisk had been running')"
card 16 16-stack    3
card 17 17-real     4
card 18 18-limits   5

echo "==> stitching"
LIST="$OUT/concat.txt"; : > "$LIST"
while read -r name; do
  d="$OUT/$name"
  [[ -d "$d" ]] && [[ -n "$(ls "$d" 2>/dev/null)" ]] || { echo "!! skipping empty clip $name" >&2; continue; }
  # Every shot becomes its own 1920x1080 segment on the product's paper, so the 430-wide
  # phone shot sits centred instead of being stretched.
  ffmpeg -nostdin -loglevel error -y -framerate $FPS -i "$d/f%05d.jpg" \
    -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0xF3F2EE,format=yuv420p" \
    -c:v libx264 -preset medium -crf 19 -r 30 "$OUT/$name.mp4"
  echo "file '$OUT/$name.mp4'" >> "$LIST"
done < "$OUT/order.txt"

ffmpeg -nostdin -loglevel error -y -f concat -safe 0 -i "$LIST" -c copy "$OUT/picture.mp4"
DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT/picture.mp4")
printf '==> picture cut: %.0f s (%dm %02ds)  %s\n' "$DUR" \
  "$(python3 -c "print(int($DUR//60))")" "$(python3 -c "print(int($DUR%60))")" "$OUT/picture.mp4"
echo "    now run: scripts/mix_explainer.sh"
