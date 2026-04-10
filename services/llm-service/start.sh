#!/bin/bash

# HoloScript LLM Service Startup Script

echo ""
echo "================================"
echo "HoloScript LLM Service Startup"
echo "================================"
echo ""

# Check if Ollama is running
echo "[1/3] Checking Ollama connection..."
if ! curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
    echo ""
    echo "[!] Ollama is not running!"
    echo ""
    echo "Please:"
    echo "  1. Download Ollama from https://ollama.ai"
    echo "  2. Run: ollama serve (in a separate terminal)"
    echo "  3. Pull a model: ollama pull mistral"
    echo "  4. Run this script again"
    echo ""
    exit 1
fi

echo "[✓] Ollama is running"

# Check if node_modules exists
echo "[2/3] Checking dependencies..."
if [ ! -d "node_modules" ]; then
    echo "Installing npm packages..."
    npm install
fi
echo "[✓] Dependencies ready"

# Check environment file
echo "[3/3] Checking configuration..."
if [ ! -f ".env.local" ]; then
    echo "Creating .env.local..."
    cp .env.local.example .env.local
fi
echo "[✓] Configuration ready"

echo ""
echo "================================"
echo "Starting HoloScript LLM Service"
echo "================================"
echo ""
echo "Port: http://localhost:8000"
echo "Login: user / password"
echo ""
echo "Press Ctrl+C to stop"
echo ""

# Start the service
npm run dev
