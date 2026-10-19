# @holoscript/framework

## 6.1.8

### Patch Changes

- 268e183: The HoloScript generator prompt (`HOLOSCRIPT_SYSTEM_PROMPT`, newly exported with
  `HOLOSCRIPT_EXAMPLE_PROGRAM`) shows whole programs that parse: a real quickstart scene
  inside its `composition "Name" { ... }` root, plus programs for templates used with
  `using`, groups, comments and state-machine transitions. Every program in it is
  parse-tested as .holo (and as .hsplus, except the state machine). It no longer teaches
  a named material or `@advanced_pbr`, which web targets drop.

  Measured on the 14 author_holo tasks, right answers with every requested detail:
  Gemini 3.1 Pro 36 of 42 (33 with the prompt before the template, group, comment and
  state-machine programs), Qwen3-4B 10 of 14 (10 before). The forms were chosen from that
  benchmark's misses, so the gain is in-sample.

  Every framework AI adapter (OpenAI, Anthropic, Ollama, LM Studio, Gemini, xAI,
  Together, Fireworks, NVIDIA) now sends that prompt for generate, fix and optimize, and
  for chat the same knowledge with its "return only code" rule lifted. Explain uses a
  short "explain clearly" prompt on every adapter: with the long prompt, Qwen3-4B answered
  explain requests with code. Before, several adapters sent their own one-line prompts
  for generate, fix and optimize too.

- Updated dependencies [4ecc50e]
- Updated dependencies [268e183]
- Updated dependencies [857c54a]
- Updated dependencies
  - @holoscript/core@8.10.0
  - @holoscript/llm-provider@1.7.0

## 6.1.0

### Changed

- Align release metadata with the HoloScript 6.x line. See the root CHANGELOG for the outward-facing release narrative.

## 6.0.5

### Patch Changes

- Updated dependencies
  - @holoscript/core@6.1.0

## 6.0.3

### Patch Changes

- @holoscript/core@6.0.3
