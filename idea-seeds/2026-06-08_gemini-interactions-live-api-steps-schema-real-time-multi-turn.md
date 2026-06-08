# Gemini Interactions / Live API — steps[] schema for real-time multi-turn

**Date**: 2026-06-08
**Origin**: A-020 migration (Interactions API breaking change, outputs→steps)

## What might be valuable

The Gemini Interactions / Live API (`generativelanguage.googleapis.com/v1beta/models/:model:streamGenerateContent` with the live session protocol) supports real-time bi-directional streaming with a `steps[]` response schema:
- `step.type === 'user_input'` — what the user said
- `step.type === 'model_output'` — what the model returned (text + functionCall)

History for subsequent turns goes in `input.steps[]` (not `contents[]`). This is distinct from standard `generateContent` and enables:
- Sub-100ms latency for voice/audio interaction (HoloLand NPCs, AR overlays)
- True streaming tool-call execution mid-session
- Native audio/video modality input within the same live session

## Why not pursued now

The current `GeminiAdapter` uses standard `generateContent` (candidates[]-based), which is sufficient for all current HoloScript use cases (Brittney chat, agent loops, batch generation). The Interactions/Live API requires a persistent WebSocket or gRPC session, not a one-shot REST call, which would need a separate adapter class or a new connection-lifecycle abstraction in `BaseLLMAdapter`.

Blocking: no current HoloScript surface drives real-time multi-turn Gemini at sub-100ms latency. Revisit when HoloLand NPCs need low-latency Gemini voice or when AR overlays require streaming model responses.

## Pointers

- Adapter header comment in `packages/llm-provider/src/adapters/gemini.ts` describes the `steps[]` schema migration (A-020).
- `packages/llm-provider/src/__tests__/gemini-adapter.test.ts` tests the standard `generateContent` path.
- Google docs: `ai.google.dev/gemini-api/docs/interactions-breaking-changes-may-2026`
