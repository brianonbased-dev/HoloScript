#!/bin/bash
# AR Foundation Examples - Automated Validation Script
# Tests syntax, compilation, and trait coverage for AR examples
# Usage: ./validate-ar-examples.sh [--ios|--android|--unity|--all]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOLOSCRIPT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
EXAMPLES_DIR="$SCRIPT_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0
WARNINGS=0

# Test results
declare -a RESULTS

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
    PASSED_TESTS=$((PASSED_TESTS + 1))
    RESULTS+=("✅ $1")
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    FAILED_TESTS=$((FAILED_TESTS + 1))
    RESULTS+=("❌ $1")
}

log_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
    WARNINGS=$((WARNINGS + 1))
    RESULTS+=("⚠️  $1")
}

# Parse arguments
TARGET="${1:-all}"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  AR Foundation Examples Validation"
echo "  Target: $TARGET"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Test 1: Check example files exist
log_info "Test 1: Checking example files..."
TOTAL_TESTS=$((TOTAL_TESTS + 1))

EXPECTED_FILES=(
    "plane-detection.holo"
    "geospatial-ar.holo"
    "mesh-scanning.holo"
    "light-estimation.holo"
    "persistent-anchors.holo"
)

MISSING_FILES=()
for file in "${EXPECTED_FILES[@]}"; do
    if [ -f "$EXAMPLES_DIR/$file" ]; then
        log_success "Found: $file"
    else
        log_fail "Missing: $file"
        MISSING_FILES+=("$file")
    fi
done

if [ ${#MISSING_FILES[@]} -eq 0 ]; then
    log_success "All expected files present (5/5)"
else
    log_fail "Missing ${#MISSING_FILES[@]} files: ${MISSING_FILES[*]}"
fi

# Test 2: Check for missing examples
log_info ""
log_info "Test 2: Checking for missing AR Foundation examples..."
TOTAL_TESTS=$((TOTAL_TESTS + 1))

if [ ! -f "$EXAMPLES_DIR/image-tracking.holo" ]; then
    log_warning "Missing: image-tracking.holo (critical AR feature)"
else
    log_success "Found: image-tracking.holo"
fi

if [ ! -f "$EXAMPLES_DIR/face-tracking.holo" ]; then
    log_warning "Missing: face-tracking.holo (critical AR feature)"
else
    log_success "Found: face-tracking.holo"
fi

# Test 3: Syntax validation
log_info ""
log_info "Test 3: Validating HoloScript syntax..."

cd "$HOLOSCRIPT_ROOT"

for file in "${EXPECTED_FILES[@]}"; do
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    filepath="$EXAMPLES_DIR/$file"

    if [ ! -f "$filepath" ]; then
        log_fail "Syntax check skipped: $file (file not found)"
        continue
    fi

    # Check if file is valid HoloScript (basic syntax check)
    if grep -q "^composition " "$filepath"; then
        log_success "Syntax check: $file (valid composition)"
    else
        log_fail "Syntax check: $file (no composition found)"
    fi
done

# Test 4: Trait usage validation
log_info ""
log_info "Test 4: Validating AR trait usage..."

declare -A TRAIT_USAGE=(
    ["plane-detection.holo"]="@plane_detection|@anchor|@light_estimation"
    ["geospatial-ar.holo"]="@geospatial|@geospatial_anchor|@vps|@terrain_anchor"
    ["mesh-scanning.holo"]="@mesh_detection|@dynamic_mesh|@occlusion"
    ["light-estimation.holo"]="@light_estimation"
    ["persistent-anchors.holo"]="@persistent_anchor|@cloud_anchor|@shared_anchor"
)

for file in "${!TRAIT_USAGE[@]}"; do
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    filepath="$EXAMPLES_DIR/$file"

    if [ ! -f "$filepath" ]; then
        log_fail "Trait check skipped: $file (file not found)"
        continue
    fi

    expected_traits="${TRAIT_USAGE[$file]}"

    if grep -qE "$expected_traits" "$filepath"; then
        log_success "Trait usage: $file (expected traits found)"
    else
        log_fail "Trait usage: $file (missing expected traits: $expected_traits)"
    fi
done

# Test 5: Platform compatibility checks
log_info ""
log_info "Test 5: Checking platform compatibility markers..."

for file in "${EXPECTED_FILES[@]}"; do
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    filepath="$EXAMPLES_DIR/$file"

    if [ ! -f "$filepath" ]; then
        log_fail "Platform check skipped: $file (file not found)"
        continue
    fi

    # Check for platform metadata
    if grep -q 'platform:.*\["ios".*"android"\]' "$filepath"; then
        log_success "Platform support: $file (iOS + Android)"
    elif grep -q 'platform:.*\["android"\]' "$filepath"; then
        log_warning "Platform support: $file (Android only)"
    elif grep -q 'platform:.*\["ios"\]' "$filepath"; then
        log_warning "Platform support: $file (iOS only)"
    else
        log_fail "Platform support: $file (no platform metadata)"
    fi
done

# Test 6: Compilation tests (optional, requires HoloScript CLI)
if [ "$TARGET" != "all" ] && [ "$TARGET" != "--skip-compile" ]; then
    log_info ""
    log_info "Test 6: Testing compilation for target: $TARGET..."

    # Check if holoscript CLI is available
    if ! command -v holoscript &> /dev/null; then
        log_warning "HoloScript CLI not found, skipping compilation tests"
        log_warning "Install with: npm install -g @holoscript/cli"
    else
        for file in "${EXPECTED_FILES[@]}"; do
            TOTAL_TESTS=$((TOTAL_TESTS + 1))
            filepath="$EXAMPLES_DIR/$file"

            if [ ! -f "$filepath" ]; then
                log_fail "Compilation skipped: $file (file not found)"
                continue
            fi

            target_platform=""
            case "$TARGET" in
                --ios)
                    target_platform="ios"
                    ;;
                --android)
                    target_platform="android"
                    ;;
                --unity)
                    target_platform="unity"
                    ;;
            esac

            log_info "Compiling $file for $target_platform..."

            if holoscript compile "$filepath" --target "$target_platform" --dry-run 2>&1 | grep -q "Success"; then
                log_success "Compilation: $file → $target_platform"
            else
                log_fail "Compilation: $file → $target_platform (failed)"
            fi
        done
    fi
else
    log_info ""
    log_info "Test 6: Skipping compilation tests (use --ios, --android, or --unity to enable)"
fi

# Test 7: Check for AR environment configuration
log_info ""
log_info "Test 7: Validating AR environment configuration..."

for file in "${EXPECTED_FILES[@]}"; do
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    filepath="$EXAMPLES_DIR/$file"

    if [ ! -f "$filepath" ]; then
        log_fail "Environment check skipped: $file (file not found)"
        continue
    fi

    if grep -q "ar_mode: true" "$filepath"; then
        log_success "AR environment: $file (ar_mode enabled)"
    else
        log_fail "AR environment: $file (ar_mode not enabled)"
    fi
done

# Test 8: Check for state management
log_info ""
log_info "Test 8: Checking state management patterns..."

for file in "${EXPECTED_FILES[@]}"; do
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    filepath="$EXAMPLES_DIR/$file"

    if [ ! -f "$filepath" ]; then
        log_fail "State check skipped: $file (file not found)"
        continue
    fi

    if grep -q "state_machine" "$filepath"; then
        log_success "State management: $file (state_machine found)"
    elif grep -q "state {" "$filepath"; then
        log_success "State management: $file (state blocks found)"
    else
        log_warning "State management: $file (no state management detected)"
    fi
done

# Test 9: Check for analytics integration
log_info ""
log_info "Test 9: Checking analytics integration..."

for file in "${EXPECTED_FILES[@]}"; do
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    filepath="$EXAMPLES_DIR/$file"

    if [ ! -f "$filepath" ]; then
        log_fail "Analytics check skipped: $file (file not found)"
        continue
    fi

    if grep -q "analytics {" "$filepath"; then
        log_success "Analytics: $file (analytics block found)"
    else
        log_warning "Analytics: $file (no analytics integration)"
    fi
done

# Test 10: Check for gesture support
log_info ""
log_info "Test 10: Checking gesture support..."

for file in "${EXPECTED_FILES[@]}"; do
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    filepath="$EXAMPLES_DIR/$file"

    if [ ! -f "$filepath" ]; then
        log_fail "Gesture check skipped: $file (file not found)"
        continue
    fi

    if grep -q "gesture " "$filepath"; then
        log_success "Gestures: $file (gesture definitions found)"
    else
        log_warning "Gestures: $file (no gesture support)"
    fi
done

# Summary
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Validation Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo -e "Total Tests: ${BLUE}$TOTAL_TESTS${NC}"
echo -e "Passed: ${GREEN}$PASSED_TESTS${NC}"
echo -e "Failed: ${RED}$FAILED_TESTS${NC}"
echo -e "Warnings: ${YELLOW}$WARNINGS${NC}"
echo ""

# Calculate pass rate
if [ $TOTAL_TESTS -gt 0 ]; then
    PASS_RATE=$((100 * PASSED_TESTS / TOTAL_TESTS))
    echo -e "Pass Rate: ${BLUE}${PASS_RATE}%${NC}"
    echo ""
fi

# Show results
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Detailed Results"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

for result in "${RESULTS[@]}"; do
    echo "$result"
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Recommendations
echo ""
echo "Recommendations:"
echo ""

if [ $FAILED_TESTS -gt 0 ]; then
    echo -e "${RED}[CRITICAL]${NC} Fix failed tests before production deployment"
fi

if [ ! -f "$EXAMPLES_DIR/image-tracking.holo" ]; then
    echo -e "${YELLOW}[HIGH]${NC} Create image-tracking.holo example (critical AR feature)"
fi

if [ ! -f "$EXAMPLES_DIR/face-tracking.holo" ]; then
    echo -e "${YELLOW}[HIGH]${NC} Create face-tracking.holo example (critical AR feature)"
fi

if [ $WARNINGS -gt 0 ]; then
    echo -e "${YELLOW}[MEDIUM]${NC} Address $WARNINGS warnings for production readiness"
fi

echo ""
echo "Full report: AR_FOUNDATION_VALIDATION_REPORT.md"
echo ""

# Exit code
if [ $FAILED_TESTS -gt 0 ]; then
    exit 1
else
    exit 0
fi
