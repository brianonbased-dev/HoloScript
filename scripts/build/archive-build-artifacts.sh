#!/usr/bin/env bash
# HoloScript Build Artifact Archival System
# Archives successful builds into tar.gz, deletes uncompressed artifacts, retains error logs
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
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Statistics
TOTAL_BEFORE=0
TOTAL_AFTER=0
TOTAL_ARCHIVED=0
PACKAGES_PROCESSED=0
ERRORS_RETAINED=0

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  HoloScript Build Artifact Archival System${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Create archive directories
mkdir -p "$ARCHIVE_DIR"
mkdir -p "$LOG_DIR"

# Calculate current disk usage
echo -e "${YELLOW}Phase 1: Calculating current disk usage...${NC}"
if command -v du &> /dev/null; then
    TOTAL_BEFORE=$(find "$REPO_ROOT/packages" -name "dist" -type d -exec du -sb {} + 2>/dev/null | awk '{sum+=$1} END {print sum}')
    echo -e "  Current dist/ size: ${GREEN}$(numfmt --to=iec-i --suffix=B $TOTAL_BEFORE 2>/dev/null || echo "$((TOTAL_BEFORE / 1024 / 1024)) MB")${NC}"
fi

# Archive successful builds
echo -e "\n${YELLOW}Phase 2: Archiving successful builds...${NC}"
for package_dir in "$REPO_ROOT/packages"/*; do
    if [ ! -d "$package_dir" ]; then
        continue
    fi

    package_name=$(basename "$package_dir")
    dist_dir="$package_dir/dist"

    if [ ! -d "$dist_dir" ]; then
        continue
    fi

    # Check if this is a successful build (has index.js or other artifacts)
    if [ -f "$dist_dir/index.js" ] || [ -f "$dist_dir/index.mjs" ] || [ -n "$(find "$dist_dir" -name "*.js" | head -1)" ]; then
        echo -e "  ${GREEN}✓${NC} Archiving: $package_name"

        # Create archive
        archive_name="${package_name}_${TIMESTAMP}.tar.gz"
        archive_path="$ARCHIVE_DIR/$archive_name"

        # Calculate size before compression
        size_before=$(du -sb "$dist_dir" 2>/dev/null | cut -f1 || echo "0")

        # Create tar.gz archive
        (cd "$package_dir" && tar -czf "$archive_path" dist/ 2>/dev/null) || {
            echo -e "    ${RED}✗${NC} Failed to create archive"
            continue
        }

        # Calculate archive size
        archive_size=$(du -sb "$archive_path" 2>/dev/null | cut -f1 || echo "0")

        # Calculate compression ratio
        if [ "$size_before" -gt 0 ]; then
            ratio=$((archive_size * 100 / size_before))
            echo -e "    Compressed: ${GREEN}$((100 - ratio))%${NC} ($(numfmt --to=iec-i --suffix=B $size_before 2>/dev/null || echo "$((size_before / 1024)) KB") → $(numfmt --to=iec-i --suffix=B $archive_size 2>/dev/null || echo "$((archive_size / 1024)) KB"))"
        fi

        TOTAL_ARCHIVED=$((TOTAL_ARCHIVED + archive_size))
        PACKAGES_PROCESSED=$((PACKAGES_PROCESSED + 1))
    else
        echo -e "  ${YELLOW}⊘${NC} Skipping: $package_name (no build artifacts)"
    fi
done

# Move error logs to dedicated directory
echo -e "\n${YELLOW}Phase 3: Retaining error logs...${NC}"
for log_file in "$REPO_ROOT"/*.log "$REPO_ROOT"/packages/*/*.log; do
    if [ -f "$log_file" ]; then
        # Check if log contains errors
        if grep -qi "error\|failed\|exception" "$log_file" 2>/dev/null; then
            log_name=$(basename "$log_file")
            cp "$log_file" "$LOG_DIR/${TIMESTAMP}_${log_name}" 2>/dev/null || true
            ERRORS_RETAINED=$((ERRORS_RETAINED + 1))
            echo -e "  ${YELLOW}⚠${NC} Retained: $log_name"
        fi
    fi
done

# Delete uncompressed dist directories
echo -e "\n${YELLOW}Phase 4: Deleting uncompressed artifacts...${NC}"
for package_dir in "$REPO_ROOT/packages"/*; do
    if [ ! -d "$package_dir" ]; then
        continue
    fi

    package_name=$(basename "$package_dir")
    dist_dir="$package_dir/dist"

    if [ -d "$dist_dir" ]; then
        # Delete dist directory
        rm -rf "$dist_dir" 2>/dev/null || {
            echo -e "  ${RED}✗${NC} Failed to delete: $package_name/dist"
            continue
        }
        echo -e "  ${GREEN}✓${NC} Deleted: $package_name/dist"
    fi
done

# Calculate final disk usage
echo -e "\n${YELLOW}Phase 5: Calculating space savings...${NC}"
if command -v du &> /dev/null; then
    TOTAL_AFTER=$(find "$REPO_ROOT/packages" -name "dist" -type d -exec du -sb {} + 2>/dev/null | awk '{sum+=$1} END {print sum}')
    TOTAL_AFTER=${TOTAL_AFTER:-0}
    SAVINGS=$((TOTAL_BEFORE - TOTAL_AFTER - TOTAL_ARCHIVED))
    SAVINGS_PCT=0

    if [ "$TOTAL_BEFORE" -gt 0 ]; then
        SAVINGS_PCT=$(((TOTAL_BEFORE - TOTAL_AFTER - TOTAL_ARCHIVED) * 100 / TOTAL_BEFORE))
    fi

    echo -e "  Before:   ${RED}$(numfmt --to=iec-i --suffix=B $TOTAL_BEFORE 2>/dev/null || echo "$((TOTAL_BEFORE / 1024 / 1024)) MB")${NC}"
    echo -e "  Archives: ${BLUE}$(numfmt --to=iec-i --suffix=B $TOTAL_ARCHIVED 2>/dev/null || echo "$((TOTAL_ARCHIVED / 1024 / 1024)) MB")${NC}"
    echo -e "  After:    ${GREEN}$(numfmt --to=iec-i --suffix=B $TOTAL_AFTER 2>/dev/null || echo "$((TOTAL_AFTER / 1024 / 1024)) MB")${NC}"
    echo -e "  Saved:    ${GREEN}$(numfmt --to=iec-i --suffix=B $SAVINGS 2>/dev/null || echo "$((SAVINGS / 1024 / 1024)) MB")${NC} (${GREEN}${SAVINGS_PCT}%${NC})"
fi

# Summary
echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✓ Archival Complete${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "  Packages processed: ${GREEN}$PACKAGES_PROCESSED${NC}"
echo -e "  Error logs retained: ${YELLOW}$ERRORS_RETAINED${NC}"
echo -e "  Archives location: ${BLUE}$ARCHIVE_DIR${NC}"
echo -e "  Logs location: ${YELLOW}$LOG_DIR${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
