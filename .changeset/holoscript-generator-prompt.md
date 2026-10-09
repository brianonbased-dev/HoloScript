---
'@holoscript/llm-provider': minor
'@holoscript/framework': patch
---

The HoloScript generator prompt (`HOLOSCRIPT_SYSTEM_PROMPT`, newly exported with
`HOLOSCRIPT_EXAMPLE_PROGRAM`) shows whole programs that parse: a real quickstart scene
inside its `composition "Name" { ... }` root, plus programs for templates used with
`using`, groups, comments and state-machine transitions. Every program in it is
parse-tested as .holo (and as .hsplus, except the state machine). It no longer teaches
a named material or `@advanced_pbr`, which web targets drop.

Measured on the 14 author_holo tasks, right answers with every requested detail:
Gemini 3.1 Pro 36 of 42, Qwen3-4B 10 of 14. The forms were chosen from that
benchmark's misses, so the gain is in-sample.

Every framework AI adapter (OpenAI, Anthropic, Ollama, LM Studio, Gemini, xAI,
Together, Fireworks, NVIDIA) now sends that prompt for generate, fix and optimize, and
the same knowledge with its "return only code" rule lifted for explain and chat. Before,
several sent their own one-line prompts.
