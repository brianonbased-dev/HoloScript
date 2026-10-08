/**
 * holo_ask_codebase answers on the hardware the owner registered, not on a
 * hard-wired 127.0.0.1:18080 (task_1791233085942_sa7k).
 *
 * Every test points the device registry at a temp folder and stubs fetch, so the
 * "network" is exactly the servers each test declares.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configureConfigSecretResolver, resetConfigSecretResolver } from '@holoscript/config';
import type { CodebaseGraph } from '../engine/CodebaseGraph';
import type { SymbolSearchIndex } from '../engine/SearchIndex';
import type { ExternalSymbolDefinition } from '../engine/types';
import { GraphRAGEngine } from '../engine/GraphRAGEngine';
import {
  handleGraphRagTool,
  resetGraphRAGStateForTests,
  setGraphRAGState,
} from './graph-rag-tools';
import { runWithCodeReadAccess } from './code-read-access';

const ENV_KEYS = [
  'SOVEREIGN_DEVICES_DIR',
  'HOLOLLAMA_URL',
  'HOLOLLAMA_ENDPOINT',
  'HOLOLLAMA_PROFILE',
  'HOLOSERVE_URL',
  'HOLOSERVE_ENDPOINT',
  'HOLO_LLM_PROVIDER',
  'BRITTNEY_PROVIDER',
  'ABSORB_GRAPH_RAG_LLM_PROVIDER',
  'HOLO_LLM_FLEET_BRAIN',
  'HOLO_LLM_SERVICE_URL',
  'BRITTNEY_SERVICE_URL',
  'VAST_API_KEY',
  'HOLO_VAST_CODING_URL',
  'ANTHROPIC_API_KEY',
  'XAI_API_KEY',
  'OPENAI_API_KEY',
] as const;
const savedEnv: Record<string, string | undefined> = {};
let registryDir = '';

type AskResult = {
  answer?: string | null;
  answered?: boolean;
  llmProvider?: string;
  fallback?: string;
  fallbackReason?: string;
  answeredBy?: {
    kind: string;
    device?: string;
    capability?: string;
    endpoint?: string;
    model?: string;
    provider?: string;
    summary: string;
  };
  routing?: Array<{ kind: string; target: string; outcome: string; reason?: string }>;
};

function writeDevice(handle: string, capabilities: unknown[]): void {
  writeFileSync(join(registryDir, `${handle}.json`), JSON.stringify({ handle, capabilities }));
}

/** Registry shaped like the real laptop + Jetson files. */
function writeLaptopAndJetson(): void {
  writeDevice('jetson-orin', [
    {
      id: 'local-llm',
      status: 'available',
      backend: 'llama.cpp',
      model: 'brittney-edge:v0-4',
      endpoint: 'http://holojetson.local:18080',
      endpoint_ip: 'http://192.168.0.119:18080',
    },
  ]);
  writeDevice('laptop-rtx3060', [
    { id: 'local-llm', status: 'retired', endpoint: 'http://192.168.0.23:11434' },
    {
      id: 'holollama-fara',
      status: 'available',
      model: 'fara-7b',
      backend: 'llama.cpp',
      endpoint: 'http://127.0.0.1:18080',
    },
  ]);
}

function llamaServer(model: string, answer: string): Record<string, unknown> {
  return {
    'GET /health': { status: 'ok' },
    'GET /props': { default_generation_settings: { model, n_ctx: 4096 }, total_slots: 1 },
    'GET /slots': [{ id: 0, is_processing: false }],
    'POST /v1/chat/completions': { choices: [{ message: { content: answer } }] },
  };
}

/** Stub fetch with the given servers; anything else is unreachable. */
function stubNetwork(servers: Record<string, Record<string, unknown>>): string[] {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const method = (init?.method ?? 'GET').toUpperCase();
      calls.push(`${method} ${url.origin}${url.pathname}`);
      const body = servers[url.origin]?.[`${method} ${url.pathname}`];
      if (body === undefined) throw new TypeError('fetch failed');
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    })
  );
  return calls;
}

function seedGraph(): void {
  const symbol: ExternalSymbolDefinition = {
    name: 'AbsorbService',
    type: 'class',
    filePath: 'packages/absorb-service/src/index.ts',
    line: 12,
    column: 1,
    language: 'typescript',
    visibility: 'public',
    signature: 'class AbsorbService',
  };
  const hit = { symbol, score: 0.99, file: symbol.filePath, type: symbol.type };
  const index: SymbolSearchIndex = {
    search: async () => [hit],
    searchWithFilters: async () => [hit],
  };
  const graph = {
    getCallersOf: () => [],
    getCalleesOf: () => [],
    getSymbolImpact: () => new Set<string>(),
    getCommunityForFile: () => 'absorb-service',
    getSymbolsInFile: (file: string) => (file === symbol.filePath ? [symbol] : []),
  } as unknown as CodebaseGraph;
  setGraphRAGState(index, new GraphRAGEngine(graph, index));
}

async function ask(extra: Record<string, unknown> = {}): Promise<AskResult> {
  return (await handleGraphRagTool('holo_ask_codebase', {
    question: 'How does Absorb answer codebase questions?',
    topK: 1,
    ...extra,
  })) as AskResult;
}

describe('holo_ask_codebase answer-model routing', () => {
  beforeEach(() => {
    for (const k of ENV_KEYS) {
      savedEnv[k] = process.env[k];
      delete process.env[k];
    }
    registryDir = mkdtempSync(join(tmpdir(), 'absorb-answer-routing-'));
    process.env.SOVEREIGN_DEVICES_DIR = registryDir;
    // No HoloKey / vault values leak in from the machine running the test.
    configureConfigSecretResolver({
      async resolve() {
        return undefined;
      },
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    seedGraph();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    resetGraphRAGStateForTests();
    resetConfigSecretResolver();
    rmSync(registryDir, { recursive: true, force: true });
    for (const k of ENV_KEYS) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
  });

  it('answers on a registered device on this computer when it is up', async () => {
    writeLaptopAndJetson();
    const calls = stubNetwork({
      'http://127.0.0.1:18080': llamaServer('fara-7b', 'Answer from the laptop.'),
      'http://192.168.0.119:18080': llamaServer('brittney-edge:v0-4', 'Answer from the Jetson.'),
    });

    const result = await ask();

    expect(result.answer).toBe('Answer from the laptop.');
    expect(result.answeredBy).toMatchObject({
      kind: 'local-device',
      device: 'laptop-rtx3060',
      capability: 'holollama-fara',
      model: 'fara-7b',
      provider: 'holollama',
    });
    expect(result.llmProvider).toBe('holollama');
    expect(calls).not.toContain('POST http://192.168.0.119:18080/v1/chat/completions');
  });

  it('falls through to a registered device on the local network when this computer has none up', async () => {
    writeLaptopAndJetson();
    const calls = stubNetwork({
      // The laptop's 127.0.0.1:18080 is down (GPU busy with HoloServe); the Jetson is up.
      'http://192.168.0.119:18080': llamaServer('brittney-edge:v0-4', 'Answer from the Jetson.'),
    });

    const result = await ask();

    expect(result.answer).toBe('Answer from the Jetson.');
    expect(result.answeredBy).toMatchObject({
      kind: 'fleet-device',
      device: 'jetson-orin',
      model: 'brittney-edge:v0-4',
      endpoint: 'http://192.168.0.119:18080',
    });
    expect(result.answeredBy?.summary).toContain('jetson-orin');
    expect(calls).toContain('POST http://192.168.0.119:18080/v1/chat/completions');
    expect(calls).not.toContain('POST http://127.0.0.1:18080/v1/chat/completions');
    expect(result.routing).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ target: 'laptop-rtx3060/holollama-fara', outcome: 'skipped' }),
        expect.objectContaining({ target: 'jetson-orin/local-llm', outcome: 'answered' }),
      ])
    );
  });

  it('moves on when a device that probed up fails to answer', async () => {
    writeLaptopAndJetson();
    const laptop = llamaServer('fara-7b', 'unused');
    delete laptop['POST /v1/chat/completions']; // probes fine, then the completion fails
    stubNetwork({
      'http://127.0.0.1:18080': laptop,
      'http://192.168.0.119:18080': llamaServer('brittney-edge:v0-4', 'Answer from the Jetson.'),
    });

    const result = await ask();

    expect(result.answer).toBe('Answer from the Jetson.');
    expect(result.answeredBy?.kind).toBe('fleet-device');
    expect(result.routing).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ target: 'laptop-rtx3060/holollama-fara', outcome: 'failed' }),
      ])
    );
  });

  it('returns a retrieval-only result naming every route when nothing answers and no paid route is allowed', async () => {
    writeLaptopAndJetson();
    stubNetwork({});

    const result = await ask();

    expect(result.fallback).toBe('extractive-graphrag');
    expect(result.answeredBy?.kind).toBe('retrieval-only');
    expect(result.fallbackReason).toContain('jetson-orin/local-llm');
    expect(result.fallbackReason).toContain('laptop-rtx3060/holollama-fara');
    expect(result.routing?.map((r) => r.outcome)).not.toContain('answered');
  });

  it('an explicit holoLlamaEndpoint still wins over the registered devices', async () => {
    writeLaptopAndJetson();
    const calls = stubNetwork({
      'http://10.0.0.5:18080': {
        'POST /v1/chat/completions': { choices: [{ message: { content: 'Pinned answer.' } }] },
      },
      'http://127.0.0.1:18080': llamaServer('fara-7b', 'Answer from the laptop.'),
    });

    const result = await ask({ holoLlamaEndpoint: 'http://10.0.0.5:18080/v1' });

    expect(result.answer).toBe('Pinned answer.');
    expect(result.answeredBy).toMatchObject({
      kind: 'explicit-endpoint',
      endpoint: 'http://10.0.0.5:18080',
    });
    // The registry was never probed.
    expect(calls.some((c) => c.endsWith('/health'))).toBe(false);
  });

  /** A request to anything but a registered device (loopback or LAN). */
  const offRegistry = (call: string) => {
    const host = new URL(call.split(' ')[1]).hostname;
    return !(host.startsWith('127.') || host.startsWith('192.168.'));
  };

  it('never reaches the paid step for a caller who may not read code; the operator still does', async () => {
    process.env.VAST_API_KEY = 'test-only-not-a-key';
    const tenantCalls = stubNetwork({});
    const tenant = await ask();
    expect(tenant.answeredBy?.kind).toBe('retrieval-only');
    expect(tenant.routing).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target: 'resolver',
          outcome: 'skipped',
          reason: expect.stringContaining('operator'),
        }),
      ])
    );
    // Nothing left for anything but registered devices: no Vast route probe.
    expect(tenantCalls.filter(offRegistry)).toEqual([]);

    vi.unstubAllGlobals();
    const operatorCalls = stubNetwork({});
    await runWithCodeReadAccess(true, () => ask());
    expect(operatorCalls.some(offRegistry)).toBe(true);
  });

  it('puts code in the answer prompt only for a caller who may read code', async () => {
    const root = mkdtempSync(join(tmpdir(), 'absorb-prompt-gate-'));
    const CODE_LINE = 'return answerFromTheGraph(question);';
    writeFileSync(
      join(root, 'service.ts'),
      ['export class AbsorbService {', `  ask(question: string) { ${CODE_LINE} }`, '}', ''].join('\n')
    );
    const symbol: ExternalSymbolDefinition = {
      name: 'AbsorbService',
      type: 'class',
      filePath: 'service.ts',
      line: 1,
      column: 1,
      language: 'typescript',
      visibility: 'public',
      signature: 'class AbsorbService',
    };
    const hit = { symbol, score: 0.99, file: symbol.filePath, type: symbol.type };
    const index: SymbolSearchIndex = {
      search: async () => [hit],
      searchWithFilters: async () => [hit],
    };
    const graph = {
      getRootDir: () => root,
      getCallersOf: () => [],
      getCalleesOf: () => [],
      getSymbolImpact: () => new Set<string>(),
      getCommunityForFile: () => 'absorb-service',
      getSymbolsInFile: (file: string) => (file === symbol.filePath ? [symbol] : []),
    } as unknown as CodebaseGraph;
    setGraphRAGState(index, new GraphRAGEngine(graph, index));

    writeLaptopAndJetson();
    const prompts: string[] = [];
    const server = llamaServer('fara-7b', 'An answer.');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        const url = new URL(String(input));
        const method = (init?.method ?? 'GET').toUpperCase();
        // Only the laptop device (loopback, port 18080) answers.
        if (!url.hostname.startsWith('127.') || url.port !== '18080') {
          throw new TypeError('fetch failed');
        }
        if (method === 'POST') prompts.push(String(init?.body ?? ''));
        const body = server[`${method} ${url.pathname}`];
        if (body === undefined) throw new TypeError('fetch failed');
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      })
    );

    await ask();
    expect(prompts.length).toBeGreaterThan(0);
    expect(prompts.join('\n')).not.toContain(CODE_LINE);

    prompts.length = 0;
    await runWithCodeReadAccess(true, () => ask());
    expect(prompts.join('\n')).toContain(CODE_LINE);
    rmSync(root, { recursive: true, force: true });
  });
});
