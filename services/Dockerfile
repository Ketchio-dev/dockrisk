# DockRisk API + simulator in one container, built on the synthetic sample (fictional customers).
# The organizer workbook and the local roadstar.db are git-ignored and never enter the image.
#   docker build -t dockrisk-api -f services/Dockerfile .
#   docker run -p 8000:8000 --env-file services/.env dockrisk-api
FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
WORKDIR /app/services
COPY services/pyproject.toml services/uv.lock* ./
RUN uv sync --no-dev --frozen 2>/dev/null || uv sync --no-dev
COPY services/ ./
COPY data/sample/ /app/data/sample/
# route polylines (OSRM cache) and city coordinates: public geometry, no customer data; without them a fresh
# container would hit the public OSRM router cold on every reset
COPY data/geo/routes.json data/geo/cities.json /app/data/geo/
COPY scripts/ /app/scripts/
# build the database from the synthetic sample at image build time so the first request is fast
RUN uv run python -m core.importer --xlsx /app/data/sample/Hackathon_Data_SAMPLE.xlsx --db /app/data/roadstar.db && uv run python -m core.analytics >/dev/null
ENV DOCKRISK_DB=/app/data/roadstar.db SIM_SPEED=60 PORT=8000
EXPOSE 8000
CMD ["sh", "/app/scripts/container-start.sh"]
