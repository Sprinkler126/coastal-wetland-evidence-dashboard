#!/bin/bash
# Start a local web server (Mac / Linux / Windows Git Bash)
cd "$(dirname "$0")"
echo "========================================="
echo "  Wetland Driver Analysis Dashboard"
echo "========================================="
echo ""
echo "  Open in your browser: http://localhost:8000"
echo "  Press Ctrl+C to stop the server"
echo ""
python3 -m http.server 8000 2>/dev/null || python -m http.server 8000
