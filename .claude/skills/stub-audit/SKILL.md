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
  trait_name=$(basename "$trait" .ts | sed 's/Trait$//' | sed -E 's/([A-Z])/_\L\1/g' | sed 's/^_//')
  ref_count=$(grep -rn "'$trait_name'" packages/core/src/compiler/ packages/core/src/HoloScript*Compiler.ts 2>/dev/null | wc -l)
  echo "$trait_name|$ref_count"
done
```

A trait is a **CONFIRMED stub-pattern violation** when:
- Effective onUpdate LOC < 30
- AND compiler reference count >= 2

Flag as **POTENTIAL** when:
- Effective onUpdate LOC < 30 AND compiler ref count == 1
- OR effective onUpdate LOC == 0 (event-only) AND compiler ref count >= 2

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

## Event-only traits (no onUpdate by design — verify intentional)

| Trait | onAttach LOC | Compiler refs |
|-------|--------------|---------------|

## Summary

- Total traits scanned: N
- CONFIRMED stubs: N
- POTENTIAL stubs: N
- Recommended next /idea synthesis: target the top-3 CONFIRMED entries
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
