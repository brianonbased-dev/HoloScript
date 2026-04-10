# HoloScript Sprint 2 Implementation Plan

**Version:** 2.2.0 Target
**Timeline:** February 2026
**Agents:** 5 AI agents in parallel (Architect, Tooling, IDE, QA, Docs)

---

## Executive Summary

This plan addresses 10 priorities identified through uAA2++ protocol analysis (W.321-W.328). The priorities form three phases:

| Phase                             | Priorities | Focus                  | Duration |
| --------------------------------- | ---------- | ---------------------- | -------- |
| **Phase 1: Core Stability**       | 1, 2, 3, 4 | Parser/Compiler fixes  | Week 1-2 |
| **Phase 2: Developer Experience** | 5, 6, 7    | Performance & Tooling  | Week 2-3 |
| **Phase 3: Ecosystem Growth**     | 8, 9, 10   | Automation & Expansion | Week 3-4 |

**Critical Path:** Priorities 1 → 2 → 4 (Parser Stability Triad) must complete before Phase 2.

---

## Phase 1: Core Stability (Week 1-2)

### Priority 1: Advanced Spread Operator Support

**Agent:** Architect
**Blocks:** Priorities 2, 5, 10
**Reference:** W.325 (Parser Syntax Gaps)

#### Objective

Implement full spread operator support: object spreads, nested spreads, function arguments.

#### Implementation Tasks

```
1.1 Lexer Updates (4 hours)
├── Add SPREAD token type (...)
├── Handle ... in object context
├── Handle ... in array context
└── Handle ... in function arguments

1.2 Parser Updates (8 hours)
├── SpreadElement AST node
├── Object spread: { ...obj, key: value }
├── Array spread: [...arr, item]
├── Function spread: fn(...args)
└── Nested spread: { ...{ ...inner } }

1.3 Type Inference (6 hours)
├── Spread type merging
├── Partial type handling
├── Rest parameter types
└── Generic spread inference

1.4 Code Generation (4 hours)
├── JavaScript target output
├── TypeScript target output
└── Runtime validation

1.5 Testing (4 hours)
├── Unit tests (20+ cases)
├── Edge case coverage
└── Snapshot tests
```

#### Acceptance Criteria

- [ ] `{ ...obj }` spreads object properties
- [ ] `[...arr]` spreads array elements
- [ ] `fn(...args)` spreads function arguments
- [ ] Nested spreads resolve correctly
- [ ] Type inference preserves types through spread
- [ ] All existing tests pass

#### Files to Modify

```
packages/core/src/lexer/Lexer.ts
packages/core/src/parser/Parser.ts
packages/core/src/types/TypeChecker.ts
packages/core/src/codegen/JavaScriptGenerator.ts
packages/core/src/ast/nodes.ts
packages/test/spread-operator.test.ts (new)
```

---

### Priority 2: Enhanced Error Recovery and Handling

**Agent:** Architect
**Blocks:** Priority 7 (VS Code)
**Reference:** W.299 (Honest Validation)

#### Objective

Add recovery mechanisms for common syntax errors with helpful suggestions.

#### Implementation Tasks

```
2.1 Error Recovery Parser Mode (8 hours)
├── Synchronization points (semicolons, braces, keywords)
├── Token insertion for missing colons
├── Token deletion for unexpected tokens
├── Panic mode with recovery
└── Maximum error limit (10 before abort)

2.2 Error Message Enhancement (6 hours)
├── "Did you mean?" suggestions
├── Code context (3 lines before/after)
├── Caret pointing to exact position
├── Error codes for documentation linking
└── Multi-error collection (don't stop at first)

2.3 Common Error Patterns (4 hours)
├── Missing colon in object: { key value }
├── Unclosed brace: { key: value
├── Invalid trait: @unknowntrait
├── Typo detection: @grabable → @grabbable
└── Missing semicolon recovery

2.4 LSP Integration (4 hours)
├── Real-time error reporting
├── Quick fix suggestions
├── Code action providers
└── Diagnostic severity levels
```

#### Acceptance Criteria

- [ ] Parser recovers from missing colons
- [ ] Parser recovers from unclosed braces
- [ ] "Did you mean?" for trait typos
- [ ] Error messages include code context
- [ ] LSP reports errors in real-time
- [ ] Quick fixes available in VS Code

#### Error Message Format

```
error[E0042]: Missing colon in object property
  --> scene.hsplus:15:8
   |
14 |   object "Player" using "PlayerTemplate" {
15 |     color "#ff0000"
   |           ^ expected ':' before value
   |
help: add a colon between property name and value
   |
15 |     color: "#ff0000"
   |          +
```

#### Files to Modify

```
packages/core/src/parser/ErrorRecovery.ts (new)
packages/core/src/parser/Parser.ts
packages/core/src/diagnostics/DiagnosticMessages.ts (new)
packages/core/src/diagnostics/SuggestionEngine.ts (new)
packages/lsp/src/providers/DiagnosticProvider.ts
```

---

### Priority 3: Trait Change Detection in Incremental Compiler

**Agent:** Architect
**Blocks:** Priority 5 (Benchmarking)
**Reference:** W.323 (Bursty Dev Cycles)

#### Objective

Extend diff system to track trait additions/removals for optimized recompilation.

#### Implementation Tasks

```
3.1 Trait Dependency Graph (6 hours)
├── Build trait → file mapping
├── Track trait inheritance chains
├── Detect trait composition dependencies
└── Cache trait signatures

3.2 Incremental Diff Engine (8 hours)
├── AST hash comparison
├── Trait-level change detection
├── Property-level change detection
├── Template inheritance tracking
└── State invalidation rules

3.3 Cache Management (4 hours)
├── LRU cache for parsed files
├── Trait signature cache
├── Invalidation triggers
└── Cache serialization (persist across sessions)

3.4 Change Propagation (4 hours)
├── Determine affected files from trait change
├── Minimal recompilation set calculation
├── Parallel recompilation of independent files
└── Progress reporting
```

#### Acceptance Criteria

- [ ] Trait additions detected without full reparse
- [ ] Trait removals trigger dependent recompilation
- [ ] Cache persists across CLI invocations
- [ ] 80%+ cache hit rate on incremental builds
- [ ] Rebuild time < 10% of full build for single file change

#### Performance Targets

| Scenario           | Full Build | Incremental |
| ------------------ | ---------- | ----------- |
| Single file change | 2000ms     | < 200ms     |
| Trait addition     | 2000ms     | < 300ms     |
| No changes         | 2000ms     | < 50ms      |

#### Files to Modify

```
packages/core/src/compiler/IncrementalCompiler.ts
packages/core/src/compiler/TraitDependencyGraph.ts (new)
packages/core/src/compiler/DiffEngine.ts (new)
packages/core/src/cache/CompilerCache.ts (new)
```

---

### Priority 4: Stabilize Visual Test Runner

**Agent:** QA
**Blocks:** Priority 9 (Snapshot Coverage)
**Reference:** W.322 (Untested Edge Cases)

#### Objective

Fix timeouts and achieve 9/9 visual tests passing reliably.

#### Implementation Tasks

```
4.1 Timeout Fixes (4 hours)
├── Replace setTimeout with event-based signaling
├── Add test-specific timeout configuration
├── Implement retry logic (3 attempts)
├── Increase default timeout to 30s for visual tests
└── Add timeout diagnostics (which step timed out)

4.2 Test Isolation (4 hours)
├── Reset renderer state between tests
├── Clear GPU resources
├── Isolate global state mutations
└── Parallel test execution guards

4.3 Flakiness Reduction (6 hours)
├── Deterministic random seeds
├── Fixed viewport sizes
├── Disable animations in test mode
├── Consistent font rendering
└── Screenshot comparison tolerance (5%)

4.4 CI Integration (4 hours)
├── GitHub Actions workflow
├── Artifact upload for failed screenshots
├── Visual diff report generation
├── Slack/Discord notification on failure
└── Blocking PR merge on test failure
```

#### Acceptance Criteria

- [ ] 9/9 visual tests pass consistently
- [ ] No flaky tests (100 consecutive runs)
- [ ] CI runs in < 5 minutes
- [ ] Failed tests produce diff images
- [ ] Test retries logged but not counted as pass

#### Test Matrix

| Test                        | Current    | Target |
| --------------------------- | ---------- | ------ |
| Basic composition rendering | ✅         | ✅     |
| Trait composition           | ❌ timeout | ✅     |
| Template inheritance        | ❌ flaky   | ✅     |
| Animation keyframes         | ❌ timeout | ✅     |
| Physics simulation          | ✅         | ✅     |
| Lighting/shadows            | ❌ flaky   | ✅     |
| Multi-object scene          | ✅         | ✅     |
| State transitions           | ❌ timeout | ✅     |
| Event handlers              | ✅         | ✅     |

#### Files to Modify

```
packages/test/visual/VisualTestRunner.ts
packages/test/visual/config.ts
packages/test/visual/utils/timeout.ts (new)
packages/test/visual/utils/isolation.ts (new)
.github/workflows/visual-tests.yml
```

---

## Phase 2: Developer Experience (Week 2-3)

### Priority 5: Performance Benchmarking and Optimization

**Agent:** Tooling
**Depends on:** Priority 3
**Reference:** W.272 (uAA2++ cycles)

#### Objective

Establish performance baselines and implement optimizations.

#### Implementation Tasks

```
5.1 Benchmark Suite (6 hours)
├── Parse time benchmark (1K, 10K, 100K lines)
├── Memory usage profiling
├── AST traversal speed
├── Code generation throughput
├── Incremental compilation delta
└── Cold start vs warm start

5.2 Optimization: Lazy Parsing (8 hours)
├── On-demand AST node creation
├── Skeleton parsing for large files
├── Background full parse
└── Partial invalidation

5.3 Optimization: Caching (6 hours)
├── AST cache with hash keys
├── Type inference memoization
├── Code generation cache
└── Cross-file symbol cache

5.4 Optimization: Worker Threads (6 hours)
├── Parallel file parsing
├── Worker pool management
├── Shared memory for AST
└── Main thread coordination

5.5 CI Regression Detection (4 hours)
├── Benchmark on every PR
├── Threshold alerts (> 10% regression)
├── Historical tracking
└── Benchmark result dashboard
```

#### Performance Targets

| Metric              | Current | Target | Stretch |
| ------------------- | ------- | ------ | ------- |
| Parse 10K lines     | 500ms   | 200ms  | 100ms   |
| Memory per 1K lines | 50MB    | 20MB   | 10MB    |
| Incremental rebuild | 300ms   | 100ms  | 50ms    |
| Cold start          | 800ms   | 300ms  | 150ms   |

#### Files to Modify

```
packages/benchmark/src/parseBenchmark.ts (new)
packages/benchmark/src/memoryBenchmark.ts (new)
packages/core/src/parser/LazyParser.ts (new)
packages/core/src/cache/ASTCache.ts (new)
packages/core/src/workers/ParserWorkerPool.ts (new)
.github/workflows/benchmark.yml (new)
```

---

### Priority 6: Formatter and Import Optimizations

**Agent:** Tooling
**Reference:** W.327 (IDE Tooling)

#### Objective

Speed up formatter for large files, add parallel processing.

#### Implementation Tasks

```
6.1 Indentation Optimization (4 hours)
├── Pre-compute indentation levels
├── Cache indentation state
├── Batch whitespace operations
└── Skip unchanged regions

6.2 Import Sorting (4 hours)
├── Dependency graph sorting
├── Group by type (external, internal, relative)
├── Alphabetical within groups
└── Remove unused imports

6.3 Parallel Formatting (6 hours)
├── Split file into independent chunks
├── Format chunks in parallel
├── Merge results
├── Handle cross-chunk dependencies

6.4 Format-on-Save Optimization (4 hours)
├── Diff-based formatting (only changed lines)
├── Debounce rapid saves
├── Background formatting
└── Format cache
```

#### Performance Targets

| File Size | Current | Target |
| --------- | ------- | ------ |
| 100 lines | 50ms    | 20ms   |
| 1K lines  | 500ms   | 100ms  |
| 10K lines | 5s      | 500ms  |

#### Files to Modify

```
packages/formatter/src/Formatter.ts
packages/formatter/src/IndentationCache.ts (new)
packages/formatter/src/ImportSorter.ts (new)
packages/formatter/src/ParallelFormatter.ts (new)
```

---

### Priority 7: VS Code Extension Enhancements

**Agent:** IDE
**Depends on:** Priority 2
**Reference:** W.327 (Community Bootstrap)

#### Objective

Lower barrier to entry with advanced IDE features.

#### Implementation Tasks

```
7.1 Advanced Syntax Highlighting (4 hours)
├── Semantic token provider
├── Trait-aware highlighting
├── Template reference highlighting
├── State variable highlighting
└── Error squiggles

7.2 Code Snippets (4 hours)
├── composition definition snippet
├── Trait composition snippet
├── Template definition snippet
├── Event handler snippet
├── State machine snippet
└── 20+ common patterns

7.3 Quick Fixes (6 hours)
├── Add missing trait import
├── Fix trait typo
├── Add missing property
├── Convert to template
├── Extract to variable
└── Wrap in conditional

7.4 Hover Documentation (4 hours)
├── Trait documentation on hover
├── Property type information
├── Template definition preview
├── Link to full documentation
└── Example code in hover

7.5 IntelliSense Improvements (6 hours)
├── Context-aware completions
├── Trait suggestions based on object type
├── Property value suggestions
├── Template parameter inference
└── Import suggestions
```

#### Acceptance Criteria

- [ ] Semantic highlighting for all constructs
- [ ] 20+ snippets available
- [ ] Quick fixes for top 10 errors
- [ ] Hover shows documentation
- [ ] Completions context-aware

#### Files to Modify

```
packages/vscode-extension/src/providers/SemanticTokensProvider.ts
packages/vscode-extension/src/providers/SnippetProvider.ts (new)
packages/vscode-extension/src/providers/QuickFixProvider.ts (new)
packages/vscode-extension/src/providers/HoverProvider.ts
packages/vscode-extension/src/providers/CompletionProvider.ts
packages/vscode-extension/snippets/holoscript.json (new)
```

---

## Phase 3: Ecosystem Growth (Week 3-4)

### Priority 8: Visual Diff and Semantic Tools

**Agent:** Tooling + QA
**Reference:** W.323 (Knowledge Capture)

#### Objective

Build web UI for snapshot comparisons and semantic diffing.

#### Implementation Tasks

```
8.1 Visual Diff Web UI (8 hours)
├── Side-by-side snapshot comparison
├── Overlay diff mode
├── Zoom and pan controls
├── Difference highlighting
├── Batch comparison view
└── Filter by change type

8.2 Semantic Diff Engine (8 hours)
├── AST-based comparison
├── Ignore whitespace/formatting
├── Ignore comment changes
├── Detect renamed symbols
├── Detect moved code blocks
└── Meaningful change classification

8.3 PR Workflow Integration (6 hours)
├── GitHub Action for visual diff
├── Auto-comment on PR with diff report
├── Link to web UI from PR
├── Approve/reject visual changes
└── Auto-update snapshots on approval

8.4 CLI Tools (4 hours)
├── holoscript diff <file1> <file2>
├── holoscript visual-diff <snapshot1> <snapshot2>
├── JSON output for CI
└── Exit codes for scripting
```

#### Files to Modify

```
packages/cli/src/commands/diff.ts (new)
packages/tools/visual-diff-ui/ (new directory)
packages/core/src/diff/SemanticDiff.ts (new)
.github/workflows/visual-diff-pr.yml (new)
```

---

### Priority 9: Snapshot Coverage and Automation

**Agent:** QA
**Depends on:** Priority 4, 8
**Reference:** W.299 (Honest Validation)

#### Objective

Automated snapshot coverage reports and regression alerts.

#### Implementation Tasks

```
9.1 Coverage Reports (6 hours)
├── AST node coverage tracking
├── Trait coverage matrix
├── Template coverage
├── Uncovered code highlighting
└── Coverage trend tracking

9.2 Performance Snapshots (4 hours)
├── Capture timing per test
├── Memory usage per test
├── Regression detection (> 10%)
├── Historical comparison
└── Alerts on regression

9.3 Auto-Update Bot (6 hours)
├── Detect intentional visual changes
├── Auto-update snapshots
├── Update CHANGELOG with changes
├── PR description generation
└── Require human approval for large changes

9.4 Coverage Badges (2 hours)
├── README badge for test coverage
├── Badge for visual test status
├── Badge for benchmark status
└── Auto-update on merge
```

#### Coverage Targets

| Category     | Current | Target |
| ------------ | ------- | ------ |
| Parser nodes | 60%     | 90%    |
| Traits       | 40%     | 80%    |
| Templates    | 30%     | 70%    |
| Error paths  | 20%     | 60%    |

#### Files to Modify

```
packages/test/coverage/CoverageTracker.ts (new)
packages/test/coverage/PerformanceSnapshots.ts (new)
.github/workflows/auto-snapshot-update.yml (new)
scripts/update-coverage-badges.ts (new)
```

---

### Priority 10: Ecosystem Expansion Beyond VR

**Agent:** Architect + Docs
**Depends on:** Priorities 1-9
**Reference:** W.328 (Stable Core First)

#### Objective

Document and prototype applications in IoT, robotics, digital twins.

#### Implementation Tasks

```
10.1 IoT Spatial Triggers (Research + Prototype)
├── Research: Smart home scene definitions
├── Prototype: Motion sensor → scene trigger
├── Documentation: IoT integration guide
├── Example: Home automation in HoloScript
└── Adapter: MQTT/Zigbee bridge

10.2 Robotics Collision Avoidance (Research + Prototype)
├── Research: ROS2 integration patterns
├── Prototype: Spatial collision detection
├── Documentation: Robotics guide
├── Example: Robot arm workspace
└── Adapter: ROS2 bridge

10.3 Digital Twins (Research + Prototype)
├── Research: Real-time sync patterns
├── Prototype: Building floor plan sync
├── Documentation: Digital twin guide
├── Example: Factory layout twin
└── Adapter: IoT data ingestion

10.4 Cross-Reality Sync (Research)
├── Research: AR-VR bridging
├── Research: Multi-device sync
├── Documentation: Cross-reality patterns
├── Example: Shared AR/VR space
└── Protocol: Sync message format

10.5 Layer Interaction Refinement
├── Document .holo ↔ .hsplus ↔ .hs patterns
├── Best practices guide
├── Migration paths
├── Anti-patterns to avoid
└── Case studies
```

#### Gate: Do Not Start Until

- [ ] Priority 1 (Spread Operator) complete
- [ ] Priority 4 (Visual Tests) 9/9 passing
- [ ] Priority 5 (Benchmarks) baselines established

#### Files to Create

```
docs/ecosystem/IOT_INTEGRATION.md
docs/ecosystem/ROBOTICS_GUIDE.md
docs/ecosystem/DIGITAL_TWINS.md
docs/ecosystem/CROSS_REALITY.md
examples/iot/smart-home.hsplus
examples/robotics/robot-arm.hsplus
examples/digital-twin/factory.hsplus
```

---

## Agent Assignment Matrix

| Priority           | Architect | Tooling | IDE    | QA     | Docs |
| ------------------ | --------- | ------- | ------ | ------ | ---- |
| 1. Spread Operator | ██████    |         |        | █      |      |
| 2. Error Recovery  | ██████    |         | ██     |        |      |
| 3. Trait Detection | ██████    |         |        |        |      |
| 4. Visual Tests    |           |         |        | ██████ |      |
| 5. Benchmarking    | █         | ██████  |        | ██     |      |
| 6. Formatter       |           | ██████  |        |        |      |
| 7. VS Code         |           |         | ██████ |        | █    |
| 8. Visual Diff     |           | ███     |        | ███    |      |
| 9. Snapshots       |           | █       |        | █████  |      |
| 10. Ecosystem      | ███       |         |        |        | ███  |

---

## Risk Register

| Risk                                    | Probability | Impact   | Mitigation                         |
| --------------------------------------- | ----------- | -------- | ---------------------------------- |
| Spread operator breaks existing code    | Medium      | High     | Extensive test suite, opt-in flag  |
| Visual tests remain flaky               | Medium      | Medium   | Event-based signaling, retry logic |
| Performance regressions                 | Low         | High     | CI benchmark gates                 |
| Ecosystem expansion before stable core  | Low         | Critical | Hard gate on priorities 1-9        |
| Community adoption slower than expected | Medium      | Medium   | VS Code extension, documentation   |

---

## Success Metrics

| Metric                     | Current | Sprint 2 Target |
| -------------------------- | ------- | --------------- |
| Parser syntax coverage     | 85%     | 95%             |
| Visual test pass rate      | 6/9     | 9/9             |
| Build time (10K lines)     | 500ms   | 200ms           |
| VS Code extension installs | N/A     | 100+            |
| GitHub stars               | 0       | 50+             |
| Community contributions    | 0       | 5+ PRs          |

---

## References

- W.321-W.328: uAA2++ Protocol Analysis (Feb 2026)
- P.REPO.024: Monorepo Migration Pattern
- P.COMMUNITY.025: Zero-to-Community Bootstrap
- G.DEV.017: Milestone-Driven Knowledge Gaps
- G.LICENSE.018: Dual License Confusion

---

**Document Version:** 1.0.0
**Last Updated:** 2026-02-05
**Generated by:** uAA2++ ∞ Protocol
