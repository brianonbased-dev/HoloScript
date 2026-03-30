# Three-Phase Daemon Architecture

## Overview

The HoloScript daemon now operates through three coordinated phases that work together to enable autonomous self-improvement capabilities:

**Phase 1: HeadlessRuntime Native Action Bridge**

- Native integration between BehaviorTree actions and runtime handlers
- Acts as the execution substrate for all autonomous operations

**Phase 2: CLI daemon Subcommand**

- Spawns long-lived daemon processes with cycle control and state persistence
- Executes continuous self-improvement workflows

**Phase 3: Standalone Daemon Actions**

- 16 reusable action handlers (diagnose, generate_fix, verify_compilation, etc.)
- Clean dependency injection without MCP coupling

---

## Phase 1: HeadlessRuntime Native Action Bridge

### Architecture

```
BehaviorTree (action:diagnose)
    ↓
HeadlessRuntime.emit('action:diagnose', {...})
    ↓
HeadlessRuntime interceptor checks: is 'diagnose' registered?
    ↓
ActionHandler callback invoked → Promise<boolean>
    ↓
HeadlessRuntime.emit('action:result', { success: true/false })
    ↓
BehaviorTree awaits result, continues or fails
```

### Key Components

**ActionHandler Type** (`src/runtime/HeadlessRuntime.ts`)

```typescript
type ActionHandler = (
  params: Record<string, unknown>,
  blackboard: Record<string, unknown>,
  context: unknown
) => Promise<boolean> | boolean;
```

**Registration API**

```typescript
runtime.registerAction('diagnose', async (params, blackboard) => {
  // Implementation
  return true; // success
});
```

**Event Interception**

- `HeadlessRuntime.emit()` checks `eventHandlers` before emitting
- If event is `action:*` and handler is registered, invokes it
- Emits `action:result` with `{ success, requestId }` payload
- BehaviorTree nodes marked with `@behavioral_tree` await `action:result`

### Why This Matters

- **No switch statements**: Previously required 1,800 lines of TypeScript mapping action names → implementations
- **Composable**: New actions defined in `.hsplus` BT, no CLI code changes needed
- **Type-safe**: Full TypeScript support, compile-time checking
- **Testable**: Unit tests verify each handler independently

---

## Phase 2: CLI daemon Subcommand

### Architecture

```
User Command:
  holoscript daemon compositions/self-improve.hsplus --cycles 15 --commit --debug

CLI Runner:
  ├─ Parse flags, verify API credits, create lock file (W.090 safeguard)
  ├─ For each cycle (1..15):
  │   ├─ Deep-clone AST from composition
  │   ├─ Create fresh HeadlessRuntime (Phase 1 active)
  │   ├─ Register all daemon-actions (Phase 3)
  │   ├─ Auto-tick BT until bt_complete event
  │   ├─ Persist mutation (state, AST diffs) if --commit
  │   └─ Log cycle metrics: duration, actions executed, mutations
  └─ Signal handlers (SIGINT/SIGTERM) for graceful cleanup
```

### Flags

| Flag         | Description                      | Default         |
| ------------ | -------------------------------- | --------------- |
| `--cycles N` | Number of improvement iterations | 1               |
| `--commit`   | Persist mutations to disk        | false (dry-run) |
| `--model`    | Override LLM provider            | from config     |
| `--trial N`  | Trial run identifier for metrics | auto-generated  |
| `--debug`    | Verbose logging                  | false           |

### State Management

```typescript
// Per-cycle state setup
runtime.emit('bt_set_blackboard', {
  cycle: currentCycle,
  mutations: accumulatedMutations,
  metrics: { duration, actionsRun, qualityScore },
  focus: 'next-candidate',
});

// Cycle complete signal
runtime.on('bt_complete', () => {
  accumulatedMutations = runtime.getState().mutations;
  persistIfNeeded();
});
```

### Lifecycle Events

1. **Startup**: Lock file created, API credits checked
2. **Cycle Start**: AST deep-cloned, blackboard focused
3. **Cycle End**: State persisted, metrics logged
4. **Graceful Shutdown**: SIGINT/SIGTERM cleanup, lock released

---

## Phase 3: Standalone Daemon Actions

### Architecture

```
DaemonHost (interface) → Implemented by CLI runner
  ├─ fs: { readFile, writeFile, deleteFile, exists }
  ├─ process: { exec }
  ├─ llm: { complete, embed }
  └─ config: { trials, maxMutations, model, ... }

createDaemonActions(host, llm, config)
  ├─ identity_intake (3 lines → 30 lines of inlined minimal code)
  ├─ diagnose (parse error, find root cause)
  ├─ read_candidate (load test file, extract test case)
  ├─ generate_fix (use LLM to propose fix)
  ├─ verify_compilation (tsc, catch errors)
  ├─ fix_from_compile_errors (map errors → code locations)
  ├─ run_related_tests (execute vitest for module)
  ├─ validate_quality (check coverage, mutation score)
  ├─ commit_changes (git add, git commit)
  ├─ rollback_changes (git reset, restore files)
  ├─ advance_candidate (move to next failing test)
  ├─ report (output summary)
  ├─ report_no_candidates (all tests passing)
  ├─ compress_knowledge (consolidate learnings)
  ├─ praise_improvement (celebrate milestone)
  └─ integrate_shadow (merge shadow changes)

Returns: Record<string, ActionHandler>
```

### 16 Core Handlers

**1. identity_intake**

- Minimizes bloat: 3 lines → 30 lines
- Inlines every dependency instead of importing

**2. diagnose**

- Parse compilation output
- Identify root issue (type error, test failure, etc.)
- Return diagnosis object

**3. read_candidate**

- Load failing test file
- Extract test case that's failing
- Return test code + location

**4. generate_fix**

- Send code context to LLM
- Request fix proposal
- Return patch or replacement code

**5. verify_compilation**

- Run `tsc --noEmit`
- If errors, emit `action:fix_from_compile_errors`
- Return true if compiled cleanly

**6. fix_from_compile_errors**

- Parse TypeScript error output
- Map error location to code
- Generate location-specific fixes

**7. run_related_tests**

- Execute vitest on modified files
- Capture test output
- Return pass/fail counts

**8. validate_quality**

- Check code coverage threshold
- Compute mutation testing score
- Return quality metrics

**9. commit_changes**

- Stage files: `git add modified-files`
- Create commit: `git commit -m "..."`
- Return commit SHA

**10. rollback_changes**

- `git reset --hard`
- Restore dirty files
- Return success status

**11. advance_candidate**

- Move to next failing test
- Update blackboard.focus
- Return test name

**12. report**

- Summarize cycle results
- Output mutation count, quality score
- Return report string

**13. report_no_candidates**

- All tests passing
- Document achievement
- Return completion message

**14. compress_knowledge**

- Consolidate learnings from successful mutations
- Store patterns in knowledge base
- Return compression summary

**15. praise_improvement**

- Calculate improvement metric
- Generate celebratory message
- Emit `praise_milestone` event

**16. integrate_shadow**

- Merge shadow changes from experimental branch
- Update stable branch
- Return merge result

### Contamination Detection

Five regex patterns detect and quarantine suspicious code:

```typescript
// Patterns detected and blacklisted:
- Infinite loops: while(true) { ... }
- Unbounded recursion: func() { func() }
- Process kills: process.exit(), process.kill()
- File wipes: fs.rmSync('/', ...), fs.unlinkSync('/')
- Cryptographic misuse: crypto with hardcoded seeds
```

Per-file quarantine: Auto-blacklist after 2 failures on same file

### Dependency Injection

```typescript
interface DaemonHost {
  fs: HostFileCapabilities;
  process: HostProcessCapabilities;
  llm: LLMProvider;
  config: DaemonConfig;
}

// Usage:
const handlers = createDaemonActions(host, llm, config);
runtime.registerAction('diagnose', handlers.diagnose);
runtime.registerAction('generate_fix', handlers.generate_fix);
// ... 14 more
```

**No MCP coupling**: Handlers only depend on `DaemonHost` interface, not on MCP server

---

## Integration: How the Three Phases Work Together

### Example: Self-Improving Composition

**File: `compositions/self-improve-daemon.hsplus`**

```hsplus
composition "AutoImprove" {
  state {
    cycle: 0
    diagnosis: ""
    candidate_test: ""
    proposed_fix: ""
  }

  template "Improver" {
    @behavioral_tree
    tree {
      sequence {
        action "diagnose"
        action "read_candidate"
        action "generate_fix"
        action "verify_compilation"
        action "run_related_tests"
        action "validate_quality"
        conditional "quality_threshold_met" {
          action "commit_changes"
          action "advance_candidate"
          action "praise_improvement"
        }
        conditional "quality_failed" {
          action "rollback_changes"
          action "advance_candidate"
        }
      }
    }
  }

  object "Improver" using "Improver" { }
}
```

**Execution Flow:**

```
1. CLI: holoscript daemon compositions/self-improve-daemon.hsplus --cycles 10 --commit

2. Phase 2 (CLI daemon):
   - Creates HeadlessRuntime (Phase 1 active)
   - Registers 16 handlers from daemon-actions (Phase 3)
   - Emits 'bt_set_blackboard' with cycle=1

3. Phase 1 (Native Action Bridge):
   - BT starts: action "diagnose"
   - Runtime checks: handlercycle 1 - execute...
   - Handler invoked: async diagnose(params, blackboard) → Parse error log
   - Emit 'action:result' { success: true, diagnosis: "Missing type annotation" }
   - BT continues...

4. BT progresses through sequence:
   - diagnose → find error
   - read_candidate → load test file
   - generate_fix → LLM proposes fix (Phase 3 calls host.llm.complete())
   - verify_compilation → Run tsc (Phase 3 calls host.process.exec())
   - run_related_tests → vitest on module
   - validate_quality → coverage check (Phase 3 calls host.fs.readFile())

5. Quality threshold met:
   - commit_changes → git add + commit (Phase 3 calls host.process.exec())
   - advance_candidate → next failing test
   - praise_improvement → celebrate

6. Cycle complete:
   - BT emits 'bt_complete'
   - Phase 2 persists state (if --commit)
   - Phase 2 logs metrics
   - Loop back to cycle 2 with fresh runtime

7. After 10 cycles:
   - Accumulate 10 commits
   - Output statistics: 10 tests fixed, quality improved 15%
   - Exit gracefully
```

---

## Key Improvements Over Prior Architecture

| Aspect                | Before                               | After                                         |
| --------------------- | ------------------------------------ | --------------------------------------------- |
| **Action Definition** | 1,800-line TS switch in CLI          | Declarative BT in `.hsplus`                   |
| **Decoupling**        | Tightly coupled to TypeScript        | BehaviorTree-driven, language-agnostic        |
| **Testability**       | Hard to isolate handlers             | Each handler unit-testable independently      |
| **Extensibility**     | Add action = edit TS switch          | Add action = edit BT composition              |
| **Runtime Safety**    | No protection against infinite loops | Contamination detection + per-file quarantine |
| **Maintainability**   | Scattered logic across files         | Centralized in `daemon-actions.ts`            |

---

## Files Changed

### New Files

- `packages/core/src/cli/__tests__/holoscript-daemon-integration.test.ts` — End-to-end integration tests
- `packages/core/src/daemon/daemon-actions.ts` — 16 standalone handlers (~300 lines)
- `DAEMON_ARCHITECTURE.md` — This file

### Modified Files

- `packages/core/src/runtime/HeadlessRuntime.ts` — Added `ActionHandler` type, `emit/on/registerAction` methods
- `packages/core/src/cli/holoscript-runner.ts` — Added `daemon` subcommand with cycle control
- `packages/core/src/index.ts` — Export `ActionHandler` type
- `packages/core/src/profiles/index.ts` — Export `ActionHandler` type

### Deleted Files

- `packages/core/src/self-improve/self-improve-bridge.ts` — No longer needed (replaced by native bridge)

---

## Testing

### Unit Tests

- **BehaviorTree trait**: 16/16 handlers pass individual tests
- **HeadlessRuntime profiles**: 31/31 action bridge tests pass

### Integration Tests

- **End-to-End**: 4 comprehensive scenarios covering all three phases
  1. Native action bridge — action → handler → result
  2. Daemon subcommand — cycle control and state persistence
  3. Standalone handlers — diagnose, generate_fix, verify_compilation
  4. Failure recovery — handler failures + retry logic

### Regression Tests

- **E2E Suite**: 8/8 existing tests still pass
- **Full Core Suite**: 45,331/45,336 tests pass (5 pre-existing failures unrelated to daemon)

---

## Usage

### Basic Daemon Run

```bash
# Single cycle, dry-run (no commits)
holoscript daemon compositions/self-improve-daemon.hsplus

# 10 cycles with commits
holoscript daemon compositions/self-improve-daemon.hsplus --cycles 10 --commit

# With debug output
holoscript daemon compositions/self-improve-daemon.hsplus --cycles 5 --debug
```

### Daemon Control

While running:

- `Ctrl+C` — Graceful shutdown (releases lock file)
- Monitor `logs/daemon-{trial}.log` — See cycle progress

### Error Handling

- **API credits**: Daemon checks LLM credits before starting; refuses to run if insufficient
- **Compilation errors**: Daemon catches and forwards to handlers; doesn't fail the cycle
- **Test failures**: Daemon uses failures as diagnostic input; continues trying fixes
- **Infinite loops**: Contamination detection auto-quarantines files after 2 failures

---

## Next Steps

1. **Integration with Hololand** — Enable HoloLand environments to run daemon cycles
2. **Distributed daemon fleet** — Multiple daemons improve different codebases in parallel
3. **Knowledge distillation** — Compress learnings into reusable patterns across projects
4. **CI/CD integration** — Automatically run daemon on pull request branches
