import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HOLO_INFERENCE_PROXY_KEY_NAME_ENV,
  INFERENCE_PROXY_AUTH_REJECTED_MESSAGE,
  configureConfigSecretResolver,
  resetConfigSecretResolver,
} from '@holoscript/config';

vi.mock('@holoscript/holollama', () => ({
  resolveHoloLlamaServeSpec: () => ({
    host: '127.0.0.1',
    port: 18080,
    model: 'qwen3-4b-instruct.gguf',
    node: 'jetson-orin',
    registerAs: 'jetson-brittney-edge',
  }),
  compileHoloLlamaBundle: () => ({ ok: true }),
  summarizeHoloLlamaBundle: () => ({
    registryHandle: 'jetson-brittney-edge',
    endpoint: 'http://127.0.0.1:18080/v1',
    healthUrl: 'http://127.0.0.1:18080/health',
    warnings: [],
  }),
  resolveHoloLlamaLiveEndpoint: () => 'http://127.0.0.1:18080',
}));

import { createHoloLlamaSynthesisProvider } from './graph-rag-tools';

const KEY_NAME = 'HOLO_INFERENCE_PROXY_KEY';
const SECRET = 'hpky_test_7f3c9a_do_not_leak';

type Seen = { url: string; init?: RequestInit };

function captureLogs(): string[] {
  const lines: string[] = [];
  for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      lines.push(
        args.map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' ')
      );
    });
  }
  return lines;
}

function errorText(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const bag: Record<string, unknown> = {};
  for (const key of Object.getOwnPropertyNames(error)) {
    bag[key] = (error as unknown as Record<string, unknown>)[key];
  }
  return `${error.message}\n${error.stack ?? ''}\n${JSON.stringify(bag)}`;
}

function responseFor(status: number, content: string, statusText = 'OK') {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status,
    statusText,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('graph-rag HoloLlama proxy bearer', () => {
  const originalName = process.env[HOLO_INFERENCE_PROXY_KEY_NAME_ENV];
  let seen: Seen[];
  let logs: string[];
  let resolved: string[];

  beforeEach(() => {
    seen = [];
    logs = captureLogs();
    resolved = [];
    delete process.env[HOLO_INFERENCE_PROXY_KEY_NAME_ENV];
    configureConfigSecretResolver({
      async resolve(name) {
        resolved.push(name);
        return name === KEY_NAME ? SECRET : undefined;
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetConfigSecretResolver();
    if (originalName === undefined) delete process.env[HOLO_INFERENCE_PROXY_KEY_NAME_ENV];
    else process.env[HOLO_INFERENCE_PROXY_KEY_NAME_ENV] = originalName;
  });

  function fetchImpl(status = 200, statusText = 'OK') {
    return vi.fn(async (input: string | URL, init?: RequestInit) => {
      seen.push({ url: String(input), init });
      if (status === 200 && String(input).endsWith('/models')) {
        return new Response(JSON.stringify({ data: [{ id: 'qwen' }] }), { status: 200 });
      }
      return responseFor(status, 'answer', statusText);
    });
  }

  async function provider(fetch = fetchImpl()) {
    return createHoloLlamaSynthesisProvider({
      profile: 'jetson-orin',
      endpoint: 'http://127.0.0.1:18080/v1',
      model: 'brittney-edge:test',
      generatedAt: '2026-09-27T00:00:00.000Z',
      fetchImpl: fetch,
    });
  }

  it('sends no Authorization header and does not resolve a key when none is configured', async () => {
    const synth = await provider();
    const chat = await synth.complete({ messages: [{ role: 'user', content: 'hi' }] });
    const models = await synth.listModels();
    expect(chat.content).toBe('answer');
    expect(models).toEqual({ data: [{ id: 'qwen' }] });

    const chatCall = seen.find((call) => call.url.endsWith('/chat/completions'));
    const modelsCall = seen.find((call) => call.url.endsWith('/models'));
    expect(chatCall?.url).toBe('http://127.0.0.1:18080/v1/chat/completions');
    expect(modelsCall?.url).toBe('http://127.0.0.1:18080/v1/models');
    expect(chatCall?.init?.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(modelsCall?.init?.headers).toBeUndefined();
    expect(JSON.stringify(synth.receipt)).not.toContain(SECRET);
    expect(JSON.stringify(synth.receipt)).not.toContain('Authorization');
    expect(resolved).toEqual([]);
    expect(logs.join('\n')).not.toContain(SECRET);
  });

  it('sends the exact bearer on models and chat when the key name resolves', async () => {
    process.env[HOLO_INFERENCE_PROXY_KEY_NAME_ENV] = KEY_NAME;
    const synth = await provider();
    await synth.listModels();
    await synth.complete({ messages: [{ role: 'user', content: 'hi' }] });

    const chatCall = seen.find((call) => call.url.endsWith('/chat/completions'));
    const modelsCall = seen.find((call) => call.url.endsWith('/models'));
    expect(modelsCall?.init?.headers).toEqual({ Authorization: `Bearer ${SECRET}` });
    expect(chatCall?.init?.headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SECRET}`,
    });
    expect(JSON.stringify(synth.receipt)).not.toContain(SECRET);
  });

  it('does not leak the key through logs, status text, or thrown fetch errors', async () => {
    process.env[HOLO_INFERENCE_PROXY_KEY_NAME_ENV] = KEY_NAME;
    const leaking = vi.fn(async (input: string | URL, init?: RequestInit) => {
      seen.push({ url: String(input), init });
      if (String(input).endsWith('/models')) {
        throw new Error(`socket hangup Authorization: Bearer ${SECRET}`);
      }
      return responseFor(500, 'nope', `Bad ${SECRET}`);
    });
    const synth = await provider(leaking);

    await expect(synth.listModels()).rejects.toThrow(/socket hangup/);
    await expect(synth.complete({ messages: [{ role: 'user', content: 'hi' }] })).rejects.toThrow(
      /HoloLlama chat completions error: 500/
    );

    const listError = await synth.listModels().catch((err: unknown) => err);
    const chatError = await synth
      .complete({ messages: [{ role: 'user', content: 'hi' }] })
      .catch((err: unknown) => err);
    expect(errorText(listError)).not.toContain(SECRET);
    expect(errorText(chatError)).not.toContain(SECRET);
    expect(errorText(chatError)).toContain('[redacted]');
    expect(logs.join('\n')).not.toContain(SECRET);
    expect(JSON.stringify(synth.receipt)).not.toContain(SECRET);
  });

  it('surfaces an auth-rejected error on 401 without key material', async () => {
    process.env[HOLO_INFERENCE_PROXY_KEY_NAME_ENV] = KEY_NAME;
    const synth = await provider(fetchImpl(401, `Unauthorized ${SECRET}`));
    await expect(synth.listModels()).rejects.toThrow(INFERENCE_PROXY_AUTH_REJECTED_MESSAGE);
    await expect(synth.complete({ messages: [{ role: 'user', content: 'hi' }] })).rejects.toThrow(
      INFERENCE_PROXY_AUTH_REJECTED_MESSAGE
    );
    const listError = await synth.listModels().catch((err: unknown) => err);
    const chatError = await synth
      .complete({ messages: [{ role: 'user', content: 'hi' }] })
      .catch((err: unknown) => err);
    expect((listError as Error).message).toBe(INFERENCE_PROXY_AUTH_REJECTED_MESSAGE);
    expect((chatError as Error).message).toBe(INFERENCE_PROXY_AUTH_REJECTED_MESSAGE);
    expect(errorText(listError)).not.toContain(SECRET);
    expect(errorText(chatError)).not.toContain(SECRET);
    expect(logs.join('\n')).not.toContain(SECRET);
  });
});
