/**
 * Realtime Voice Transport Types
 *
 * A realtime voice session is a SEPARATE transport axis from
 * `complete()` / `streamCompletion()` — a long-lived, bidirectional, stateful
 * duplex connection where audio flows in and out continuously, the user can
 * barge in mid-utterance, VAD segments turns server-side, and usage accrues
 * over the whole session rather than at one response boundary. Forcing this
 * into `complete()` would corrupt the streaming contract (which MUST end with
 * exactly one `message_stop` chunk). So realtime voice lives here, off the chat
 * path, exactly like image/video are separate axes.
 *
 * These types are consumed by:
 *  - `ILLMProvider.openRealtimeSession?()` (optional method, default-throws in
 *    `BaseLLMAdapter` — mirrors `uploadFile`), gated by the universal
 *    `Capabilities.realtimeVoice` flag.
 *  - `adapters/openai-realtime.ts` (the first per-vendor implementation).
 *  - `@holoscript/holoscript-agent` CostGuard, which imports `AudioUsage` the
 *    same way it already imports `TokenUsage` — the usage type lives with the
 *    session that emits it; the pricer + pricing table live with CostGuard.
 *
 * SSOT: research/2026-07-10_realtime-adapter-implementation-plan-p0pp.md §1.
 *
 * @module @holoscript/llm-provider
 */

import type { ToolSpec, ProviderExtensions, LLMProviderError, ILLMProvider } from './types';

/**
 * Transport SELECTION knob. Server-side WebSocket is the testable default;
 * WebRTC targets browser/Quest; SIP targets telephony. This is a per-session
 * choice — a provider may support several.
 */
export type RealtimeTransport = 'webrtc' | 'sip' | 'websocket';

/**
 * Provider-neutral config for opening a realtime voice session. Per-vendor
 * transport dialects (OpenAI's 3-way transport union + SIP + ephemeral secrets,
 * xAI's WebSocket-only + REST STT/TTS, Gemini's live-vs-tts mode split) live
 * SEGREGATED on `provider.<name>.realtimeVoice` — never flattened here.
 */
export interface RealtimeSessionConfig {
  /** Realtime model id — NOT a chat model. e.g. 'gpt-realtime-2.1'. */
  model: string;
  /** Transport SELECTION knob (server WebSocket is the testable default). */
  transport: RealtimeTransport;
  /** Which modalities the session exchanges. */
  modalities: Array<'audio' | 'text'>;
  /** System instructions (the "brain" prompt for the voice). */
  instructions?: string;
  /** Named voice (vendor-specific values, e.g. 'marin', 'cedar'). */
  voice?: string;
  /** Provider-neutral audio codec hints; adapters map to vendor formats. */
  audioFormat?: { input?: string; output?: string };
  /** Turn/VAD policy (provider-neutral; adapters map to server_vad etc.). */
  turnDetection?: { mode: 'server_vad' | 'semantic_vad' | 'manual'; thresholdMs?: number };
  /** Tools exposed inside the session (reuses the universal ToolSpec shape). */
  tools?: ToolSpec[];
  /** Which surface this session serves — drives ephemeral-secret scoping + CAEL. */
  surface?: 'brittney' | 'hololand' | 'quest' | 'server' | string;
  /** Hard budget ceilings so a long duplex session can't run away. */
  budget?: { maxDurationSeconds?: number; maxCostUsd?: number };
  /** SEGREGATED per-vendor transport dialect. Never flattened. */
  provider?: ProviderExtensions;
}

/**
 * Short-lived credential a browser/Quest client uses instead of the master key.
 * Minted server-side, scoped per surface, short-TTL. The master API key must
 * never leave the server (see plan §1.3, §6.2).
 */
export interface EphemeralSecret {
  value: string;
  /** ISO timestamp. */
  expiresAt: string;
  surface: string;
  sessionId: string;
}

/**
 * Usage emitted by a realtime session. Audio is 3-dimensional (audio-in /
 * cached-audio-in / audio-out), unlike the text-only `TokenUsage`
 * ({promptTokens, completionTokens, totalTokens}) — so it needs a distinct
 * shape. Realtime sessions still bill text (transcripts, tool args), hence the
 * optional text dims.
 */
export interface AudioUsage {
  audioInputTokens: number;
  cachedAudioInputTokens: number;
  audioOutputTokens: number;
  /** Realtime sessions still bill text (transcripts, tool args). */
  textInputTokens?: number;
  textOutputTokens?: number;
}

/**
 * Server → client events over the session lifetime. Kept faithful to the vendor
 * event shapes so the mockable transport seam doesn't hide contract drift.
 */
export type RealtimeServerEvent =
  | { type: 'session.open'; sessionId: string; ephemeral?: EphemeralSecret }
  | { type: 'audio.delta'; chunk: Uint8Array }
  | { type: 'transcript.delta'; role: 'user' | 'assistant'; text: string }
  | { type: 'turn.start' }
  | { type: 'turn.end' }
  | { type: 'tool.call'; id: string; name: string; input: unknown }
  | { type: 'usage'; usage: AudioUsage } // incremental, per response.done
  | { type: 'error'; error: LLMProviderError }
  | { type: 'session.close'; totalUsage: AudioUsage; durationSeconds: number };

/**
 * The live duplex handle returned by `openRealtimeSession()`. Push audio/text
 * in, consume server events out, close to finalize cost.
 */
export interface RealtimeSession {
  readonly sessionId: string;
  readonly transport: RealtimeTransport;
  /** Push mic audio frames in. */
  sendAudio(chunk: Uint8Array): void;
  /** Inject a text turn (e.g. a system nudge or typed input). */
  sendText(text: string): void;
  /** Commit the current input turn (manual VAD). */
  commitTurn(): void;
  /** Barge-in: cancel the assistant's in-flight audio. */
  interrupt(): void;
  /** Consume server events. */
  events(): AsyncIterable<RealtimeServerEvent>;
  /** Tear down; resolves with final usage for cost finalization. */
  close(): Promise<{ totalUsage: AudioUsage; durationSeconds: number }>;
}

/**
 * Type guard narrowing a provider to one that implements `openRealtimeSession`.
 * Checks BOTH the universal capability flag (routing/swap) AND the concrete
 * method (some adapter inherits the default-throw). Gives call sites a clean
 * narrow before opening a voice session.
 */
export function supportsRealtime(
  p: ILLMProvider
): p is ILLMProvider & Required<Pick<ILLMProvider, 'openRealtimeSession'>> {
  return Boolean(p.capabilities?.realtimeVoice) && typeof p.openRealtimeSession === 'function';
}
