/**
 * OpenAI Realtime adapter — mockable session lifecycle.
 *
 * The transport seam (WebSocket + ephemeral-secret mint fetch) is INJECTED, so
 * this drives the whole mint → open → echo-turn → usage → close flow WITHOUT a
 * live endpoint (no API key use, no real audio). Real-endpoint audio
 * verification is slice E (manual/founder). The mock injects at the SAME `deps`
 * seam the production default uses, so it exercises production wiring.
 */

import { describe, it, expect } from 'vitest';
import {
  openOpenAIRealtimeSession,
  OpenAIRealtimeAdapter,
  OPENAI_REALTIME_MODELS,
  DEFAULT_OPENAI_REALTIME_MODEL,
  type RealtimeWebSocketLike,
  type RealtimeFetchLike,
} from '../adapters/openai-realtime';
import { OPENAI_MODELS } from '../adapters/openai';
import { MockAdapter } from '../adapters/mock';
import { supportsRealtime } from '../realtime';
import type { RealtimeServerEvent } from '../realtime';

// --- Fakes -----------------------------------------------------------------

class MockWebSocket implements RealtimeWebSocketLike {
  sent: string[] = [];
  private handlers: Record<string, Array<(arg?: unknown) => void>> = {};

  constructor(
    public url: string,
    public options: { headers: Record<string, string> }
  ) {}

  on(event: 'open' | 'message' | 'close' | 'error', handler: (arg?: unknown) => void): void {
    (this.handlers[event] ??= []).push(handler);
  }

  /** Test driver: simulate a server-side event. */
  emit(event: string, arg?: unknown): void {
    for (const h of this.handlers[event] ?? []) h(arg);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.emit('close');
  }

  /** Parsed view of what the client sent. */
  sentTypes(): string[] {
    return this.sent.map((s) => (JSON.parse(s) as { type: string }).type);
  }
}

const mintFetch: RealtimeFetchLike = async () => ({
  ok: true,
  status: 200,
  json: async () => ({
    value: 'ek_test_abc',
    expires_at: '2026-07-10T00:10:00Z',
    session: { id: 'sess_test_1' },
  }),
  text: async () => '',
});

async function drain(session: {
  events(): AsyncIterable<RealtimeServerEvent>;
}): Promise<RealtimeServerEvent[]> {
  const out: RealtimeServerEvent[] = [];
  for await (const ev of session.events()) out.push(ev);
  return out;
}

// --- Segregation -----------------------------------------------------------

describe('realtime model registry segregation', () => {
  it('keeps realtime model ids OUT of OPENAI_MODELS (the chat registry)', () => {
    for (const m of OPENAI_REALTIME_MODELS) {
      expect(OPENAI_MODELS as readonly string[]).not.toContain(m);
    }
    expect(DEFAULT_OPENAI_REALTIME_MODEL).toBe('gpt-realtime-2.1');
  });
});

// --- Capability gate -------------------------------------------------------

describe('openRealtimeSession capability gate', () => {
  it('supportsRealtime() is true for the OpenAI realtime adapter, false for Mock', () => {
    expect(supportsRealtime(new OpenAIRealtimeAdapter({ apiKey: 'sk-test' }))).toBe(true);
    expect(supportsRealtime(new MockAdapter())).toBe(false);
  });

  it('an adapter WITHOUT realtimeVoice inherits the default unsupported throw', async () => {
    const mock = new MockAdapter();
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      mock.openRealtimeSession!({ model: 'x', transport: 'websocket', modalities: ['audio'] })
    ).rejects.toThrow(/does not support openRealtimeSession/);
  });
});

// --- Full session lifecycle (mock transport) -------------------------------

describe('openOpenAIRealtimeSession (mock transport)', () => {
  it('mints an ephemeral secret, opens a WS, and runs one echo turn to usage', async () => {
    let mock!: MockWebSocket;
    const webSocketFactory = (url: string, options: { headers: Record<string, string> }) => {
      mock = new MockWebSocket(url, options);
      return mock;
    };

    const session = await openOpenAIRealtimeSession(
      {
        model: 'gpt-realtime-2.1',
        transport: 'websocket',
        modalities: ['audio', 'text'],
        surface: 'server',
      },
      { apiKey: 'sk-test', fetchImpl: mintFetch, webSocketFactory }
    );

    // Handshake: the WS opened with the EPHEMERAL secret (never the master key),
    // pointed at the realtime model.
    expect(mock.url).toContain('wss://api.openai.com/v1/realtime');
    expect(mock.url).toContain('model=gpt-realtime-2.1');
    expect(mock.options.headers.Authorization).toBe('Bearer ek_test_abc');
    expect(mock.options.headers['OpenAI-Beta']).toBe('realtime=v1');

    // Server confirms the connection + session.
    mock.emit('open');
    mock.emit(
      'message',
      JSON.stringify({ type: 'session.created', session: { id: 'sess_test_1' } })
    );
    expect(session.sessionId).toBe('sess_test_1');

    // Client drives one turn.
    session.sendText('hello there');
    expect(mock.sentTypes()).toEqual(['conversation.item.create', 'response.create']);

    // Server echoes: transcript + audio, then usage at response.done.
    mock.emit(
      'message',
      JSON.stringify({ type: 'response.output_audio_transcript.delta', delta: 'hello there' })
    );
    const audioBytes = Buffer.from([1, 2, 3, 4]).toString('base64');
    mock.emit(
      'message',
      JSON.stringify({ type: 'response.output_audio.delta', delta: audioBytes })
    );
    mock.emit(
      'message',
      JSON.stringify({
        type: 'response.done',
        response: {
          usage: {
            input_token_details: { audio_tokens: 100, cached_tokens: 10, text_tokens: 5 },
            output_token_details: { audio_tokens: 200, text_tokens: 7 },
          },
        },
      })
    );

    const closeResult = await session.close();
    const events = await drain(session);

    // session.open carried the ephemeral secret.
    const open = events.find((e) => e.type === 'session.open');
    expect(open).toBeDefined();
    if (open?.type === 'session.open') {
      expect(open.ephemeral?.value).toBe('ek_test_abc');
      expect(open.ephemeral?.surface).toBe('server');
    }

    // transcript + audio mapped from vendor wire events.
    const transcript = events.find((e) => e.type === 'transcript.delta');
    expect(transcript).toEqual({
      type: 'transcript.delta',
      role: 'assistant',
      text: 'hello there',
    });

    const audio = events.find((e) => e.type === 'audio.delta');
    expect(audio?.type).toBe('audio.delta');
    if (audio?.type === 'audio.delta') {
      expect(Array.from(audio.chunk)).toEqual([1, 2, 3, 4]);
    }

    // usage accrues the 3 audio dims + text dims.
    const expectedUsage = {
      audioInputTokens: 100,
      cachedAudioInputTokens: 10,
      audioOutputTokens: 200,
      textInputTokens: 5,
      textOutputTokens: 7,
    };
    const usage = events.find((e) => e.type === 'usage');
    expect(usage?.type).toBe('usage');
    if (usage?.type === 'usage') {
      expect(usage.usage).toEqual(expectedUsage);
    }

    // session.close carries the total usage; close() resolves with the same.
    const close = events.find((e) => e.type === 'session.close');
    expect(close?.type).toBe('session.close');
    if (close?.type === 'session.close') {
      expect(close.totalUsage).toEqual(expectedUsage);
      expect(close.durationSeconds).toBeGreaterThanOrEqual(0);
    }
    expect(closeResult.totalUsage).toEqual(expectedUsage);

    // Event order: open first, close last.
    expect(events[0].type).toBe('session.open');
    expect(events[events.length - 1].type).toBe('session.close');
  });

  it('sendAudio / commitTurn / interrupt emit the vendor client events', async () => {
    let mock!: MockWebSocket;
    const session = await openOpenAIRealtimeSession(
      { model: 'gpt-realtime-2.1-mini', transport: 'websocket', modalities: ['audio'] },
      {
        apiKey: 'sk-test',
        fetchImpl: mintFetch,
        webSocketFactory: (url, options) => {
          mock = new MockWebSocket(url, options);
          return mock;
        },
      }
    );

    session.sendAudio(new Uint8Array([9, 8, 7]));
    session.commitTurn();
    session.interrupt();

    expect(mock.sentTypes()).toEqual([
      'input_audio_buffer.append',
      'input_audio_buffer.commit',
      'response.create',
      'response.cancel',
    ]);
    const append = JSON.parse(mock.sent[0]) as { audio: string };
    expect(Array.from(Buffer.from(append.audio, 'base64'))).toEqual([9, 8, 7]);

    await session.close();
  });

  it('drives the same flow through the OpenAIRealtimeAdapter (production seam)', async () => {
    let mock!: MockWebSocket;
    const adapter = new OpenAIRealtimeAdapter(
      { apiKey: 'sk-test' },
      {
        fetchImpl: mintFetch,
        webSocketFactory: (url, options) => {
          mock = new MockWebSocket(url, options);
          return mock;
        },
      }
    );

    const session = await adapter.openRealtimeSession({
      model: 'gpt-realtime-2.1',
      transport: 'websocket',
      modalities: ['audio'],
    });
    expect(mock.options.headers.Authorization).toBe('Bearer ek_test_abc');

    mock.emit('open');
    const closeResult = await session.close();
    const events = await drain(session);
    expect(events[0].type).toBe('session.open');
    expect(closeResult.durationSeconds).toBeGreaterThanOrEqual(0);
  });
});
