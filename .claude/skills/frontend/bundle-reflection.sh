#!/bin/bash
# Bundle Reflection Wrapper Script
# Integrates with build process and provides secure execution

# Source security library
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HOME/.claude/skills/lib/security.sh"

# Configuration
LOG_FILE="$HOME/.claude/skills/frontend/logs/bundle-reflection.log"
THRESHOLD="${BUNDLE_THRESHOLD:-10}"
AUTO_FIX="${BUNDLE_AUTO_FIX:-false}"

# ============================================================================
# Functions
# ============================================================================

log_execution() {
  local message="$1"
  secure_log "$LOG_FILE" "$message" "INFO"
}

run_reflection() {
  local project_dir="$1"

  # Validate project directory
  local validated_dir
  validated_dir=$(validate_path "$project_dir" "" true)
  if [[ $? -ne 0 ]]; then
    echo -e "${RED}❌ Invalid project directory: $project_dir${NC}"
    return 1
  fi

  # Check if dist directory exists
  if [[ ! -d "$validated_dir/dist" ]]; then
    echo -e "${YELLOW}⚠️  No dist directory found. Run build first.${NC}"
    return 1
  fi

  # Change to project directory
  cd "$validated_dir" || return 1

  # Run reflection script
  local node_script="$HOME/.claude/skills/frontend/bundle-reflection.js"
  if [[ ! -f "$node_script" ]]; then
    echo -e "${RED}❌ Reflection script not found: $node_script${NC}"
    return 1
  fi

  log_execution "Running bundle reflection for $validated_dir"

  local args=()
  args+=("--threshold=$THRESHOLD")

  if [[ "$AUTO_FIX" == "true" ]]; then
    args+=("--auto-fix")
  fi

  node "$node_script" "${args[@]}"
  local exit_code=$?

  log_execution "Bundle reflection completed with exit code: $exit_code"

  return $exit_code
}

install_build_hook() {
  local project_dir="$1"
  local build_tool="${2:-vite}"  # vite, webpack, rollup

  # Validate project directory
  local validated_dir
  validated_dir=$(validate_path "$project_dir" "" true)
  if [[ $? -ne 0 ]]; then
    echo -e "${RED}❌ Invalid project directory: $project_dir${NC}"
    return 1
  fi

  cd "$validated_dir" || return 1

  # Check package.json exists
  if [[ ! -f "package.json" ]]; then
    echo -e "${RED}❌ No package.json found in $validated_dir${NC}"
    return 1
  fi

  echo -e "${GREEN}📦 Installing bundle reflection build hook...${NC}"

  # Add postbuild script to package.json
  # This uses jq to safely modify JSON
  if command -v jq &> /dev/null; then
    # Backup package.json
    cp package.json package.json.bak

    # Add postbuild script
    jq '.scripts.postbuild = "bash $HOME/.claude/skills/frontend/bundle-reflection.sh run ."' package.json > package.json.tmp
    mv package.json.tmp package.json

    echo -e "${GREEN}✓ Build hook installed successfully${NC}"
    echo -e "${YELLOW}  Added 'postbuild' script to package.json${NC}"
    echo -e "${YELLOW}  Bundle reflection will run automatically after each build${NC}"

    log_execution "Build hook installed for $validated_dir"
  else
    echo -e "${YELLOW}⚠️  jq not installed. Add this to your package.json scripts manually:${NC}"
    echo -e "${YELLOW}    \"postbuild\": \"bash \$HOME/.claude/skills/frontend/bundle-reflection.sh run .\"${NC}"
  fi
}

show_history() {
  local project_dir="$1"

  # Validate project directory
  local validated_dir
  validated_dir=$(validate_path "$project_dir" "" true)
  if [[ $? -ne 0 ]]; then
    echo -e "${RED}❌ Invalid project directory: $project_dir${NC}"
    return 1
  fi

  local history_file="$validated_dir/.bundle-history.json"

  if [[ ! -f "$history_file" ]]; then
    echo -e "${YELLOW}⚠️  No bundle history found${NC}"
    return 1
  fi

  echo -e "${GREEN}📊 Bundle Size History${NC}\n"

  # Use jq to parse and display history
  if command -v jq &> /dev/null; then
    jq -r '.builds[] |
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
      "📅 \(.timestamp)\n" +
      "   Total Size: \(.totalSize | . / 1024 / 1024 | floor)MB\n" +
      "   Issues: \(.issues)\n" +
      "   Recommendations: \(.recommendations)\n"
    ' "$history_file"
  else
    cat "$history_file"
  fi
}

show_report() {
  local project_dir="$1"
  local report_index="${2:-latest}"

  # Validate project directory
  local validated_dir
  validated_dir=$(validate_path "$project_dir" "" true)
  if [[ $? -ne 0 ]]; then
    echo -e "${RED}❌ Invalid project directory: $project_dir${NC}"
    return 1
  fi

  local analysis_dir="$validated_dir/.bundle-analysis"

  if [[ ! -d "$analysis_dir" ]]; then
    echo -e "${YELLOW}⚠️  No analysis reports found${NC}"
    return 1
  fi

  # Get latest report
  local report_file
  if [[ "$report_index" == "latest" ]]; then
    report_file=$(ls -t "$analysis_dir"/report-*.json 2>/dev/null | head -n1)
  else
    report_file="$analysis_dir/report-$report_index.json"
  fi

  if [[ ! -f "$report_file" ]]; then
    echo -e "${RED}❌ Report not found${NC}"
    return 1
  fi

  echo -e "${GREEN}📄 Bundle Analysis Report${NC}\n"

  # Display report
  if command -v jq &> /dev/null; then
    jq '.' "$report_file"
  else
    cat "$report_file"
  fi
}

show_usage() {
  cat << EOF
Bundle Reflection - Automated Bundle Size Monitoring

Usage:
  bundle-reflection.sh <command> [options]

Commands:
  run <project-dir>              Run reflection analysis on project
  install <project-dir> [tool]   Install build hook (tool: vite|webpack|rollup)
  history <project-dir>          Show bundle size history
  report <project-dir> [index]   Show detailed report (default: latest)
  help                           Show this help message

Environment Variables:
  BUNDLE_THRESHOLD    Size increase threshold % (default: 10)
  BUNDLE_AUTO_FIX     Auto-apply fixes (default: false)

Examples:
  # Run analysis
  bundle-reflection.sh run /path/to/project

  # Install build hook
  bundle-reflection.sh install /path/to/project vite

  # View history
  bundle-reflection.sh history /path/to/project

  # View latest report
  bundle-reflection.sh report /path/to/project

Configuration:
  Set threshold:    export BUNDLE_THRESHOLD=15
  Enable auto-fix:  export BUNDLE_AUTO_FIX=true

EOF
}

# ============================================================================
# Main
# ============================================================================

COMMAND="${1:-help}"
PROJECT_DIR="${2:-.}"

case "$COMMAND" in
  run)
    run_reflection "$PROJECT_DIR"
    ;;
  install)
    BUILD_TOOL="${3:-vite}"
    install_build_hook "$PROJECT_DIR" "$BUILD_TOOL"
    ;;
  history)
    show_history "$PROJECT_DIR"
    ;;
  report)
    REPORT_INDEX="${3:-latest}"
    show_report "$PROJECT_DIR" "$REPORT_INDEX"
    ;;
  help|--help|-h)
    show_usage
    ;;
  *)
    echo -e "${RED}❌ Unknown command: $COMMAND${NC}\n"
    show_usage
    exit 1
    ;;
esac
