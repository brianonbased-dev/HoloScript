---
name: benchmark
description: >
  Performance benchmarking for HoloScript platform. Runs compilation benchmarks,
  measures MCP tool response times, tracks regressions across commits, and
  compares against baseline metrics. Uses vitest bench and custom timing harnesses.
argument-hint: "[compile|tools|solvers|full|compare <commit>]"
disable-model-invocation: false
allowed-tools: Bash, Read, Write, Edit, Grep, Glob, Task, Agent
context: fork
agent: general-purpose
project-dir: C:/Users/Josep/Documents/GitHub/HoloScript
---

# /holoscript:benchmark — Performance Benchmarking

**Command**: $ARGUMENTS

## Overview

Measure and track HoloScript platform performance. This skill runs benchmarks,
compares against baselines, and flags regressions before they ship.

## Subcommands

### `compile` — Compilation Benchmarks
Measure parse → AST → compile → output times for .holo and .hs files.

```bash
cd C:/Users/Josep/Documents/GitHub/HoloScript
pnpm bench 2>&1 | tee .perf-metrics/latest-bench.txt
```

### `tools` — MCP Tool Response Times
Benchmark tool call latency against the live MCP server.

```bash
ENV_FILE="${HOME}/.ai-ecosystem/.env"
[ ! -f "$ENV_FILE" ] && ENV_FILE="/c/Users/Josep/.ai-ecosystem/.env"
set -a && source "$ENV_FILE" 2>/dev/null && set +a

# Health check first
curl -s https://mcp.holoscript.net/health | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'Tools: {d.get(\"tools\",\"?\")} | Uptime: {d.get(\"uptime\",\"?\")}')"

# Benchmark core tools
for tool in parse_hs compile_to_threejs compile_to_r3f; do
  START=$(date +%s%N)
  curl -s -X POST https://mcp.holoscript.net/api/compile \
    -H "x-mcp-api-key: $HOLOSCRIPT_API_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"code\": \"object Cube { position: [0,1,0] }\"}" > /dev/null
  END=$(date +%s%N)
  echo "$tool: $(( (END - START) / 1000000 ))ms"
done
```

### `solvers` — Simulation Solver Benchmarks
Run SimSci solver performance tests.

```bash
cd C:/Users/Josep/Documents/GitHub/HoloScript
pnpm --filter @holoscript/engine test -- --run "*.bench.*" 2>&1
```

### `full` — Complete Benchmark Suite
Run all benchmarks and generate a report.

### `compare <commit>` — Regression Detection
Compare current performance against a specific commit baseline.

```bash
# Read baseline
cat .perf-metrics/baseline.json 2>/dev/null || echo "No baseline found"

# Run current benchmarks and diff
```

## Output Format

Results are written to `.perf-metrics/` directory:
- `latest-bench.txt` — raw vitest bench output
- `baseline.json` — pinned baseline for regression detection
- `history/YYYY-MM-DD.json` — historical results

## Key Metrics to Track

| Metric | Target | Source |
|--------|--------|--------|
| .holo parse time | <5ms | packages/core/src/parser/ |
| Three.js compile | <10ms | packages/core/src/compilers/ |
| MCP tool latency | <200ms | mcp.holoscript.net |
| Test suite runtime | <60s | vitest |
| Bundle size (core) | <500KB | dist/ |

## Zero Hardcoded Stats

Never write benchmark numbers into this skill file. Results go to `.perf-metrics/` and are read fresh each run.
