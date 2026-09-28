/**
 * Studio's local fallback is our own model server (D.117: HoloLlama replaced Ollama on the
 * owned machines). With no cloud key, /api/generate, /api/material/generate and
 * /api/autocomplete fall back to HoloServe (HOLOSERVE_URL) or HoloLlama (HOLOLLAMA_URL), and
 * /api/health reports that server. A leftover OLLAMA_URL reaches nothing. fetch is stubbed:
 * no test here calls a live server.
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

const JETSON_HOLOLLAMA = 'http://192.168.0.119:18080';
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

function sentBody(fetchMock: ReturnType<typeof stubLocalServer>): ChatBody {
  return JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as ChatBody;
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
    // The retirement notice is llm-provider's; keep it out of the test output.
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
});
