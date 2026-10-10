#!/usr/bin/env bash
# Run on the Oracle free VM after the first setup.sh build, from Nuvexa repo.
set -Eeuo pipefail
cd "$(dirname "$0")/.."
if ! sudo docker image inspect nuvexa-wa-cloud-pilot:arm64 >/dev/null 2>&1; then
  echo "Build the image first: bash oci-free/setup.sh"
  exit 2
fi
echo "Open Nuvexa account management -> Connect cloud QR service."
echo "Create a one-time code (valid 10 minutes). Do not paste it in chat."
IFS= read -r -s -p "One-time cloud enrollment code: " code
echo
code="$(printf '%s' "$code" | tr -d '[:space:]-' | tr '[:lower:]' '[:upper:]')"
if ! [[ "$code" =~ ^[A-F0-9]{24}$ ]]; then
  echo "Invalid format. Expected 24 hexadecimal characters."
  exit 2
fi
echo "Pairing one cloud device. Existing persistent session folders will NOT be removed."
NUVEXA_CLOUD_PAIR_CODE="$code" NUVEXA_SKIP_BUILD=1 bash oci-free/setup.sh
unset code
echo "Waiting for secure pairing confirmation..."
paired=0
for i in {1..25}; do
  if curl -fsS --max-time 5 http://127.0.0.1:10000/healthz 2>/dev/null \
       | python3 -c 'import sys,json; d=json.load(sys.stdin); sys.exit(0 if d.get("paired") else 1)' 2>/dev/null; then
    paired=1
    break
  fi
  sleep 2
done
if [[ "$paired" != 1 ]]; then
  echo "Pairing is not confirmed yet. Review: sudo docker logs --tail 50 nuvexa-wa-cloud-pilot"
  echo "Your existing WhatsApp sessions were not deleted."
  exit 1
fi
# Recreate the worker without the one-time code in its container environment.
# It now authenticates with its stored scoped token on /var/data.
echo "Cloud paired. Clearing short-lived enrollment code from container env..."
NUVEXA_SKIP_BUILD=1 bash oci-free/setup.sh
echo "Connection complete. Cloud token remains only in persistent private storage."
