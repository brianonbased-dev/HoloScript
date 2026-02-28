#!/usr/bin/env bash
# HoloScript Archive Pruning System
# Automatically removes archives older than 30 days
# Part of autonomous build management system

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARCHIVE_DIR="$REPO_ROOT/.build-archives"
LOG_DIR="$REPO_ROOT/.build-logs"
MAX_AGE_DAYS=30
DRY_RUN=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --max-age)
            MAX_AGE_DAYS="$2"
            shift 2
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: $0 [--dry-run] [--max-age DAYS]"
            exit 1
            ;;
    esac
done

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  HoloScript Archive Pruning System${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  Max age: ${YELLOW}$MAX_AGE_DAYS days${NC}"
if [ "$DRY_RUN" = true ]; then
    echo -e "  Mode: ${YELLOW}DRY RUN (no files will be deleted)${NC}"
fi
echo ""

# Statistics
ARCHIVES_FOUND=0
ARCHIVES_PRUNED=0
LOGS_PRUNED=0
SPACE_FREED=0

# Check if archive directory exists
if [ ! -d "$ARCHIVE_DIR" ]; then
    echo -e "${YELLOW}⚠ No archive directory found${NC}"
    exit 0
fi

# Prune old archives
echo -e "${YELLOW}Phase 1: Scanning for old archives...${NC}"
if command -v find &> /dev/null; then
    while IFS= read -r -d '' archive; do
        ARCHIVES_FOUND=$((ARCHIVES_FOUND + 1))

        # Get file size
        size=$(du -sb "$archive" 2>/dev/null | cut -f1 || echo "0")

        # Get file age in days
        if [[ "$OSTYPE" == "darwin"* ]]; then
            # macOS
            mod_time=$(stat -f %m "$archive")
        else
            # Linux/Git Bash
            mod_time=$(stat -c %Y "$archive" 2>/dev/null || echo "0")
        fi

        current_time=$(date +%s)
        age_days=$(( (current_time - mod_time) / 86400 ))

        if [ "$age_days" -gt "$MAX_AGE_DAYS" ]; then
            echo -e "  ${RED}✗${NC} Pruning: $(basename "$archive") (${age_days} days old, $(numfmt --to=iec-i --suffix=B $size 2>/dev/null || echo "$((size / 1024)) KB"))"

            if [ "$DRY_RUN" = false ]; then
                rm -f "$archive" 2>/dev/null || {
                    echo -e "    ${RED}Failed to delete${NC}"
                    continue
                }
            fi

            ARCHIVES_PRUNED=$((ARCHIVES_PRUNED + 1))
            SPACE_FREED=$((SPACE_FREED + size))
        else
            echo -e "  ${GREEN}✓${NC} Keeping: $(basename "$archive") (${age_days} days old)"
        fi
    done < <(find "$ARCHIVE_DIR" -name "*.tar.gz" -type f -mtime +$MAX_AGE_DAYS -print0 2>/dev/null)
fi

# Prune old logs
if [ -d "$LOG_DIR" ]; then
    echo -e "\n${YELLOW}Phase 2: Scanning for old logs...${NC}"
    if command -v find &> /dev/null; then
        while IFS= read -r -d '' log; do
            # Get file size
            size=$(du -sb "$log" 2>/dev/null | cut -f1 || echo "0")

            echo -e "  ${RED}✗${NC} Pruning: $(basename "$log")"

            if [ "$DRY_RUN" = false ]; then
                rm -f "$log" 2>/dev/null || {
                    echo -e "    ${RED}Failed to delete${NC}"
                    continue
                }
            fi

            LOGS_PRUNED=$((LOGS_PRUNED + 1))
            SPACE_FREED=$((SPACE_FREED + size))
        done < <(find "$LOG_DIR" -name "*.log" -type f -mtime +$MAX_AGE_DAYS -print0 2>/dev/null)
    fi
fi

# Summary
echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
if [ "$DRY_RUN" = true ]; then
    echo -e "${YELLOW}⚠ Dry Run Complete${NC}"
else
    echo -e "${GREEN}✓ Pruning Complete${NC}"
fi
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "  Archives found: ${BLUE}$ARCHIVES_FOUND${NC}"
echo -e "  Archives pruned: ${RED}$ARCHIVES_PRUNED${NC}"
echo -e "  Logs pruned: ${RED}$LOGS_PRUNED${NC}"
echo -e "  Space freed: ${GREEN}$(numfmt --to=iec-i --suffix=B $SPACE_FREED 2>/dev/null || echo "$((SPACE_FREED / 1024 / 1024)) MB")${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
