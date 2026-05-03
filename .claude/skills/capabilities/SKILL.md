---
name: capabilities
description: >
  Single-shot discovery scan that surfaces orphaned platform capabilities — MCP tools,
  API routes, and lib exports that ship in HoloScript but have zero skill wrappers or
  caller references. Prints "your platform does X, Y, Z that you're not using" so agents
  and users can find and consume what already exists before building something new.
  Closes the W.GOLD.343 surface gap (capabilities without surfaces are invisible).
argument-hint: "[focus: 'mcp' | 'routes' | 'lib' | 'skills' | 'full']"
disable-model-invocation: false
allowed-tools: Bash, Read, Grep, Glob, WebFetch
context: fork
agent: general-purpose
---

# /capabilities — Platform Orphan Discovery

You are running a **single-shot discovery scan** that answers the question:
*"What can this platform already do that nothing is using?"*

This skill operationalizes W.GOLD.343 (UI-First Build Loop): capabilities
without surfaces are invisible to agent peers. Before building something new,
run this scan to find what already ships but has no wrapper.

**Origin**: Research memo `research/2026-04-28_capability-orphans-audit.md` Top-N #2.

## When to invoke

- Before proposing a new feature, skill, or tool — check if it already ships
- When asked "what can HoloScript do?" or "what features does the platform have?"
- When an agent says "we need X" — verify X isn't already an orphaned capability
- At session start (proactive, like /scan) to surface forgotten subsystems
- Auto-fire on: "what does X do", "is there already a tool for", "what capabilities", "platform features", "what's available"

## Arguments

```
/capabilities              — Full scan (all layers)
/capabilities mcp          — MCP tools only
/capabilities routes       — API routes only
/capabilities lib          — Lib exports only
/capabilities skills       — Skill coverage gap only
```

If `$ARGUMENTS` is empty, default to `full` (all layers).

## Working directories

- `C:\Users\Josep\Documents\GitHub\HoloScript` — primary codebase
- `C:\Users\josep\.ai-ecosystem` — orchestration repo (hooks, scripts, skills)
- `C:\Users\Josep\Documents\GitHub\HoloScript\packages\mcp-server\src\holomesh\routes` — API route definitions

Read-only scan. Do NOT modify any files.

## Phase 1 — Enumerate MCP tools and map to skill coverage

Query the live MCP endpoint for the full tool list, then cross-reference
against known skills to find orphans (tools with zero skill wrappers).

```bash
ENV_FILE="${HOME}/.ai-ecosystem/.env"; [ ! -f "$ENV_FILE" ] && ENV_FILE="/c/Users/Josep/.ai-ecosystem/.env"
set -a && source "$ENV_FILE" 2>/dev/null && set +a

echo "=== MCP TOOL ORPHAN SCAN ==="

# Step 1: Get the live tool list
TOOL_LIST=$(curl -s -X POST "https://mcp.holoscript.net/mcp" \
  -H "Content-Type: application/json" \
  -H "x-mcp-api-key: $HOLOSCRIPT_API_KEY" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' 2>/dev/null)

echo "$TOOL_LIST" | python3 -c "
import sys, json
d = json.load(sys.stdin)
tools = d.get('result', {}).get('tools', [])
print(f'Total MCP tools: {len(tools)}')

# Known skill wrappers — map skill name to tool prefixes/names they cover
# This is the skill-to-tool coverage map. Update when skills are added.
skill_map = {
    'compile': ['compile_to_', 'compile_pipeline', 'compile_holoscript', 'compile_trait_composition',
                'list_export_targets', 'get_circuit_breaker_status', 'get_compilation_status',
                'holoscript_select_modality', 'holoscript_compose_traits', 'holoscript_map_schema',
                'holoscript_map_csv', 'holoscript_compile_healthcare', 'holoscript_compile_robotics',
                'holoscript_compile_iot', 'holoscript_compile_education', 'holoscript_compile_music',
                'compile_to_mcp_config'],
    'room': ['holomesh_board_', 'holomesh_heartbeat', 'holomesh_send_message', 'holomesh_inbox',
             'holomesh_knowledge_read', 'holomesh_contribute', 'holomesh_discover',
             'holomesh_suggest', 'holomesh_suggest_list', 'holomesh_suggest_vote',
             'holomesh_discussion', 'holomesh_reply', 'holomesh_upvote_reply',
             'holomesh_search', 'holomesh_query', 'holomesh_notifications', 'holomesh_mark_read',
             'holomesh_mode_set', 'holomesh_status', 'holomesh_wallet_status',
             'holomesh_team_load_agents', 'holomesh_team_run_cycle', 'holomesh_team_compound',
             'holomesh_slot_assign', 'holomesh_scout', 'holomesh_crosspost_moltbook',
             'holomesh_moltbook_crosspost', 'holomesh_publish_insight', 'holomesh_publish_agent_template',
             'holomesh_collect', 'holomesh_read_thread', 'holomesh_feed_source',
             'holomesh_gossip', 'holomesh_gossip_sync', 'holomesh_subscribe',
             'holomesh_query_spatial', 'holomesh_sovereign_', 'holomesh_board_add',
             'holomesh_board_claim', 'holomesh_board_complete', 'holomesh_board_list'],
    'scan': ['holoscript_audit_numbers', 'holoscript_code_health'],
    'stub-audit': [],  # reads trait files directly, no MCP tools
    'critic': [],  # reads code directly, no MCP tools
    'idea': [],  # reads ecosystem state, no MCP tools
    'qa': [],  # reads GitHub/Railway directly
    'founder': [],  # reads NORTH_STAR, no MCP tools
    'executioner': [],  # reads board/files directly
    'security-audit': [],  # reads code directly
    'absorb': ['absorb_query', 'absorb_diff', 'absorb_list_projects', 'absorb_create_project',
               'absorb_delete_project', 'absorb_run_absorb', 'absorb_run_improve',
               'absorb_run_pipeline', 'absorb_run_query_ai', 'absorb_run_render',
               'absorb_check_credits', 'absorb_provenance_answer', 'absorb_typescript',
               'absorb_suggest_holoscript_transform', 'absorb_get_status'],
    'admin': ['get_dev_dashboard_state', 'get_usage_summary', 'get_agent_health',
              'check_agent_budget', 'get_unified_budget_state', 'get_telemetry_metrics',
              'get_metrics_prometheus'],
    'tools': ['list_traits', 'list_plugins', 'list_export_targets', 'discover_plugins',
              'install_plugin', 'install_domain_plugin', 'manage_plugin'],
}

# Build set of covered tool names
covered = set()
for skill, prefixes in skill_map.items():
    for t in tools:
        name = t['name']
        for prefix in prefixes:
            if name.startswith(prefix) or name == prefix:
                covered.add(name)

# Find orphans
orphans = [t for t in tools if t['name'] not in covered]
orphan_prefixes = {}
for t in orphans:
    prefix = t['name'].split('_')[0] if '_' in t['name'] else t['name']
    orphan_prefixes.setdefault(prefix, []).append(t['name'])

print(f'Tools with skill wrappers: {len(covered)}')
print(f'Orphaned tools (no skill wrapper): {len(orphans)} ({len(orphans)*100//len(tools)}%)')
print()
print('ORPHANED BY SUBSYSTEM:')
for prefix in sorted(orphan_prefixes.keys()):
    names = orphan_prefixes[prefix]
    print(f'  {prefix}: {len(names)} tools')
    for n in names[:5]:
        print(f'    - {n}')
    if len(names) > 5:
        print(f'    ... +{len(names)-5} more')
" 2>/dev/null
```

## Phase 2 — Enumerate API routes and map to callers

Scan the HoloScript mcp-server route files for API endpoints, then grep
the ai-ecosystem workspace for callers. Routes with zero callers are orphans.

```bash
echo ""
echo "=== API ROUTE ORPHAN SCAN ==="

# Step 1: List all route files
echo "Scanning route definitions..."
find "C:/Users/Josep/Documents/GitHub/HoloScript/packages/mcp-server/src/holomesh/routes" \
  -name "*.ts" -type f 2>/dev/null | head -30

# Step 2: Extract route method + path patterns from route files
# This scans for Express route registrations like router.get('/path', ...) or router.post('/path', ...)
ROUTE_FILE="C:/Users/Josep/Documents/GitHub/HoloScript/packages/mcp-server/src/holomesh/routes"
echo ""
echo "Extracting route patterns..."
grep -rnoE 'router\.(get|post|put|patch|delete)\s*\(\s*['\''"`/]' "$ROUTE_FILE"/*.ts 2>/dev/null | head -80
```

After extracting route patterns, for each route, count callers in:
- `C:\Users\josep\.ai-ecosystem\hooks\`
- `C:\Users\josep\.ai-ecosystem\scripts\`
- `C:\Users\josep\.claude\skills\`

Routes with zero callers across all three directories are orphans.

## Phase 3 — Enumerate lib exports and map to consumers

Scan `hooks/lib/*.mjs` for exported symbols, then grep for importers across
the hooks, scripts, and skills directories.

```bash
echo ""
echo "=== LIB EXPORT ORPHAN SCAN ==="

# Step 1: Extract exported symbols from hooks/lib
echo "Scanning hooks/lib exports..."
grep -rhoE 'export\s+(async\s+)?function\s+\w+|export\s+const\s+\w+|export\s+class\s+\w+' \
  "C:/Users/josep/.ai-ecosystem/hooks/lib/"*.mjs 2>/dev/null | \
  sed -E 's/export\s+(async\s+)?(function|const|class)\s+//' | sort -u | head -50

# Step 2: For each exported symbol, count importers outside its own file
echo ""
echo "Checking import counts per symbol..."
for sym in $(grep -rhoE 'export\s+(async\s+)?function\s+\w+|export\s+const\s+\w+|export\s+class\s+\w+' \
  "C:/Users/josep/.ai-ecosystem/hooks/lib/"*.mjs 2>/dev/null | \
  sed -E 's/export\s+(async\s+)?(function|const|class)\s+//' | sort -u); do
  # Count imports across hooks/, scripts/, and skills/
  count=$(grep -rl "$sym" "C:/Users/josep/.ai-ecosystem/hooks/"*.mjs \
    "C:/Users/josep/.ai-ecosystem/scripts/"*.mjs \
    "C:/Users/josep/.claude/skills/"*/SKILL.md 2>/dev/null | wc -l)
  if [ "$count" -le 1 ]; then
    echo "  ORPHAN: $sym ($count importer)"
  fi
done 2>/dev/null | head -30
```

## Phase 4 — Skill coverage gap analysis

Compare the total MCP tool count against the skill count to compute the
wrapper ratio. Per the audit: 234 tools / ~40 skills = 5.85x more capability
than wrapping. This is the binding constraint per Pattern 4.

```bash
echo ""
echo "=== SKILL COVERAGE GAP ==="

# Count skills (both user-level and repo-level)
SKILL_COUNT=$(ls -d "C:/Users/josep/.claude/skills/"*/ 2>/dev/null | wc -l)
SKILL_COUNT_REPO=$(ls -d "C:/Users/Josep/Documents/GitHub/HoloScript/.claude/skills/"*/ 2>/dev/null | wc -l)
TOTAL_SKILLS=$((SKILL_COUNT + SKILL_COUNT_REPO))

# MCP tool count from Phase 1 (or re-fetch)
TOOL_COUNT=$(curl -s "https://mcp.holoscript.net/health" -H "x-mcp-api-key: $HOLOSCRIPT_API_KEY" 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin).get('tools', 0))" 2>/dev/null)

RATIO=$(python3 -c "print(f'{int(\"$TOOL_COUNT\" or 0) / max(int(\"$TOTAL_SKILLS\" or 1), 1):.1f}x')" 2>/dev/null)

echo "MCP tools: $TOOL_COUNT"
echo "Skills (user-level): $SKILL_COUNT"
echo "Skills (repo-level): $SKILL_COUNT_REPO"
echo "Total skills: $TOTAL_SKILLS"
echo "Tool/skill ratio: $RATIO"
echo ""
echo "Target ratio: ~3x (each skill wraps ~3 tools on average)"
echo "Current gap: $(( $(echo "$TOOL_COUNT" | tr -d ' ') - TOTAL_SKILLS * 3 )) excess tools without skill surfaces"
```

## Phase 5 — Orphaned subsystems summary

The audit identified these whole subsystems with zero skill consumers:

| Subsystem | MCP Tools | API Routes | Status |
|-----------|-----------|------------|--------|
| Brittney (AI review/compile-gate/cultural-context) | 3 | 3 | 0 callers |
| Storyweaver (session/branch/generation) | 0 | 5 | 0 callers |
| Marketplace (listing/buy/revenue) | 1 | 4 | 0 callers |
| Sovereign/lifepod (migration) | 3 | 5 | 0 callers |
| World self-improvement | 4 | 3 | 0 callers |
| Format/holo envelope | 0 | 2 | 0 callers |
| `compile_to_*` family | 28 | — | 0 skill refs (now 1: /compile) |
| `holo_*` codebase intelligence | 51 | — | 4 used, 47 orphan (8% used) |
| `holomesh_*` team coordination | 42 | — | 2 used, 40 orphan (5% used) |

Per the self-correction in the audit: NOT every orphan is a bug. Two classes:
1. **Real orphans** — exposed-and-needed but unconsumed (the `handle` case)
2. **Parallel-path artifacts** — exposed-but-superseded-by-another-path (the `walletKey` case)

Triage every line before scoping a fix.

## Phase 6 — Produce the capabilities report

Output a structured report to stdout. Do NOT write to disk unless asked.

```
CAPABILITIES DISCOVERY REPORT (<date>)
========================================

MCP TOOLS — <total> tools, <orphaned> orphaned (<percent>%)
  Subsystems with zero skill consumers:
    <subsystem> — <N> tools: <tool1>, <tool2>, ...
    ...
  Skill-wrapped subsystems:
    <subsystem> — <N> tools via /<skill-name>

API ROUTES — <total> routes, <orphaned> orphaned (<percent>%)
  Orphaned routes (zero callers in workspace):
    <METHOD /path> — <route-file>
    ...
  Single-consumer routes (fragile):
    <METHOD /path> — sole caller: <caller-file>

LIB EXPORTS — <total> exports, <orphaned> with zero importers
  Orphaned exports:
    <symbol> — <file>:line
    ...

SKILL COVERAGE GAP
  Tools: <N> | Skills: <N> | Ratio: <R>x
  Excess tools without surfaces: <N>
  Highest-leverage skill builds:
    1. /<skill-name> — wraps <N> tools (<subsystem>)

RECOMMENDATIONS
  1. <top recommendation from orphans>
  2. <second recommendation>
  3. <third recommendation>

ANTI-PATTERNS TO AVOID (from audit)
  - Don't propose fixes for parallel-path artifacts (superseded by another path)
  - Don't count destructured-but-unused fields as real orphans
  - Bucket by family, not individual symbol — 28 compile_to_* orphans = 1 skill-build
  - Before claiming "X is unwired", verify the actual production code path
```

## What this skill teaches future agents

Per W.GOLD.343: **the producer side of HoloScript moves faster than the consumer side**.
Most "I can't do X" responses reflect a missing wrapper, not a missing capability.
Before claiming the team needs to BUILD X, scan for whether X already ships and
just lacks a surface. Two-thirds of the gap is "capability has no surface", one-third
is "capability has a parallel path that supersedes it" — only the first third is a
real fix.

Cross-links:
- W.GOLD.343 (UI-First Build Loop) — the surface-as-conversation framing
- W.GOLD.344 (Trust the System, Trust Yourself) — agent-stance bottleneck
- W.116 (marathon iter shape) — verify-before-scope routine
- `research/2026-04-28_capability-orphans-audit.md` — the original scan

## Anti-patterns

- Do NOT modify any files (read-only audit)
- Do NOT auto-file board tasks (output report only — user decides what to file)
- Do NOT propose new skills for parallel-path artifacts (they're superseded, not orphaned)
- Do NOT hardcode tool counts — always re-scan via MCP endpoint (counts change every deploy)
- Do NOT count destructured-but-unused config fields as orphans without checking the production path