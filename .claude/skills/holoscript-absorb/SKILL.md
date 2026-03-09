---
name: holoscript-absorb
description: >
  Use when you need to understand, map, or analyze the HoloScript codebase structure before refactoring,
  planning, or investigating dependencies. Runs `holoscript absorb` to scan packages into spatial knowledge
  graphs, then uses Graph RAG queries to answer architectural questions. Examples: "What calls this function?",
  "Map the compiler pipeline", "Absorb core before refactoring", "Show dependency graph for studio",
  "What's the blast radius of changing R3FCompiler?"
argument-hint: "[package-path or query] e.g. 'packages/core' or 'what depends on R3FCompiler?'"
---

# HoloScript Absorb — Codebase Intelligence Extraction

## When to Use

- **Before refactoring**: "Absorb core before touching the compiler"
- **Understanding architecture**: "Map the studio rendering pipeline"
- **Impact analysis**: "What depends on getMaterialProps?"
- **Dependency mapping**: "Show me the import graph for packages/core"
- **Planning work tracks**: "Absorb studio and identify tight coupling"
- **Knowledge snapshots**: Save codebase structure before major changes

## What It Does

`holoscript absorb` scans TypeScript/Python/Rust/Go codebases and extracts:
- **Symbols**: Functions, classes, interfaces, methods, exports
- **Relationships**: Imports, function calls, type references
- **Module communities**: Auto-detected clusters of tightly coupled code
- **Knowledge graph**: Nodes = symbols, edges = relationships

Output formats:
- `.holo` — Spatial 3D visualization (default)
- `--json` — Serialized graph for programmatic queries

## Workflow

### Quick Absorb (Single Package)

```
1. Run: npx holoscript absorb <package-path> -o <output>.holo
2. Review scan stats (files, symbols, imports, calls, LOC)
3. Review detected module communities
4. Use output for planning or Graph RAG queries
```

### Deep Analysis (With Graph RAG)

```
1. Run: npx holoscript absorb <package-path> --json -o graph.json
2. Analyze community structure for tight coupling
3. Trace call chains between subsystems
4. Identify circular dependencies
5. Map blast radius for planned changes
6. Generate refactoring plan based on findings
```

### Pre-Refactor Protocol (MANDATORY per CLAUDE.md)

```
1. npx holoscript absorb <package-path> -o knowledge.holo    → Snapshot BEFORE changes
2. Analyze symbol relationships and communities
3. Identify affected consumers of target code
4. Make refactoring changes
5. npx holoscript absorb <package-path> -o knowledge-after.holo → Snapshot AFTER
6. Compare before/after to verify no unintended structural changes
```

## Commands

### Absorb to .holo (Spatial Visualization)

```bash
# Force-directed layout (organic, shows natural clusters)
npx holoscript absorb packages/core -o packages/core/knowledge.holo

# Layered layout (hierarchical, shows dependency layers)
npx holoscript absorb packages/core -o packages/core/knowledge.holo --layout layered

# Absorb entire repo
npx holoscript absorb . -o codebase.holo
```

### Absorb to JSON (Programmatic Analysis)

```bash
# JSON graph for analysis
npx holoscript absorb packages/core --json -o core-graph.json

# JSON to stdout for piping
npx holoscript absorb packages/studio --json | head -100
```

## Interpreting Results

### Scan Stats

| Metric | What It Means |
|--------|---------------|
| Total Files | Source files scanned (TS, JS, Python, Rust, Go) |
| Total Symbols | Functions, classes, interfaces, methods found |
| Total Imports | Import/require statements resolved |
| Total Calls | Function call relationships mapped |
| LOC | Lines of code scanned |
| Errors | Files that failed to parse (check for syntax issues) |

### Module Communities

Communities are clusters of tightly coupled symbols detected via graph analysis.

| Community Size | Interpretation |
|---------------|----------------|
| 1-5 symbols | Normal module boundary |
| 6-20 symbols | Feature cluster |
| 20-50 symbols | Major subsystem |
| 50+ symbols | Potential god module — consider splitting |

### Coupling Indicators

| Pattern | Risk Level | Action |
|---------|-----------|--------|
| Single community > 100 symbols | HIGH | Needs architectural decomposition |
| Circular imports between communities | MEDIUM | Break dependency cycle |
| Orphan symbols (no callers) | LOW | Possibly dead code |
| Hub symbol (50+ callers) | INFO | Critical path — change carefully |

## Package Quick Reference

Common absorb targets in HoloScript monorepo:

```bash
# Core compiler and language
npx holoscript absorb packages/core

# Studio (Next.js frontend)
npx holoscript absorb packages/studio

# MCP server (AI tools)
npx holoscript absorb packages/mcp-server

# CLI
npx holoscript absorb packages/cli

# Specific subsystem
npx holoscript absorb packages/core/src/compiler
npx holoscript absorb packages/core/src/parser
npx holoscript absorb packages/core/src/traits
npx holoscript absorb packages/studio/src/components/scene
```

## Integration with Other Skills

### With GitNexus (Complementary)

- **GitNexus**: Process-level execution flows (who calls what in sequence)
- **HoloScript Absorb**: Structural graph (module communities, import topology)
- **Together**: Use absorb for structural planning, GitNexus for behavioral tracing

### With AI Workspace Research

- Absorb output feeds into uAA2++ Phase 0 (INTAKE) as structural context
- Module communities map to Track 1/2/3 work planning
- Community analysis reveals optimization targets for Phase 2 (EXECUTE)

### With Impact Analysis

```
1. holoscript absorb packages/core --json     → Build full graph
2. Identify target symbol in graph
3. Trace upstream/downstream dependencies
4. Assess blast radius (d=1 WILL BREAK, d=2 LIKELY, d=3 MAY)
5. Plan changes with full dependency awareness
```

## MCP Tools (When Available)

If the HoloScript MCP server is running (`npx tsx packages/mcp-server/src/index.ts`):

| Tool | Purpose |
|------|---------|
| `holo_absorb_repo` | Absorb via MCP (same as CLI) |
| `holo_semantic_search` | Search absorbed graph semantically |
| `holo_ask_codebase` | Natural language queries on graph |
| `holo_self_diagnose` | Auto-diagnose issues from graph |
| `holo_validate_quality` | Quality metrics from graph analysis |

## Examples

### Example 1: "Absorb core before refactoring the compiler"

```bash
1. npx holoscript absorb packages/core -o packages/core/knowledge.holo
   → Scanned 847 files, 12,432 symbols, 8,901 imports, 15,234 calls
   → Detected 64 module communities
   → Generated knowledge.holo (45,892 chars)

2. Review communities related to compiler:
   - Community "CompilerBase" (42 symbols) — core compilation pipeline
   - Community "R3FCompiler" (38 symbols) — React Three Fiber output
   - Community "DomainBlockCompilerMixin" (24 symbols) — domain block routing

3. Identify cross-community dependencies before refactoring
```

### Example 2: "What's the blast radius of changing getMaterialProps?"

```bash
1. npx holoscript absorb packages/studio --json -o studio-graph.json
2. Search graph for getMaterialProps:
   - Defined in: materialUtils.tsx
   - Called by: MeshNode.tsx, AnimatedMeshNode.tsx, ShaderMeshNode.tsx, LODMeshNode.tsx
   - Community: "SceneRendering" (18 symbols)
3. Blast radius: 4 direct callers, all in scene/ directory
4. Risk: MEDIUM (affects all mesh rendering)
```

### Example 3: "Map tight coupling in studio"

```bash
1. npx holoscript absorb packages/studio -o studio.holo --layout layered
2. Review communities > 30 symbols:
   - "EditorState" (47 symbols) — stores, hooks, panels all interleaved
   - "SceneRendering" (35 symbols) — rendering pipeline
3. Recommendation: Extract EditorState into dedicated state management layer
```

## Checklist

```
- [ ] Identified target package/directory for absorption
- [ ] Ran holoscript absorb with appropriate output format
- [ ] Reviewed scan stats (symbols, imports, calls, LOC)
- [ ] Analyzed module communities for coupling patterns
- [ ] Identified target symbols and their relationships
- [ ] Assessed blast radius for planned changes
- [ ] Documented findings for team/future reference
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Not a directory" | Verify the path exists and is a directory |
| Absorb error | Check for syntax errors in source files |
| Slow scan | Narrow scope to specific subdirectory |
| Empty graph | Ensure target has TypeScript/Python/Rust/Go files |
| Missing symbols | Some dynamic patterns may not be statically detected |

---

**HoloScript Absorb v1.0**
*Codebase Intelligence Extraction + Spatial Knowledge Graphs*
*Pre-Refactor Protocol + Module Community Analysis + Blast Radius Assessment*
