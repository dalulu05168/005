#!/usr/bin/env bash
# Oracle Always Free OCI VM.Standard.A1.Flex Ubuntu ARM64 one-account pilot.
# QR login only. No message sending and no migrations from Windows.
set -Eeuo pipefail
cd "$(dirname "$0")/.."

if [[ "$(uname -m)" != "aarch64" ]]; then
  echo "An OCI ARM64 A1 instance is required, found $(uname -m). No changes made."
  exit 2
fi
if [[ ! -f ./Dockerfile.whatsapp-cloud || ! -f ./whatsapp-connector/cloud.mjs ]]; then
  echo "Run this script in the Nuvexa Pro repository checkout."
  exit 2
fi
if ! command -v docker >/dev/null 2>&1; then
  echo "Installing Docker on Ubuntu ARM64..."
  sudo apt-get update
  sudo apt-get install -y --no-install-recommends docker.io curl ca-certificates
  sudo systemctl enable --now docker
fi
DATA="/srv/nuvexa-whatsapp-pilot"
CONTAINER="nuvexa-wa-cloud-pilot"
sudo install -d -m 0700 -o 10001 -g 10001 "$DATA"
if [[ "${NUVEXA_SKIP_BUILD:-0}" == "1" ]]; then
  sudo docker image inspect nuvexa-wa-cloud-pilot:arm64 >/dev/null
  echo "Reusing previously built image; no slow rebuild during 10-minute pairing window."
else
  echo "Building OCI ARM64 Chromium container. First build may take several minutes."
  sudo docker build --platform linux/arm64 -f Dockerfile.whatsapp-cloud -t nuvexa-wa-cloud-pilot:arm64 .
fi
echo "Persistent WhatsApp session data: $DATA"
echo "Port 10000 will be bound only to VM localhost, not public internet."
sudo docker rm -f "$CONTAINER" >/dev/null 2>&1 || true

args=(
  run -d --name "$CONTAINER" --restart unless-stopped
  --mount "type=bind,src=$DATA,dst=/var/data"
  --publish "127.0.0.1:10000:10000"
  --cap-drop ALL --security-opt no-new-privileges
  --pids-limit 256 --memory 4g --shm-size 256m
)
if [[ -n "${NUVEXA_CLOUD_PAIR_CODE:-}" ]]; then
  # Short-lived enrollment secret; never printed, stored in source or logs.
  args+=( --env "NUVEXA_CLOUD_PAIR_CODE=$NUVEXA_CLOUD_PAIR_CODE" )
fi
args+=( nuvexa-wa-cloud-pilot:arm64 )
sudo docker "${args[@]}" >/dev/null

sleep 3
if ! sudo docker inspect --format '{{.State.Running}}' "$CONTAINER" | grep -qx true; then
  echo "Container failed; recent diagnostic logs:"
  sudo docker logs --tail 25 "$CONTAINER"
  exit 1
fi
echo "Cloud QR pilot service started. Health:"
curl -fsS --max-time 10 http://127.0.0.1:10000/healthz || true
echo
echo "If not yet paired: generate a 10-minute code in Nuvexa admin, then run:"
echo "  bash oci-free/pair.sh"
echo "Do not delete the persistent session directory."
