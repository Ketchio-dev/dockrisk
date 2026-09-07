#!/usr/bin/env bash
# The 90-second backup: drive the scenario through the API, capture each demo beat with headless Chrome, and
# stitch the stills into docs/demo/backup.mp4 with a caption per beat. Needs the local stack running
# (scripts/demo.sh), Google Chrome, ffmpeg, and `cd apps/web && npm install --no-save puppeteer-core` once.
# Frames land in .demo-logs/frames/.
#   scripts/record_backup.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
A=localhost:8000; W=http://localhost:3000
OUT="$ROOT/.demo-logs/frames"; rm -rf "$OUT"; mkdir -p "$OUT"
p() { curl -s -X POST -H 'content-type: application/json' "$@"; }
snap() { curl -s $A/snapshot 2>/dev/null; }
shot() {  # name url width height seconds-on-screen caption — the caption is drawn by the page (scripts/shot.mjs)
  printf '%s\t%s\t%s\t%s\t%s\n' "$1" "$2" "$3" "$4" "$6" | (cd "$ROOT/apps/web" && node scripts/shot.mjs "$OUT") >/dev/null
  [[ -s "$OUT/$1.png" ]] || echo "!! no frame for $1" >&2
  printf '%s\t%s\n' "$1" "$5" >> "$OUT/beats.tsv"
}
until_t() { for i in $(seq 1 300); do t=$(snap | jq -r '.sim.sim_ts[11:16]' 2>/dev/null || echo 00:00); [[ "$t" > "$1" ]] && return; sleep 1; done; echo "timeout at $t waiting for $1" >&2; }
pause() { p $A/sim/control -d '{"running":false}' >/dev/null; }
resume() { p $A/sim/control -d '{"running":true}' >/dev/null; }

# fresh scenario, fast clock; wait until the simulator has rebuilt (clock back before 08:00) before trusting the time
for i in $(seq 1 30); do snap | jq -e '.assignments|length>0' >/dev/null 2>&1 && break; sleep 1; done
p $A/sim/reset -d '{}' >/dev/null
for i in $(seq 1 60); do t=$(snap | jq -r '.sim.sim_ts[11:16]' 2>/dev/null || echo 99:99); [[ "$t" < "08:00" ]] && break; sleep 1; done
p $A/sim/control -d '{"speed":300,"running":true}' >/dev/null
: > "$OUT/beats.tsv"

shot 01-data "$W/data" 1440 900 12 "The carrier's own 62-day export, replayed: \$32k–43k a month of detention exposure in a thin tail past two hours"
until_t 09:30; pause
V=$(snap | jq -r '.visits[]|select(.driver_name=="Driver84")|.visit_id')
shot 02-arrival "$W/" 1440 900 10 "09:30 — B3339 enters the London DC for a 10:00 appointment. Next load feasible: +1h 10m"
p $A/visits/$V/driver-event -d '{"kind":"arrival_class","actor":"Driver84","payload":{"value":"on_time"}}' >/dev/null
p $A/visits/$V/driver-event -d '{"kind":"checked_in","actor":"Driver84","payload":{"at":"arrival"}}' >/dev/null
shot 03-driver "$W/driver/Driver84" 430 900 8 "The driver confirms check-in on the companion app; the billing clock starts at the later of check-in and appointment"
resume; until_t 11:20; pause
shot 04-collision "$W/" 1440 900 14 "11:20 — still at the dock. The next load is infeasible before detention even starts billing; the 401 event adds road minutes to the same forward check"
B=$(snap | jq -r '.assignments[]|select(.driver_name=="Driver84" and .status=="accepted" and (.reason_json|test("next load")))|.bill_number')
AID=$(p $A/assignments -d "{\"bill_number\":\"$B\",\"driver_name\":\"Driver8\",\"unit\":\"B9001\",\"status\":\"offered\",\"reason\":{\"via\":\"rescue\",\"pickup_by_start\":\"2026-09-08 13:00:00\",\"pickup_by_end\":\"2026-09-08 13:30:00\"}}" | jq -r '.assignment_id')
shot 05-offer "$W/driver/Driver8" 430 900 8 "Dispatch offers the load to a relief driver ranked by position, hours, trailer and the road"
p $A/assignments/$AID/status -d '{"status":"accepted","actor":"Driver8"}' >/dev/null
resume; sleep 6; pause
shot 06-relief "$W/" 1440 900 10 "Relief accepted: B9001 is driving to the pickup; the next-load exception resolves"
resume; until_t 12:15; pause
p $A/visits/$V/driver-event -d '{"kind":"service_complete","actor":"Driver84"}' >/dev/null
p $A/visits/$V/driver-event -d '{"kind":"released","actor":"Driver84"}' >/dev/null
resume; until_t 12:25; pause
shot 07-charge "$W/" 1440 900 10 "12:16 — released. A draft detention charge with its evidence: \$18.75, 15 billable minutes at the 15-minute floor"
shot 08-packet "$W/evidence/$V" 1440 900 12 "The evidence packet: the calculation in words, the event ledger with sources, GPS and duty samples"
shot 09-policies "$W/policies" 1440 900 6 "AI reads the rate confirmation and writes the notice. The engine computes every number. The dispatcher confirms."

# stitch: each still held for its seconds, scaled onto a 1440x900 warm canvas (phone frames sit centred)
LIST="$OUT/list.txt"; : > "$LIST"
while IFS=$'\t' read -r name secs; do
  [[ -f "$OUT/$name.png" ]] || continue
  ffmpeg -loglevel error -y -loop 1 -t "$secs" -i "$OUT/$name.png" -vf "scale=1440:900:force_original_aspect_ratio=decrease,pad=1440:900:(ow-iw)/2:(oh-ih)/2:color=0xf3f2ee,format=yuv420p" -r 24 "$OUT/$name.mp4"
  echo "file '$OUT/$name.mp4'" >> "$LIST"
done < "$OUT/beats.tsv"
mkdir -p "$ROOT/docs/demo"
ffmpeg -loglevel error -y -f concat -safe 0 -i "$LIST" -c copy "$ROOT/docs/demo/backup.mp4"
echo "docs/demo/backup.mp4  $(ffprobe -v error -show_entries format=duration -of csv=p=0 "$ROOT/docs/demo/backup.mp4" | cut -d. -f1)s"
