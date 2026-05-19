#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NCM_DIR="$ROOT_DIR/ncm-enhanced-api"
RUN_DIR="$ROOT_DIR/.claudio-run"
LOG_DIR="$RUN_DIR/logs"

CLAUDIO_PORT=3000
NCM_PORT=3001
NCM_BASE_URL="${NCM_BASE_URL:-http://localhost:${NCM_PORT}}"

mkdir -p "$LOG_DIR"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing command: $1"
    exit 1
  fi
}

is_port_listening() {
  lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
}

port_pids() {
  lsof -tiTCP:"$1" -sTCP:LISTEN 2>/dev/null | tr '\n' ' '
}

wait_for_port() {
  local port="$1"
  local seconds="$2"
  local i

  for ((i = 1; i <= seconds; i++)); do
    if is_port_listening "$port"; then
      return 0
    fi
    sleep 1
  done

  return 1
}

ensure_node_modules() {
  local dir="$1"
  local name="$2"

  if [ ! -f "$dir/package.json" ]; then
    echo "Missing $name package.json: $dir/package.json"
    exit 1
  fi

  if [ ! -d "$dir/node_modules" ]; then
    echo "Installing $name dependencies..."
    (cd "$dir" && npm install)
  fi
}

start_ncm() {
  local log_file="$LOG_DIR/ncm-enhanced.log"
  local pid_file="$RUN_DIR/ncm-enhanced.pid"

  if is_port_listening "$NCM_PORT"; then
    echo "NCM Enhanced is already running on port $NCM_PORT (PID: $(port_pids "$NCM_PORT"))"
    return
  fi

  echo "Starting NCM Enhanced on port $NCM_PORT..."
  (
    cd "$NCM_DIR"
    nohup npm start >"$log_file" 2>&1 &
    echo $! >"$pid_file"
  )

  if wait_for_port "$NCM_PORT" 30; then
    echo "NCM Enhanced started (PID: $(cat "$pid_file"))"
  else
    echo "NCM Enhanced failed to start. Log: $log_file"
    tail -n 30 "$log_file" 2>/dev/null || true
    exit 1
  fi
}

start_claudio() {
  local log_file="$LOG_DIR/claudio.log"
  local pid_file="$RUN_DIR/claudio.pid"

  if is_port_listening "$CLAUDIO_PORT"; then
    echo "Claudio is already running on port $CLAUDIO_PORT (PID: $(port_pids "$CLAUDIO_PORT"))"
    return
  fi

  echo "Starting Claudio on port $CLAUDIO_PORT..."
  (
    cd "$ROOT_DIR"
    nohup env NCM_BASE_URL="$NCM_BASE_URL" PORT="$CLAUDIO_PORT" npm start >"$log_file" 2>&1 &
    echo $! >"$pid_file"
  )

  if wait_for_port "$CLAUDIO_PORT" 30; then
    echo "Claudio started (PID: $(cat "$pid_file"))"
  else
    echo "Claudio failed to start. Log: $log_file"
    tail -n 30 "$log_file" 2>/dev/null || true
    exit 1
  fi
}

require_command node
require_command npm
require_command lsof

ensure_node_modules "$ROOT_DIR" "Claudio"
ensure_node_modules "$NCM_DIR" "NCM Enhanced"

start_ncm
start_claudio

echo
echo "Services are ready:"
echo "  Claudio:      http://localhost:$CLAUDIO_PORT"
echo "  NCM Enhanced: $NCM_BASE_URL/inner/version"
echo
echo "Logs:"
echo "  Claudio:      $LOG_DIR/claudio.log"
echo "  NCM Enhanced: $LOG_DIR/ncm-enhanced.log"
echo
echo "To stop them from terminal:"
echo "  lsof -tiTCP:$CLAUDIO_PORT -sTCP:LISTEN | xargs kill"
echo "  lsof -tiTCP:$NCM_PORT -sTCP:LISTEN | xargs kill"
