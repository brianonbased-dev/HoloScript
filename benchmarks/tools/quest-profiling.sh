#!/bin/bash
#
# Quest 3 Deployment & Profiling Script
#
# Purpose: Automate deployment and runtime profiling on Quest 3 device
# Usage: ./quest-profiling.sh [scenario] [duration]
#
# Requirements:
# - adb installed and in PATH
# - Quest 3 connected via USB
# - Developer mode enabled on Quest
# - Built APK in Builds/ directory

set -e  # Exit on error

# Configuration
SCENARIO="${1:-01-basic-scene}"
DURATION="${2:-60}"  # seconds
APP_PACKAGE="com.holoscript.benchmark"
RESULTS_DIR="benchmarks/results/quest"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🎯 Quest 3 Profiling Script${NC}"
echo -e "   Scenario: ${SCENARIO}"
echo -e "   Duration: ${DURATION}s"
echo ""

# Check prerequisites
echo -e "${BLUE}🔍 Checking prerequisites...${NC}"

# Check adb
if ! command -v adb &> /dev/null; then
    echo -e "${RED}❌ Error: adb not found. Please install Android Debug Bridge.${NC}"
    exit 1
fi
echo -e "${GREEN}✓${NC} adb installed"

# Check Quest connection
if ! adb devices | grep -q "device$"; then
    echo -e "${RED}❌ Error: No Quest device connected. Please connect via USB.${NC}"
    exit 1
fi
echo -e "${GREEN}✓${NC} Quest 3 connected"

# Check APK exists
APK_PATH="Builds/${SCENARIO}.apk"
if [ ! -f "$APK_PATH" ]; then
    echo -e "${RED}❌ Error: APK not found at ${APK_PATH}${NC}"
    echo -e "   Please build the Unity/Unreal project first."
    exit 1
fi
echo -e "${GREEN}✓${NC} APK found: ${APK_PATH}"

# Deploy APK
echo ""
echo -e "${BLUE}📦 Deploying APK to Quest 3...${NC}"
adb install -r "$APK_PATH"
echo -e "${GREEN}✓${NC} APK deployed"

# Enable performance HUD
echo ""
echo -e "${BLUE}📊 Configuring performance monitoring...${NC}"
adb shell setprop debug.oculus.perfhud 3
echo -e "${GREEN}✓${NC} Performance HUD enabled (level 3)"

# Create results directory
mkdir -p "$RESULTS_DIR"

# Start app
echo ""
echo -e "${BLUE}🚀 Starting application...${NC}"
adb shell am start -n "${APP_PACKAGE}/.MainActivity"
sleep 5  # Wait for app startup
echo -e "${GREEN}✓${NC} Application started"

# Collect metrics
echo ""
echo -e "${BLUE}📈 Collecting metrics for ${DURATION}s...${NC}"
echo -e "   ${YELLOW}(Put on the headset to see performance overlay)${NC}"

LOG_FILE="${RESULTS_DIR}/${SCENARIO}-$(date +%Y%m%d-%H%M%S).log"

# Collect logcat for duration
timeout "${DURATION}s" adb logcat -s "VrApi:V" "Unity:D" "UE4:D" > "$LOG_FILE" || true

echo -e "${GREEN}✓${NC} Metrics collected: ${LOG_FILE}"

# Stop app
echo ""
echo -e "${BLUE}🛑 Stopping application...${NC}"
adb shell am force-stop "$APP_PACKAGE"
echo -e "${GREEN}✓${NC} Application stopped"

# Disable performance HUD
adb shell setprop debug.oculus.perfhud 0

# Parse results (if Python script exists)
echo ""
echo -e "${BLUE}🔬 Parsing results...${NC}"

PYTHON_PARSER="benchmarks/tools/parse-quest-metrics.py"
JSON_OUTPUT="${RESULTS_DIR}/${SCENARIO}-results.json"

if [ -f "$PYTHON_PARSER" ]; then
    python3 "$PYTHON_PARSER" "$LOG_FILE" > "$JSON_OUTPUT"
    echo -e "${GREEN}✓${NC} Results parsed: ${JSON_OUTPUT}"

    # Display summary
    echo ""
    echo -e "${GREEN}📊 Performance Summary:${NC}"
    cat "$JSON_OUTPUT" | python3 -m json.tool
else
    echo -e "${YELLOW}⚠${NC} Parser not found: ${PYTHON_PARSER}"
    echo -e "   Raw log available at: ${LOG_FILE}"
fi

# Success
echo ""
echo -e "${GREEN}✅ Profiling complete!${NC}"
echo ""
echo "Results:"
echo "  - Raw log: ${LOG_FILE}"
if [ -f "$JSON_OUTPUT" ]; then
    echo "  - JSON summary: ${JSON_OUTPUT}"
fi
echo ""
