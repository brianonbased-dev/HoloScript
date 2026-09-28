# Agent frames: a way to say "no tools" (G15) — v1

**Status:** Accepted 2026-09-28 under the Spec v0.1 gate rule (approval by gates, not by a person; founder direction 2026-09-28); implemented in this PR, review pending.
**Gap:** G15 in [`docs/spec/spec-vs-reality-gap.md`](../docs/spec/spec-vs-reality-gap.md).
**Board:** task_1790587169083_1y5v.

## For Joseph, in plain words

An agent's frame lists the tools it may use. Today an empty list means "every tool", and leaving the
list out also means "every tool". So there is no way to write "this agent may use no tools", and an
AI that writes an empty list meaning "none" hands the agent every tool instead.

The change: `["*"]` means every tool (the same star the frame already uses for "any domain"), an
empty list means no tools, and leaving the list out keeps today's meaning.

What breaks: one example file, which uses an empty list on purpose to mean "every tool"; it changes
to `["*"]` in the same change.

**Decided 2026-09-28 (yes), as an agent decision under the gate rule.** The question as first posed: Should an empty tool list mean "no tools", with `["*"]` for "every tool" —
yes or no?

## What the change is

| Written in the frame      | Today                      | After                   |
| ------------------------- | -------------------------- | ----------------------- |
| `allowed_tools` omitted   | every tool                 | every tool (unchanged)  |
| `allowed_tools: []`       | every tool                 | **no tool**             |
| `allowed_tools: ["*"]`    | a tool literally named `*` | every tool              |
| `allowed_tools: ["read"]` | only `read`                | only `read` (unchanged) |

`denied_domains` still takes precedence over the tool list, as today.

Code seams: `packages/core/src/traits/FrameDeclarationTrait.ts` (`DEFAULT_FRAME` becomes
`allowed_tools: ["*"]`; the check allows a tool when the list contains `*` or the tool, and denies
everything for an empty list) and `packages/compiler-wasm/src/ast.rs` (an omitted `allowed_tools`
defaults to `["*"]` instead of an empty vector; the doc comment "Empty vec = all tools permitted"
changes accordingly).

## Why

- Frames are how an agent's authority is bounded; "C++ for agents" depends on them meaning what
  they say. Today the empty list fails open.
- The frame already uses `"*"` for "any domain"; the same mark for "any tool" is one rule, not two.

## What existing files would break

Measured 2026-09-28 across every tracked `.hs`, `.hsplus` and `.holo` file in HoloScript and
ai-ecosystem:

- One explicit empty list: `compositions/frame-declaration-example.hsplus:99` (`TrustedAnalyst`,
  commented as "a more privileged agent"), which means "every tool". It becomes `["*"]` in the same
  change, keeping its meaning.
- Four files list specific tools (`compositions/founder-core.hs`,
  `compositions/frame-declaration-example.hsplus` twice, `examples/three-surface-agent/agent.hsplus`,
  `packages/holoscript-agent/src/brains/holoscript-engineer.hsplus`): unchanged.
- Every other brain omits the field: unchanged.
- Tests that build a frame with `allowed_tools: []` expecting "every tool"
  (`packages/core/src/traits/__tests__/FrameDeclarationTrait.test.ts:58`) change to `["*"]`.

## The test that proves it

1. A frame with `allowed_tools: []` denies every tool call, in the TypeScript trait and in the Rust
   AST/evaluator path.
2. `["*"]` allows any tool; an omitted list allows any tool; `["read"]` allows only `read`.
3. `TrustedAnalyst` still allows every tool after its migration.
4. Fed the old rule (empty = all), test 1 fails.

## What remains after this proposal

- Whether an omitted list should default by trust tier instead of "every tool" is a separate
  question; this proposal keeps today's default so no brain changes behavior silently.
