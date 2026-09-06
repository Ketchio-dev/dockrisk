#!/usr/bin/env bash
# One-command demo: API on :8000, web on :3000, simulator at the given speed (default x60 = 1 sim minute per second).
#   scripts/demo.sh            # start everything, fresh scenario
#   scripts/demo.sh 120        # faster clock
#   scripts/demo.sh stop       # stop everything
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG="$ROOT/.demo-logs"; mkdir -p "$LOG"
if [[ "${1:-}" == "stop" ]]; then
  pkill -f "uvicorn api.main:app" || true; pkill -f "sim.main" || true; pkill -f "next dev" || true
  echo "stopped"; exit 0
fi
SPEED="${1:-60}"
[[ -f "$ROOT/data/roadstar.db" ]] || { echo "no data/roadstar.db — run: cd services && uv run python -m core.importer && uv run python -m core.analytics"; exit 1; }
pkill -f "uvicorn api.main:app" || true; pkill -f "sim.main" || true
( cd "$ROOT/services" && uv run uvicorn api.main:app --port 8000 > "$LOG/api.log" 2>&1 & )
for i in $(seq 1 20); do curl -sf localhost:8000/health >/dev/null && break; sleep 0.5; done
if ! curl -sf localhost:3000 >/dev/null 2>&1; then
  ( cd "$ROOT/apps/web" && npm run dev -- --port 3000 > "$LOG/web.log" 2>&1 & )
  for i in $(seq 1 40); do curl -sf localhost:3000 >/dev/null 2>&1 && break; sleep 0.5; done
fi
( cd "$ROOT/services" && uv run python -m sim.main --reset --speed "$SPEED" > "$LOG/sim.log" 2>&1 & )
echo "dispatcher  http://localhost:3000"
echo "driver app  http://localhost:3000/driver   (hero: /driver/Driver84)"
echo "api         http://localhost:8000/docs"
echo "sim x$SPEED  tail -f $LOG/sim.log"
