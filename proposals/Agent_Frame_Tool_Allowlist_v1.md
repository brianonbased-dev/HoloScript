# Agent frames: a way to say "no tools" (G15) — v1

**Status:** Proposed 2026-09-28 under the Spec v0.1 gate rule (approval by gates, not by a person; founder direction 2026-09-28). Built in PR #456 with gates 1 to 3 (measured breakage, corpus, switch-off run); gate 4, a reviewer of another seat in another session, pending, so not yet accepted. Enforcement is in TypeScript: core's frame trait, the agent loader and the MCP server's SDK transport. The Rust checker only parses frames. The server's stateless tool routes (POST /mcp, POST /tools/call) do not run the frame check yet: task_1790649717250_6fef.
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

`denied_domains` still takes precedence over the tool list, as today, but only where a check is
given the call's domain (core's trait, through its `frame_check_tool` event): the MCP server's gate
checks a tool's name alone, because a tool call carries no domain tag, so there `["*"]` permits
every tool whatever domains the frame denies.

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

1. A frame with `allowed_tools: []` denies every tool call, in the TypeScript trait, in the agent
   loader and in the MCP gate. Rust only parses the field (`ast.rs`); it evaluates no frame, so
   its test is that an omitted list parses as `["*"]`.
2. `["*"]` allows any tool; an omitted list allows any tool; `["read"]` allows only `read`.
3. `TrustedAnalyst` still allows every tool after its migration.
4. Fed the old rule (empty = all), test 1 fails.

## How each reader reads a frame

Three programs read a frame. Core's `.hsplus` parser is the canonical one, and core's trait
enforces what it reads. The agent loader (`packages/holoscript-agent/src/brain.ts`) reads the frame
an agent sends with every MCP tool call, and the MCP gate enforces that. The Rust reader
(`packages/compiler-wasm`) only parses. They agree on every ordinary frame. Where they differ, the
agent loader is never wider than core: it may permit fewer tools, never more. The shared cases in
`packages/agent-protocol/src/__tests__/fixtures/frame-allowlist-cases.json` pin each reader's answer,
and every reader's tests run them.

| Written                                                   | Core                                                                             | Rust                                                            | Agent loader                     |
| --------------------------------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------- | -------------------------------- |
| Two frames in one brain                                   | keeps the last                                                                   | returns both; combines none                                     | only the tools both permit       |
| `@frame_declaration("allowed_tools": [])`                 | every tool (it reads no quoted key in parentheses)                               | refuses parentheses                                             | no tool                          |
| `@frame_declaration("read")`                              | every tool (a name with no key is no list)                                       | refuses parentheses                                             | every tool                       |
| `@frame_declaration` with no block after it               | every tool (all defaults)                                                        | every tool (all defaults)                                       | no tool                          |
| A line break or a `//` comment between the name and `{`   | refuses the brain                                                                | reads the block                                                 | reads the block                  |
| A block comment that never closes, after the name         | refuses the brain (the comment swallows its closing `}`)                         | every tool (its lexer reads the comment to the end of the file) | no tool                          |
| A key that looks like a frame key, such as `allowedTools` | refuses                                                                          | refuses                                                         | refuses: the brain does not load |
| A frame shown as an example in the brain's prompt         | not read once PR #481 blanks the prompt (before it, such a brain does not parse) | not applicable                                                  | not read                         |

A key looks like a frame key when, ignoring letter case, `_`, `-` and spaces, it is at most two
letters away from one of the six frame keys (`domain`, `horizon`, `capability_tier`, `trust_tier`,
`allowed_tools`, `denied_domains`): `allowedTools`, `allowed_tool` and `allow_tools` all look like
`allowed_tools`. A reader that ignored such a key would read the real key as left out, which is its
widest value, so the typo `allowedTools: []` would mean every tool. A brain's prompt is the free text
above its first section line written at column 0 (`#brain`, `#version`, `identity {`, ...), the
rule of PR #481.

## What remains after this proposal

- Whether an omitted list should default by trust tier instead of "every tool" is a separate
  question; this proposal keeps today's default so no brain changes behavior silently.
- Both lexers read a block comment that never closes to the end of the file instead of refusing
  it. No enforced frame is widened by that (core refuses the brain, and Rust enforces no frame),
  but the Rust reader then reads a bare frame as every tool.
- Other allowlists still read an empty list as "everything": board policy `allowedTools`, the
  holoshell receipts, `@identity allowed_tools` and others (claude3's review lists them). The
  same word means two things until the spec says so in one place.

## What changed after review

Second review (claude3, 2026-10-05, at commit 7e3b314a5), changed in PR #456:

- The agent loader no longer misses a frame because of a comment. It skips block comments,
  including ones that run over several lines, before `@frame_declaration` and between the name and
  its `{`. Before, `/* don't widen */ @frame_declaration { allowed_tools: ["read"] }` sent no
  frame, so every tool.
- When the loader finds `@frame_declaration` with no block it can read after it, it sends a frame
  that permits no tool. It never sends no frame.
- The loader reads frames only from the brain's code, below the prompt. An example frame in the
  prompt no longer gives a frameless brain no tool, and prose no longer narrows a real frame.
- Only the exact entry `"*"` opens every tool. `"a*"`, `" * "`, `"**"`, `"*a"` and look-alike stars
  each name one tool, and a list inside the list names none. Every reader and the MCP gate are
  tested on them.
- A key that looks like a frame key makes every reader refuse the frame. Refusing was chosen over
  narrowing to no tool: a refusal tells the author at once, while a frame quietly narrowed looks
  like a working agent that can do nothing. Where a frame cannot be refused (core's trait coercer,
  a Rust node built without the parser), it is closed to no tool.
- Where the readers still differ, the table above says how, and the shared cases pin it.
- A stale build of `@holoscript/agent-protocol` now stops a brain with a frame from loading, with
  the command that rebuilds it, instead of sending the frame as `[undefined]`.
- The browser build of the WASM package (`pkg/`) is rebuilt with `pkg-node/`, so both read an
  omitted list as `["*"]`.
- The MCP gate's comments name the A2A task route (`POST /a2a/tasks`) among the routes that do not
  run the frame check yet.
- Measured again on 2026-10-05, over the same 4,882 tracked files in both repos, with main's
  loader, the first round's and this one: the same 3 files hold frames, no file's frame changes in
  this round, and no file is refused.
