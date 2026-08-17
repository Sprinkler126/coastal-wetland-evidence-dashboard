@echo off
echo =========================================
echo   Wetland Driver Analysis Dashboard
echo =========================================
echo.
echo   Open in your browser: http://localhost:8000
echo   Press Ctrl+C to stop the server
echo.
cd /d "%~dp0"
python -m http.server 8000
