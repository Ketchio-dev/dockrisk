#!/bin/sh
# Start the API, wait for it, then the simulator against it (same container, one clock).
cd /app/services
uv run uvicorn api.main:app --host 0.0.0.0 --port "${PORT:-8000}" &
for i in $(seq 1 40); do curl -sf "localhost:${PORT:-8000}/health" >/dev/null 2>&1 && break; sleep 0.5; done
uv run python -m sim.main --reset --speed "${SIM_SPEED:-60}" --loop "${SIM_LOOP:-20}" --api "http://localhost:${PORT:-8000}" &
wait
