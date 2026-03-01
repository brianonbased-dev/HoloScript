#!/usr/bin/env bash
# HoloScript Autonomous Build Manager
# Complete automation: build -> archive -> monitor -> prune
# Part of autonomous build management system

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="full" # full, build-only, archive-only, monitor-only

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --build-only)
            MODE="build-only"
            shift
            ;;
        --archive-only)
            MODE="archive-only"
            shift
            ;;
        --monitor-only)
            MODE="monitor-only"
            shift
            ;;
        --help)
            echo "HoloScript Autonomous Build Manager"
            echo ""
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --build-only    Only build packages (no archival)"
            echo "  --archive-only  Only archive existing builds"
            echo "  --monitor-only  Only monitor disk usage"
            echo "  --help          Show this help"
            echo ""
            echo "Default: Full autonomous workflow (build -> archive -> monitor -> prune)"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

echo -e "${CYAN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║                                                                ║${NC}"
echo -e "${CYAN}║         HoloScript Autonomous Build Manager v1.0               ║${NC}"
echo -e "${CYAN}║                                                                ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}Mode: ${YELLOW}$MODE${NC}"
echo -e "${BLUE}Time: ${YELLOW}$(date '+%Y-%m-%d %H:%M:%S')${NC}"
echo ""

# Change to repo root
cd "$REPO_ROOT"

# Phase 1: Build (if needed)
if [ "$MODE" = "full" ] || [ "$MODE" = "build-only" ]; then
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}  Phase 1: Building Packages${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    # Run build with error logging
    BUILD_LOG="$REPO_ROOT/.build-logs/build_$(date +%Y%m%d_%H%M%S).log"
    mkdir -p "$(dirname "$BUILD_LOG")"

    if pnpm build 2>&1 | tee "$BUILD_LOG"; then
        echo -e "\n${GREEN}✓ Build successful${NC}\n"
    else
        echo -e "\n${RED}✗ Build failed - errors logged to: $BUILD_LOG${NC}"
        echo -e "${YELLOW}Continuing with archive/monitor phases...${NC}\n"
    fi
fi

# Phase 2: Archive (if needed)
if [ "$MODE" = "full" ] || [ "$MODE" = "archive-only" ]; then
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}  Phase 2: Archiving Build Artifacts${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    ARCHIVE_SCRIPT="$REPO_ROOT/scripts/archive-build-artifacts.sh"
    if [ -x "$ARCHIVE_SCRIPT" ]; then
        bash "$ARCHIVE_SCRIPT"
    elif [ -f "$ARCHIVE_SCRIPT" ]; then
        chmod +x "$ARCHIVE_SCRIPT"
        bash "$ARCHIVE_SCRIPT"
    else
        echo -e "${RED}✗ Archive script not found: $ARCHIVE_SCRIPT${NC}"
    fi
    echo ""
fi

# Phase 3: Monitor (always run unless build-only)
if [ "$MODE" != "build-only" ]; then
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}  Phase 3: Monitoring Disk Usage${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    MONITOR_SCRIPT="$REPO_ROOT/scripts/monitor-disk-usage.sh"
    if [ -x "$MONITOR_SCRIPT" ]; then
        bash "$MONITOR_SCRIPT"
    elif [ -f "$MONITOR_SCRIPT" ]; then
        chmod +x "$MONITOR_SCRIPT"
        bash "$MONITOR_SCRIPT"
    else
        echo -e "${RED}✗ Monitor script not found: $MONITOR_SCRIPT${NC}"
    fi
    echo ""
fi

# Summary
echo -e "${CYAN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║                                                                ║${NC}"
echo -e "${CYAN}║                 Autonomous Build Cycle Complete                ║${NC}"
echo -e "${CYAN}║                                                                ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}Completed: ${GREEN}$(date '+%Y-%m-%d %H:%M:%S')${NC}"
echo ""
echo -e "${YELLOW}Next actions:${NC}"
echo -e "  • Review archives: ${BLUE}ls -lh .build-archives/${NC}"
echo -e "  • Check logs: ${BLUE}ls -lh .build-logs/${NC}"
echo -e "  • Restore archive: ${BLUE}bash scripts/restore-build-archive.sh <name|latest>${NC}"
echo -e "  • Manual prune: ${BLUE}bash scripts/prune-old-archives.sh${NC}"
echo ""
