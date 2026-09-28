/**
 * studio-api's model routes run on our own local model server (D.117: HoloLlama replaced
 * Ollama): HoloServe when HOLOSERVE_URL is set, else HoloLlama when HOLOLLAMA_URL is set.
 * A leftover OLLAMA_* selects nothing. fetch is mocked: no case reaches a real server.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as materialPOST } from './material/generate/route';
import { POST as autocompletePOST } from './autocomplete/route';
import { GET as healthGET } from './health/route';

const HOLOLLAMA = 'http://holollama.test:18080';
const HOLOSERVE = 'http://holoserve.test:8099';
/** A parity pin for HoloServe's default model: the sync resolver refuses to hand it out. */
const PINNED = `holorunner-s0@sha256:${'a'.repeat(64)}`;

const ENV_NAMES = [
  'OLLAMA_URL',
  'OLLAMA_HOST',
  'OLLAMA_BASE_URL',
  'OLLAMA_MODEL',
  'OLLAMA_AUTOCOMPLETE_MODEL',
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
];

function stubEnv(env: Record<string, string> = {}) {
  for (const name of ENV_NAMES) vi.stubEnv(name, env[name] ?? '');
}

function post(path: string, body: unknown) {
  return new Request(`http://studio-api.test${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function chat(content: string) {
  return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content } }] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

/** For cases that must send nothing: a call fails the assertion, never reaches a network. */
function noFetch() {
  return vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('no network in tests'));
}

function sentBody(fetchMock: { mock: { calls: unknown[][] } }, call = 0) {
  const init = fetchMock.mock.calls[call][1] as RequestInit | undefined;
  return JSON.parse(String(init?.body)) as {
    model?: string;
    max_tokens?: number;
    stop?: string[];
    messages?: Array<{ role: string; content: string }>;
  };
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('POST /api/material/generate', () => {
  it('answers 503 and sends nothing when no local model server is configured', async () => {
    stubEnv({ OLLAMA_BASE_URL: 'http://127.0.0.1:11434' });
    const fetchMock = noFetch();

    const res = await materialPOST(post('/api/material/generate', { prompt: 'lava' }));

    expect(res.status).toBe(503);
    expect((await res.json()).error).toContain('Set HOLOLLAMA_URL (HoloLlama) or HOLOSERVE_URL');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('asks HoloLlama with a system prompt and the request, and splits the traits', async () => {
    stubEnv({ HOLOLLAMA_URL: HOLOLLAMA });
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        chat('void main() { gl_FragColor = vec4(1.0); }\n---TRAITS---\n@material roughness:0.5')
      );

    const res = await materialPOST(
      post('/api/material/generate', { prompt: 'lava', baseColor: '#ff0000', model: 'qwen3.5:4b' })
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      glsl: 'void main() { gl_FragColor = vec4(1.0); }',
      traits: '@material roughness:0.5',
    });
    expect(String(fetchMock.mock.calls[0][0])).toBe(`${HOLOLLAMA}/v1/chat/completions`);
    const body = sentBody(fetchMock);
    expect(body.messages?.map((m) => m.role)).toEqual(['system', 'user']);
    expect(body.messages?.[0].content).toContain('Base color is: #ff0000');
    expect(body.messages?.[1].content).toBe('lava');
    // body.model no longer selects the model.
    expect(body.model).not.toBe('qwen3.5:4b');
  });

  it('answers 502 when the local model server does not answer', async () => {
    stubEnv({ HOLOLLAMA_URL: HOLOLLAMA });
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('fetch failed'));

    const res = await materialPOST(post('/api/material/generate', { prompt: 'lava' }));

    expect(res.status).toBe(502);
    expect((await res.json()).error).toContain('holollama');
  });

  it('answers 503 when the configured model is parity-pinned and cannot be used here', async () => {
    stubEnv({ HOLOSERVE_URL: HOLOSERVE, HOLOSERVE_PARITY_PINS: PINNED });
    const fetchMock = noFetch();

    const res = await materialPOST(post('/api/material/generate', { prompt: 'lava' }));

    expect(res.status).toBe(503);
    expect((await res.json()).error).toContain('cannot be used here');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('answers 422 when the model returns no shader', async () => {
    stubEnv({ HOLOLLAMA_URL: HOLOLLAMA });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(chat('I cannot help with that.'));

    const res = await materialPOST(post('/api/material/generate', { prompt: 'lava' }));

    expect(res.status).toBe(422);
  });
});

describe('POST /api/autocomplete', () => {
  it('returns an empty completion with a warning when nothing is configured', async () => {
    stubEnv({ OLLAMA_URL: 'http://127.0.0.1:11434' });
    const fetchMock = noFetch();

    const res = await autocompletePOST(post('/api/autocomplete', { prefix: 'object "A" {' }));
    const json = await res.json();

    expect(json.completion).toBe('');
    expect(json.warning).toContain('HOLOLLAMA_URL');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends a chat request with the cursor between prefix and suffix', async () => {
    stubEnv({ HOLOLLAMA_URL: HOLOLLAMA });
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(chat('```holoscript\n  geometry: "cube"\n```'));

    const res = await autocompletePOST(
      post('/api/autocomplete', { prefix: 'object "A" {\n', suffix: '\n}', maxTokens: 999 })
    );

    expect(await res.json()).toEqual({ completion: '  geometry: "cube"' });
    expect(String(fetchMock.mock.calls[0][0])).toBe(`${HOLOLLAMA}/v1/chat/completions`);
    const body = sentBody(fetchMock);
    expect(body.messages?.[1].content).toContain('object "A" {\n<cursor>\n}');
    expect(body.max_tokens).toBe(256);
    expect(body.stop).toEqual(['\n\n']);
  });

  it('degrades to an empty completion when the server fails', async () => {
    stubEnv({ HOLOLLAMA_URL: HOLOLLAMA });
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('fetch failed'));

    const res = await autocompletePOST(post('/api/autocomplete', { prefix: 'object "A" {' }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.completion).toBe('');
    expect(json.warning).toContain('Autocomplete unavailable');
  });
});

describe('GET /api/health', () => {
  it('reports no local model, and no ollama field, when nothing is configured', async () => {
    stubEnv({ OLLAMA_URL: 'http://127.0.0.1:11434' });
    const fetchMock = noFetch();

    const json = await (await healthGET()).json();

    expect(json.local).toEqual({ provider: 'none', reachable: false });
    expect(json).not.toHaveProperty('ollama');
    expect(json).toHaveProperty('persistence');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports HoloLlama reachable, with the models it lists', async () => {
    stubEnv({ HOLOLLAMA_URL: HOLOLLAMA });
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input) =>
        String(input).endsWith('/v1/models')
          ? new Response(JSON.stringify({ object: 'list', data: [{ id: 'qwen3-4b-instruct' }] }))
          : new Response(JSON.stringify({ status: 'ok' }))
      );

    const json = await (await healthGET()).json();

    expect(json.local).toEqual({
      provider: 'holollama',
      reachable: true,
      models: ['qwen3-4b-instruct'],
    });
    expect(fetchMock.mock.calls.map((c) => String(c[0]))).toEqual([
      `${HOLOLLAMA}/health`,
      `${HOLOLLAMA}/v1/models`,
    ]);
  });

  it('reports a parity-pinned HoloServe as configured but not reachable', async () => {
    stubEnv({ HOLOSERVE_URL: HOLOSERVE, HOLOSERVE_PARITY_PINS: PINNED });
    noFetch();

    const json = await (await healthGET()).json();

    expect(json.local).toMatchObject({
      provider: 'holoserve',
      reachable: false,
      error: expect.stringContaining('artifact-pinned'),
    });
  });

  it('reports HoloLlama unreachable when it does not answer', async () => {
    stubEnv({ HOLOLLAMA_URL: HOLOLLAMA });
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('fetch failed'));

    const json = await (await healthGET()).json();

    expect(json.local).toEqual({ provider: 'holollama', reachable: false });
  });
});
