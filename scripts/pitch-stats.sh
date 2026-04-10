#!/usr/bin/env bash
# HoloScript Pitch Stats — Auto-generated metrics from live sources.
# Usage: bash scripts/pitch-stats.sh
# Output: stdout + scripts/pitch-stats.md

set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

# Load API keys
if [ -f .env ]; then
  set -a; source .env 2>/dev/null; set +a
fi

OUT="scripts/pitch-stats.md"
DATE=$(date -u +"%Y-%m-%d %H:%M UTC")

metric() {
  local label="$1" cmd="$2"
  local val
  val=$(eval "$cmd" 2>/dev/null || echo "?")
  echo "| $label | $val |"
}

{
echo "# HoloScript Pitch Stats"
echo "**Generated**: $DATE"
echo ""
echo "| Metric | Value |"
echo "|--------|-------|"

metric "Source LOC (non-test TS)" \
  "find packages -name '*.ts' ! -name '*.test.*' ! -name '*.d.ts' ! -path '*/node_modules/*' ! -path '*/dist/*' -print0 | xargs -0 cat 2>/dev/null | wc -l | tr -d ' '"

metric "Test LOC" \
  "find packages -name '*.test.*' ! -path '*/node_modules/*' ! -path '*/dist/*' -print0 | xargs -0 cat 2>/dev/null | wc -l | tr -d ' '"

metric "Packages" \
  "ls -d packages/*/ 2>/dev/null | wc -l | tr -d ' '"

metric "Compilers" \
  "find packages/core/src/compiler -name '*Compiler.ts' ! -name '*.test.*' 2>/dev/null | wc -l | tr -d ' '"

metric "Trait files" \
  "find packages/core/src/traits -name '*.ts' ! -name '*.test.*' ! -name 'index.ts' ! -path '*constants*' ! -path '*__tests__*' 2>/dev/null | wc -l | tr -d ' '"

metric "VR_TRAITS constant count" \
  "grep -c \"'[a-z_]*'\" packages/core/src/traits/constants/index.ts 2>/dev/null || echo '?'"

metric "MCP tools (live)" \
  "curl -sf --max-time 5 https://mcp.holoscript.net/health | python3 -c \"import sys,json; print(json.load(sys.stdin).get('tools','?'))\" 2>/dev/null || echo '?'"

metric "Knowledge entries (live)" \
  "curl -sf --max-time 5 https://mcp-orchestrator-production-45f9.up.railway.app/health | python3 -c \"import sys,json; print(json.load(sys.stdin).get('knowledge_entries','?'))\" 2>/dev/null || echo '?'"

metric "Absorb tools (live)" \
  "curl -sf --max-time 5 https://absorb.holoscript.net/health | python3 -c \"import sys,json; print(json.load(sys.stdin).get('tools','?'))\" 2>/dev/null || echo '?'"

metric "Git commits" \
  "git rev-list --count HEAD"

metric "Git contributors" \
  "git shortlog -sn --all | wc -l | tr -d ' '"

metric "HoloMesh agents (live)" \
  "curl -sf --max-time 5 'https://mcp.holoscript.net/api/holomesh/agents' -H 'Authorization: Bearer ${MCP_API_KEY:-none}' | python3 -c \"import sys,json; print(json.load(sys.stdin).get('count','?'))\" 2>/dev/null || echo '?'"

metric ": any in core" \
  "grep -rn ': any' packages/core/src/ --include='*.ts' | grep -v node_modules | grep -v __tests__ | grep -v '.test.' | grep -v '.d.ts' | wc -l | tr -d ' '"

metric "npm @holoscript/core" \
  "curl -sf --max-time 5 'https://registry.npmjs.org/@holoscript%2fcore' | python3 -c \"import sys,json; print(json.load(sys.stdin).get('dist-tags',{}).get('latest','?'))\" 2>/dev/null || echo '?'"

echo ""
echo "*Run \`bash scripts/pitch-stats.sh\` to regenerate.*"
} | tee "$OUT"

echo ""
echo "Saved to $OUT"
