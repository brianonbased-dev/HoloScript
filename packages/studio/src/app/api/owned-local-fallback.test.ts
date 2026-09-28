/**
 * Studio's local fallback is our own model server (D.117: HoloLlama replaced Ollama on the
 * owned machines). With no cloud key, /api/generate, /api/material/generate and
 * /api/autocomplete fall back to HoloServe (HOLOSERVE_URL) or HoloLlama (HOLOLLAMA_URL), and
 * /api/health reports that server. A leftover OLLAMA_URL reaches nothing, a public
 * HOLOLLAMA_URL is refused without a call, each route makes one attempt, and a failure's text
 * (it names the LAN host) goes to the server log, never into a response. fetch is stubbed: no
 * test here calls a live server.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/api-auth', () => ({
  requireAuth: vi.fn(async () => ({ user: { id: 'u1' } })),
}));
vi.mock('@/lib/rate-limiter', () => ({
  rateLimit: () => ({ ok: true, remaining: 9 }),
}));
vi.mock('@/lib/creditGate', () => ({
  checkCredits: async () => ({ userId: 'u1', error: null }),
  deductCredits: async () => {},
}));
// No cloud keys, so every route has to reach its local step.
vi.mock('@/lib/secrets/serviceSecretStore', () => ({
  resolveStudioServiceSecret: async () => undefined,
}));
vi.mock('@/db/client', () => ({ getDb: () => null }));

import { POST as postGenerate } from './generate/route';
import { POST as postMaterial } from './material/generate/route';
import { POST as postAutocomplete } from './autocomplete/route';
import { GET as getHealth } from './health/route';
import { __resetRouteLocalFailureLog } from './_lib/ownedLocalFallback';

const JETSON_HOLOLLAMA = 'http://192.168.0.119:18080';
const JETSON_HOST = '192.168.0.119';
const LAPTOP_HOLOSERVE = 'http://127.0.0.1:8099';

const LOCAL_ENV = [
  'OLLAMA_URL',
  'OLLAMA_HOST',
  'OLLAMA_BASE_URL',
  'HOLOLLAMA_URL',
  'HOLOLLAMA_ENDPOINT',
  'HOLOSERVE_URL',
  'HOLOSERVE_ENDPOINT',
  'HOLOSERVE_MODEL',
  'HOLOSERVE_PARITY_PINS',
  'HOLOSERVE_PARITY_REGISTRY',
  'HOLO_LLM_MODEL',
  'HOLO_LLM_MAX_TOKENS',
  'BRITTNEY_MODEL',
  'BRITTNEY_MAX_TOKENS',
  'HOLO_INFERENCE_PROXY_KEY_NAME',
];

const VALID_SCENE = `composition "Local Scene" {
  scene "Main" {
    object "Beacon" @glowing {
      geometry: "sphere"
      position: [0, 1, -2]
    }
  }
}`;

interface ChatBody {
  model: string;
  messages: Array<{ role: string; content: string }>;
}

/** A local server that answers every chat request with `content`. */
function stubLocalServer(content: string) {
  const fetchMock = vi.fn(async (_url: string, _init?: { body?: string }) => ({
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content }, finish_reason: 'stop' }] }),
    text: async () => '',
  }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** A local server that answers every request with an HTTP error (a 5xx counts as retryable). */
function stubFailingServer(status: number) {
  const fetchMock = vi.fn(async (_url: string, _init?: { body?: string }) => ({
    ok: false,
    status,
    json: async () => ({}),
    text: async () => 'model busy',
  }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function sentBody(fetchMock: ReturnType<typeof stubLocalServer>): ChatBody {
  return JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as ChatBody;
}

/** Everything this test wrote to the server log (console.warn is stubbed in beforeEach). */
function warnLines(): string[] {
  return vi.mocked(console.warn).mock.calls.map((call) => String(call[0]));
}

function post(path: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('Studio local fallback = our own model server', () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...origEnv };
    for (const k of LOCAL_ENV) delete process.env[k];
    __resetRouteLocalFailureLog();
    // Failure details and llm-provider's notices go to console.warn; tests read them from here.
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = { ...origEnv };
    vi.unstubAllGlobals();
  });

  describe('/api/generate', () => {
    it('falls back to HoloLlama with the generator instructions, and labels the scene local', async () => {
      process.env.HOLOLLAMA_URL = JETSON_HOLOLLAMA;
      const fetchMock = stubLocalServer(VALID_SCENE);
      const res = await postGenerate(post('/api/generate', { prompt: 'a glowing beacon' }));
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.source).toBe('local');
      expect(data.code).toContain('composition "Local Scene"');
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0]?.[0]).toBe(`${JETSON_HOLOLLAMA}/v1/chat/completions`);
      const sent = sentBody(fetchMock);
      expect(sent.messages[0]?.role).toBe('system');
      expect(sent.messages[0]?.content).toContain('HoloScript code generator');
      expect(sent.messages[1]).toEqual({
        role: 'user',
        content: 'Generate a HoloScript scene for: a glowing beacon',
      });
    });

    it('with only OLLAMA_URL set, reaches nothing and returns the template', async () => {
      process.env.OLLAMA_URL = 'http://localhost:11434';
      const fetchMock = stubLocalServer(VALID_SCENE);
      const res = await postGenerate(post('/api/generate', { prompt: 'a glowing beacon' }));
      const data = await res.json();
      expect(data.source).toBe('mock');
      expect(data.warning).toContain('HOLOLLAMA_URL');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('returns the template when the configured local server is down', async () => {
      process.env.HOLOLLAMA_URL = JETSON_HOLOLLAMA;
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          throw new Error('connect ECONNREFUSED');
        })
      );
      const res = await postGenerate(post('/api/generate', { prompt: 'a glowing beacon' }));
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.source).toBe('mock');
      // The failure names the Jetson: server log only.
      expect(JSON.stringify(data)).not.toContain(JETSON_HOST);
      const logged = warnLines().filter((line) => line.startsWith('[studio /api/generate]'));
      expect(logged).toHaveLength(1);
      expect(logged[0]).toContain(JETSON_HOST);
    });

    it('makes one attempt: a 5xx from the local server is not retried', async () => {
      process.env.HOLOLLAMA_URL = JETSON_HOLOLLAMA;
      const fetchMock = stubFailingServer(503);
      const res = await postGenerate(post('/api/generate', { prompt: 'a glowing beacon' }));
      expect((await res.json()).source).toBe('mock');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('/api/material/generate', () => {
    const SHADER = [
      'precision mediump float;',
      'void main() { gl_FragColor = vec4(1.0); }',
      '---TRAITS---',
      '@material roughness:0.5',
    ].join('\n');

    it('falls back to HoloLlama, and a body `model` no longer picks the local model', async () => {
      process.env.HOLOLLAMA_URL = JETSON_HOLOLLAMA;
      const fetchMock = stubLocalServer(SHADER);
      const res = await postMaterial(
        post('/api/material/generate', { prompt: 'lava', model: 'codellama:7b-code' })
      );
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.glsl).toContain('void main');
      expect(data.traits).toBe('@material roughness:0.5');
      expect(fetchMock.mock.calls[0]?.[0]).toBe(`${JETSON_HOLOLLAMA}/v1/chat/completions`);
      expect(sentBody(fetchMock).model).not.toBe('codellama:7b-code');
    });

    it('with only OLLAMA_URL set, answers 503 and names HOLOLLAMA_URL', async () => {
      process.env.OLLAMA_URL = 'http://localhost:11434';
      const fetchMock = stubLocalServer(SHADER);
      const res = await postMaterial(post('/api/material/generate', { prompt: 'lava' }));
      const data = await res.json();
      expect(res.status).toBe(503);
      expect(data.error).toContain('HOLOLLAMA_URL');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('makes one attempt: a local 5xx is not retried, and the answer names no host', async () => {
      process.env.HOLOLLAMA_URL = JETSON_HOLOLLAMA;
      const fetchMock = stubFailingServer(503);
      const res = await postMaterial(post('/api/material/generate', { prompt: 'lava' }));
      const data = await res.json();
      expect(res.status).toBe(503);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(data)).not.toContain(JETSON_HOST);
    });
  });

  describe('/api/autocomplete', () => {
    it("falls back to HoloLlama as 'local', with the chat prompt, not a fill-in prompt", async () => {
      process.env.HOLOLLAMA_URL = JETSON_HOLOLLAMA;
      const fetchMock = stubLocalServer('position: [0, 1, 0]');
      const res = await postAutocomplete(
        post('/api/autocomplete', { prefix: 'object "Cube" {\n  ', suffix: '\n}' })
      );
      const data = await res.json();
      expect(data).toEqual({ completion: 'position: [0, 1, 0]', provider: 'local' });
      expect(fetchMock.mock.calls[0]?.[0]).toBe(`${JETSON_HOLOLLAMA}/v1/chat/completions`);
      const prompt = sentBody(fetchMock).messages[0]?.content ?? '';
      expect(prompt).toContain('Complete the following HoloScript code');
      expect(prompt).not.toContain('<PRE>');
    });

    it('with only OLLAMA_URL set, returns an empty completion and calls nothing', async () => {
      process.env.OLLAMA_URL = 'http://localhost:11434';
      const fetchMock = stubLocalServer('never');
      const res = await postAutocomplete(post('/api/autocomplete', { prefix: 'object "Cube" {' }));
      const data = await res.json();
      expect(data.completion).toBe('');
      expect(res.headers.get('x-llm-provider')).toBe('none');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('makes one attempt: a local 5xx is not retried, and the answer names no host', async () => {
      process.env.HOLOLLAMA_URL = JETSON_HOLOLLAMA;
      const fetchMock = stubFailingServer(503);
      const res = await postAutocomplete(post('/api/autocomplete', { prefix: 'object "Cube" {' }));
      const data = await res.json();
      expect(data.completion).toBe('');
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(data)).not.toContain(JETSON_HOST);
    });
  });

  describe('/api/health', () => {
    it('reports HoloLlama when HOLOLLAMA_URL is set (legacy ollama flag mirrors it)', async () => {
      process.env.HOLOLLAMA_URL = JETSON_HOLOLLAMA;
      const data = await (await getHealth()).json();
      expect(data.ai).toEqual({ provider: 'holollama', connected: true });
      expect(data.ollama).toBe(true);
      expect(data.models).toEqual(['holollama']);
    });

    it('reports HoloServe when both are set', async () => {
      process.env.HOLOSERVE_URL = LAPTOP_HOLOSERVE;
      process.env.HOLOLLAMA_URL = JETSON_HOLOLLAMA;
      const data = await (await getHealth()).json();
      expect(data.ai).toEqual({ provider: 'holoserve', connected: true });
    });

    it('does not count a leftover OLLAMA_URL as a provider', async () => {
      process.env.OLLAMA_URL = 'http://localhost:11434';
      const data = await (await getHealth()).json();
      expect(data.ai).toEqual({ provider: 'none', connected: false });
      expect(data.ollama).toBe(false);
      expect(data.models).toEqual([]);
    });
  });

  describe('a public HOLOLLAMA_URL is refused: no call, same answer as nothing configured', () => {
    const PUBLIC_URL = 'https://ollama.com';
    const refusals = (route: string) =>
      warnLines().filter((line) =>
        line.includes(`REFUSING HOLOLLAMA_URL for caller studio ${route}`)
      );

    it('/api/generate returns the template', async () => {
      process.env.HOLOLLAMA_URL = PUBLIC_URL;
      const fetchMock = stubLocalServer(VALID_SCENE);
      const res = await postGenerate(post('/api/generate', { prompt: 'a glowing beacon' }));
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.source).toBe('mock');
      expect(fetchMock).not.toHaveBeenCalled();
      expect(JSON.stringify(data)).not.toContain('ollama.com');
      expect(refusals('/api/generate')).toHaveLength(1);
    });

    it('/api/material/generate answers 503', async () => {
      process.env.HOLOLLAMA_URL = PUBLIC_URL;
      const fetchMock = stubLocalServer('never');
      const res = await postMaterial(post('/api/material/generate', { prompt: 'lava' }));
      expect(res.status).toBe(503);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(JSON.stringify(await res.json())).not.toContain('ollama.com');
      expect(refusals('/api/material/generate')).toHaveLength(1);
    });

    it('/api/autocomplete returns an empty completion, logging the refusal once, not per keystroke', async () => {
      process.env.HOLOLLAMA_URL = PUBLIC_URL;
      const fetchMock = stubLocalServer('never');
      for (let keystroke = 0; keystroke < 3; keystroke += 1) {
        const res = await postAutocomplete(
          post('/api/autocomplete', { prefix: 'object "Cube" {' })
        );
        expect(await res.json()).toMatchObject({ completion: '' });
        expect(res.headers.get('x-llm-provider')).toBe('none');
      }
      expect(fetchMock).not.toHaveBeenCalled();
      expect(refusals('/api/autocomplete')).toHaveLength(1);
    });

    it('/api/health reports none', async () => {
      process.env.HOLOLLAMA_URL = PUBLIC_URL;
      const data = await (await getHealth()).json();
      expect(data.ai).toEqual({ provider: 'none', connected: false });
      expect(JSON.stringify(data)).not.toContain('ollama.com');
      expect(refusals('/api/health')).toHaveLength(1);
    });
  });
});
