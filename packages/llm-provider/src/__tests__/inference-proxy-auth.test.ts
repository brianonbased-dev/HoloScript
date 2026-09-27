import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HOLO_INFERENCE_PROXY_KEY_NAME_ENV,
  INFERENCE_PROXY_AUTH_REJECTED_MESSAGE,
  configureConfigSecretResolver,
  resetConfigSecretResolver,
} from '@holoscript/config';
import { LocalLLMAdapter } from '../adapters/local-llm';

const KEY_NAME = 'HOLO_INFERENCE_PROXY_KEY';
const SECRET = 'hpky_test_7f3c9a_do_not_leak';

type Seen = { url: string; headers?: Record<string, string> };

function captureLogs(): string[] {
  const lines: string[] = [];
  for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      lines.push(
        args
          .map((arg) => {
            if (typeof arg === 'string') return arg;
            try {
              return JSON.stringify(arg);
            } catch {
              return String(arg);
            }
          })
          .join(' ')
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

function chatResponse(status: number, body: string) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 401 ? 'Unauthorized' : 'OK',
    text: async () => body,
    json: async () => ({
      choices: [{ message: { content: 'ok', role: 'assistant' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      model: 'test',
    }),
  };
}

describe('local-llm inference proxy bearer', () => {
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
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: { headers?: Record<string, string> }) => {
        seen.push({ url: String(url), headers: init?.headers });
        if (String(url).endsWith('/health')) return chatResponse(404, '');
        if (String(url).endsWith('/v1/models')) return chatResponse(200, '{"data":[]}');
        return chatResponse(200, '');
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    resetConfigSecretResolver();
    if (originalName === undefined) delete process.env[HOLO_INFERENCE_PROXY_KEY_NAME_ENV];
    else process.env[HOLO_INFERENCE_PROXY_KEY_NAME_ENV] = originalName;
  });

  const ask = (adapter: LocalLLMAdapter) =>
    adapter.complete({ messages: [{ role: 'user', content: 'hi' }], maxTokens: 8 });

  it('sends no Authorization header and does not resolve a key when none is configured', async () => {
    const adapter = new LocalLLMAdapter({ baseURL: 'http://127.0.0.1:18080' });
    await ask(adapter);
    await adapter.healthCheck();

    const chat = seen.find((call) => call.url.endsWith('/v1/chat/completions'));
    const models = seen.find((call) => call.url.endsWith('/v1/models'));
    expect(chat?.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(models?.headers).toBeUndefined();
    expect(JSON.stringify(seen)).not.toContain('Authorization');
    expect(resolved).toEqual([]);
    expect(logs.join('\n')).not.toContain(SECRET);
  });

  it('stays header-free when the configured name resolves to nothing', async () => {
    process.env[HOLO_INFERENCE_PROXY_KEY_NAME_ENV] = KEY_NAME;
    configureConfigSecretResolver({
      async resolve(name) {
        resolved.push(name);
        return name === KEY_NAME ? '   ' : undefined;
      },
    });
    const adapter = new LocalLLMAdapter({ baseURL: 'http://127.0.0.1:18080' });
    await ask(adapter);
    const chat = seen.find((call) => call.url.endsWith('/v1/chat/completions'));
    expect(chat?.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(resolved).toEqual([KEY_NAME]);
  });

  it('sends the exact bearer on chat, models, and health when a key resolves', async () => {
    process.env[HOLO_INFERENCE_PROXY_KEY_NAME_ENV] = KEY_NAME;
    const adapter = new LocalLLMAdapter({ baseURL: 'http://127.0.0.1:18080' });
    await ask(adapter);
    await adapter.healthCheck();

    const proxyCalls = seen.filter((call) => call.url.includes(':18080'));
    expect(proxyCalls.length).toBeGreaterThanOrEqual(3);
    for (const call of proxyCalls) {
      expect(call.headers?.Authorization).toBe(`Bearer ${SECRET}`);
    }
    const chat = seen.find((call) => call.url.endsWith('/v1/chat/completions'));
    const models = seen.find((call) => call.url.endsWith('/v1/models'));
    expect(chat?.headers?.['Content-Type']).toBe('application/json');
    expect(models?.url).toBe('http://127.0.0.1:18080/v1/models');
    expect(models?.headers).toEqual({ Authorization: `Bearer ${SECRET}` });
  });

  it('does not attach the proxy bearer to a non-proxy local server', async () => {
    process.env[HOLO_INFERENCE_PROXY_KEY_NAME_ENV] = KEY_NAME;
    const adapter = new LocalLLMAdapter({
      baseURL: 'http://127.0.0.1:8080',
      inferenceProxy: false,
    });
    await ask(adapter);
    expect(seen[0]?.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(resolved).toEqual([]);
  });

  it('never puts the key in logs or thrown errors, including a body that echoes it', async () => {
    process.env[HOLO_INFERENCE_PROXY_KEY_NAME_ENV] = KEY_NAME;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: { headers?: Record<string, string> }) => {
        seen.push({ url: String(url), headers: init?.headers });
        return chatResponse(500, `upstream echoed ${SECRET} Authorization: Bearer ${SECRET}`);
      })
    );
    const adapter = new LocalLLMAdapter({ baseURL: 'http://127.0.0.1:18080' });
    let caught: unknown;
    try {
      await ask(adapter);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    const text = errorText(caught);
    expect(text).not.toContain(SECRET);
    expect(text).toContain('[redacted]');
    expect(text).not.toContain(`Bearer ${SECRET}`);
    expect(logs.join('\n')).not.toContain(SECRET);
  });

  it('surfaces an auth-rejected error on 401 without key material', async () => {
    process.env[HOLO_INFERENCE_PROXY_KEY_NAME_ENV] = KEY_NAME;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: { headers?: Record<string, string> }) => {
        seen.push({ url: String(url), headers: init?.headers });
        if (String(url).endsWith('/health')) return chatResponse(404, SECRET);
        return chatResponse(401, `bad ${SECRET}`);
      })
    );
    const adapter = new LocalLLMAdapter({ baseURL: 'http://127.0.0.1:18080' });

    await expect(ask(adapter)).rejects.toThrow(INFERENCE_PROXY_AUTH_REJECTED_MESSAGE);
    const health = await adapter.healthCheck();
    expect(health.ok).toBe(false);
    expect(health.error).toContain('authentication was rejected');
    expect(health.error).not.toContain(SECRET);
    expect(logs.join('\n')).not.toContain(SECRET);

    const stream = new LocalLLMAdapter({ baseURL: 'http://127.0.0.1:18080' }).streamCompletion({
      messages: [{ role: 'user', content: 'hi' }],
      maxTokens: 8,
    });
    await expect(stream[Symbol.asyncIterator]().next()).rejects.toThrow(
      INFERENCE_PROXY_AUTH_REJECTED_MESSAGE
    );
    const streamCall = seen.find((call) => call.url.endsWith('/v1/chat/completions'));
    expect(streamCall?.headers?.Authorization).toBe(`Bearer ${SECRET}`);
  });
});
