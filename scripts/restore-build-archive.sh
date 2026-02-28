#!/usr/bin/env bash
# HoloScript Build Archive Restoration System
# Restores archived builds from tar.gz files
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

# Parse arguments
if [ $# -lt 1 ]; then
    echo -e "${YELLOW}Usage: $0 <archive-name|package-name|latest>${NC}"
    echo ""
    echo -e "${BLUE}Available archives:${NC}"
    if [ -d "$ARCHIVE_DIR" ]; then
        ls -lh "$ARCHIVE_DIR"/*.tar.gz 2>/dev/null | awk '{print "  " $9}' || echo -e "  ${YELLOW}No archives found${NC}"
    else
        echo -e "  ${YELLOW}No archive directory found${NC}"
    fi
    exit 1
fi

TARGET="$1"

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  HoloScript Build Archive Restoration${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Check if archive directory exists
if [ ! -d "$ARCHIVE_DIR" ]; then
    echo -e "${RED}✗ No archive directory found${NC}"
    exit 1
fi

# Determine archive file
ARCHIVE_FILE=""

if [ "$TARGET" = "latest" ]; then
    # Find latest archive
    ARCHIVE_FILE=$(find "$ARCHIVE_DIR" -name "*.tar.gz" -type f -printf '%T+ %p\n' 2>/dev/null | sort -r | head -1 | cut -d' ' -f2-)
    if [ -z "$ARCHIVE_FILE" ]; then
        echo -e "${RED}✗ No archives found${NC}"
        exit 1
    fi
    echo -e "${YELLOW}Restoring latest archive: $(basename "$ARCHIVE_FILE")${NC}\n"
elif [ -f "$ARCHIVE_DIR/$TARGET" ]; then
    # Direct archive file
    ARCHIVE_FILE="$ARCHIVE_DIR/$TARGET"
elif [ -f "$TARGET" ]; then
    # Full path provided
    ARCHIVE_FILE="$TARGET"
else
    # Search by package name
    ARCHIVE_FILE=$(find "$ARCHIVE_DIR" -name "${TARGET}_*.tar.gz" -type f -printf '%T+ %p\n' 2>/dev/null | sort -r | head -1 | cut -d' ' -f2-)
    if [ -z "$ARCHIVE_FILE" ]; then
        echo -e "${RED}✗ No archive found matching: $TARGET${NC}"
        exit 1
    fi
    echo -e "${YELLOW}Restoring latest archive for package: $(basename "$ARCHIVE_FILE")${NC}\n"
fi

# Extract package name from archive
ARCHIVE_NAME=$(basename "$ARCHIVE_FILE" .tar.gz)
PACKAGE_NAME=$(echo "$ARCHIVE_NAME" | sed 's/_[0-9]*$//')

echo -e "${BLUE}Archive:${NC} $ARCHIVE_NAME"
echo -e "${BLUE}Package:${NC} $PACKAGE_NAME"
echo ""

# Find package directory
PACKAGE_DIR="$REPO_ROOT/packages/$PACKAGE_NAME"
if [ ! -d "$PACKAGE_DIR" ]; then
    echo -e "${RED}✗ Package directory not found: $PACKAGE_DIR${NC}"
    exit 1
fi

# Check if dist already exists
if [ -d "$PACKAGE_DIR/dist" ]; then
    echo -e "${YELLOW}⚠ dist/ directory already exists${NC}"
    read -p "Overwrite? [y/N] " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${YELLOW}Restoration cancelled${NC}"
        exit 0
    fi
    rm -rf "$PACKAGE_DIR/dist"
fi

# Extract archive
echo -e "${YELLOW}Extracting archive...${NC}"
(cd "$PACKAGE_DIR" && tar -xzf "$ARCHIVE_FILE") || {
    echo -e "${RED}✗ Failed to extract archive${NC}"
    exit 1
}

# Verify extraction
if [ -d "$PACKAGE_DIR/dist" ]; then
    SIZE=$(du -sh "$PACKAGE_DIR/dist" 2>/dev/null | cut -f1)
    FILE_COUNT=$(find "$PACKAGE_DIR/dist" -type f | wc -l)
    echo -e "${GREEN}✓ Successfully restored: $SIZE ($FILE_COUNT files)${NC}"
else
    echo -e "${RED}✗ Extraction failed - no dist/ directory created${NC}"
    exit 1
fi

echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✓ Restoration Complete${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
