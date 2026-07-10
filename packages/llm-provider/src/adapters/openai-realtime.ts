/**
 * OpenAI Realtime Voice Adapter
 *
 * The OpenAI implementation of the realtime transport axis (`realtime.ts`).
 * `OpenAIAdapter` stays the single provider object for chat; this companion
 * module holds the duplex-transport code so it stays OFF the chat path and
 * realtime model ids stay OFF `OPENAI_MODELS` (the chat registry). Realtime is
 * a separate axis — see `realtime.ts` and plan §0/§1.4.
 *
 * The transport is MOCKABLE: `openOpenAIRealtimeSession()` takes injectable
 * `webSocketFactory` + `fetchImpl` so a test can drive the full
 * mint-ephemeral-secret → open-WebSocket → echo-turn → usage flow without a
 * live endpoint. Real-endpoint audio verification is slice E (manual/founder);
 * the default factory lazily loads the `ws` package for the production path.
 *
 * SSOT: research/2026-07-10_realtime-adapter-implementation-plan-p0pp.md §1, §5.
 *
 * @module @holoscript/llm-provider
 */

import { OpenAIAdapter } from './openai';
import { LLMProviderError } from '../types';
import type { OpenAIProviderConfig } from '../types';
import type {
  AudioUsage,
  EphemeralSecret,
  RealtimeServerEvent,
  RealtimeSession,
  RealtimeSessionConfig,
} from '../realtime';

// =============================================================================
// Realtime model registry — SEPARATE from OPENAI_MODELS (the chat registry).
// Realtime is a transport axis, not a chat model. Never add these to
// OPENAI_MODELS. Pricing for each row lives in @holoscript/holoscript-agent
// CostGuard (OPENAI_REALTIME_PRICING_USD_PER_MTOK).
// =============================================================================

export const OPENAI_REALTIME_MODELS = [
  'gpt-realtime-2.1',
  'gpt-realtime-2.1-mini',
  'gpt-realtime-2',
  'gpt-realtime-1.5',
  'gpt-realtime-mini',
] as const;

export type OpenAIRealtimeModel = (typeof OPENAI_REALTIME_MODELS)[number];

/** Default full-quality realtime model. */
export const DEFAULT_OPENAI_REALTIME_MODEL: OpenAIRealtimeModel = 'gpt-realtime-2.1';
/** Default cost-optimized realtime model. */
export const DEFAULT_OPENAI_REALTIME_MINI_MODEL: OpenAIRealtimeModel = 'gpt-realtime-2.1-mini';

// =============================================================================
// Injectable transport seam — the SAME seam the real transport uses, so a mock
// exercises production wiring rather than a parallel path (plan §5.1 #2).
// =============================================================================

/**
 * Minimal WebSocket contract the session driver needs. Deliberately shaped like
 * the `ws` package's EventEmitter surface (`.on('open'|'message'|'close'|
 * 'error')`, `.send`, `.close`) so the default factory can hand a real `ws`
 * instance straight through, and a test can hand a fake with the same shape.
 */
export interface RealtimeWebSocketLike {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  on(event: 'open' | 'message' | 'close' | 'error', handler: (arg?: unknown) => void): void;
}

export type RealtimeWebSocketFactory = (
  url: string,
  options: { headers: Record<string, string> }
) => RealtimeWebSocketLike;

/** Minimal fetch shape (avoids a DOM lib dependency under lib: ES2020). */
export type RealtimeFetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string }
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown>; text(): Promise<string> }>;

export interface OpenAIRealtimeDeps {
  apiKey: string;
  /** Defaults to https://api.openai.com. */
  baseURL?: string;
  /** Inject for tests; production default lazily loads the `ws` package. */
  webSocketFactory?: RealtimeWebSocketFactory;
  /** Inject for tests; defaults to `globalThis.fetch`. */
  fetchImpl?: RealtimeFetchLike;
}

// =============================================================================
// Ephemeral-secret mint (server-side)
// =============================================================================

/**
 * Mint a short-lived client secret so a browser/Quest client can connect
 * directly to the vendor without the master `OPENAI_API_KEY` ever leaving the
 * server. Scoped per surface, short-TTL. For pure server-side WebSocket the
 * caller may skip this and use the master key directly — but the session-open
 * flow mints by default so the ephemeral path is exercised (plan §1.3, §5.1).
 */
export async function mintOpenAIEphemeralSecret(
  surface: string,
  deps: OpenAIRealtimeDeps,
  opts?: { ttlSeconds?: number; model?: string }
): Promise<EphemeralSecret> {
  const doFetch = deps.fetchImpl ?? (globalThis.fetch as unknown as RealtimeFetchLike);
  const base = (deps.baseURL ?? 'https://api.openai.com').replace(/\/$/, '');
  const res = await doFetch(`${base}/v1/realtime/client_secrets`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${deps.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...(opts?.ttlSeconds
        ? { expires_after: { anchor: 'created_at', seconds: opts.ttlSeconds } }
        : {}),
      session: { type: 'realtime', ...(opts?.model ? { model: opts.model } : {}) },
    }),
  });
  if (!res.ok) {
    throw new LLMProviderError(
      `OpenAI ephemeral-secret mint failed (status ${res.status})`,
      'openai',
      res.status
    );
  }
  const body = (await res.json()) as {
    value?: string;
    expires_at?: number | string;
    session?: { id?: string };
  };
  const expiresAt =
    typeof body.expires_at === 'number'
      ? new Date(body.expires_at * 1000).toISOString()
      : (body.expires_at ?? '');
  return {
    value: body.value ?? '',
    expiresAt,
    surface,
    sessionId: body.session?.id ?? '',
  };
}

// =============================================================================
// Session driver
// =============================================================================

/**
 * Open a realtime voice session against OpenAI. Mints an ephemeral secret,
 * opens the WebSocket, and returns a live duplex handle. The event loop maps
 * OpenAI's wire events to the provider-neutral `RealtimeServerEvent` union.
 *
 * Inject `deps.webSocketFactory` + `deps.fetchImpl` to drive the whole flow in
 * a test without a live endpoint.
 */
export async function openOpenAIRealtimeSession(
  config: RealtimeSessionConfig,
  deps: OpenAIRealtimeDeps
): Promise<RealtimeSession> {
  const model = config.model || DEFAULT_OPENAI_REALTIME_MODEL;
  const surface = config.surface ?? 'server';

  // 1. Mint an ephemeral secret (server-side).
  const ttl =
    config.provider?.openai?.realtimeVoice?.ephemeralSecret?.ttlSeconds ??
    config.budget?.maxDurationSeconds;
  const ephemeral = await mintOpenAIEphemeralSecret(surface, deps, { ttlSeconds: ttl, model });

  // 2. Open the WebSocket transport.
  const wsFactory = deps.webSocketFactory ?? (await resolveDefaultWebSocketFactory());
  const wsBase = (deps.baseURL ?? 'https://api.openai.com')
    .replace(/\/$/, '')
    .replace(/^http/, 'ws');
  const url = `${wsBase}/v1/realtime?model=${encodeURIComponent(model)}`;
  const authToken = ephemeral.value || deps.apiKey;
  const ws = wsFactory(url, {
    headers: {
      Authorization: `Bearer ${authToken}`,
      'OpenAI-Beta': 'realtime=v1',
    },
  });

  // 3. Wire the event loop.
  const queue = new EventQueue<RealtimeServerEvent>();
  const startedAt = Date.now();
  let sessionId = ephemeral.sessionId;
  let closed = false;
  const totalUsage: AudioUsage = {
    audioInputTokens: 0,
    cachedAudioInputTokens: 0,
    audioOutputTokens: 0,
    textInputTokens: 0,
    textOutputTokens: 0,
  };

  const finalize = (): { totalUsage: AudioUsage; durationSeconds: number } => ({
    totalUsage: { ...totalUsage },
    durationSeconds: (Date.now() - startedAt) / 1000,
  });

  ws.on('open', () => {
    queue.push({ type: 'session.open', sessionId, ephemeral });
  });
  ws.on('message', (raw) => {
    const ev = mapServerEvent(raw, totalUsage, (id) => {
      sessionId = id;
    });
    if (ev) queue.push(ev);
  });
  ws.on('error', (err) => {
    queue.push({ type: 'error', error: toProviderError(err) });
  });
  ws.on('close', () => {
    if (closed) return;
    closed = true;
    const result = finalize();
    queue.push({ type: 'session.close', ...result });
    queue.end();
  });

  const session: RealtimeSession = {
    get sessionId() {
      return sessionId;
    },
    transport: config.transport,
    sendAudio(chunk: Uint8Array): void {
      ws.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: bytesToBase64(chunk) }));
    },
    sendText(text: string): void {
      ws.send(
        JSON.stringify({
          type: 'conversation.item.create',
          item: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] },
        })
      );
      ws.send(JSON.stringify({ type: 'response.create' }));
    },
    commitTurn(): void {
      ws.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
      ws.send(JSON.stringify({ type: 'response.create' }));
    },
    interrupt(): void {
      ws.send(JSON.stringify({ type: 'response.cancel' }));
    },
    events(): AsyncIterable<RealtimeServerEvent> {
      return queue;
    },
    close(): Promise<{ totalUsage: AudioUsage; durationSeconds: number }> {
      if (closed) return Promise.resolve(finalize());
      closed = true;
      try {
        ws.close();
      } catch {
        /* transport already gone — nothing to close */
      }
      const result = finalize();
      queue.push({ type: 'session.close', ...result });
      queue.end();
      return Promise.resolve(result);
    },
  };

  return session;
}

/**
 * The OpenAI realtime adapter. Extends `OpenAIAdapter` so it stays the SAME
 * provider object shape the capability router already reads (inherits
 * `OPENAI_CAPABILITIES`, which declares `realtimeVoice: true`), and only adds
 * the optional `openRealtimeSession()` method — making the `realtimeVoice`
 * flag honest for the first vendor. The chat adapter (`openai.ts`) is untouched.
 *
 * `realtimeDeps` lets a caller/test inject the transport seam through the
 * adapter path too, not just the standalone `openOpenAIRealtimeSession()`.
 */
export class OpenAIRealtimeAdapter extends OpenAIAdapter {
  private readonly realtimeDeps?: Partial<OpenAIRealtimeDeps>;

  constructor(config: OpenAIProviderConfig, realtimeDeps?: Partial<OpenAIRealtimeDeps>) {
    super(config);
    this.realtimeDeps = realtimeDeps;
  }

  async openRealtimeSession(config: RealtimeSessionConfig): Promise<RealtimeSession> {
    return openOpenAIRealtimeSession(config, {
      apiKey: this.config.apiKey,
      baseURL: this.config.baseURL || undefined,
      ...this.realtimeDeps,
    });
  }
}

// =============================================================================
// Internal helpers
// =============================================================================

/**
 * A push-based async queue: server events pushed before iteration are buffered
 * (not lost), and `end()` terminates the async iteration. Lets the callback
 * transport feed an `AsyncIterable`.
 */
class EventQueue<T> implements AsyncIterable<T> {
  private buffer: T[] = [];
  private resolvers: Array<(r: IteratorResult<T>) => void> = [];
  private ended = false;

  push(item: T): void {
    if (this.ended) return;
    const resolve = this.resolvers.shift();
    if (resolve) resolve({ value: item, done: false });
    else this.buffer.push(item);
  }

  end(): void {
    if (this.ended) return;
    this.ended = true;
    let resolve: ((r: IteratorResult<T>) => void) | undefined;
    while ((resolve = this.resolvers.shift())) {
      resolve({ value: undefined as unknown as T, done: true });
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: (): Promise<IteratorResult<T>> => {
        if (this.buffer.length > 0) {
          return Promise.resolve({ value: this.buffer.shift() as T, done: false });
        }
        if (this.ended) {
          return Promise.resolve({ value: undefined as unknown as T, done: true });
        }
        return new Promise<IteratorResult<T>>((resolve) => this.resolvers.push(resolve));
      },
    };
  }
}

/**
 * Lazily load the `ws` package for the production transport. Kept behind a
 * runtime specifier so tsc doesn't require `ws` to be installed for
 * type-checking (tests inject a factory and never hit this). Real-endpoint
 * audio verification is slice E.
 */
async function resolveDefaultWebSocketFactory(): Promise<RealtimeWebSocketFactory> {
  // Non-literal specifier keeps tsc from resolving an optional dependency.
  const specifier: string = 'ws';
  let WsCtor: new (
    url: string,
    options: { headers: Record<string, string> }
  ) => RealtimeWebSocketLike;
  try {
    const mod = (await import(specifier)) as {
      default?: unknown;
      WebSocket?: unknown;
    };
    WsCtor = (mod.default ?? mod.WebSocket ?? mod) as typeof WsCtor;
  } catch {
    throw new LLMProviderError(
      "Realtime WebSocket transport requires the 'ws' package, or inject " +
        'deps.webSocketFactory. Real-endpoint audio verification is slice E; ' +
        'slices A–D drive the session through an injected mock factory.',
      'openai'
    );
  }
  return (url, options) => new WsCtor(url, options);
}

function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

function base64ToBytes(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined;
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function toProviderError(raw: unknown): LLMProviderError {
  if (raw instanceof LLMProviderError) return raw;
  const rec = asRecord(raw);
  const message =
    (rec && str(rec.message)) ?? (typeof raw === 'string' ? raw : 'realtime session error');
  return new LLMProviderError(message, 'openai');
}

/**
 * Map an OpenAI Realtime wire event to the provider-neutral union. Faithful to
 * the vendor event shapes (plan §6.1). Accumulates audio usage from
 * `response.done` into `totalUsage` and emits a `usage` delta.
 */
function mapServerEvent(
  raw: unknown,
  totalUsage: AudioUsage,
  setSessionId: (id: string) => void
): RealtimeServerEvent | null {
  let msg: Record<string, unknown> | undefined;
  if (typeof raw === 'string') {
    try {
      msg = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return null;
    }
  } else {
    msg = asRecord(raw);
  }
  if (!msg) return null;

  const type = str(msg.type) ?? '';
  switch (type) {
    case 'session.created':
    case 'session.updated': {
      const s = asRecord(msg.session);
      const id = s && str(s.id);
      if (id) setSessionId(id);
      return null;
    }
    case 'response.output_audio.delta':
    case 'response.audio.delta':
      return { type: 'audio.delta', chunk: base64ToBytes(str(msg.delta) ?? '') };
    case 'response.output_audio_transcript.delta':
    case 'response.audio_transcript.delta':
      return { type: 'transcript.delta', role: 'assistant', text: str(msg.delta) ?? '' };
    case 'conversation.item.input_audio_transcription.delta':
      return { type: 'transcript.delta', role: 'user', text: str(msg.delta) ?? '' };
    case 'input_audio_buffer.speech_started':
      return { type: 'turn.start' };
    case 'input_audio_buffer.speech_stopped':
      return { type: 'turn.end' };
    case 'response.function_call_arguments.done':
      return {
        type: 'tool.call',
        id: str(msg.call_id) ?? str(msg.item_id) ?? '',
        name: str(msg.name) ?? '',
        input: parseMaybeJson(msg.arguments),
      };
    case 'response.done': {
      const usage = extractAudioUsage(msg);
      accumulateUsage(totalUsage, usage);
      return { type: 'usage', usage };
    }
    case 'error':
      return { type: 'error', error: toProviderError(msg.error ?? msg) };
    default:
      return null;
  }
}

/** Extract 3-dimensional audio usage from a `response.done` payload. */
function extractAudioUsage(msg: Record<string, unknown>): AudioUsage {
  const response = asRecord(msg.response);
  const usage = asRecord(response?.usage) ?? asRecord(msg.usage);
  const inDetails = asRecord(usage?.input_token_details);
  const outDetails = asRecord(usage?.output_token_details);
  const cachedDetails = asRecord(inDetails?.cached_tokens_details);
  return {
    audioInputTokens: num(inDetails?.audio_tokens),
    cachedAudioInputTokens: num(cachedDetails?.audio_tokens) || num(inDetails?.cached_tokens),
    audioOutputTokens: num(outDetails?.audio_tokens),
    textInputTokens: num(inDetails?.text_tokens),
    textOutputTokens: num(outDetails?.text_tokens),
  };
}

function accumulateUsage(total: AudioUsage, delta: AudioUsage): void {
  total.audioInputTokens += delta.audioInputTokens;
  total.cachedAudioInputTokens += delta.cachedAudioInputTokens;
  total.audioOutputTokens += delta.audioOutputTokens;
  total.textInputTokens = (total.textInputTokens ?? 0) + (delta.textInputTokens ?? 0);
  total.textOutputTokens = (total.textOutputTokens ?? 0) + (delta.textOutputTokens ?? 0);
}
