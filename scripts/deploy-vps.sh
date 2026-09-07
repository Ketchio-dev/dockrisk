#!/bin/sh
# Ship the tracked tree (synthetic sample only; the organizer workbook is untracked) to the VPS and rebuild.
#   scripts/deploy-vps.sh            # HEAD
# Requires Tailscale SSH access to the host and services/.env locally (copied as the container env).
set -eu
HOST=${DOCKRISK_VPS:-user@vps}
DIR=/home/ubuntu/apps/dockrisk
cd "$(dirname "$0")/.."
git archive --format=tar HEAD services scripts data/sample .dockerignore > /tmp/dockrisk-src.tar
tar -rf /tmp/dockrisk-src.tar data/geo/routes.json data/geo/cities.json
ssh "$HOST" "mkdir -p $DIR && rm -rf $DIR/src && mkdir $DIR/src && tar -x -C $DIR/src" < /tmp/dockrisk-src.tar
scp -q deploy/vps/docker-compose.yml "$HOST:$DIR/docker-compose.yml"
scp -q services/.env "$HOST:$DIR/.env"
ssh "$HOST" "cd $DIR && sudo docker compose up -d --build 2>&1 | tail -3 && sleep 8 && sudo docker exec dockrisk-api curl -sf localhost:8000/health"
echo
echo "https://dockrisk-api.myarchive.cc/health"
