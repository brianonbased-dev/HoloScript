#!/usr/bin/env bash
# =============================================================================
# Unified WASM Build Pipeline for HoloScript
# =============================================================================
#
# Builds all WASM modules with a single command:
#   - spatial-engine-wasm   (wasm-pack / wasm-bindgen)
#   - compiler-wasm         (wasm-pack / wasm-bindgen)
#   - holoscript-component  (WASI Component Model: cargo + wasm-tools + jco)
#   - tree-sitter-holoscript (tree-sitter CLI)
#
# Usage:
#   ./scripts/build/wasm-build.sh                    # Build all modules (release)
#   ./scripts/build/wasm-build.sh --debug            # Build all modules (debug)
#   ./scripts/build/wasm-build.sh --module spatial    # Build only spatial-engine-wasm
#   ./scripts/build/wasm-build.sh --module compiler   # Build only compiler-wasm
#   ./scripts/build/wasm-build.sh --module component  # Build only holoscript-component
#   ./scripts/build/wasm-build.sh --module treesitter # Build only tree-sitter-holoscript
#   ./scripts/build/wasm-build.sh --parallel          # Build all modules in parallel
#   ./scripts/build/wasm-build.sh --sizes             # Report output sizes after build
#   ./scripts/build/wasm-build.sh --check             # Check toolchain availability only
#   ./scripts/build/wasm-build.sh --clean             # Clean all WASM build artifacts
#
# =============================================================================

set -euo pipefail

# -- Configuration -----------------------------------------------------------

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PACKAGES_DIR="${REPO_ROOT}/packages"

# Colors (disabled if not a tty)
if [ -t 1 ]; then
  RED='\033[0;31m'
  GREEN='\033[0;32m'
  YELLOW='\033[1;33m'
  BLUE='\033[0;34m'
  CYAN='\033[0;36m'
  BOLD='\033[1m'
  NC='\033[0m'
else
  RED='' GREEN='' YELLOW='' BLUE='' CYAN='' BOLD='' NC=''
fi

# Default options
BUILD_MODE="release"
PARALLEL=false
REPORT_SIZES=false
CHECK_ONLY=false
CLEAN_ONLY=false
MODULES=()

# -- Argument Parsing --------------------------------------------------------

print_usage() {
  echo "Usage: $(basename "$0") [OPTIONS]"
  echo ""
  echo "Options:"
  echo "  --debug            Build in debug mode (faster, larger output)"
  echo "  --release          Build in release mode (default, optimized)"
  echo "  --module <name>    Build specific module (can be repeated)"
  echo "                     Names: spatial, compiler, component, treesitter, all"
  echo "  --parallel         Build independent modules in parallel"
  echo "  --sizes            Report WASM output sizes after build"
  echo "  --check            Check toolchain availability only"
  echo "  --clean            Clean all WASM build artifacts"
  echo "  --help             Show this help message"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --debug)    BUILD_MODE="debug"; shift ;;
    --release)  BUILD_MODE="release"; shift ;;
    --module)
      shift
      case "${1:-}" in
        spatial)    MODULES+=("spatial-engine-wasm") ;;
        compiler)   MODULES+=("compiler-wasm") ;;
        component)  MODULES+=("holoscript-component") ;;
        treesitter) MODULES+=("tree-sitter-holoscript") ;;
        all)        MODULES=() ;;  # empty = all
        *)          echo -e "${RED}Unknown module: ${1:-}${NC}"; print_usage; exit 1 ;;
      esac
      shift
      ;;
    --parallel)    PARALLEL=true; shift ;;
    --sizes)       REPORT_SIZES=true; shift ;;
    --check)       CHECK_ONLY=true; shift ;;
    --clean)       CLEAN_ONLY=true; shift ;;
    --help|-h)     print_usage; exit 0 ;;
    *)             echo -e "${RED}Unknown option: $1${NC}"; print_usage; exit 1 ;;
  esac
done

# If no modules specified, build all
if [ ${#MODULES[@]} -eq 0 ]; then
  MODULES=("spatial-engine-wasm" "compiler-wasm" "holoscript-component" "tree-sitter-holoscript")
fi

# -- Logging -----------------------------------------------------------------

log_header() {
  echo ""
  echo -e "${BOLD}${BLUE}===========================================================${NC}"
  echo -e "${BOLD}${BLUE}  $1${NC}"
  echo -e "${BOLD}${BLUE}===========================================================${NC}"
}

log_step() {
  echo -e "${CYAN}  -> $1${NC}"
}

log_ok() {
  echo -e "${GREEN}  [OK] $1${NC}"
}

log_warn() {
  echo -e "${YELLOW}  [WARN] $1${NC}"
}

log_error() {
  echo -e "${RED}  [ERROR] $1${NC}"
}

log_size() {
  local file="$1"
  if [ -f "$file" ]; then
    local size_bytes
    size_bytes=$(wc -c < "$file" | tr -d ' ')
    local size_kb=$(( size_bytes / 1024 ))
    echo -e "    ${BOLD}$(basename "$file")${NC}: ${size_kb} KB (${size_bytes} bytes)"
  fi
}

# -- Toolchain Checks --------------------------------------------------------

check_toolchain() {
  log_header "Checking WASM Toolchain"

  local all_ok=true

  # Rust + Cargo (required for all Rust-based modules)
  if command -v cargo &> /dev/null; then
    log_ok "cargo $(cargo --version | cut -d' ' -f2)"
  else
    log_error "cargo not found (required for spatial-engine-wasm, compiler-wasm, holoscript-component)"
    all_ok=false
  fi

  # rustup target for wasm32
  if command -v rustup &> /dev/null; then
    if rustup target list --installed 2>/dev/null | grep -q "wasm32-unknown-unknown"; then
      log_ok "wasm32-unknown-unknown target installed"
    else
      log_warn "wasm32-unknown-unknown target not installed (run: rustup target add wasm32-unknown-unknown)"
    fi
    if rustup target list --installed 2>/dev/null | grep -q "wasm32-wasip1"; then
      log_ok "wasm32-wasip1 target installed"
    else
      log_warn "wasm32-wasip1 target not installed (run: rustup target add wasm32-wasip1)"
    fi
  else
    log_warn "rustup not found - cannot verify WASM targets"
  fi

  # wasm-pack (required for spatial-engine-wasm and compiler-wasm)
  if command -v wasm-pack &> /dev/null; then
    log_ok "wasm-pack $(wasm-pack --version 2>/dev/null | head -1)"
  else
    log_warn "wasm-pack not found (required for spatial-engine-wasm, compiler-wasm)"
    log_step "Install: cargo install wasm-pack  OR  curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh"
  fi

  # wasm-tools (required for holoscript-component)
  if command -v wasm-tools &> /dev/null; then
    log_ok "wasm-tools $(wasm-tools --version 2>/dev/null || echo 'installed')"
  else
    log_warn "wasm-tools not found (required for holoscript-component)"
    log_step "Install: cargo install wasm-tools"
  fi

  # jco (required for holoscript-component JS transpilation)
  if command -v jco &> /dev/null || npx jco --version &> /dev/null 2>&1; then
    log_ok "jco available (via npx or global)"
  else
    log_warn "jco not found (required for holoscript-component JS output)"
    log_step "Install: npm install -g @bytecodealliance/jco"
  fi

  # tree-sitter CLI (required for tree-sitter-holoscript)
  if command -v tree-sitter &> /dev/null; then
    log_ok "tree-sitter $(tree-sitter --version 2>/dev/null | head -1)"
  else
    if npx tree-sitter --version &> /dev/null 2>&1; then
      log_ok "tree-sitter available via npx"
    else
      log_warn "tree-sitter CLI not found (required for tree-sitter-holoscript)"
      log_step "Install: npm install -g tree-sitter-cli  OR  cargo install tree-sitter-cli"
    fi
  fi

  # wasm-opt (optional, for further size optimization)
  if command -v wasm-opt &> /dev/null; then
    log_ok "wasm-opt $(wasm-opt --version 2>/dev/null | head -1) (optional optimizer)"
  else
    log_warn "wasm-opt not found (optional - install binaryen for further size optimization)"
  fi

  if $all_ok; then
    echo ""
    log_ok "Core toolchain available"
  else
    echo ""
    log_error "Missing required tools - see warnings above"
    return 1
  fi
}

# -- Clean -------------------------------------------------------------------

clean_all() {
  log_header "Cleaning WASM Build Artifacts"

  for module in "${MODULES[@]}"; do
    case "$module" in
      spatial-engine-wasm)
        log_step "Cleaning spatial-engine-wasm..."
        rm -rf "${PACKAGES_DIR}/spatial-engine-wasm/pkg"
        rm -rf "${PACKAGES_DIR}/spatial-engine-wasm/target"
        log_ok "spatial-engine-wasm cleaned"
        ;;
      compiler-wasm)
        log_step "Cleaning compiler-wasm..."
        rm -rf "${PACKAGES_DIR}/compiler-wasm/pkg"
        rm -rf "${PACKAGES_DIR}/compiler-wasm/pkg-node"
        rm -rf "${PACKAGES_DIR}/compiler-wasm/pkg-bundler"
        rm -rf "${PACKAGES_DIR}/compiler-wasm/target"
        log_ok "compiler-wasm cleaned"
        ;;
      holoscript-component)
        log_step "Cleaning holoscript-component..."
        rm -rf "${PACKAGES_DIR}/holoscript-component/dist"
        rm -rf "${PACKAGES_DIR}/holoscript-component/target"
        log_ok "holoscript-component cleaned"
        ;;
      tree-sitter-holoscript)
        log_step "Cleaning tree-sitter-holoscript..."
        rm -rf "${PACKAGES_DIR}/tree-sitter-holoscript/tree-sitter-holoscript.wasm"
        rm -rf "${PACKAGES_DIR}/tree-sitter-holoscript/build"
        log_ok "tree-sitter-holoscript cleaned"
        ;;
    esac
  done

  log_ok "Clean complete"
}

# -- Build Functions ---------------------------------------------------------

build_spatial_engine_wasm() {
  log_header "Building: spatial-engine-wasm"
  local pkg_dir="${PACKAGES_DIR}/spatial-engine-wasm"
  local start_time=$SECONDS

  if ! command -v wasm-pack &> /dev/null; then
    log_error "wasm-pack not found - skipping spatial-engine-wasm"
    return 1
  fi

  log_step "Running wasm-pack build (target: web, mode: ${BUILD_MODE})..."

  local wasm_pack_args=("build" "--target" "web" "--out-dir" "pkg")
  if [ "$BUILD_MODE" = "release" ]; then
    wasm_pack_args+=("--release")
  else
    wasm_pack_args+=("--dev")
  fi

  (cd "$pkg_dir" && wasm-pack "${wasm_pack_args[@]}")

  # Optional: run wasm-opt for further size reduction in release mode
  if [ "$BUILD_MODE" = "release" ] && command -v wasm-opt &> /dev/null; then
    local wasm_file="${pkg_dir}/pkg/spatial_engine_wasm_bg.wasm"
    if [ -f "$wasm_file" ]; then
      log_step "Running wasm-opt for additional size optimization..."
      wasm-opt -Oz "$wasm_file" -o "$wasm_file"
    fi
  fi

  local elapsed=$(( SECONDS - start_time ))
  log_ok "spatial-engine-wasm built in ${elapsed}s"

  if $REPORT_SIZES; then
    echo -e "  ${BOLD}Output sizes:${NC}"
    for f in "${pkg_dir}/pkg/"*.wasm; do
      [ -f "$f" ] && log_size "$f"
    done
  fi
}

build_compiler_wasm() {
  log_header "Building: compiler-wasm"
  local pkg_dir="${PACKAGES_DIR}/compiler-wasm"
  local start_time=$SECONDS

  if ! command -v wasm-pack &> /dev/null; then
    log_error "wasm-pack not found - skipping compiler-wasm"
    return 1
  fi

  log_step "Running wasm-pack build (target: web, mode: ${BUILD_MODE})..."

  local wasm_pack_args=("build" "--target" "web" "--out-dir" "pkg")
  if [ "$BUILD_MODE" = "release" ]; then
    wasm_pack_args+=("--release")
  else
    wasm_pack_args+=("--dev")
  fi

  (cd "$pkg_dir" && wasm-pack "${wasm_pack_args[@]}")

  # Also build nodejs target for server-side usage
  log_step "Running wasm-pack build (target: nodejs)..."
  local node_args=("build" "--target" "nodejs" "--out-dir" "pkg-node")
  if [ "$BUILD_MODE" = "release" ]; then
    node_args+=("--release")
  else
    node_args+=("--dev")
  fi
  (cd "$pkg_dir" && wasm-pack "${node_args[@]}") || log_warn "nodejs target build failed (non-fatal)"

  # Optional: run wasm-opt for further size reduction in release mode
  if [ "$BUILD_MODE" = "release" ] && command -v wasm-opt &> /dev/null; then
    local wasm_file="${pkg_dir}/pkg/holoscript_wasm_bg.wasm"
    if [ -f "$wasm_file" ]; then
      log_step "Running wasm-opt for additional size optimization..."
      wasm-opt -Oz "$wasm_file" -o "$wasm_file"
    fi
  fi

  local elapsed=$(( SECONDS - start_time ))
  log_ok "compiler-wasm built in ${elapsed}s"

  if $REPORT_SIZES; then
    echo -e "  ${BOLD}Output sizes:${NC}"
    for f in "${pkg_dir}/pkg/"*.wasm; do
      [ -f "$f" ] && log_size "$f"
    done
  fi
}

build_holoscript_component() {
  log_header "Building: holoscript-component (WASI Component Model)"
  local pkg_dir="${PACKAGES_DIR}/holoscript-component"
  local start_time=$SECONDS

  if ! command -v cargo &> /dev/null; then
    log_error "cargo not found - skipping holoscript-component"
    return 1
  fi

  # Step 1: Build Rust to wasm32-wasip1
  log_step "Step 1/4: Building Rust (target: wasm32-wasip1, mode: ${BUILD_MODE})..."

  local cargo_args=("build" "--target" "wasm32-wasip1")
  if [ "$BUILD_MODE" = "release" ]; then
    cargo_args+=("--release")
  fi

  (cd "$pkg_dir" && cargo "${cargo_args[@]}")

  # Determine the path to the built wasm file
  local profile_dir
  if [ "$BUILD_MODE" = "release" ]; then
    profile_dir="release"
  else
    profile_dir="debug"
  fi
  local core_wasm="${pkg_dir}/target/wasm32-wasip1/${profile_dir}/holoscript_component.wasm"

  if [ ! -f "$core_wasm" ]; then
    log_error "Core WASM not found at: ${core_wasm}"
    return 1
  fi

  # Ensure dist directory exists
  mkdir -p "${pkg_dir}/dist"

  # Step 2: Create WASI component using wasm-tools
  log_step "Step 2/4: Creating WASI component (wasm-tools component new)..."
  if command -v wasm-tools &> /dev/null; then
    local adapter="${pkg_dir}/wasi_snapshot_preview1.reactor.wasm"
    if [ -f "$adapter" ]; then
      wasm-tools component new "$core_wasm" \
        --adapt "$adapter" \
        -o "${pkg_dir}/dist/holoscript.component.wasm"
      log_ok "WASI component created"
    else
      log_warn "WASI adapter not found at ${adapter} - copying raw wasm"
      cp "$core_wasm" "${pkg_dir}/dist/holoscript.component.wasm"
    fi
  else
    log_warn "wasm-tools not found - copying raw wasm"
    cp "$core_wasm" "${pkg_dir}/dist/holoscript.component.wasm"
  fi

  # Step 3: Transpile to JS using jco
  log_step "Step 3/4: Transpiling to JS (jco transpile)..."
  local jco_cmd=""
  if command -v jco &> /dev/null; then
    jco_cmd="jco"
  elif npx jco --version &> /dev/null 2>&1; then
    jco_cmd="npx jco"
  fi

  if [ -n "$jco_cmd" ]; then
    (cd "$pkg_dir" && $jco_cmd transpile dist/holoscript.component.wasm -o dist --name holoscript) \
      || log_warn "jco transpile failed (non-fatal)"
    log_ok "JS transpilation complete"
  else
    log_warn "jco not available - skipping JS transpilation"
  fi

  # Step 4: Generate TypeScript types
  log_step "Step 4/4: Generating TypeScript types..."
  if [ -n "$jco_cmd" ]; then
    (cd "$pkg_dir" && $jco_cmd types dist/holoscript.component.wasm -o dist/holoscript.d.ts) \
      || log_warn "Type generation skipped"
  fi

  local elapsed=$(( SECONDS - start_time ))
  log_ok "holoscript-component built in ${elapsed}s"

  if $REPORT_SIZES; then
    echo -e "  ${BOLD}Output sizes:${NC}"
    for f in "${pkg_dir}/dist/"*.wasm; do
      [ -f "$f" ] && log_size "$f"
    done
  fi
}

build_tree_sitter_holoscript() {
  log_header "Building: tree-sitter-holoscript (WASM)"
  local pkg_dir="${PACKAGES_DIR}/tree-sitter-holoscript"
  local start_time=$SECONDS

  local ts_cmd=""
  if command -v tree-sitter &> /dev/null; then
    ts_cmd="tree-sitter"
  elif npx tree-sitter --version &> /dev/null 2>&1; then
    ts_cmd="npx tree-sitter"
  fi

  if [ -z "$ts_cmd" ]; then
    log_error "tree-sitter CLI not found - skipping tree-sitter-holoscript"
    return 1
  fi

  # Step 1: Generate parser from grammar
  log_step "Step 1/2: Generating parser from grammar.js..."
  (cd "$pkg_dir" && $ts_cmd generate) || log_warn "tree-sitter generate failed (grammar may already be current)"

  # Step 2: Build WASM
  log_step "Step 2/2: Building WASM..."
  (cd "$pkg_dir" && $ts_cmd build --wasm)

  local elapsed=$(( SECONDS - start_time ))
  log_ok "tree-sitter-holoscript built in ${elapsed}s"

  if $REPORT_SIZES; then
    echo -e "  ${BOLD}Output sizes:${NC}"
    for f in "${pkg_dir}/"*.wasm; do
      [ -f "$f" ] && log_size "$f"
    done
  fi
}

# -- Parallel Build ----------------------------------------------------------

run_parallel() {
  log_header "Running WASM Builds in Parallel"

  local pids=()
  local names=()
  local log_dir
  log_dir=$(mktemp -d)

  for module in "${MODULES[@]}"; do
    case "$module" in
      spatial-engine-wasm)
        build_spatial_engine_wasm > "${log_dir}/spatial.log" 2>&1 &
        pids+=($!)
        names+=("spatial-engine-wasm")
        ;;
      compiler-wasm)
        build_compiler_wasm > "${log_dir}/compiler.log" 2>&1 &
        pids+=($!)
        names+=("compiler-wasm")
        ;;
      holoscript-component)
        build_holoscript_component > "${log_dir}/component.log" 2>&1 &
        pids+=($!)
        names+=("holoscript-component")
        ;;
      tree-sitter-holoscript)
        build_tree_sitter_holoscript > "${log_dir}/treesitter.log" 2>&1 &
        pids+=($!)
        names+=("tree-sitter-holoscript")
        ;;
    esac
  done

  echo -e "  Started ${#pids[@]} parallel build jobs..."

  local failed=0
  for i in "${!pids[@]}"; do
    if wait "${pids[$i]}"; then
      log_ok "${names[$i]} completed"
    else
      log_error "${names[$i]} failed (see log below)"
      echo "--- ${names[$i]} build log ---"
      local log_name
      case "${names[$i]}" in
        spatial-engine-wasm)     log_name="spatial" ;;
        compiler-wasm)           log_name="compiler" ;;
        holoscript-component)    log_name="component" ;;
        tree-sitter-holoscript)  log_name="treesitter" ;;
      esac
      cat "${log_dir}/${log_name}.log" 2>/dev/null || true
      echo "---"
      failed=$((failed + 1))
    fi
  done

  rm -rf "$log_dir"

  if [ $failed -gt 0 ]; then
    log_error "$failed module(s) failed to build"
    return 1
  fi
}

# -- Sequential Build --------------------------------------------------------

run_sequential() {
  local failed=0
  local built=0

  for module in "${MODULES[@]}"; do
    case "$module" in
      spatial-engine-wasm)
        if build_spatial_engine_wasm; then
          built=$((built + 1))
        else
          failed=$((failed + 1))
        fi
        ;;
      compiler-wasm)
        if build_compiler_wasm; then
          built=$((built + 1))
        else
          failed=$((failed + 1))
        fi
        ;;
      holoscript-component)
        if build_holoscript_component; then
          built=$((built + 1))
        else
          failed=$((failed + 1))
        fi
        ;;
      tree-sitter-holoscript)
        if build_tree_sitter_holoscript; then
          built=$((built + 1))
        else
          failed=$((failed + 1))
        fi
        ;;
    esac
  done

  echo ""
  if [ $failed -gt 0 ]; then
    log_error "Build complete: ${built} succeeded, ${failed} failed"
    return 1
  else
    log_ok "All ${built} module(s) built successfully"
  fi
}

# -- Main Entry Point --------------------------------------------------------

main() {
  local total_start=$SECONDS

  log_header "HoloScript Unified WASM Build Pipeline"
  echo -e "  Mode:    ${BOLD}${BUILD_MODE}${NC}"
  echo -e "  Modules: ${BOLD}${MODULES[*]}${NC}"
  echo -e "  Parallel: ${BOLD}${PARALLEL}${NC}"

  # Always check toolchain first
  check_toolchain || {
    if ! $CHECK_ONLY; then
      log_warn "Proceeding with available tools..."
    else
      exit 1
    fi
  }

  if $CHECK_ONLY; then
    exit 0
  fi

  if $CLEAN_ONLY; then
    clean_all
    exit 0
  fi

  # Run builds
  if $PARALLEL; then
    run_parallel
  else
    run_sequential
  fi
  local build_result=$?

  # Summary
  local total_elapsed=$(( SECONDS - total_start ))
  echo ""
  log_header "Build Summary"
  echo -e "  Total time: ${BOLD}${total_elapsed}s${NC}"

  if $REPORT_SIZES; then
    echo ""
    echo -e "  ${BOLD}All WASM Output Sizes:${NC}"
    for module in "${MODULES[@]}"; do
      case "$module" in
        spatial-engine-wasm)
          for f in "${PACKAGES_DIR}/spatial-engine-wasm/pkg/"*.wasm 2>/dev/null; do
            [ -f "$f" ] && log_size "$f"
          done
          ;;
        compiler-wasm)
          for f in "${PACKAGES_DIR}/compiler-wasm/pkg/"*.wasm 2>/dev/null; do
            [ -f "$f" ] && log_size "$f"
          done
          ;;
        holoscript-component)
          for f in "${PACKAGES_DIR}/holoscript-component/dist/"*.wasm 2>/dev/null; do
            [ -f "$f" ] && log_size "$f"
          done
          ;;
        tree-sitter-holoscript)
          for f in "${PACKAGES_DIR}/tree-sitter-holoscript/"*.wasm 2>/dev/null; do
            [ -f "$f" ] && log_size "$f"
          done
          ;;
      esac
    done
  fi

  return $build_result
}

main "$@"
