/**
 * The MCP server's local fallback is our own model server (D.117: HoloLlama replaced Ollama
 * on the owned machines 2026-07-05): HoloServe when HOLOSERVE_URL is set, else HoloLlama
 * when HOLOLLAMA_URL is set, else nothing. A leftover OLLAMA_URL selects nothing; it only
 * gets a one-line notice.
 *
 * LLM_PROVIDER=ollama still reaches OLLAMA_URL, as a deliberate foreign choice. There a
 * hosted Ollama URL (ollama.com) or a cloud-tagged model is not local, so nothing is sent
 * to it and it does not report as available — unless HOLO_ALLOW_HOSTED_OLLAMA=1
 * (2026-09-24 native-inference audit follow-up).
 *
 * ollama-client reads its env at import time, so each case stubs env, resets the
 * module registry, and imports it fresh. fetch is mocked: no case reaches a real server.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const ENV_NAMES = [
  'LLM_PROVIDER',
  'OPENROUTER_API_KEY',
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'OLLAMA_URL',
  'OLLAMA_HOST',
  'OLLAMA_BASE_URL',
  'OLLAMA_MODEL',
  'HOLO_ALLOW_HOSTED_OLLAMA',
  'HOLOSERVE_URL',
  'HOLOSERVE_ENDPOINT',
  'HOLOSERVE_MODEL',
  'HOLOSERVE_PARITY_PINS',
  'HOLOSERVE_PARITY_REGISTRY',
  'HOLOLLAMA_URL',
  'HOLOLLAMA_ENDPOINT',
  'HOLO_LLM_MODEL',
  'BRITTNEY_MODEL',
  'HOLO_LLM_MAX_TOKENS',
  'BRITTNEY_MAX_TOKENS',
  'HOLO_INFERENCE_PROXY_KEY_NAME',
  'GEMMA_EDGE_MODEL',
];

const HOLOLLAMA = 'http://holollama.test:18080';
const HOLOSERVE = 'http://holoserve.test:8099';

async function loadClient(env: Record<string, string>) {
  vi.resetModules();
  for (const name of ENV_NAMES) {
    vi.stubEnv(name, env[name] ?? '');
  }
  return import('../ollama-client');
}

function okCompletion(content = 'ok') {
  return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content } }] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function mockFetch() {
  return vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (input) =>
      String(input).endsWith('/health')
        ? new Response(JSON.stringify({ status: 'ok' }), { status: 200 })
        : okCompletion('object "Cube" {}')
    );
}

function requestBody(fetchMock: ReturnType<typeof mockFetch>, call = 0) {
  return JSON.parse(String(fetchMock.mock.calls[call][1]?.body)) as {
    model?: string;
    messages?: Array<{ role: string; content: string }>;
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('mcp-server ollama-client: the no-key default is our own local model', () => {
  it('asks HoloLlama over /v1/chat/completions when only HOLOLLAMA_URL is set', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const fetchMock = mockFetch();
    const client = await loadClient({ HOLOLLAMA_URL: HOLOLLAMA });

    expect(client.getActiveProvider()).toBe('local');
    expect(await client.queryOllama('hello', 'be brief')).toBe('object "Cube" {}');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe(`${HOLOLLAMA}/v1/chat/completions`);
    expect(requestBody(fetchMock).messages).toEqual([
      { role: 'system', content: 'be brief' },
      { role: 'user', content: 'hello' },
    ]);
  });

  it('prefers HoloServe, and sends it its own model name rather than an Ollama tag', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const fetchMock = mockFetch();
    const client = await loadClient({
      HOLOSERVE_URL: HOLOSERVE,
      HOLOLLAMA_URL: HOLOLLAMA,
      OLLAMA_MODEL: 'qwen3.5:4b',
    });

    await client.queryOllama('hello');
    expect(String(fetchMock.mock.calls[0][0])).toBe(`${HOLOSERVE}/v1/chat/completions`);
    expect(requestBody(fetchMock).model).toBe('holorunner-s0');
    expect(client.describeLocalModel()).toEqual({ source: 'holoserve', model: 'holorunner-s0' });
  });

  it('sends nothing to a leftover OLLAMA_URL, and says Ollama is retired', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const fetchMock = mockFetch();
    const client = await loadClient({ OLLAMA_URL: 'http://127.0.0.1:11434' });

    expect(client.getActiveProvider()).toBe('local');
    expect(await client.queryOllama('hello')).toBeNull();
    expect(await client.isOllamaAvailable()).toBe(false);
    expect(client.describeLocalModel()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('OLLAMA RETIRED (caller mcp-server local fallback)')
    );
  });

  it('isOllamaAvailable follows the owned local model', async () => {
    const fetchMock = mockFetch();

    let client = await loadClient({});
    expect(await client.isOllamaAvailable()).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();

    client = await loadClient({ HOLOLLAMA_URL: HOLOLLAMA });
    expect(await client.isOllamaAvailable()).toBe(true);
    expect(String(fetchMock.mock.calls[0][0])).toBe(`${HOLOLLAMA}/health`);

    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    client = await loadClient({ HOLOLLAMA_URL: HOLOLLAMA });
    expect(await client.isOllamaAvailable()).toBe(false);
  });

  it('runs the hybrid-gemma edge half on the owned local model, without a gemma override', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const fetchMock = mockFetch();
    const client = await loadClient({
      LLM_PROVIDER: 'hybrid-gemma',
      HOLOLLAMA_URL: HOLOLLAMA,
      GEMMA_EDGE_MODEL: 'gemma4:e4b',
    });

    expect(await client.queryOllama('hello')).toBe('object "Cube" {}');
    expect(String(fetchMock.mock.calls[0][0])).toBe(`${HOLOLLAMA}/v1/chat/completions`);
    expect(requestBody(fetchMock).model).not.toBe('gemma4:e4b');
  });
});

describe('mcp-server ollama-client: explicit LLM_PROVIDER=ollama never means hosted', () => {
  it('sends nothing to ollama.com and reports Ollama unavailable', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const fetchMock = mockFetch();
    const client = await loadClient({ LLM_PROVIDER: 'ollama', OLLAMA_URL: 'https://ollama.com' });

    expect(client.getActiveProvider()).toBe('ollama');
    expect(await client.queryOllama('hello')).toBeNull();
    expect(await client.isOllamaAvailable()).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('HOSTED OLLAMA REFUSED'));
  });

  it('refuses a cloud-tagged OLLAMA_MODEL on a local Ollama too', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const fetchMock = mockFetch();
    const client = await loadClient({
      LLM_PROVIDER: 'ollama',
      OLLAMA_URL: 'http://127.0.0.1:11434',
      OLLAMA_MODEL: 'glm-4.6:cloud',
    });

    expect(await client.queryOllama('hello')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('still queries an owned Ollama, and not the owned local model', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const fetchMock = mockFetch();
    const client = await loadClient({
      LLM_PROVIDER: 'ollama',
      OLLAMA_URL: 'http://127.0.0.1:11434',
      HOLOLLAMA_URL: HOLOLLAMA,
    });

    await client.queryOllama('hello');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('127.0.0.1:11434');
    expect(client.describeLocalModel()).toEqual({ source: 'ollama', model: expect.any(String) });
  });
});
