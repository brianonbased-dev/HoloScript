#!/bin/bash
# Test Suite for Bundle Reflection Pattern
# Validates core functionality without requiring real project

set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Test directory
TEST_DIR="$HOME/.claude/skills/frontend/tests/mock-project"
SCRIPT_DIR="$HOME/.claude/skills/frontend"

echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}Bundle Reflection Pattern - Test Suite${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"

# ============================================================================
# Setup
# ============================================================================

setup_mock_project() {
  echo -e "${YELLOW}Setting up mock project...${NC}"

  # Clean previous test
  rm -rf "$TEST_DIR"
  mkdir -p "$TEST_DIR/dist/assets"

  # Create mock package.json
  cat > "$TEST_DIR/package.json" << 'EOF'
{
  "name": "mock-project",
  "version": "1.0.0",
  "scripts": {
    "build": "echo 'Building...'"
  }
}
EOF

  # Create mock bundle files (varying sizes)
  dd if=/dev/zero of="$TEST_DIR/dist/assets/main-abc123.js" bs=1024 count=512 2>/dev/null  # 512KB
  dd if=/dev/zero of="$TEST_DIR/dist/assets/vendor-def456.js" bs=1024 count=256 2>/dev/null # 256KB
  dd if=/dev/zero of="$TEST_DIR/dist/assets/styles-ghi789.css" bs=1024 count=64 2>/dev/null  # 64KB
  dd if=/dev/zero of="$TEST_DIR/dist/index.html" bs=1024 count=4 2>/dev/null               # 4KB

  echo -e "${GREEN}✓ Mock project created${NC}\n"
}

cleanup_mock_project() {
  echo -e "${YELLOW}Cleaning up...${NC}"
  rm -rf "$TEST_DIR"
  echo -e "${GREEN}✓ Cleanup complete${NC}\n"
}

# ============================================================================
# Test Cases
# ============================================================================

test_1_initial_analysis() {
  echo -e "${YELLOW}Test 1: Initial bundle analysis (no history)${NC}"

  cd "$TEST_DIR" || exit 1

  # Run reflection
  node "$SCRIPT_DIR/bundle-reflection.js" > /dev/null 2>&1

  # Check history file created
  if [[ -f ".bundle-history.json" ]]; then
    echo -e "${GREEN}✓ History file created${NC}"
  else
    echo -e "${RED}✗ History file not created${NC}"
    return 1
  fi

  # Check build recorded
  local build_count
  build_count=$(jq '.builds | length' .bundle-history.json)

  if [[ "$build_count" -eq 1 ]]; then
    echo -e "${GREEN}✓ Build recorded in history${NC}"
  else
    echo -e "${RED}✗ Build not recorded (count: $build_count)${NC}"
    return 1
  fi

  echo -e "${GREEN}✓ Test 1 passed${NC}\n"
}

test_2_size_increase_detection() {
  echo -e "${YELLOW}Test 2: Size increase detection${NC}"

  cd "$TEST_DIR" || exit 1

  # Increase main.js size by 15% (should trigger warning)
  dd if=/dev/zero of="dist/assets/main-abc123.js" bs=1024 count=589 2>/dev/null  # 589KB (~15% increase)

  # Run reflection
  local output
  output=$(node "$SCRIPT_DIR/bundle-reflection.js" 2>&1)

  # Check for issue detection
  if echo "$output" | grep -q "Issues Detected"; then
    echo -e "${GREEN}✓ Size increase detected${NC}"
  else
    echo -e "${RED}✗ Size increase not detected${NC}"
    return 1
  fi

  # Check for recommendations
  if echo "$output" | grep -q "Optimization Recommendations"; then
    echo -e "${GREEN}✓ Recommendations generated${NC}"
  else
    echo -e "${RED}✗ No recommendations generated${NC}"
    return 1
  fi

  echo -e "${GREEN}✓ Test 2 passed${NC}\n"
}

test_3_report_generation() {
  echo -e "${YELLOW}Test 3: Report generation${NC}"

  cd "$TEST_DIR" || exit 1

  # Run reflection
  node "$SCRIPT_DIR/bundle-reflection.js" > /dev/null 2>&1

  # Check analysis directory
  if [[ -d ".bundle-analysis" ]]; then
    echo -e "${GREEN}✓ Analysis directory created${NC}"
  else
    echo -e "${RED}✗ Analysis directory not created${NC}"
    return 1
  fi

  # Check report file exists
  local report_count
  report_count=$(find .bundle-analysis -name "report-*.json" | wc -l)

  if [[ "$report_count" -gt 0 ]]; then
    echo -e "${GREEN}✓ Report file generated${NC}"
  else
    echo -e "${RED}✗ No report file found${NC}"
    return 1
  fi

  # Validate report JSON structure
  local latest_report
  latest_report=$(ls -t .bundle-analysis/report-*.json | head -n1)

  if jq -e '.timestamp' "$latest_report" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Report has valid JSON structure${NC}"
  else
    echo -e "${RED}✗ Invalid report JSON${NC}"
    return 1
  fi

  echo -e "${GREEN}✓ Test 3 passed${NC}\n"
}

test_4_history_tracking() {
  echo -e "${YELLOW}Test 4: History tracking (multiple builds)${NC}"

  cd "$TEST_DIR" || exit 1

  # Run 5 builds with different sizes
  for i in {1..5}; do
    local size=$((512 + i * 10))
    dd if=/dev/zero of="dist/assets/main-abc123.js" bs=1024 count=$size 2>/dev/null
    node "$SCRIPT_DIR/bundle-reflection.js" > /dev/null 2>&1
    sleep 1  # Ensure different timestamps
  done

  # Check history count
  local build_count
  build_count=$(jq '.builds | length' .bundle-history.json)

  if [[ "$build_count" -ge 5 ]]; then
    echo -e "${GREEN}✓ Multiple builds tracked (count: $build_count)${NC}"
  else
    echo -e "${RED}✗ Insufficient builds tracked (count: $build_count)${NC}"
    return 1
  fi

  # Check timestamp progression
  local first_timestamp
  local last_timestamp
  first_timestamp=$(jq -r '.builds[0].timestamp' .bundle-history.json)
  last_timestamp=$(jq -r '.builds[-1].timestamp' .bundle-history.json)

  if [[ "$first_timestamp" < "$last_timestamp" ]]; then
    echo -e "${GREEN}✓ Timestamps progress correctly${NC}"
  else
    echo -e "${RED}✗ Timestamp order incorrect${NC}"
    return 1
  fi

  echo -e "${GREEN}✓ Test 4 passed${NC}\n"
}

test_5_wrapper_script() {
  echo -e "${YELLOW}Test 5: Wrapper script functionality${NC}"

  # Test run command
  bash "$SCRIPT_DIR/bundle-reflection.sh" run "$TEST_DIR" > /dev/null 2>&1

  if [[ $? -eq 0 ]]; then
    echo -e "${GREEN}✓ Wrapper script 'run' command works${NC}"
  else
    echo -e "${RED}✗ Wrapper script 'run' command failed${NC}"
    return 1
  fi

  # Test history command
  local history_output
  history_output=$(bash "$SCRIPT_DIR/bundle-reflection.sh" history "$TEST_DIR" 2>&1)

  if echo "$history_output" | grep -q "Bundle Size History"; then
    echo -e "${GREEN}✓ Wrapper script 'history' command works${NC}"
  else
    echo -e "${RED}✗ Wrapper script 'history' command failed${NC}"
    return 1
  fi

  # Test report command
  local report_output
  report_output=$(bash "$SCRIPT_DIR/bundle-reflection.sh" report "$TEST_DIR" 2>&1)

  if echo "$report_output" | grep -q "Bundle Analysis Report" || echo "$report_output" | grep -q "timestamp"; then
    echo -e "${GREEN}✓ Wrapper script 'report' command works${NC}"
  else
    echo -e "${RED}✗ Wrapper script 'report' command failed${NC}"
    return 1
  fi

  echo -e "${GREEN}✓ Test 5 passed${NC}\n"
}

test_6_threshold_configuration() {
  echo -e "${YELLOW}Test 6: Custom threshold configuration${NC}"

  cd "$TEST_DIR" || exit 1

  # Reset bundles
  dd if=/dev/zero of="dist/assets/main-abc123.js" bs=1024 count=512 2>/dev/null
  node "$SCRIPT_DIR/bundle-reflection.js" > /dev/null 2>&1

  # Increase by 8% (below default 10% threshold)
  dd if=/dev/zero of="dist/assets/main-abc123.js" bs=1024 count=553 2>/dev/null

  # Run with default threshold (10%)
  local output_default
  output_default=$(node "$SCRIPT_DIR/bundle-reflection.js" 2>&1)

  if ! echo "$output_default" | grep -q "Issues Detected"; then
    echo -e "${GREEN}✓ 8% increase ignored with 10% threshold${NC}"
  else
    echo -e "${RED}✗ False positive with default threshold${NC}"
    return 1
  fi

  # Run with custom threshold (5%)
  local output_custom
  output_custom=$(node "$SCRIPT_DIR/bundle-reflection.js" --threshold=5 2>&1)

  if echo "$output_custom" | grep -q "Issues Detected"; then
    echo -e "${GREEN}✓ 8% increase detected with 5% threshold${NC}"
  else
    echo -e "${RED}✗ Custom threshold not applied${NC}"
    return 1
  fi

  echo -e "${GREEN}✓ Test 6 passed${NC}\n"
}

# ============================================================================
# Test Runner
# ============================================================================

run_all_tests() {
  local failed_tests=0

  setup_mock_project

  test_1_initial_analysis || ((failed_tests++))
  test_2_size_increase_detection || ((failed_tests++))
  test_3_report_generation || ((failed_tests++))
  test_4_history_tracking || ((failed_tests++))
  test_5_wrapper_script || ((failed_tests++))
  test_6_threshold_configuration || ((failed_tests++))

  cleanup_mock_project

  echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

  if [[ $failed_tests -eq 0 ]]; then
    echo -e "${GREEN}✅ All tests passed!${NC}"
    return 0
  else
    echo -e "${RED}❌ $failed_tests test(s) failed${NC}"
    return 1
  fi
}

# Run tests
run_all_tests
exit $?
