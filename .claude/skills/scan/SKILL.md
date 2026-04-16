---
name: scan
description: >
  Proactive codebase scanner for the HoloScript ecosystem. Scans for TODO/FIXME
  markers, uncommitted changes, code health issues, and knowledge pipeline gaps.
  Triggered voluntarily by the agent every ~10 operations via the operation-counter
  hook, or manually by the user with /scan.
argument-hint: "[focus area: 'todos' | 'health' | 'git' | 'knowledge' | 'coverage' | 'dependencies' | 'full']"
disable-model-invocation: false
allowed-tools: Bash, Read, Grep, Glob, Task, WebFetch
context: fork
agent: general-purpose
---

# Antigravity Proactive Scanner

You are executing a proactive scan of the HoloScript ecosystem. This scan detects issues before they become problems.

## Working Directory

Scan targets:
- `C:\Users\Josep\Documents\GitHub\HoloScript` (primary codebase)
- `C:\Users\josep\.ai-ecosystem` (orchestration repo)

Read-only scan. Do NOT modify any files.

## Scan Modes

The user or agent invoked: `/scan $ARGUMENTS`

If `$ARGUMENTS` is empty or "full", run ALL scan phases below.
Otherwise, run only the specified phase.

## Phase 1: TODO/FIXME Scan (`todos`)

Search for TODO, FIXME, HACK, XXX, and WARN markers in recently modified files.

```bash
cd C:\Users\Josep\Documents\GitHub\HoloScript
git diff --name-only HEAD~10 HEAD
```

For each file found, grep for markers. Report:
- File path + line number
- Marker type (TODO/FIXME/HACK/XXX)
- The comment text
- Priority assessment (FIXME > TODO > HACK > XXX)

Sort by priority. Cap at 25 results.

## Phase 2: Git Health (`git`)

Check both repos for uncommitted state:

```bash
# HoloScript
git -C "C:\Users\Josep\Documents\GitHub\HoloScript" status --short
git -C "C:\Users\Josep\Documents\GitHub\HoloScript" stash list

# ai-ecosystem
git -C "C:\Users\josep\.ai-ecosystem" status --short
```

Report:
- Number of uncommitted files (modified, untracked, staged)
- Any stash entries that may be forgotten
- Files modified but not staged

## Phase 3: Code Health (`health`)

Check key health indicators:

1. **Graph cache freshness**: Check if `.holoscript-graph-cache.json` exists and its age
2. **MCP server health**: Probe `https://mcp.holoscript.net/health`
3. **Orchestrator health**: Probe `https://mcp-orchestrator-production-45f9.up.railway.app/health`
4. **Package.json consistency**: Quick check that core package version matches v6.0.2
5. **CRDT brain health**: Check V9 distributed memory consolidation state in `packages/mcp-server/src/holomesh/crdt-sync.ts`:
   - Grep for `DOMAIN_CONFIGS` to verify all 5 domains (security, rendering, agents, compilation, general) are present
   - Check if any domain's cold store exceeds 90% capacity (capacity field in DOMAIN_CONFIGS)
   - Look for recent `ConsolidationResult` logs — if last sleep cycle was >2x the domain's configured sleep interval, report WARN
   - Verify engram excitability formula hasn't drifted: `2 * queryCount + 3 * citationCount + 1.5 * corroborationCount + 0.5 * consolidationSurvivals`
   - Report per-domain: OK (healthy consolidation) / WARN (overdue sleep cycle or near capacity) / FAIL (missing domain or broken formula)

Report each as OK/WARN/FAIL with brief explanation.

## Phase 4: Knowledge Pipeline (`knowledge`)

Query the knowledge store for recent entries:

```bash
curl -s -X POST "https://mcp-orchestrator-production-45f9.up.railway.app/knowledge/query" \
  -H "Content-Type: application/json" \
  -d '{"search":"recent","limit":5}'
```

Report:
- Total knowledge entries
- Most recent entries
- Any domains with zero coverage

## Phase 5: Coverage Regression (`coverage`)

Check test coverage against pragmatic floors.

Look for `coverage/coverage-summary.json` in:
- `C:\Users\Josep\Documents\GitHub\HoloScript\coverage\coverage-summary.json`
- `C:\Users\Josep\Documents\GitHub\HoloScript\packages\core\coverage\coverage-summary.json`

If a coverage file exists, read the `total` key and check:
- **Lines**: floor 20% (WARN if below)
- **Branches**: floor 10% (WARN if below)
- **Functions**: floor 20% (WARN if below)

Report each metric as OK/WARN with the actual percentage. If no coverage data exists, report SKIP — this is normal if tests were run without `--coverage`.

## Phase 6: Dependency Audit (`dependencies`)

Run a dependency vulnerability scan:

```bash
cd C:\Users\Josep\Documents\GitHub\HoloScript
pnpm audit --json 2>nul
```

Parse the JSON output. Look for `metadata.vulnerabilities` object with keys: `critical`, `high`, `moderate`, `low`, `info`.

Flag levels:
- **critical > 0**: FAIL — immediate attention needed
- **high > 0**: WARN — should be addressed soon
- **moderate > 0**: INFO — note for awareness
- **low/info**: OK — no action needed

If `pnpm audit` is unavailable or times out (30s limit), report SKIP gracefully.

## Output Format

Structure your output as a brief scan report:

```
SCAN RESULTS (session operation #N)
====================================

TODOS (X found, Y high-priority)
  FIXME path/file.ts:42 — description
  TODO  path/file.ts:88 — description

GIT (X uncommitted across N repos)
  HoloScript: 3 modified, 1 untracked
  ai-ecosystem: clean

HEALTH
  MCP Server:    OK
  Orchestrator:  OK
  Graph cache:   WARN (48h old)
  Core version:  OK (6.1.0)
  CRDT Brain:    OK (check domains via consolidation status)
    security:    OK ([N]/50 entries, sleep Xh ago)
    rendering:   OK ([N]/200 entries, sleep Xh ago)
    agents:      WARN ([N]/150 entries — check capacity)
    compilation: OK ([N]/100 entries, sleep Xh ago)
    general:     OK ([N]/300 entries, sleep Xh ago)

KNOWLEDGE ([N] entries — GET orchestrator/health)
  Recent: W.AGT.05, P.AGT.01, G.AGT.01
  Gaps:   none detected

COVERAGE
  Root:  Lines 45% OK | Branches 22% OK | Functions 38% OK
  Core:  SKIP (no coverage data)

DEPENDENCIES
  critical: 0 | high: 0 | moderate: 3 INFO | low: 12 OK

RECOMMENDATIONS
  1. Graph cache is stale — consider running holo_absorb_repo
  2. 3 high-priority FIXMEs need attention
  3. 3 moderate vulnerabilities — review with pnpm audit
```

Keep the entire report under 50 lines. Be concise.
