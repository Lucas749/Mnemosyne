#!/usr/bin/env bash
# Start the Mnemosyne API and expose it publicly via ngrok.
# Usage: ./scripts/dev-public.sh
#
# Requires:
#   pnpm install (workspace)
#   ngrok (brew install ngrok)
#   ngrok authtoken <your-token>  (free at ngrok.com)

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$SCRIPT_DIR/.."

echo "Starting Mnemosyne API..."
cd "$ROOT"
pnpm --filter @mnemosyne/api start &
API_PID=$!

# Wait for the API to be ready
echo "Waiting for API on :3000..."
for i in $(seq 1 20); do
  curl -sf http://localhost:3000/health > /dev/null 2>&1 && break
  sleep 1
done

echo "Opening ngrok tunnel..."
ngrok http 3000 --log=stdout &
NGROK_PID=$!

# Wait for ngrok to assign a URL
sleep 3
NGROK_URL=$(curl -s http://localhost:4040/api/tunnels | \
  grep -o '"public_url":"https://[^"]*"' | head -1 | \
  sed 's/"public_url":"//;s/"//')

if [ -z "$NGROK_URL" ]; then
  echo "Could not detect ngrok URL. Check http://localhost:4040"
else
  echo ""
  echo "Public API URL: $NGROK_URL"
  echo ""
  echo "Use this in OpenClaw / Cursor skill:"
  echo "  MNEMOSYNE_API_URL=$NGROK_URL"
  echo ""
  echo "Demo:"
  echo "  curl $NGROK_URL/health"
  echo "  curl -X POST $NGROK_URL/store \\"
  echo "    -H 'Content-Type: application/json' \\"
  echo "    -d '{\"content\":\"The Ethereum merge was September 15 2022\",\"domain\":\"factual\",\"submittedBy\":\"demo.mnemosyne.eth\"}'"
fi

# Clean up on exit
trap "kill $API_PID $NGROK_PID 2>/dev/null" EXIT
wait
