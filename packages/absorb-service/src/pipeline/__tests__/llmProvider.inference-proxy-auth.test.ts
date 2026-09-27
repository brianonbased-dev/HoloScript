import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HOLO_INFERENCE_PROXY_KEY_NAME_ENV,
  INFERENCE_PROXY_AUTH_REJECTED_MESSAGE,
  configureConfigSecretResolver,
  resetConfigSecretResolver,
} from '@holoscript/config';
import { createPipelineLLMProvider, createPipelineLLMProviderAsync } from '../llmProvider';

const KEY_NAME = 'HOLO_INFERENCE_PROXY_KEY';
const SECRET = 'hpky_test_7f3c9a_do_not_leak';

type Seen = { url: string; headers?: Record<string, string> };

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

function jsonResponse(status: number, body: unknown, text = '') {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 401 ? `Unauthorized ${SECRET}` : 'OK',
    text: async () => text || JSON.stringify(body),
    json: async () => body,
  };
}

describe('absorb HoloLlama provider inference proxy bearer', () => {
  const originalEnv = { ...process.env };
  let seen: Seen[];
  let logs: string[];
  let resolved: string[];

  beforeEach(() => {
    seen = [];
    logs = captureLogs();
    resolved = [];
    delete process.env.HOLO_LLM_PROVIDER;
    delete process.env.BRITTNEY_PROVIDER;
    delete process.env.HOLOLLAMA_URL;
    delete process.env.HOLOLLAMA_ENDPOINT;
    delete process.env.HOLO_LLM_SERVICE_URL;
    delete process.env[HOLO_INFERENCE_PROXY_KEY_NAME_ENV];
    configureConfigSecretResolver({
      async resolve(name) {
        resolved.push(name);
        if (name === KEY_NAME) return SECRET;
        return undefined;
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: { headers?: Record<string, string> }) => {
        seen.push({ url: String(url), headers: init?.headers });
        if (String(url).endsWith('/health')) return jsonResponse(404, {});
        if (String(url).endsWith('/v1/models')) return jsonResponse(200, { data: [{ id: 'm' }] });
        return jsonResponse(200, {
          choices: [{ message: { content: 'from-proxy' } }],
        });
      })
    );
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    resetConfigSecretResolver();
  });

  it('matches prior chat headers and skips key resolution when no name is configured', async () => {
    const provider = await createPipelineLLMProviderAsync();
    const result = await provider.chat({ system: 's', prompt: 'p', maxTokens: 16 });
    expect(result.text).toBe('from-proxy');

    const chat = seen.find((call) => call.url.endsWith('/v1/chat/completions'));
    const models = seen.find((call) => call.url.endsWith('/v1/models'));
    expect(chat?.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(models?.headers).toBeUndefined();
    expect(JSON.stringify(seen)).not.toContain('Authorization');
    expect(resolved).not.toContain(KEY_NAME);
    expect(logs.join('\n')).not.toContain(SECRET);
  });

  it('sends the exact bearer on models and chat when the key name resolves', async () => {
    process.env[HOLO_INFERENCE_PROXY_KEY_NAME_ENV] = KEY_NAME;
    process.env.HOLOLLAMA_URL = 'http://jetson.local:9999';
    const provider = await createPipelineLLMProviderAsync();
    await provider.chat({ system: 's', prompt: 'p', maxTokens: 16 });

    const chat = seen.find((call) => call.url.endsWith('/v1/chat/completions'));
    const models = seen.find((call) => call.url.endsWith('/v1/models'));
    const health = seen.find((call) => call.url.endsWith('/health'));
    expect(models?.url).toBe('http://jetson.local:9999/v1/models');
    expect(chat?.url).toBe('http://jetson.local:9999/v1/chat/completions');
    expect(models?.headers).toEqual({ Authorization: `Bearer ${SECRET}` });
    expect(health?.headers).toEqual({ Authorization: `Bearer ${SECRET}` });
    expect(chat?.headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SECRET}`,
    });
  });

  it('does not leak the key into logs or a 500 body', async () => {
    process.env[HOLO_INFERENCE_PROXY_KEY_NAME_ENV] = KEY_NAME;
    process.env.HOLO_LLM_PROVIDER = 'holollama';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: { headers?: Record<string, string> }) => {
        seen.push({ url: String(url), headers: init?.headers });
        return jsonResponse(500, {}, `echo ${SECRET}`);
      })
    );
    const provider = createPipelineLLMProvider();
    let caught: unknown;
    try {
      await provider.chat({ system: 's', prompt: 'p', maxTokens: 8 });
    } catch (err) {
      caught = err;
    }
    expect(errorText(caught)).not.toContain(SECRET);
    expect(errorText(caught)).toContain('[redacted]');
    expect(logs.join('\n')).not.toContain(SECRET);
  });

  it('throws the auth-rejected error on 401 from chat and model listing', async () => {
    process.env[HOLO_INFERENCE_PROXY_KEY_NAME_ENV] = KEY_NAME;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: { headers?: Record<string, string> }) => {
        seen.push({ url: String(url), headers: init?.headers });
        if (String(url).endsWith('/health')) return jsonResponse(404, {}, SECRET);
        return jsonResponse(401, { error: SECRET }, `nope ${SECRET}`);
      })
    );

    await expect(createPipelineLLMProviderAsync()).rejects.toThrow(/authentication was rejected/);
    const listed = seen.find((call) => call.url.endsWith('/v1/models'));
    expect(listed?.headers?.Authorization).toBe(`Bearer ${SECRET}`);

    process.env.HOLO_LLM_PROVIDER = 'holollama';
    const provider = createPipelineLLMProvider();
    let caught: unknown;
    try {
      await provider.chat({ system: 's', prompt: 'p', maxTokens: 8 });
    } catch (err) {
      caught = err;
    }
    const text = errorText(caught);
    expect(text).toContain(INFERENCE_PROXY_AUTH_REJECTED_MESSAGE);
    expect(text).not.toContain(SECRET);
    expect(logs.join('\n')).not.toContain(SECRET);
  });
});
