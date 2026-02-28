#!/usr/bin/env bash
# HoloScript Build Management System Verification
# Tests all components and reports system health

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TOTAL_CHECKS=0
PASSED_CHECKS=0
FAILED_CHECKS=0

echo -e "${CYAN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║                                                                ║${NC}"
echo -e "${CYAN}║      HoloScript Build Management System Verification           ║${NC}"
echo -e "${CYAN}║                                                                ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

check_pass() {
    echo -e "  ${GREEN}✓${NC} $1"
    PASSED_CHECKS=$((PASSED_CHECKS + 1))
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
}

check_fail() {
    echo -e "  ${RED}✗${NC} $1"
    FAILED_CHECKS=$((FAILED_CHECKS + 1))
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
}

check_warn() {
    echo -e "  ${YELLOW}⚠${NC} $1"
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
}

# Check 1: Scripts exist
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Check 1: Script Files${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

SCRIPTS=(
    "archive-build-artifacts.sh"
    "prune-old-archives.sh"
    "monitor-disk-usage.sh"
    "restore-build-archive.sh"
    "auto-build-manager.sh"
)

for script in "${SCRIPTS[@]}"; do
    if [ -f "$REPO_ROOT/scripts/$script" ]; then
        if [ -x "$REPO_ROOT/scripts/$script" ]; then
            check_pass "$script exists and is executable"
        else
            check_warn "$script exists but not executable"
        fi
    else
        check_fail "$script not found"
    fi
done

# Check 2: Documentation exists
echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Check 2: Documentation${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

if [ -f "$REPO_ROOT/scripts/BUILD_MANAGEMENT.md" ]; then
    SIZE=$(wc -l < "$REPO_ROOT/scripts/BUILD_MANAGEMENT.md")
    check_pass "BUILD_MANAGEMENT.md exists ($SIZE lines)"
else
    check_fail "BUILD_MANAGEMENT.md not found"
fi

if [ -f "$REPO_ROOT/BUILD_ARTIFACT_MANAGEMENT_SUMMARY.md" ]; then
    SIZE=$(wc -l < "$REPO_ROOT/BUILD_ARTIFACT_MANAGEMENT_SUMMARY.md")
    check_pass "BUILD_ARTIFACT_MANAGEMENT_SUMMARY.md exists ($SIZE lines)"
else
    check_fail "BUILD_ARTIFACT_MANAGEMENT_SUMMARY.md not found"
fi

# Check 3: package.json integration
echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Check 3: package.json Commands${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

COMMANDS=(
    "build:auto"
    "build:archive"
    "build:restore"
    "build:monitor"
    "build:prune"
)

for cmd in "${COMMANDS[@]}"; do
    if grep -q "\"$cmd\":" "$REPO_ROOT/package.json" 2>/dev/null; then
        check_pass "pnpm $cmd command registered"
    else
        check_fail "pnpm $cmd command not found"
    fi
done

# Check 4: .gitignore updated
echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Check 4: Git Integration${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

if grep -q "\.build-archives/" "$REPO_ROOT/.gitignore" 2>/dev/null; then
    check_pass ".build-archives/ in .gitignore"
else
    check_fail ".build-archives/ not in .gitignore"
fi

if grep -q "\.build-logs/" "$REPO_ROOT/.gitignore" 2>/dev/null; then
    check_pass ".build-logs/ in .gitignore"
else
    check_fail ".build-logs/ not in .gitignore"
fi

# Check 5: Current state
echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Check 5: Current System State${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Count dist directories
DIST_COUNT=$(find "$REPO_ROOT/packages" -name "dist" -type d 2>/dev/null | wc -l || echo "0")
if [ "$DIST_COUNT" -gt 0 ]; then
    DIST_SIZE=$(find "$REPO_ROOT/packages" -name "dist" -type d -exec du -sb {} + 2>/dev/null | awk '{sum+=$1} END {print sum}' || echo "0")
    DIST_SIZE=${DIST_SIZE:-0}
    echo -e "  ${BLUE}ℹ${NC} Found $DIST_COUNT dist/ directories ($(numfmt --to=iec-i --suffix=B $DIST_SIZE 2>/dev/null || echo "$((DIST_SIZE / 1024 / 1024)) MB"))"
    check_pass "Build artifacts present (ready to archive)"
else
    check_warn "No dist/ directories found (run pnpm build first)"
fi

# Check archive directory
if [ -d "$REPO_ROOT/.build-archives" ]; then
    ARCHIVE_COUNT=$(find "$REPO_ROOT/.build-archives" -name "*.tar.gz" -type f 2>/dev/null | wc -l || echo "0")
    if [ "$ARCHIVE_COUNT" -gt 0 ]; then
        ARCHIVE_SIZE=$(du -sb "$REPO_ROOT/.build-archives" 2>/dev/null | cut -f1 || echo "0")
        echo -e "  ${BLUE}ℹ${NC} Found $ARCHIVE_COUNT archives ($(numfmt --to=iec-i --suffix=B $ARCHIVE_SIZE 2>/dev/null || echo "$((ARCHIVE_SIZE / 1024 / 1024)) MB"))"
        check_pass "Archive directory operational"
    else
        check_warn "Archive directory exists but empty (no archives yet)"
    fi
else
    check_warn "Archive directory not created yet (will be created on first archive)"
fi

# Check log directory
if [ -d "$REPO_ROOT/.build-logs" ]; then
    LOG_COUNT=$(find "$REPO_ROOT/.build-logs" -name "*.log" -type f 2>/dev/null | wc -l || echo "0")
    if [ "$LOG_COUNT" -gt 0 ]; then
        LOG_SIZE=$(du -sb "$REPO_ROOT/.build-logs" 2>/dev/null | cut -f1 || echo "0")
        echo -e "  ${BLUE}ℹ${NC} Found $LOG_COUNT error logs ($(numfmt --to=iec-i --suffix=B $LOG_SIZE 2>/dev/null || echo "$((LOG_SIZE / 1024)) KB"))"
        check_pass "Log directory operational"
    else
        check_warn "Log directory exists but empty (no errors logged)"
    fi
else
    check_warn "Log directory not created yet (will be created on first archive)"
fi

# Check 6: Dependencies
echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Check 6: System Dependencies${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

DEPS=("bash" "tar" "gzip" "find" "du" "df" "awk" "sed")

for dep in "${DEPS[@]}"; do
    if command -v "$dep" &> /dev/null; then
        VERSION=$($dep --version 2>&1 | head -1 || echo "unknown")
        check_pass "$dep available"
    else
        check_fail "$dep not found"
    fi
done

# Summary
echo -e "\n${CYAN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║                                                                ║${NC}"
echo -e "${CYAN}║                    Verification Summary                        ║${NC}"
echo -e "${CYAN}║                                                                ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  Total Checks: ${BLUE}$TOTAL_CHECKS${NC}"
echo -e "  Passed: ${GREEN}$PASSED_CHECKS${NC}"
echo -e "  Failed: ${RED}$FAILED_CHECKS${NC}"
echo -e "  Warnings: ${YELLOW}$((TOTAL_CHECKS - PASSED_CHECKS - FAILED_CHECKS))${NC}"
echo ""

if [ "$FAILED_CHECKS" -eq 0 ]; then
    echo -e "${GREEN}✓ All critical checks passed!${NC}"
    echo ""
    echo -e "${YELLOW}Next steps:${NC}"
    echo -e "  1. Run: ${BLUE}pnpm build${NC} (if no dist/ directories exist)"
    echo -e "  2. Run: ${BLUE}pnpm build:archive${NC} to test archival"
    echo -e "  3. Run: ${BLUE}pnpm build:monitor${NC} to check disk usage"
    echo -e "  4. Run: ${BLUE}pnpm build:auto${NC} for full lifecycle"
    echo ""
    exit 0
else
    echo -e "${RED}✗ Some checks failed. Review output above.${NC}"
    echo ""
    exit 1
fi
