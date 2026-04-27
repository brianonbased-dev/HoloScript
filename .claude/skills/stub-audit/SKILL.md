---
name: stub-audit
description: >
  Detects Pattern B trait stubs in the HoloScript ecosystem — trait files where
  compiler files reference the trait as if its runtime works, but the actual
  onUpdate body is <30 effective LOC of placeholder code. Produces a ranked
  report of stub candidates so future agents can WIRE+BUILD on existing seams
  rather than create duplicate parallel traits (the failure mode that idea-run-3
  caught with @neural_locomotion vs NeuralAnimationTrait). Auto-fire whenever
  the conversation touches: "is there an existing trait for X", "should we add
  a new trait for X", "does the runtime actually do X", "the compiler references
  this but does it work", or before any /idea synthesis that proposes a new trait.
  Manual invocation via /stub-audit [trait-glob].
argument-hint: "[optional trait file glob — default scans all packages/core/src/traits/*Trait.ts]"
disable-model-invocation: false
allowed-tools: Bash, Read, Grep, Glob
context: fork
---

# stub-audit — Pattern B trait stub detector

You are running a **read-only audit** of the HoloScript trait surface to find
"stub-shaped" trait bodies that compilers reference as live but whose runtime
implementations are placeholder. This pattern was named by idea-run-3
(`research/2026-04-26_idea-run-3-neural-locomotion.md` Pattern B) — agents
propose NEW traits (`@neural_locomotion`) when an existing trait
(`NeuralAnimationTrait`) is name-correct but body-empty.

**Output**: a markdown report ranking stub candidates by stub-severity ×
compiler-reference-count. The report goes to stdout; do NOT modify any files.

## Working directory

Primary scan target: `C:\Users\Josep\Documents\GitHub\HoloScript`

The argument `$ARGUMENTS` may narrow the scan. Default: `packages/core/src/traits/*Trait.ts`.

## Phase 1 — Enumerate trait files

```bash
cd C:/Users/Josep/Documents/GitHub/HoloScript
ls packages/core/src/traits/*Trait.ts | head -100
```

Report the count. Cap traits scanned at 80 to keep context bounded.

## Phase 2 — Measure stub-shape per trait

For each trait file, extract the `onUpdate` body and count **effective LOC**:
- Total lines in the function body (between the matching braces)
- MINUS blank lines, comment-only lines, lines that are just `}` or `{`
- MINUS lines that are state-init only (e.g. `state.X = 0;` patterns)
- MINUS lines that are only `context.emit(...)` or `ctx.emit(...)` calls

Use this awk/grep recipe (or equivalent):

```bash
for f in packages/core/src/traits/*Trait.ts; do
  # Find onUpdate function body
  on_update_lines=$(awk '
    /onUpdate.*\(/ { in_func=1; brace_count=0 }
    in_func {
      if ($0 ~ /\{/) brace_count += gsub(/\{/, "{")
      if ($0 ~ /\}/) brace_count -= gsub(/\}/, "}")
      if (in_func && brace_count > 0) print
      if (in_func && brace_count == 0 && $0 ~ /\}/) { in_func=0 }
    }
  ' "$f")
  effective=$(echo "$on_update_lines" | grep -vE '^\s*(\/\/|\*|\s*$|\}\s*$|\{\s*$)' | grep -vE '(emit|ctx\.|context\.)' | wc -l)
  total=$(echo "$on_update_lines" | wc -l)
  echo "$f|$total|$effective"
done | awk -F'|' '$3 < 30 && $3 > 0 { print }' | sort -t'|' -k3 -n
```

Capture the result. Files with effective onUpdate LOC < 30 are stub candidates.
Files with NO onUpdate (effective=0) may be event-only traits — flag separately
but don't auto-stamp as stubs.

## Phase 3 — Cross-reference compiler files

For each stub candidate, count references in compiler files:

```bash
for trait in <candidate-list>; do
  # Name derivation that handles PascalCase initialisms correctly.
  # AINPCBrainTrait → ai_npc_brain (NOT a_i_n_p_c_brain)
  # NeuralAnimationTrait → neural_animation
  # CRDTRoomTrait → crdt_room
  # Two-pass split: (1) cap-run → Cap+lower; (2) lower → Cap.
  trait_name=$(basename "$trait" .ts | sed 's/Trait$//' \
    | sed -E 's/([A-Z]+)([A-Z][a-z])/\1_\2/g' \
    | sed -E 's/([a-z0-9])([A-Z])/\1_\2/g' \
    | tr '[:upper:]' '[:lower:]' \
    | sed 's/^_//')
  ref_count=$(grep -rn "'$trait_name'" packages/core/src/compiler/ packages/core/src/HoloScript*Compiler.ts 2>/dev/null | wc -l)
  echo "$trait_name|$ref_count"
done
```

**Verified name derivation** (regression-tested 2026-04-26 against real codebase): `AINPCBrain → ai_npc_brain` (16 refs), `NeuralAnimation → neural_animation`, `CRDTRoom → crdt_room`, `ABTest → ab_test`. The naive single-pass `sed s/([A-Z])/_\L\1/g` produces `a_i_n_p_c_brain` and finds zero refs — false-negative on every initialism trait. The two-pass approach fixes it.

A trait is a **CONFIRMED stub-pattern violation** when:
- Effective onUpdate LOC < 30
- AND compiler reference count >= 2

Flag as **POTENTIAL** when:
- Effective onUpdate LOC < 30 AND compiler ref count == 1
- OR effective onUpdate LOC == 0 (event-only) AND compiler ref count >= 2

## Phase 3.5 — Pattern E detection (emit-without-listener)

**Pattern B** (covered above) flags traits whose `onUpdate` body is a stub.
**Pattern E** flags traits whose body emits events that NO downstream
consumer reads — the failure mode discovered 2026-04-27 in /critic batch-6
review of commits 527d1236e + 62185dd56: a trait can be FULLY WIRED at
the body level and still be a tombstone if its emit-targets have no
listener anywhere outside `__tests__/` and the trait file itself.

**Algorithm**: for each event the trait emits, count listeners outside
`packages/core/src/traits/` (the emitter's home). If zero — flag as Pattern E.

```bash
# Verified-working regex (regression-tested 2026-04-27 against
# OnnxRuntimeTrait + NeuralForgeTrait + NeuralAnimationTrait):
for trait in <all-trait-files>; do
  # Extract emitted event names from `context.emit?.('event')` patterns.
  # The two-step grep simplification: first match the emit prefix + first
  # quote + event name, then re-extract just the quoted name.
  emits=$(grep -oE "context\.emit\?[^']*'[a-z_:]+'" "$trait" \
    | grep -oE "'[a-z_:]+'" \
    | tr -d "'" \
    | sort -u)
  [ -z "$emits" ] && continue

  for evt in $emits; do
    # Search consumer-side packages — runtime, studio, r3f-renderer, engine.
    # Exclude the emitter's own home (core/traits) so we don't count self-references.
    listener_count=$(grep -rn "['\"]${evt}['\"]" \
      packages/runtime/src/ \
      packages/studio/src/ \
      packages/r3f-renderer/src/ \
      packages/engine/src/ \
      2>/dev/null | wc -l)
    if [ "$listener_count" -eq 0 ]; then
      echo "PATTERN_E|$(basename "$trait")|$evt|0_listeners"
    else
      echo "WIRED|$(basename "$trait")|$evt|${listener_count}_listeners"
    fi
  done
done
```

**To support `ctx.emit?` callers as well**, swap the first regex to
`(context|ctx)\\.emit\\?[^']*'[a-z_:]+'`. The current single-pattern version
covers all 4 wired traits this session; expand if a future trait uses `ctx.`.

**A trait is a PATTERN E violation when**:
- It emits 1+ events that have ZERO listeners across consumer packages.
- Severity scales with: (a) compiler reference count (high = more callers
  expecting the events to fire), (b) number of distinct events with no
  listeners (more = bigger void). A trait emitting 12 events with all-zero
  listeners is the canonical extreme (ComputeTrait at /critic batch-6).

**Pattern E + Pattern B can co-exist**: a trait can be a stub AND emit
into the void. Wiring the stub body without wiring the consumer just
moves the failure mode from "no work" to "work that nobody reads".

**Verified Pattern E examples on real codebase 2026-04-27**:
- `OnnxRuntimeTrait` (post-commit 527d1236e WIRE): emits `onnx:loaded`,
  `onnx:output`, `onnx:error`, `onnx:disposed` — all 0 listeners outside
  `__tests__/`. Pattern B closed, Pattern E opened — exactly the
  failure mode /critic Critical #1 named.
- `NeuralForgeTrait` (post-commit 62185dd56 WIRE): same shape — events
  emit, no listener anywhere.

**Pattern E REPORT integrates with the main report** in Phase 4 below.

## Phase 4 — Produce report

Output to stdout (do NOT write to disk unless user says so):

```markdown
# Stub-audit report — <date>

## CONFIRMED Pattern B violations (high priority)

| Trait | Effective onUpdate LOC | Compiler refs | Suggested action |
|-------|------------------------|---------------|------------------|
| ...   | <number>               | <number>      | WIRE/BUILD recommendation |

## POTENTIAL stubs (medium priority — investigate)

| Trait | Effective onUpdate LOC | Compiler refs | Notes |
|-------|------------------------|---------------|-------|
| ...   | ...                    | ...           | ...   |

## Pattern E violations — emit-without-listener (the void trap)

Traits whose body is wired but whose emitted events have ZERO listeners
across consumer packages (runtime/, studio/, r3f-renderer/, engine/).
This is the "WIRE'd Pattern B is now Pattern E" failure mode caught
post-2026-04-27. WIRE-ing the body without a consumer just relocates
the failure from "no work" to "work nobody reads".

| Trait | Events into the void | Compiler refs | Suggested action |
|-------|----------------------|---------------|------------------|
| ...   | <count> / <names>    | <number>      | WIRE-CONSUMER recommendation |

## Event-only traits (no onUpdate by design — verify intentional)

| Trait | onAttach LOC | Compiler refs |
|-------|--------------|---------------|

## Summary

- Total traits scanned: N
- CONFIRMED Pattern B stubs: N
- POTENTIAL stubs: N
- PATTERN E violations: N (events into the void)
- Recommended next /idea synthesis: target the top-3 CONFIRMED Pattern B
  entries OR the top-1 Pattern E (whichever has highest compiler ref count
  — consumer-side WIRE for Pattern E unblocks N traits at once via shared
  consumer infrastructure).
```

For each CONFIRMED entry, suggest a concrete WIRE+BUILD framing:
- "Existing seam — extend `<trait>.onUpdate` body with <pattern>" rather than "propose new `@<x>` trait"

## Phase 5 — Cross-reference idea-run-3 findings

The Pattern B examples already cited in `research/2026-04-26_idea-run-3-neural-locomotion.md`:
- `NeuralAnimationTrait` (180 LOC, ~28 effective onUpdate) — RESOLVED 2026-04-26 via commits 292b47e4c + 559ec681b
- `OnnxRuntimeTrait` (44 LOC stub) — UNRESOLVED, candidate for next BUILD
- `NeuralLinkTrait` (99 LOC) — UNRESOLVED
- `NeuralForgeTrait` (124 LOC) — UNRESOLVED

If the scan re-confirms these (or finds new entries), tag each row with
RESOLVED/UNRESOLVED based on the scan's effective LOC count vs the prior memo.
A trait that was a stub but is no longer (effective LOC > 30) should be
reported as "GRADUATED — was stub at <prior-date>, now wired".

## Anti-patterns this skill avoids

- Do NOT modify trait files (read-only audit).
- Do NOT propose new trait names (the whole point is "extend existing seam").
- Do NOT auto-file board tasks (output report only — user decides what to file).
- Do NOT count `console.log`, debugger statements, or test harness lines as effective LOC.
- Do NOT mistake a thin handler that delegates to a class (like `iKHandler` →
  `IKTrait` class) as a stub — those are wrappers around real implementations.
  When you find a thin handler, ALSO check if the corresponding class file has
  meaningful methods. If yes → not a stub.

## Output discipline

The report is the deliverable. Keep it under 200 lines. If more than 10
CONFIRMED + POTENTIAL combined, pick the top 10 by `effective_loc < 30 AND
compiler_refs DESC`. Mention the cap.
