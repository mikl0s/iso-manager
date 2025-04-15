#!/bin/bash

set -e  # Exit on errors

# Check if the web interface directory exists
WEB_DIR="$(dirname "$0")/iso-manager-web"
if [ ! -d "$WEB_DIR" ]; then
  echo "Error: ISO Manager web interface not found at $WEB_DIR"
  exit 1
fi

# Set the port (default: 5001)
PORT=${1:-5001}

# Use /tmp for logs with a unique directory name based on the application
LOG_DIR="/tmp/iso-manager"

# Ensure log directory exists with proper permissions
mkdir -p "$LOG_DIR"
chmod 755 "$LOG_DIR"

# Create a PID file location
PID_FILE="$LOG_DIR/web-server.pid"

# Function to kill any process using our port
kill_port_process() {
  local port=$1
  echo "Checking for processes using port $port..."
  local pid=$(sudo lsof -t -i:$port 2>/dev/null)
  if [ -n "$pid" ]; then
    echo "Found process(es) using port $port: $pid"
    echo "Killing process(es)..."
    sudo kill -9 $pid 2>/dev/null
    echo "Process(es) killed."
    sleep 1
  else
    echo "No processes found using port $port."
  fi
}

# Kill any process using our port before starting
kill_port_process $PORT

# Start the web server using Node.js Express
cd "$WEB_DIR"

if [ -f "server.js" ] && command -v node &> /dev/null; then
  echo "Using Node.js Express server"
  export PORT=$PORT
  nohup node server.js > "$LOG_DIR/web-server.log" 2>&1 &
  echo $! > "$PID_FILE"
  echo "Web server started with PID $(cat "$PID_FILE") on port $PORT. Logs: $LOG_DIR/web-server.log"
else
  echo "server.js not found or Node.js not installed."
  exit 1
fi