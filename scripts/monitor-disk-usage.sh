#!/usr/bin/env bash
# HoloScript Disk Usage Monitor (Focus Agent)
# Monitors disk usage and triggers automatic pruning at 80% capacity
# Part of autonomous build management system

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

# Configuration
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARCHIVE_DIR="$REPO_ROOT/.build-archives"
LOG_DIR="$REPO_ROOT/.build-logs"
THRESHOLD_PCT=80
AUTO_PRUNE=true

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --threshold)
            THRESHOLD_PCT="$2"
            shift 2
            ;;
        --no-auto-prune)
            AUTO_PRUNE=false
            shift
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: $0 [--threshold PCT] [--no-auto-prune]"
            exit 1
            ;;
    esac
done

echo -e "${MAGENTA}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${MAGENTA}  HoloScript Disk Usage Monitor (Focus Agent)${NC}"
echo -e "${MAGENTA}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Get disk usage
if command -v df &> /dev/null; then
    # Get repository disk partition
    if [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "win32" ]] || [[ "$OSTYPE" == "cygwin" ]]; then
        # Windows (Git Bash)
        DISK_INFO=$(df -h "$REPO_ROOT" | tail -1)
        USED_PCT=$(echo "$DISK_INFO" | awk '{print $5}' | sed 's/%//')
        TOTAL=$(echo "$DISK_INFO" | awk '{print $2}')
        USED=$(echo "$DISK_INFO" | awk '{print $3}')
        AVAIL=$(echo "$DISK_INFO" | awk '{print $4}')
        MOUNT=$(echo "$DISK_INFO" | awk '{print $1}')
    else
        # Linux/macOS
        DISK_INFO=$(df -h "$REPO_ROOT" | tail -1)
        USED_PCT=$(echo "$DISK_INFO" | awk '{print $5}' | sed 's/%//')
        TOTAL=$(echo "$DISK_INFO" | awk '{print $2}')
        USED=$(echo "$DISK_INFO" | awk '{print $3}')
        AVAIL=$(echo "$DISK_INFO" | awk '{print $4}')
        MOUNT=$(echo "$DISK_INFO" | awk '{print $6}')
    fi

    echo -e "${BLUE}Disk Usage:${NC}"
    echo -e "  Mount point: ${BLUE}$MOUNT${NC}"
    echo -e "  Total: ${BLUE}$TOTAL${NC}"
    echo -e "  Used: ${YELLOW}$USED${NC} (${YELLOW}$USED_PCT%${NC})"
    echo -e "  Available: ${GREEN}$AVAIL${NC}"
    echo ""
else
    echo -e "${YELLOW}⚠ df command not available${NC}"
    USED_PCT=0
fi

# Get repository size
echo -e "${BLUE}Repository Breakdown:${NC}"
REPO_SIZE=$(du -sh "$REPO_ROOT" 2>/dev/null | cut -f1 || echo "unknown")
echo -e "  Total repository: ${BLUE}$REPO_SIZE${NC}"

# Get package dist sizes
DIST_SIZE=0
if command -v du &> /dev/null; then
    DIST_SIZE=$(find "$REPO_ROOT/packages" -name "dist" -type d -exec du -sb {} + 2>/dev/null | awk '{sum+=$1} END {print sum}')
    DIST_SIZE=${DIST_SIZE:-0}
    echo -e "  Build artifacts (dist/): ${YELLOW}$(numfmt --to=iec-i --suffix=B $DIST_SIZE 2>/dev/null || echo "$((DIST_SIZE / 1024 / 1024)) MB")${NC}"
fi

# Get archive sizes
if [ -d "$ARCHIVE_DIR" ]; then
    ARCHIVE_SIZE=$(du -sb "$ARCHIVE_DIR" 2>/dev/null | cut -f1 || echo "0")
    ARCHIVE_COUNT=$(find "$ARCHIVE_DIR" -name "*.tar.gz" -type f 2>/dev/null | wc -l || echo "0")
    echo -e "  Archives: ${BLUE}$(numfmt --to=iec-i --suffix=B $ARCHIVE_SIZE 2>/dev/null || echo "$((ARCHIVE_SIZE / 1024 / 1024)) MB")${NC} (${ARCHIVE_COUNT} files)"
else
    ARCHIVE_SIZE=0
    ARCHIVE_COUNT=0
    echo -e "  Archives: ${BLUE}0 B${NC} (0 files)"
fi

# Get log sizes
if [ -d "$LOG_DIR" ]; then
    LOG_SIZE=$(du -sb "$LOG_DIR" 2>/dev/null | cut -f1 || echo "0")
    LOG_COUNT=$(find "$LOG_DIR" -name "*.log" -type f 2>/dev/null | wc -l || echo "0")
    echo -e "  Error logs: ${YELLOW}$(numfmt --to=iec-i --suffix=B $LOG_SIZE 2>/dev/null || echo "$((LOG_SIZE / 1024)) KB")${NC} (${LOG_COUNT} files)"
else
    LOG_SIZE=0
    LOG_COUNT=0
    echo -e "  Error logs: ${YELLOW}0 B${NC} (0 files)"
fi

# Get node_modules size
if [ -d "$REPO_ROOT/node_modules" ]; then
    NODE_MODULES_SIZE=$(du -sh "$REPO_ROOT/node_modules" 2>/dev/null | cut -f1 || echo "unknown")
    echo -e "  node_modules: ${RED}$NODE_MODULES_SIZE${NC}"
fi

echo ""

# Check threshold and trigger actions
if [ "$USED_PCT" -ge "$THRESHOLD_PCT" ]; then
    echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${RED}⚠ DISK USAGE CRITICAL: ${USED_PCT}% (threshold: ${THRESHOLD_PCT}%)${NC}"
    echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

    if [ "$AUTO_PRUNE" = true ]; then
        echo -e "${YELLOW}Triggering automatic archive pruning...${NC}\n"

        # Run pruning script
        PRUNE_SCRIPT="$REPO_ROOT/scripts/prune-old-archives.sh"
        if [ -x "$PRUNE_SCRIPT" ]; then
            bash "$PRUNE_SCRIPT"
        else
            echo -e "${RED}✗ Pruning script not found or not executable${NC}"
        fi

        # Suggest additional actions
        echo -e "\n${YELLOW}Additional recommendations:${NC}"
        echo -e "  • Run: ${BLUE}pnpm clean${NC} to remove all dist/ directories"
        echo -e "  • Run: ${BLUE}bash scripts/archive-build-artifacts.sh${NC} to archive current builds"
        echo -e "  • Consider removing old node_modules: ${BLUE}rm -rf node_modules && pnpm install${NC}"
    else
        echo -e "\n${YELLOW}Recommendations:${NC}"
        echo -e "  • Run: ${BLUE}bash scripts/prune-old-archives.sh${NC} to remove old archives"
        echo -e "  • Run: ${BLUE}pnpm clean${NC} to remove all dist/ directories"
        echo -e "  • Run: ${BLUE}bash scripts/archive-build-artifacts.sh${NC} to archive current builds"
    fi
else
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}✓ Disk usage healthy: ${USED_PCT}% (threshold: ${THRESHOLD_PCT}%)${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
fi

# Estimate potential savings
echo -e "\n${BLUE}Potential Space Savings:${NC}"
POTENTIAL_SAVINGS=0

# If we archive and compress (estimate 70% compression for JS/TS files)
if [ "$DIST_SIZE" -gt 0 ]; then
    COMPRESSED_EST=$((DIST_SIZE * 30 / 100))
    SAVINGS=$((DIST_SIZE - COMPRESSED_EST))
    echo -e "  Archive compression: ${GREEN}~$(numfmt --to=iec-i --suffix=B $SAVINGS 2>/dev/null || echo "$((SAVINGS / 1024 / 1024)) MB")${NC} (70% compression)"
    POTENTIAL_SAVINGS=$((POTENTIAL_SAVINGS + SAVINGS))
fi

# Old archives
if [ "$ARCHIVE_SIZE" -gt 0 ]; then
    OLD_ARCHIVES=$(find "$ARCHIVE_DIR" -name "*.tar.gz" -type f -mtime +30 -exec du -sb {} + 2>/dev/null | awk '{sum+=$1} END {print sum}')
    OLD_ARCHIVES=${OLD_ARCHIVES:-0}
    if [ "$OLD_ARCHIVES" -gt 0 ]; then
        echo -e "  Prune old archives (>30 days): ${GREEN}~$(numfmt --to=iec-i --suffix=B $OLD_ARCHIVES 2>/dev/null || echo "$((OLD_ARCHIVES / 1024 / 1024)) MB")${NC}"
        POTENTIAL_SAVINGS=$((POTENTIAL_SAVINGS + OLD_ARCHIVES))
    fi
fi

if [ "$POTENTIAL_SAVINGS" -gt 0 ]; then
    SAVINGS_PCT=0
    if [ "$DIST_SIZE" -gt 0 ]; then
        SAVINGS_PCT=$((POTENTIAL_SAVINGS * 100 / DIST_SIZE))
    fi
    echo -e "  ${GREEN}Total potential: ~$(numfmt --to=iec-i --suffix=B $POTENTIAL_SAVINGS 2>/dev/null || echo "$((POTENTIAL_SAVINGS / 1024 / 1024)) MB")${NC} (${GREEN}~${SAVINGS_PCT}%${NC})"
fi

echo -e "\n${MAGENTA}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${MAGENTA}  Monitor Complete${NC}"
echo -e "${MAGENTA}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
