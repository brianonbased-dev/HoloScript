# Capability Manifest Async Axes

> Date: 2026-05-25
> Task: `task_1779744793933_sxi9`
> Status: planning memo
> Scope: `packages/llm-provider/src/types.ts` capability manifest and router-facing provider constants.

## Problem

The current `Capabilities.tools: true` field answers only one question: can this provider participate in a tool-shaped request flow at all? It does not answer the routing questions HoloScript now needs:

- Can the provider emit client-side function calls?
- Can the provider run built-in/server-side tools during a normal response?
- Can a single response run in a durable background/deferred mode and be polled later?
- Can a batch job be queued and retrieved later?
- Can the provider mount a remote MCP server as a tool source?
- Can the provider hold a long-lived realtime session over WebSocket, WebRTC, or SIP?
- Is the realtime surface voice/media/live-session infrastructure rather than normal chat completion?

OpenAI, xAI, and Gemini all truthfully have `tools: true`, but their async and realtime surfaces are not interchangeable. Routing them as equal would send background jobs to realtime sessions, remote MCP workloads to plain function-call adapters, and Live API/media sessions through the normal text chat path.

## Proposed manifest fields

Add these optional typed fields to `Capabilities`. Keep names positive and provider-neutral where possible. Provider-specific request knobs still belong under `req.provider.<provider>.*`.

```ts
export interface Capabilities {
  /**
   * Legacy aggregate. Deprecated for routing once the fields below exist.
   * Derived from supportsFunctionTools || supportsServerTools || supportsRemoteMcp.
   */
  tools?: boolean;

  /** Model can return client-executed function/tool calls in a request-response turn. */
  supportsFunctionTools?: boolean;

  /** Provider executes built-in tools server-side during a normal response. */
  supportsServerTools?: boolean;

  /** Single response can be started as a durable background job and polled later. */
  supportsBackground?: boolean;

  /** Single chat/completion request can return a request id and be retrieved later. */
  supportsDeferred?: boolean;

  /** Provider publishes an async SDK/client mode for concurrent non-durable requests. */
  supportsAsyncClientConcurrency?: boolean;

  /** Provider exposes batch jobs with queued requests and later result retrieval. */
  supportsBatch?: boolean;

  /** Provider can connect to remote MCP servers as a managed tool source. */
  supportsRemoteMcp?: boolean;

  /** Provider can maintain a stateful responses/chat session over WebSocket. */
  supportsResponseWebSocket?: boolean;

  /** Provider has a low-latency realtime session transport. */
  supportsRealtime?: boolean;

  /** Realtime surface supports audio/voice input or output. */
  supportsRealtimeVoice?: boolean;

  /** Provider has a named Live API surface separate from normal generation. */
  supportsLiveApi?: boolean;
}
```

Field semantics:

- `supportsFunctionTools` is client-executed function calling. It must not imply remote MCP or built-in tools.
- `supportsServerTools` is provider-managed tools such as OpenAI built-ins, xAI search/code tools, or Gemini built-in tools.
- `supportsBackground`, `supportsDeferred`, and `supportsBatch` are separate because they have different durability, pricing, lifecycle, and retrieval semantics.
- `supportsAsyncClientConcurrency` is intentionally not a job queue. It records SDK/client concurrency docs such as xAI Async Requests and must not satisfy a `supportsBackground` or `supportsDeferred` requirement.
- `supportsRemoteMcp` is a remote tool-source capability, not a signal that the provider itself can run as an MCP server.
- `supportsRealtime`, `supportsRealtimeVoice`, `supportsResponseWebSocket`, and `supportsLiveApi` are session/transport axes. They must not be collapsed into normal chat routing.

## Provider truth table

Values are from official vendor docs checked on 2026-05-25.

| Provider | supportsFunctionTools | supportsServerTools | supportsBackground | supportsDeferred | supportsAsyncClientConcurrency | supportsBatch | supportsRemoteMcp | supportsResponseWebSocket | supportsRealtime | supportsRealtimeVoice | supportsLiveApi |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| OpenAI | yes | yes | yes | no | no cited A-020 source | yes | yes | no | yes | yes | no |
| xAI | yes | yes | no | yes | yes | yes | yes | yes | yes | yes | no |
| Gemini | yes | yes | no | no | no cited A-020 source | yes | no for normal Gemini API tools | no | yes | yes | yes |

Notes:

- OpenAI background mode is a Responses API single-response job started with `background=true`, then polled through response retrieval. That is not the same as OpenAI Batch API, which is a file/job queue for asynchronous groups of requests.
- OpenAI Remote MCP is a Responses tool surface for connectors and remote MCP servers. It should set `supportsRemoteMcp`, not merely `tools`.
- xAI Deferred Chat Completions return a request id for later retrieval. xAI Batch API is a separate queued batch surface. xAI Async Requests are documented concurrent SDK/client usage, so they are explicitly not background/deferred job support.
- xAI WebSocket Mode for `/v1/responses` is a stateful responses transport; xAI Voice Agent API is a realtime voice WebSocket surface. Both require typed transport flags.
- Gemini Batch API is asynchronous batch processing. Gemini Live API is a stateful WSS realtime voice/vision session with tool use. It is not normal chat routing.
- Gemini's public Tools guide documents built-in tools and custom function calling for standard and Live API interactions, but does not document normal Gemini API remote MCP tools. Do not infer the Gemini Deep Research preview MCP note into `supportsRemoteMcp` for the router.

## Falsifiable invariant

No two providers with different async capabilities share the same manifest value.

In executable terms, provider fixtures must assert that this tuple differs whenever the vendor docs differ:

```ts
[
  supportsBackground,
  supportsDeferred,
  supportsAsyncClientConcurrency,
  supportsBatch,
  supportsRemoteMcp,
  supportsResponseWebSocket,
  supportsRealtime,
  supportsRealtimeVoice,
  supportsLiveApi,
]
```

A regression test should fail if OpenAI, xAI, and Gemini collapse to the same `{ tools: true }` manifest despite the table above.

## Migration path

1. Extend `Capabilities` with the typed optional fields above. Keep `tools?: boolean` for compatibility.
2. Populate provider constants from the official 2026-05-25 docs:
   - OpenAI: set `supportsBackground`, `supportsBatch`, `supportsRemoteMcp`, `supportsRealtime`, and `supportsRealtimeVoice`.
   - xAI: set `supportsDeferred`, `supportsAsyncClientConcurrency`, `supportsBatch`, `supportsRemoteMcp`, `supportsResponseWebSocket`, `supportsRealtime`, and `supportsRealtimeVoice`.
   - Gemini: set `supportsBatch`, `supportsRealtime`, `supportsRealtimeVoice`, and `supportsLiveApi`.
3. Derive legacy `tools` from typed tool fields for one migration window:

   ```ts
   tools = supportsFunctionTools || supportsServerTools || supportsRemoteMcp;
   ```

4. Add fixture tests that assert the async tuple above differs for OpenAI, xAI, and Gemini.
5. Update router/brain capability matching so:
   - background and deferred work require `supportsBackground` or `supportsDeferred`, never `tools`.
   - batch/eval jobs require `supportsBatch`.
   - remote MCP jobs require `supportsRemoteMcp`.
   - realtime voice/live sessions require `supportsRealtime` plus `supportsRealtimeVoice` or `supportsLiveApi`.
6. Keep provider-specific request shapes under `req.provider.openai.background`, `req.provider.grok.deferredCompletion`, `req.provider.grok.realtimeWebSocket`, and `req.provider.gemini.live` rather than adding universal request knobs prematurely.
7. After brain manifests and router policies stop gating on `tools`, mark `tools` as deprecated in `Capabilities` comments and restrict it to compatibility display.

## Boundary

Do not flatten media/realtime into chat routing. Realtime voice, Live API, response WebSockets, and audio/video session transports are separate session surfaces. They can share model identity and tool definitions with text generation, but they must have distinct routing requirements, lifecycle handling, billing expectations, cancellation behavior, and HoloDoor receipt policies.

## Sources

- OpenAI Background mode: https://developers.openai.com/api/docs/guides/background
- OpenAI Remote MCP and connectors: https://developers.openai.com/api/docs/guides/tools-connectors-mcp
- OpenAI Realtime WebSocket: https://developers.openai.com/api/docs/guides/realtime-websocket
- OpenAI Batch API: https://platform.openai.com/docs/guides/batch/getting-started
- xAI Deferred Chat Completions: https://docs.x.ai/developers/advanced-api-usage/deferred-chat-completions
- xAI Async Requests: https://docs.x.ai/developers/advanced-api-usage/async
- xAI Batch API: https://docs.x.ai/developers/advanced-api-usage/batch-api
- xAI Remote MCP Tools: https://docs.x.ai/developers/tools/remote-mcp
- xAI WebSocket Mode: https://docs.x.ai/developers/advanced-api-usage/websocket-mode
- xAI Voice Agent API: https://docs.x.ai/developers/model-capabilities/audio/voice-agent
- Gemini Batch API: https://ai.google.dev/gemini-api/docs/batch-api
- Gemini Live API: https://ai.google.dev/gemini-api/docs/live-api
- Gemini Tools guide: https://ai.google.dev/gemini-api/docs/tools
