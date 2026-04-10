@echo off
REM HoloScript LLM Service Startup Script for Windows

echo.
echo ================================
echo HoloScript LLM Service Startup
echo ================================
echo.

REM Check if Ollama is running
echo [1/3] Checking Ollama connection...
timeout /t 1 /nobreak > nul

curl -s http://localhost:11434/api/tags > nul 2>&1
if errorlevel 1 (
    echo.
    echo [!] Ollama is not running!
    echo.
    echo Please:
    echo   1. Download Ollama from https://ollama.ai
    echo   2. Run: ollama serve (in a separate terminal)
    echo   3. Pull a model: ollama pull mistral
    echo   4. Run this script again
    echo.
    pause
    exit /b 1
)

echo [✓] Ollama is running

REM Check if node_modules exists
echo [2/3] Checking dependencies...
if not exist "node_modules" (
    echo Installing npm packages...
    call npm install
)
echo [✓] Dependencies ready

REM Check environment file
echo [3/3] Checking configuration...
if not exist ".env.local" (
    echo Creating .env.local...
    copy .env.local.example .env.local
)
echo [✓] Configuration ready

echo.
echo ================================
echo Starting HoloScript LLM Service
echo ================================
echo.
echo Port: http://localhost:8000
echo Login: user / password
echo.
echo Press Ctrl+C to stop
echo.

REM Start the service
call npm run dev

pause
