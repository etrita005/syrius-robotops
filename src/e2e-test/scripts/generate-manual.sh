#!/usr/bin/env bash
# =============================================================================
# RobotOps Studio - One-Click User Manual Generator
#
# Starts mock backend + Vite frontend, captures full-app screenshots via
# Playwright, generates a self-contained markdown manual with embedded
# base64 images, then stops all servers.
#
# Usage:
#   cd src
#   bash e2e-test/scripts/generate-manual.sh
#
# Output:
#   documents/user-manual/robotops-user-manual.md  (single file, no deps)
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
BACKEND_DIR="$SRC_DIR/backend"
FRONTEND_DIR="$SRC_DIR/frontend"
E2E_DIR="$SRC_DIR/e2e-test"
DATA_DIR="$E2E_DIR/test-results/.e2e-data-manual"
BACKEND_PORT=30002
FRONTEND_PORT=5174
PID_BACKEND=""
PID_FRONTEND=""

# Colours
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

cleanup() {
  echo ""
  echo -e "${YELLOW}Stopping servers...${NC}"

  if [ -n "$PID_BACKEND" ]; then
    kill "$PID_BACKEND" 2>/dev/null || true
    wait "$PID_BACKEND" 2>/dev/null || true
    echo "  Backend stopped (pid $PID_BACKEND)"
  fi

  if [ -n "$PID_FRONTEND" ]; then
    kill "$PID_FRONTEND" 2>/dev/null || true
    wait "$PID_FRONTEND" 2>/dev/null || true
    echo "  Frontend stopped (pid $PID_FRONTEND)"
  fi

  # Remove PID file
  rm -f "$DATA_DIR/.backend.pid"

  echo -e "${GREEN}Cleanup complete.${NC}"
}
trap cleanup EXIT INT TERM

# ---------------------------------------------------------------------------
# Step 1: Start mock backend
# ---------------------------------------------------------------------------
echo -e "${CYAN}[1/4] Starting mock backend on port $BACKEND_PORT...${NC}"

mkdir -p "$DATA_DIR/logs"

pushd "$BACKEND_DIR" > /dev/null
npx tsx src/index.ts \
  --port "$BACKEND_PORT" \
  --data-dir "$DATA_DIR" \
  --mock \
  > "$DATA_DIR/backend.log" 2>&1 &
PID_BACKEND=$!
popd > /dev/null

echo "  Backend pid: $PID_BACKEND"

# Wait for backend ready signal
echo "  Waiting for backend..."
for i in $(seq 1 60); do
  if grep -q "RobotOps Studio started" "$DATA_DIR/backend.log" 2>/dev/null; then
    echo -e "  ${GREEN}Backend ready.${NC}"
    break
  fi
  if ! kill -0 "$PID_BACKEND" 2>/dev/null; then
    echo -e "${RED}Backend exited prematurely. Log tail:${NC}"
    tail -20 "$DATA_DIR/backend.log"
    exit 1
  fi
  sleep 0.5
done

if ! kill -0 "$PID_BACKEND" 2>/dev/null; then
  echo -e "${RED}Backend failed to start.${NC}"
  exit 1
fi

# ---------------------------------------------------------------------------
# Step 2: Start Vite frontend
# ---------------------------------------------------------------------------
echo -e "${CYAN}[2/4] Starting Vite frontend on port $FRONTEND_PORT...${NC}"

pushd "$FRONTEND_DIR" > /dev/null
VITE_API_TARGET="http://localhost:$BACKEND_PORT" \
npx vite --port "$FRONTEND_PORT" --strictPort \
  > "$DATA_DIR/frontend.log" 2>&1 &
PID_FRONTEND=$!
popd > /dev/null

echo "  Frontend pid: $PID_FRONTEND"

# Wait for frontend ready signal
echo "  Waiting for frontend..."
for i in $(seq 1 60); do
  if grep -qE "Local:\s+http://localhost:$FRONTEND_PORT" "$DATA_DIR/frontend.log" 2>/dev/null; then
    echo -e "  ${GREEN}Frontend ready.${NC}"
    break
  fi
  if ! kill -0 "$PID_FRONTEND" 2>/dev/null; then
    echo -e "${RED}Frontend exited prematurely. Log tail:${NC}"
    tail -20 "$DATA_DIR/frontend.log"
    exit 1
  fi
  sleep 0.5
done

if ! kill -0 "$PID_FRONTEND" 2>/dev/null; then
  echo -e "${RED}Frontend failed to start.${NC}"
  exit 1
fi

# Extra settle time for browser compatibility
sleep 1

# ---------------------------------------------------------------------------
# Step 3: Generate manual
# ---------------------------------------------------------------------------
echo -e "${CYAN}[3/4] Generating user manual...${NC}"
echo ""

pushd "$E2E_DIR" > /dev/null
npx tsx scripts/generate-manual.ts
GEN_EXIT=$?
popd > /dev/null

echo ""

if [ $GEN_EXIT -ne 0 ]; then
  echo -e "${RED}Manual generation failed (exit code $GEN_EXIT).${NC}"
  exit $GEN_EXIT
fi

# ---------------------------------------------------------------------------
# Step 4: Report output
# ---------------------------------------------------------------------------
MANUAL_FILE="$SRC_DIR/../documents/user-manual/robotops-user-manual.md"

echo -e "${CYAN}[4/4] Generation complete${NC}"
echo ""
echo -e "${GREEN}=====================================================${NC}"
echo -e "${GREEN}  User manual generated successfully!${NC}"
echo -e "${GREEN}=====================================================${NC}"
echo ""
echo -e "  Output: ${CYAN}$(realpath "$MANUAL_FILE" 2>/dev/null || echo "$MANUAL_FILE")${NC}"
echo ""
echo "  The manual is a single self-contained markdown file"
echo "  with all screenshots embedded as base64 images."
echo "  Open with any markdown viewer (VS Code, Typora, GitHub, etc.)."
echo ""
