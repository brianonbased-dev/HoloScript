---
doc_tier: research
research_phase: base
status: active
last_verified: 2026-05-06
canonical_for: "cursor-mdc-spec"
supersedes: ""
extends: "C:/Users/josep/.ai-ecosystem/research/2026-05-06_context-as-compile-target.md"
---

### Machine summary (uAA2 COMPRESS)

**TL;DR:** Cursor workspace rules use `.cursor/rules/*.mdc` files with `description`, `globs`, and `alwaysApply` frontmatter. The v1 `compile_to_cursor_rules` emitter should produce one always-applied `.mdc` file per refusal, hard-don't, and default rule, plus a small `_ecosystem-context.mdc` index for identity, authority order, and vision pillars.

- **W —** Treat Cursor rules as a multi-file rule directory, not as another single-file `CLAUDE.md`/`AGENTS.md` target.
- **P —** Emit small kebab-case `.mdc` files with `alwaysApply: true`, empty `globs`, and focused markdown bodies.
- **G —** Cursor frontmatter is camelCase (`alwaysApply`); snake_case or guessed glob semantics would create stale or misrouted rules.

**Evidence:** `research/2026-05-06_cursor-mdc-spec.md`; existing `.cursor/rules/*.mdc`; `ContextCompiler` `cursor_rules` follow-up task notes.

---

# Cursor `.mdc` rule format — spec research (Phase 1 follow-up)

> Spec-research subtask for `compile_to_cursor_rules` emitter (task_1778120018296_bv8r).
> Source: `task_1778120018296_bv8r.description` § Part A — One-day spec research subtask.
> Parent spec: `~/.ai-ecosystem/research/2026-05-06_context-as-compile-target.md` § `compile_to_cursor_rules` (line 336) + § Phase 1 — RATIFIED ordering Q5 (line 387).

## Why this memo exists (founder ruling Q5)

Task description: research is BLOCKING for the emitter design — don't guess the spec. Cursor is a first-class daily founder surface (per `~/.ai-ecosystem/CLAUDE.md` identity note: `cursor1`/`cursor2` auto-numbered handles). Punting cursor would mean founder lives with stale rules during Phase 1-3 — itself a demote (parent memo line 387).

## Sources consulted

1. **Cursor docs** — `https://cursor.com/docs/context/rules` (canonical, fetched 2026-05-06). Original `docs.cursor.com/context/rules` 308-redirects to `cursor.com/docs/context/rules`.
2. **In-use shape** — existing `.cursor/rules/*.mdc` files in this repo + ai-ecosystem:
   - `HoloScript/.cursor/rules/holodoor-security.mdc` (1326 bytes, 2026-04-26)
   - `HoloScript/.cursor/rules/team-peer-protocol.mdc` (1053 bytes, 2026-04-15)
   - `~/.ai-ecosystem/.cursor/rules/holodoor-security.mdc` (1101 bytes, 2026-04-15)
   - `~/.ai-ecosystem/.cursor/rules/team-peer-protocol.mdc` (2590 bytes, 2026-04-27)

## Frontmatter spec (verified)

```mdc
---
description: <string — one-line summary used by Agent for relevance routing when alwaysApply=false>
globs: <comma-separated glob patterns, or empty>
alwaysApply: <boolean — true|false>
---

<markdown body — one rule per file>
```

| Field          | Type                              | Purpose                                                                        |
|----------------|-----------------------------------|--------------------------------------------------------------------------------|
| `description`  | String                            | Agent uses this to decide relevance when `alwaysApply: false`. Required-ish.   |
| `globs`        | String (comma-separated patterns) | File patterns that auto-attach the rule. Empty = not glob-scoped.              |
| `alwaysApply`  | Boolean                           | If `true`, rule applies every chat session; `globs` and `description` ignored. |

### Rule-type matrix (derived from frontmatter combinations)

| Type                      | `alwaysApply` | `description` | `globs`   | Trigger                           |
|---------------------------|---------------|---------------|-----------|-----------------------------------|
| Always Apply              | `true`        | —             | —         | Every chat session                |
| Apply Intelligently       | `false`       | provided      | omitted   | Agent picks based on description  |
| Apply to Specific Files   | `false`       | —             | provided  | File matches glob pattern         |
| Apply Manually            | `false`       | omitted       | omitted   | User `@`-mentions in chat         |

### Verified against in-use files

Both `holodoor-security.mdc` and `team-peer-protocol.mdc` use the **Always Apply** shape (`alwaysApply: true`, `globs:` empty). This matches our use case for ecosystem context — rules are not file-scoped, they apply across the whole workspace. Refusals/hard-don'ts are session-wide, not file-pattern-triggered.

### Casing

Field names are **camelCase** (`alwaysApply`), **not** snake_case. Confirmed in both Cursor docs and in-use files.

## Glob pattern syntax (when used)

- `*` — single file segment
- `**` — any number of directories
- Multiple patterns separated by **commas**, e.g. `src/**/*.tsx, *.md`

Not used by our emitter v1 (we emit Always-Apply rules), but documented here so we know the shape if `applies_to` ever maps to a file scope in the future.

## File-organization conventions (Cursor's idioms)

- Stored in `.cursor/rules/` (workspace-relative).
- One rule per file. Cursor keeps rules small and composable — split anything over 500 lines.
- Subdirectories OK for grouping (e.g. `.cursor/rules/security/`).
- Reference other files via `@filename` rather than copying content.
- File names: kebab-case ending in `.mdc`. Example: `holodoor-security.mdc`.

## Mapping decisions for `compile_to_cursor_rules`

Per parent spec lines 336-340:

> - Each `@refusal` / `@hard_dont` / `@default` becomes one `.mdc` file
> - Cursor frontmatter (`description`, `globs`, `alwaysApply`) derived from `applies_to` field
> - Body is one rule per file (Cursor's idiom — small focused files)

Concrete decisions for v1:

1. **One file per rule.** `@refusal` → `refusal-<name>.mdc`, `@hard_dont` → `hard-dont-<name>.mdc`, `@default` → `default-<name>.mdc`. File name from rule `name` field (snake_case → kebab-case).
2. **`alwaysApply: true`** for `@refusal` and `@hard_dont` (cross-session rules — user can't safely opt out). Defaults emit as `alwaysApply: true` too — they're answer-immediately defaults, not file-scoped.
3. **`globs: <empty>`** when `applies_to` is empty, `["all"]`, `["all surfaces"]`, or `["any"]` (sentinel words for "no scope"). Otherwise we'd need a file→glob mapping which v1 doesn't have. Future v2: map `applies_to: ["typescript"]` → `globs: **/*.ts, **/*.tsx`.
4. **`description`** = one-line summary derived from rule `name` + `reason` (refusal/hard_dont) or `when` (default). Single line, no newlines.
5. **Body** = the rule's full content rendered as markdown — `When/Do/Do not/Reason` block for refusals, `Reason/Alternative/Applies to` for hard_donts, `When/Do/Reason` for defaults.

### Output shape difference vs `claude_md` / `agents_md`

Both prior emitters return `Map<filename, content>` with a single key (`CLAUDE.md` or `AGENTS.md`). Cursor emits **one file per rule** — multiple keys in the same `files` map. The `Record<string, string>` shape on `ContextCompileResult.files` already supports this (parent task description Part B line 6: "Output: Map<filename, content> instead of single string").

File-key convention for Cursor output: `.cursor/rules/<rule-type>-<rule-name>.mdc` (full path relative to repo root, since the consumer of this emit format will write to disk at exactly that location).

Example keys for a 2-refusal + 1-hard_dont + 1-default composition:

```
.cursor/rules/refusal-bandaid.mdc
.cursor/rules/refusal-demote.mdc
.cursor/rules/hard-dont-git-add-all.mdc
.cursor/rules/default-commit-now-if.mdc
```

### Identity, vision pillars, authority order — what about those?

These are not per-rule traits — they're top-level blocks. Cursor's idiom is one-rule-per-file, not one-block-per-file. Decision: emit a single index file `.cursor/rules/_ecosystem-context.mdc` that contains identity + authority order + vision pillars + production rule + output shape + cross-references — the "always-loaded background" for the workspace. Underscore-prefix sorts it first in directory listings (Cursor doesn't depend on order, but humans browsing the directory benefit).

Per-rule files cover the BLOCK rules (refusals/hard_donts) and answer-defaults — the things that need their own description+frontmatter to be Agent-routable.

## What the emitter does NOT do (v1 scope)

- **No glob mapping yet.** `applies_to` semantics are too varied today (mix of "all", "supervisor", "typescript", role names) to map to file globs without ratifying a vocabulary subset. v1 emits empty `globs:` and `alwaysApply: true` uniformly. v2 (separate task) can introduce a mapping table when `applies_to` semantics are pinned.
- **No `@`-mention rules.** Apply-Manually rules (no `description`, no `globs`, `alwaysApply: false`) require user-typed invocation. Our context primitives are not user-invoked, they're session-wide. Out of scope.
- **No subdirectory grouping.** All v1 output goes flat under `.cursor/rules/`. Subdirectories are a future organization decision; the emitter doesn't preempt.

## Decisions ratified for the implementation (Part B)

1. **`ContextEmitFormat` union**: add `'cursor_rules'` (already in the union — verified ContextCompiler.ts:249).
2. **Switch in `compile()`**: remove the `Phase 1+ follow-up` throw branch for `'cursor_rules'`; route to new `emitCursorRules(ast)` method (ContextCompiler.ts:384).
3. **`emitCursorRules(ast)` returns `Record<string, string>`** — one entry per rule plus the `_ecosystem-context.mdc` index file. Keys are full repo-relative paths (`.cursor/rules/<name>.mdc`).
4. **Body conventions**: short focused content, no `Generated by` trailer per rule (the index file gets the trailer; per-rule files stay terse — Cursor users see the rule body inline when the rule fires).
5. **File naming**: lowercase, kebab-case. Internal underscores in rule names (e.g. `git_add_all`) → kebab-case (`git-add-all`). Strict `[a-z0-9-]+` filter at emit time, fall back to a hash if the result is empty (defensive — never emit a malformed filename).

## Test plan (Part B test surface)

- Per-file output shape: assert that result.files has multiple keys, all under `.cursor/rules/`, all ending in `.mdc`.
- Frontmatter: assert each emitted file starts with `---\n` and contains `alwaysApply: true`, valid `description:`, `globs:` line.
- Body: assert refusal files contain `**When**` / `**Do**` / `**Do not**`. Hard_dont files contain `**Reason**` / `**Alternative**`. Default files contain `**When**` / `**Do**`.
- Index file: assert `.cursor/rules/_ecosystem-context.mdc` is present and contains identity name, authority order, vision pillars.
- False-case (G.GOLD.013): assert `CLAUDE.md` and `AGENTS.md` are NOT in the output. Assert no per-rule file contains the `Generated by HoloScript` trailer (only the index file does).
- Empty composition: only the trailer-bearing index file emits (no per-rule files).
- Dual-format compile: `formats: ['claude_md', 'cursor_rules']` produces `CLAUDE.md` plus the per-rule files in one pass.

## Open questions (deferred to v2 — not v1 blockers)

- Should `@hard_physical_gap` get its own `.mdc`? Decision deferred. v1 surfaces them only in the index file. Rationale: hard physical gaps describe what the skill *cannot* absorb — they're not actionable rules an Agent enforces, they're posture. The index file is the right home until a v2 use case proves otherwise.
- Should `@routine` (A-00X) emit one .mdc per routine? Deferred to v2. Routines are scheduled triggers, not in-session rules. The index file's "Recurring routines" table is enough surface area for v1.
- Should `@skill` registrations emit per-skill `.mdc` files? The parent spec has `compile_to_skill_md` for that — not this emitter's job. Skills appear in the index file as a registry only.

---

*Research timestamp: 2026-05-06. Spec verified live against `cursor.com/docs/context/rules` (after the documented 308 redirect from `docs.cursor.com`). Existing `.cursor/rules/*.mdc` files in HoloScript and ai-ecosystem repos confirm the in-use shape matches the documented spec.*
