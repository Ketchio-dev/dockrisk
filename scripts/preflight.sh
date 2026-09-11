#!/usr/bin/env bash
# Is this thing demo-ready? One command, one table, non-zero exit if anything that matters is red.
#
# Written for the twenty minutes before a live demo, not for CI: it checks the things that have
# actually gone wrong on this project — a simulator that finished and stopped, a deployed clock
# frozen for a day, an API restarted without its schema, a page that 200s but renders an error.
#
#   scripts/preflight.sh              # local + deployed
#   scripts/preflight.sh --local      # skip the deployed checks (no network)
#   scripts/preflight.sh --scenario   # also drive the demo scenario end to end (~2 min)
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
A=http://localhost:8000
W=http://localhost:3000
DEPLOY_API=https://dockrisk-api.myarchive.cc
DEPLOY_WEB=https://dockrisk.vercel.app

DO_DEPLOY=1; DO_SCENARIO=0
for arg in "$@"; do
  case "$arg" in
    --local) DO_DEPLOY=0 ;;
    --scenario) DO_SCENARIO=1 ;;
    *) echo "unknown flag: $arg" >&2; exit 2 ;;
  esac
done

PASS=0; FAIL=0; WARN=0
ok()   { printf '  \033[32m✓\033[0m %-34s %s\n' "$1" "${2:-}"; PASS=$((PASS+1)); }
bad()  { printf '  \033[31m✗\033[0m %-34s %s\n' "$1" "${2:-}"; FAIL=$((FAIL+1)); }
warn() { printf '  \033[33m!\033[0m %-34s %s\n' "$1" "${2:-}"; WARN=$((WARN+1)); }
head_() { printf '\n\033[1m%s\033[0m\n' "$1"; }

# An empty body during a reset or a timeout is normal here; jq must not spew a parse error
# into the middle of the table over it.
j() { local b; b=$(curl -s -m "${2:-10}" "$1" 2>/dev/null); echo "$b" | jq -e . >/dev/null 2>&1 && echo "$b" || echo '{}'; }

head_ "local stack"
if [[ "$(curl -s -o /dev/null -w '%{http_code}' -m 8 $A/health)" == "200" ]]; then
  ok "API" "$(j $A/health | jq -r '.db' | sed "s|$ROOT/||")"
else
  bad "API" "down — scripts/demo.sh"
fi
if [[ "$(curl -s -o /dev/null -w '%{http_code}' -m 10 $W)" == "200" ]]; then ok "web"; else bad "web" "down — scripts/demo.sh"; fi

# The schema column that a reset depends on. A database made before it existed answers 500s
# on /sim/reset and nobody finds out until the Reset button is pressed on stage.
if j $A/sim/clock | jq -e 'has("resetting")' >/dev/null 2>&1; then
  ok "sim_clock.resetting" "reset is answerable"
else
  bad "sim_clock.resetting" "old schema — restart the API to migrate"
fi

CLOCK=$(j $A/sim/clock)
RUNNING=$(echo "$CLOCK" | jq -r '.running // 0')
SIM_TS=$(echo "$CLOCK" | jq -r '.sim_ts // "?"')
if [[ "$RUNNING" == "1" ]]; then
  ok "simulator" "running · $SIM_TS"
else
  warn "simulator" "stopped at $SIM_TS — press Reset, or run scripts/demo.sh"
fi

head_ "data"
DS=$(j $A/dataset)
ORD=$(echo "$DS" | jq -r '.orders // 0')
if [[ "${ORD:-0}" -gt 100 ]]; then
  ok "dataset" "$(echo "$DS" | jq -r '"\(.orders) orders · \(.legs) legs · \(.drivers) drivers · \(.source)"')"
else
  bad "dataset" "empty or tiny — rebuild: core.importer && core.analytics"
fi
EXP=$(j $A/exposure)
if [[ "$(echo "$EXP" | jq -r '.monthly_exposure_low // 0')" -gt 0 ]]; then
  ok "exposure" "$(echo "$EXP" | jq -r '"$\(.monthly_exposure_low)–$\(.monthly_exposure_high)/mo over \(.window_days) d"')"
else
  bad "exposure" "no dwell history — run core.analytics"
fi
BT=$(j $A/backtest 20)
if [[ "$(echo "$BT" | jq -r '.charges.n // 0')" -gt 0 ]]; then
  ok "backtest" "$(echo "$BT" | jq -r '"\(.charges.n) charges · precision \((.warning.precision*100)|round)% · recall \((.warning.recall*100)|round)%"')"
else
  bad "backtest" "replay produced nothing"
fi

head_ "pages"
for p in / /driver /data /policies; do
  code=$(curl -s -o /dev/null -w '%{http_code}' -m 15 "$W$p")
  [[ "$code" == "200" ]] && ok "GET $p" || bad "GET $p" "$code"
done
# A page that 200s can still render an error boundary; check for the text the product shows.
if curl -s -m 15 "$W/data" | grep -q "per month"; then ok "/data rendered" "headline present"; else warn "/data rendered" "no headline in HTML (client-rendered?)"; fi

head_ "tests"
if ( cd "$ROOT/services" && uv run pytest -q >/tmp/preflight-pytest.txt 2>&1 ); then
  ok "pytest" "$(tail -1 /tmp/preflight-pytest.txt | sed 's/ in .*//')"
else
  bad "pytest" "$(tail -3 /tmp/preflight-pytest.txt | tr '\n' ' ')"
fi

head_ "deliverables"
for f in docs/demo/submission.mp4 docs/demo/submission-captioned.mp4 docs/demo/backup.mp4 docs/demo/deck/dockrisk-deck.pdf docs/demo/submission.md docs/demo/runbook.md; do
  if [[ -f "$ROOT/$f" ]]; then
    case "$f" in
      *.mp4) d=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$ROOT/$f" 2>/dev/null)
             ok "$(basename "$f")" "$(python3 -c "print(f'{int($d//60)}m {int($d%60):02d}s')")" ;;
      *)     ok "$(basename "$f")" ;;
    esac
  else
    bad "$(basename "$f")" "missing"
  fi
done
SUB=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$ROOT/docs/demo/submission.mp4" 2>/dev/null || echo 0)
python3 -c "import sys; sys.exit(0 if 180 <= $SUB <= 300 else 1)" 2>/dev/null \
  && ok "submission length" "inside the 3–5 min rule" \
  || bad "submission length" "$(python3 -c "print(f'{$SUB:.0f}s')" 2>/dev/null) — outside 3–5 min"

if [[ $DO_DEPLOY == 1 ]]; then
  head_ "deployed"
  if [[ "$(curl -s -o /dev/null -w '%{http_code}' -m 20 $DEPLOY_WEB)" == "200" ]]; then ok "web" "$DEPLOY_WEB"; else bad "web" "$DEPLOY_WEB"; fi
  if [[ "$(curl -s -o /dev/null -w '%{http_code}' -m 20 $DEPLOY_API/health)" == "200" ]]; then ok "API" "$DEPLOY_API"; else bad "API" "$DEPLOY_API"; fi
  # The failure that actually happened: the scenario ran out and the clock sat still for a day.
  C1=$(j $DEPLOY_API/sim/clock 20 | jq -r '.sim_ts // "?"')
  sleep 6
  C2=$(j $DEPLOY_API/sim/clock 20 | jq -r '.sim_ts // "?"')
  if [[ "$C1" != "$C2" ]]; then
    ok "deployed clock" "advancing · $C2"
  else
    R=$(j $DEPLOY_API/sim/clock 20 | jq -r '.running // 0')
    [[ "$R" == "1" ]] && warn "deployed clock" "running but unchanged in 6 s — slow speed?" \
                      || bad "deployed clock" "frozen at $C2 — the simulator is not looping"
  fi
  MOV=$(j $DEPLOY_API/snapshot 25 | jq -r '[.fleet[]|select(.speed_kmh>3)]|length' 2>/dev/null || echo 0)
  [[ "${MOV:-0}" -gt 0 ]] && ok "deployed fleet" "$MOV trucks moving" || warn "deployed fleet" "nothing moving right now"
fi

if [[ $DO_SCENARIO == 1 ]]; then
  head_ "scenario (live drive)"
  curl -s -X POST -H 'content-type: application/json' $A/sim/reset -d '{}' >/dev/null
  okreset=0
  for i in $(seq 1 90); do
    c=$(j $A/sim/clock)
    [[ "$(echo "$c" | jq -r '.resetting // 1')" == "0" && "$(echo "$c" | jq -r '.sim_ts')" < "2026-09-08 08:00" ]] && { okreset=1; break; }
    sleep 1
  done
  [[ $okreset == 1 ]] && ok "reset" "scenario rebuilt at $(j $A/sim/clock | jq -r '.sim_ts')" || bad "reset" "simulator never rebuilt — is it running?"
  curl -s -X POST -H 'content-type: application/json' $A/sim/control -d '{"speed":600,"running":true}' >/dev/null
  hero=""
  for i in $(seq 1 120); do
    hero=$(j $A/snapshot 15 | jq -r '.visits[]?|select(.driver_name=="Driver84")|.visit_id' | head -1)
    [[ -n "$hero" ]] && break
    sleep 2
  done
  [[ -n "$hero" ]] && ok "hero visit" "visit $hero at the dock" || bad "hero visit" "never opened"
  for i in $(seq 1 120); do
    ex=$(j $A/exceptions 15 | jq -r '[.[]?|select(.kind=="next_load_at_risk" or .kind=="hos_margin")]|length')
    [[ "${ex:-0}" -gt 0 ]] && break
    sleep 2
  done
  [[ "${ex:-0}" -gt 0 ]] && ok "exceptions" "$ex raised (hos / next load)" || warn "exceptions" "none raised yet"
fi

printf '\n\033[1m%d passed · %d warnings · %d failed\033[0m\n' "$PASS" "$WARN" "$FAIL"
[[ $FAIL -eq 0 ]] || exit 1
