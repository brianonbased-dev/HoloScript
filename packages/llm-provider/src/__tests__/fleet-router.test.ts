/**
 * fleet-router — parsing the native `@model_fleet` brain and routing one request
 * across the owned-metal GPU nodes (Jetson + laptop RTX 3060) least-loaded +
 * warm-preferred, with endpoints resolved by registry handle.
 *
 * Network + registry are injected (fetchImpl / resolveEndpoint) so the suite is
 * hermetic — no real Ollama, no real files.
 */
import { describe, expect, test } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  parseFleetSpec,
  planFleetModelPlacement,
  pickFleetModel,
  resolveNodeEndpoint,
  discoverNode,
  discoverLlamaCppNode,
  discoverPytorchHoloNode,
  embedAcrossFleet,
  cosineSimilarity,
  type FleetSpec,
  type FetchLike,
} from '../fleet-router';
import { FLEET_PLACEMENT_MANIFEST_SCHEMA } from '../fleet-placement';

// A faithful slice of compositions/model-fleet.hsplus (the authored spec).
const BRAIN_SRC = `
You are the Local Model Fleet.

#version 6.0.0
#target daemon

@model_fleet {
  jetson {
    node: "jetson-orin"
    gpu: "Jetson Orin Nano Super 8GB"
    models: ["qwen3:4b-instruct", "qwen3:4b", "hf.co/bartowski/microsoft_Fara-7B-GGUF:Q4_K_M"]
    role: "edge brain"
  }
  laptop {
    node: "laptop-rtx3060"
    gpu: "RTX 3060 Laptop 6GB"
    models: ["qwen3:4b-instruct", "gemma4:e2b", "qwen3.5:4b", "nomic-embed-text:latest"]
    role: "second GPU"
  }
  endpoints: "resolved by handle"
  strategy: "least-loaded"
  warm_preferred: true
  artifact_mode: "warm_only"
  data_plane: "direct_worker"
  parallel_scope: "single_worker"
  spend: "forbidden"
  provisioning: "forbidden"
  remote_code: false
  generic_rpc: false
  inter_worker_tensor_transport: false
  blacklist: ["qwen2.5"]
}

@provider_policy {
  prefer: "qwen3:4b-instruct"
}
`;

/** Build an injected fetch from a map of baseURL → {tags, ps}. Unknown host = unreachable. */
function fakeFetch(
  nodes: Record<string, { tags: string[]; ps?: Array<{ name: string; vram: number }> }>
): FetchLike {
  return async (url: string) => {
    const base = url.replace(/\/api\/(tags|ps)$/, '');
    const node = nodes[base];
    if (!node) throw new Error('ECONNREFUSED'); // unreachable host
    if (url.endsWith('/api/tags')) {
      return { ok: true, json: async () => ({ models: node.tags.map((name) => ({ name })) }) };
    }
    // /api/ps
    return {
      ok: true,
      json: async () => ({
        models: (node.ps ?? []).map((p) => ({ name: p.name, size_vram: p.vram })),
      }),
    };
  };
}

const ENDPOINTS: Record<string, string> = {
  'jetson-orin': 'http://holojetson.local:11434',
  'laptop-rtx3060': 'http://192.168.0.23:11434',
};
const resolveEndpoint = async (h: string): Promise<string | null> => ENDPOINTS[h] ?? null;

describe('parseFleetSpec', () => {
  test('consumes the canonical authored composition with the safe placement policy', () => {
    const authored = readFileSync(
      new URL('../../../../compositions/model-fleet.hsplus', import.meta.url),
      'utf8'
    );
    const spec = parseFleetSpec(authored);

    expect(spec).not.toBeNull();
    expect(spec!.nodes.map((node) => node.handle)).not.toContain('holo-runtime-m1');
    expect(
      spec!.nodes.every(
        (node) =>
          node.backend === undefined ||
          node.backend === 'ollama' ||
          node.backend === 'llama.cpp' ||
          node.backend === 'pytorch-holo'
      )
    ).toBe(true);
    expect(spec?.placementPolicy).toEqual({
      artifactMode: 'warm_only',
      dataPlane: 'direct_worker',
      parallelScope: 'single_worker',
      spend: 'forbidden',
      provisioning: 'forbidden',
      remoteCode: false,
      genericRpc: false,
      interWorkerTensorTransport: false,
    });
  });

  test('extracts both nodes by handle, strategy, warm-preferred, blacklist', () => {
    const spec = parseFleetSpec(BRAIN_SRC);
    expect(spec).not.toBeNull();
    expect(spec!.nodes.map((n) => n.handle)).toEqual(['jetson-orin', 'laptop-rtx3060']);
    expect(spec!.strategy).toBe('least-loaded');
    expect(spec!.warmPreferred).toBe(true);
    expect(spec!.blacklist).toEqual(['qwen2.5']);
    expect(spec!.placementPolicy).toEqual({
      artifactMode: 'warm_only',
      dataPlane: 'direct_worker',
      parallelScope: 'single_worker',
      spend: 'forbidden',
      provisioning: 'forbidden',
      remoteCode: false,
      genericRpc: false,
      interWorkerTensorTransport: false,
    });
  });

  test('node model hints are parsed, not leaked into fleet-level blacklist', () => {
    const spec = parseFleetSpec(BRAIN_SRC)!;
    const laptop = spec.nodes.find((n) => n.handle === 'laptop-rtx3060')!;
    expect(laptop.models).toContain('nomic-embed-text:latest');
    expect(laptop.role).toBe('second GPU');
    // blacklist must be exactly the fleet-level one — a node's models[] must not bleed in.
    expect(spec.blacklist).toEqual(['qwen2.5']);
  });

  test('returns null when no @model_fleet block is present', () => {
    expect(parseFleetSpec('#version 6.0.0\nidentity { domain: "x" }')).toBeNull();
  });

  test('rejects path-traversal and non-basename node handles', () => {
    for (const handle of [
      '../outside',
      String.raw`..\outside`,
      'nested/worker',
      'C:/outside',
      'CON',
      'NUL',
      'jetson.',
    ]) {
      expect(parseFleetSpec(`@model_fleet { worker { node: "${handle}" } }`)).toBeNull();
    }
  });

  test('rejects duplicate or non-string node fields while ignoring runtime_id-only blocks', () => {
    expect(
      parseFleetSpec(
        '@model_fleet { worker { node: "worker-1" node: "../outside" } runtime { runtime_id: "holo-runtime-m1" } }'
      )
    ).toBeNull();
    expect(parseFleetSpec('@model_fleet { worker { node: 42 } }')).toBeNull();
    expect(
      parseFleetSpec(
        '@model_fleet { runtime { runtime_id: "holo-runtime-m1" } worker { node: "worker-1" } }'
      )?.nodes.map((node) => node.handle)
    ).toEqual(['worker-1']);
  });

  test('rejects an explicitly unsupported backend instead of downgrading to Ollama', () => {
    expect(
      parseFleetSpec('@model_fleet { worker { node: "worker-1" backend: "vllm" } }')
    ).toBeNull();
  });

  test('rejects an explicitly unsafe placement policy', () => {
    const unsafe = BRAIN_SRC.replace('provisioning: "forbidden"', 'provisioning: "allowed"');
    expect(parseFleetSpec(unsafe)).toBeNull();
  });

  test('rejects duplicate placement-policy fields instead of accepting first-match ambiguity', () => {
    const duplicate = BRAIN_SRC.replace(
      'provisioning: "forbidden"',
      'provisioning: "forbidden"\n  provisioning: "allowed"'
    );
    expect(parseFleetSpec(duplicate)).toBeNull();
  });

  test('older fleet declarations inherit the safe placement boundary', () => {
    const legacy = '@model_fleet { nodeA { node: "jetson-orin" } strategy: "least-loaded" }';
    expect(parseFleetSpec(legacy)?.placementPolicy).toEqual({
      artifactMode: 'warm_only',
      dataPlane: 'direct_worker',
      parallelScope: 'single_worker',
      spend: 'forbidden',
      provisioning: 'forbidden',
      remoteCode: false,
      genericRpc: false,
      interWorkerTensorTransport: false,
    });
  });

  test('injects the authored policy into a digest-bound plan', () => {
    const digest = (character: string): string => `sha256:${character.repeat(64)}`;
    const result = planFleetModelPlacement(parseFleetSpec(BRAIN_SRC)!, {
      decisionTime: '2026-08-08T23:30:15.000Z',
      leaseLedgerVersion: 0,
      capabilities: [],
      manifest: {
        schema: FLEET_PLACEMENT_MANIFEST_SCHEMA,
        requestId: 'request-001',
        idempotencyKey: 'request-001-attempt-1',
        upstreamAttestationReceiptDigest: digest('a'),
        laneId: 'frontier-serve-01',
        laneManifestDigest: digest('b'),
        modelReleaseDigest: digest('c'),
        runtimeProfileDigest: digest('d'),
        licensePolicyDigest: digest('e'),
        resources: {
          gpuCount: 1,
          gpuMemoryMiB: 8_192,
          hostMemoryMiB: 16_384,
          scratchBytes: 0,
          slots: 1,
        },
        allowedCustodyTiers: ['sovereign-overflow'],
        admittedWorkerSpecDigests: [digest('1')],
        dataClass: 'internal-nonsecret',
      },
    });

    expect(result.status).toBe('unplaced');
    expect(result.outcomeCode).toBe('NO_CANDIDATES');
    expect(result.requestDigest).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(result.errors).toEqual([]);
  });
});

describe('resolveNodeEndpoint', () => {
  test('keeps registry reads contained and preserves safe handle resolution', async () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'fleet-router-registry-'));
    const registryDir = join(fixtureRoot, 'registry');
    mkdirSync(registryDir);
    const registryEntry = JSON.stringify({
      capabilities: [{ id: 'local-llm', endpoint: 'http://owned-metal.invalid:11434' }],
    });
    writeFileSync(join(registryDir, 'jetson-orin.json'), registryEntry, 'utf8');
    // This valid JSON proves that a traversal would have escaped the registry before hardening.
    writeFileSync(join(fixtureRoot, 'outside.json'), registryEntry, 'utf8');

    try {
      await expect(resolveNodeEndpoint('jetson-orin', registryDir)).resolves.toBe(
        'http://owned-metal.invalid:11434'
      );
      for (const unsafeHandle of ['../outside', String.raw`..\outside`, 'CON', 'NUL', 'jetson.']) {
        await expect(resolveNodeEndpoint(unsafeHandle, registryDir)).resolves.toBeNull();
      }
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });
});

const SPEC: FleetSpec = parseFleetSpec(BRAIN_SRC)!;

describe('pickFleetModel routing', () => {
  test('warm-preferred: routes to the node where the requested model is already resident', async () => {
    const fetchImpl = fakeFetch({
      'http://holojetson.local:11434': { tags: ['qwen3:4b-instruct', 'qwen3:4b'], ps: [] }, // idle, none warm
      'http://192.168.0.23:11434': {
        tags: ['qwen3:4b-instruct', 'gemma4:e2b'],
        ps: [{ name: 'qwen3:4b-instruct', vram: 3_000_000_000 }], // warm here
      },
    });
    const route = await pickFleetModel(SPEC, {
      model: 'qwen3:4b-instruct',
      resolveEndpoint,
      fetchImpl,
    });
    expect(route).not.toBeNull();
    expect(route!.handle).toBe('laptop-rtx3060'); // warm beats lower load
    expect(route!.model).toBe('qwen3:4b-instruct');
    expect(route!.warm).toBe(true);
  });

  test('least-loaded: when neither is warm, the freer GPU wins', async () => {
    const fetchImpl = fakeFetch({
      'http://holojetson.local:11434': {
        tags: ['qwen3:4b-instruct'],
        ps: [{ name: 'other:7b', vram: 6_000_000_000 }], // busy
      },
      'http://192.168.0.23:11434': { tags: ['qwen3:4b-instruct'], ps: [] }, // idle
    });
    const route = await pickFleetModel(SPEC, {
      model: 'qwen3:4b-instruct',
      resolveEndpoint,
      fetchImpl,
    });
    expect(route!.handle).toBe('laptop-rtx3060'); // load 0 < jetson's 6GB
  });

  test('requested model installed on only one node → routes there', async () => {
    const fetchImpl = fakeFetch({
      'http://holojetson.local:11434': { tags: ['qwen3:4b'], ps: [] }, // no -instruct here
      'http://192.168.0.23:11434': {
        tags: ['qwen3:4b-instruct', 'nomic-embed-text:latest'],
        ps: [],
      },
    });
    const route = await pickFleetModel(SPEC, {
      model: 'qwen3:4b-instruct',
      resolveEndpoint,
      fetchImpl,
    });
    expect(route!.handle).toBe('laptop-rtx3060');
    expect(route!.model).toBe('qwen3:4b-instruct');
  });

  test('unreachable node is dropped; fleet still answers from the reachable one', async () => {
    const fetchImpl = fakeFetch({
      // laptop offline (Ollama bound 127.0.0.1) — only the Jetson answers
      'http://holojetson.local:11434': { tags: ['qwen3:4b'], ps: [] },
    });
    const route = await pickFleetModel(SPEC, {
      model: 'qwen3:4b-instruct',
      resolveEndpoint,
      fetchImpl,
    });
    expect(route!.handle).toBe('jetson-orin');
    // requested -instruct not installed on the Jetson → falls back to its installed model
    expect(route!.model).toBe('qwen3:4b');
    expect(route!.reason).toContain('not installed');
  });

  test('all nodes unreachable → null (caller falls back to single-endpoint path)', async () => {
    const route = await pickFleetModel(SPEC, {
      model: 'qwen3:4b-instruct',
      resolveEndpoint,
      fetchImpl: fakeFetch({}),
    });
    expect(route).toBeNull();
  });

  test('drops an Ollama node when required /api/ps load telemetry is non-OK', async () => {
    const fetchImpl: FetchLike = async (url: string) => {
      if (url.endsWith('/api/tags')) {
        return {
          ok: true,
          json: async () => ({ models: [{ name: 'qwen3:4b-instruct' }] }),
        };
      }
      if (url.endsWith('/api/ps')) return { ok: false, json: async () => ({}) };
      throw new Error('unexpected route');
    };

    const discovered = await discoverNode(
      'jetson-orin',
      'http://holojetson.local:11434',
      () => false,
      { fetchImpl }
    );
    expect(discovered).toBeNull();
  });

  test('drops malformed Ollama /api/tags payloads before reading model names', async () => {
    for (const tagsBody of [{}, { models: 'not-an-array' }, { models: [{ name: 7 }] }]) {
      const fetchImpl: FetchLike = async (url: string) => ({
        ok: true,
        json: async () => (url.endsWith('/api/tags') ? tagsBody : { models: [] }),
      });
      const discovered = await discoverNode(
        'jetson-orin',
        'http://holojetson.local:11434',
        () => false,
        { fetchImpl }
      );
      expect(discovered).toBeNull();
    }
  });

  test('contains one node discovery exception and still routes to a healthy peer', async () => {
    const throwingTags = Object.defineProperty({}, 'models', {
      enumerable: true,
      get: () => {
        throw new Error('malformed tags getter');
      },
    });
    const healthyPeer = fakeFetch({
      'http://192.168.0.23:11434': { tags: ['qwen3:4b-instruct'], ps: [] },
    });
    const fetchImpl: FetchLike = async (url, init) => {
      if (url.startsWith('http://holojetson.local:11434')) {
        return { ok: true, json: async () => throwingTags };
      }
      return healthyPeer(url, init);
    };

    const route = await pickFleetModel(SPEC, {
      model: 'qwen3:4b-instruct',
      resolveEndpoint,
      fetchImpl,
    });
    expect(route?.handle).toBe('laptop-rtx3060');
  });

  test('blacklisted models are never installed candidates nor routed to', async () => {
    const fetchImpl = fakeFetch({
      'http://holojetson.local:11434': { tags: ['qwen2.5-coder:7b'], ps: [] }, // only a blacklisted model
      'http://192.168.0.23:11434': { tags: ['qwen3:4b-instruct'], ps: [] },
    });
    // Jetson offers only a blacklisted model → it has 0 usable installed → dropped.
    const route = await pickFleetModel(SPEC, {
      model: 'qwen3:4b-instruct',
      resolveEndpoint,
      fetchImpl,
    });
    expect(route!.handle).toBe('laptop-rtx3060');
    expect(route!.model).toBe('qwen3:4b-instruct');
  });

  test('an explicitly requested blacklisted model fails closed before endpoint discovery', async () => {
    let resolutionAttempts = 0;
    const route = await pickFleetModel(SPEC, {
      model: 'qwen2.5-coder:7b',
      resolveEndpoint: async () => {
        resolutionAttempts += 1;
        return 'http://should-not-be-contacted.invalid:11434';
      },
    });
    expect(route).toBeNull();
    expect(resolutionAttempts).toBe(0);
  });

  test('a node with no resolvable endpoint (not registered) is skipped', async () => {
    const onlyJetson = async (h: string): Promise<string | null> =>
      h === 'jetson-orin' ? 'http://holojetson.local:11434' : null;
    const fetchImpl = fakeFetch({
      'http://holojetson.local:11434': { tags: ['qwen3:4b'], ps: [] },
    });
    const route = await pickFleetModel(SPEC, { resolveEndpoint: onlyJetson, fetchImpl });
    expect(route!.handle).toBe('jetson-orin');
  });

  // Regression: a model pulled by bare name (`ollama pull nomic-embed-text`) is
  // reported by /api/tags as `nomic-embed-text:latest`. A bare request MUST still
  // match it (this was live: embed routing fell back to a chat model and returned null).
  test('a bare requested model matches a `:latest`-tagged install (and echoes the bare name)', async () => {
    const fetchImpl = fakeFetch({
      'http://holojetson.local:11434': {
        tags: ['nomic-embed-text:latest', 'qwen3:4b-instruct'],
        ps: [],
      },
    });
    const route = await pickFleetModel(SPEC, {
      model: 'nomic-embed-text',
      resolveEndpoint,
      fetchImpl,
    });
    expect(route!.handle).toBe('jetson-orin');
    expect(route!.model).toBe('nomic-embed-text'); // echoes the caller's form; Ollama resolves :latest
    expect(route!.reason).not.toContain('not installed');
  });

  test('warm-preference still works through `:latest` normalization', async () => {
    const fetchImpl = fakeFetch({
      'http://holojetson.local:11434': { tags: ['nomic-embed-text:latest'], ps: [] }, // installed, cold
      'http://192.168.0.23:11434': {
        tags: ['nomic-embed-text:latest'],
        ps: [{ name: 'nomic-embed-text:latest', vram: 300_000_000 }], // warm here
      },
    });
    const route = await pickFleetModel(SPEC, {
      model: 'nomic-embed-text',
      resolveEndpoint,
      fetchImpl,
    });
    expect(route!.handle).toBe('laptop-rtx3060'); // warm beats cold despite the :latest tag
    expect(route!.warm).toBe(true);
  });
});

/**
 * Build an injected fetch that, beyond /api/tags and /api/ps, answers Ollama's
 * `POST /api/embed`. `embed` maps baseURL → the vector that node returns (or a
 * sentinel to force a non-ok response / the legacy single-vector shape).
 */
function fakeFetchWithEmbed(
  nodes: Record<string, { tags: string[]; ps?: Array<{ name: string; vram: number }> }>,
  embed: Record<string, { ok?: boolean; embeddings?: number[][]; embedding?: number[] }>
): FetchLike {
  return async (url: string, init?: { method?: string; body?: string }) => {
    if (url.endsWith('/api/embed')) {
      const base = url.replace(/\/api\/embed$/, '');
      const e = embed[base];
      if (!e || e.ok === false) return { ok: false, json: async () => ({}) };
      return { ok: true, json: async () => ({ embeddings: e.embeddings, embedding: e.embedding }) };
    }
    const base = url.replace(/\/api\/(tags|ps)$/, '');
    const node = nodes[base];
    if (!node) throw new Error('ECONNREFUSED');
    if (url.endsWith('/api/tags')) {
      return { ok: true, json: async () => ({ models: node.tags.map((name) => ({ name })) }) };
    }
    return {
      ok: true,
      json: async () => ({
        models: (node.ps ?? []).map((p) => ({ name: p.name, size_vram: p.vram })),
      }),
    };
  };
}

// Brain with the Jetson declared PRIMARY (founder: jetson = main inference, laptop = on top).
const PRIMARY_BRAIN = BRAIN_SRC.replace(
  '  warm_preferred: true',
  '  warm_preferred: true\n  primary: "jetson-orin"\n  primary_max_load_gb: "6"'
);
const PRIMARY_SPEC: FleetSpec = parseFleetSpec(PRIMARY_BRAIN)!;

describe('primary-node preference (jetson main, laptop overflow)', () => {
  test('parses primary + primary_max_load_gb', () => {
    expect(PRIMARY_SPEC.primary).toBe('jetson-orin');
    expect(PRIMARY_SPEC.primaryMaxLoadBytes).toBe(6_000_000_000);
  });

  test('routes to the PRIMARY (jetson) even when the laptop is equally idle', async () => {
    const fetchImpl = fakeFetch({
      'http://holojetson.local:11434': { tags: ['qwen3:4b-instruct'], ps: [] }, // idle
      'http://192.168.0.23:11434': { tags: ['qwen3:4b-instruct'], ps: [] }, // idle
    });
    const route = await pickFleetModel(PRIMARY_SPEC, {
      model: 'qwen3:4b-instruct',
      resolveEndpoint,
      fetchImpl,
    });
    expect(route!.handle).toBe('jetson-orin');
    expect(route!.reason).toContain('primary');
  });

  test('routes to the PRIMARY even when the laptop has the model WARM (primary beats warm)', async () => {
    const fetchImpl = fakeFetch({
      'http://holojetson.local:11434': { tags: ['qwen3:4b-instruct'], ps: [] }, // cold but primary
      'http://192.168.0.23:11434': {
        tags: ['qwen3:4b-instruct'],
        ps: [{ name: 'qwen3:4b-instruct', vram: 3_000_000_000 }], // warm overflow
      },
    });
    const route = await pickFleetModel(PRIMARY_SPEC, {
      model: 'qwen3:4b-instruct',
      resolveEndpoint,
      fetchImpl,
    });
    expect(route!.handle).toBe('jetson-orin'); // unsaturated primary wins over a warm overflow
  });

  test('SPILLS to the laptop when the primary is saturated (VRAM past the line)', async () => {
    const fetchImpl = fakeFetch({
      'http://holojetson.local:11434': {
        tags: ['qwen3:4b-instruct'],
        ps: [{ name: 'big:14b', vram: 7_000_000_000 }], // 7GB resident > 6GB line → saturated
      },
      'http://192.168.0.23:11434': { tags: ['qwen3:4b-instruct'], ps: [] }, // free overflow
    });
    const route = await pickFleetModel(PRIMARY_SPEC, {
      model: 'qwen3:4b-instruct',
      resolveEndpoint,
      fetchImpl,
    });
    expect(route!.handle).toBe('laptop-rtx3060');
    expect(route!.reason).toContain('overflow');
  });

  test('falls back to the laptop when the primary is unreachable', async () => {
    const fetchImpl = fakeFetch({
      'http://192.168.0.23:11434': { tags: ['qwen3:4b-instruct'], ps: [] }, // only the laptop answers
    });
    const route = await pickFleetModel(PRIMARY_SPEC, {
      model: 'qwen3:4b-instruct',
      resolveEndpoint,
      fetchImpl,
    });
    expect(route!.handle).toBe('laptop-rtx3060');
  });
});

// ── llama.cpp backend node kind (HoloLlama) ────────────────────────────────────
// A fleet where one node runs a llama-server (backend: "llama.cpp"), discovered
// via /health + /props + /slots instead of Ollama /api/tags + /api/ps.

/**
 * Injected fetch answering BOTH backends: llama-server (/health, /props, /slots)
 * and Ollama (/api/tags, /api/ps). `llama` maps baseURL → the served model, busy
 * slot count, and health; `ollama` reuses the tags/ps shape.
 */
function fakeFetchLlama(
  llama: Record<
    string,
    {
      model: string;
      busySlots?: number;
      healthy?: boolean;
      healthBody?: unknown;
      propsBody?: unknown;
    }
  >,
  ollama: Record<string, { tags: string[]; ps?: Array<{ name: string; vram: number }> }> = {}
): FetchLike {
  return async (url: string) => {
    if (/\/(health|props|slots)$/.test(url)) {
      const base = url.replace(/\/(health|props|slots)$/, '');
      const n = llama[base];
      if (!n) throw new Error('ECONNREFUSED');
      if (url.endsWith('/health')) {
        return n.healthy === false
          ? { ok: false, json: async () => ({}) }
          : {
              ok: true,
              json: async () =>
                Object.prototype.hasOwnProperty.call(n, 'healthBody')
                  ? n.healthBody
                  : { status: 'ok' },
            };
      }
      if (url.endsWith('/props')) {
        return {
          ok: true,
          json: async () =>
            Object.prototype.hasOwnProperty.call(n, 'propsBody')
              ? n.propsBody
              : {
                  default_generation_settings: { model: n.model },
                  model_path: `/models/${n.model}.gguf`,
                },
        };
      }
      // /slots — an array of slot objects; state !== 0 (or is_processing) counts as busy.
      const busy = n.busySlots ?? 0;
      const slots = Array.from({ length: Math.max(busy, 1) }, (_, i) => ({
        id: i,
        state: i < busy ? 1 : 0,
      }));
      return { ok: true, json: async () => slots };
    }
    const base = url.replace(/\/api\/(tags|ps)$/, '');
    const node = ollama[base];
    if (!node) throw new Error('ECONNREFUSED');
    if (url.endsWith('/api/tags')) {
      return { ok: true, json: async () => ({ models: node.tags.map((name) => ({ name })) }) };
    }
    return {
      ok: true,
      json: async () => ({
        models: (node.ps ?? []).map((p) => ({ name: p.name, size_vram: p.vram })),
      }),
    };
  };
}

const LLAMA_BRAIN = `
@model_fleet {
  jetson {
    node: "jetson-orin"
    models: ["qwen3:4b-instruct"]
  }
  laptopLlama {
    node: "laptop-fara"
    backend: "llama.cpp"
    models: ["fara-7b"]
  }
  strategy: "least-loaded"
  warm_preferred: true
}
`;
const LLAMA_SPEC: FleetSpec = parseFleetSpec(LLAMA_BRAIN)!;
const LLAMA_ENDPOINTS: Record<string, string> = {
  'jetson-orin': 'http://holojetson.local:11434',
  'laptop-fara': 'http://192.168.0.23:18080',
};
const resolveLlama = async (h: string): Promise<string | null> => LLAMA_ENDPOINTS[h] ?? null;

describe('llama.cpp backend node kind', () => {
  test('parseFleetSpec reads the per-node backend discriminator', () => {
    const jetson = LLAMA_SPEC.nodes.find((n) => n.handle === 'jetson-orin')!;
    const llama = LLAMA_SPEC.nodes.find((n) => n.handle === 'laptop-fara')!;
    expect(llama.backend).toBe('llama.cpp');
    expect(jetson.backend).toBeUndefined(); // default = ollama
  });

  test('routes to a llama-server node, model resolved from /props (always warm)', async () => {
    const fetchImpl = fakeFetchLlama(
      { 'http://192.168.0.23:18080': { model: 'fara-7b', busySlots: 0 } },
      { 'http://holojetson.local:11434': { tags: ['qwen3:4b-instruct'], ps: [] } }
    );
    const route = await pickFleetModel(LLAMA_SPEC, {
      model: 'fara-7b',
      resolveEndpoint: resolveLlama,
      fetchImpl,
    });
    expect(route!.handle).toBe('laptop-fara');
    expect(route!.model).toBe('fara-7b'); // from /props default_generation_settings.model
    expect(route!.warm).toBe(true); // a llama-server holds its one model resident
  });

  test('an unhealthy llama-server (/health not ok) is dropped; the Ollama node still answers', async () => {
    const fetchImpl = fakeFetchLlama(
      { 'http://192.168.0.23:18080': { model: 'fara-7b', healthy: false } },
      { 'http://holojetson.local:11434': { tags: ['qwen3:4b-instruct'], ps: [] } }
    );
    const route = await pickFleetModel(LLAMA_SPEC, {
      model: 'qwen3:4b-instruct',
      resolveEndpoint: resolveLlama,
      fetchImpl,
    });
    expect(route!.handle).toBe('jetson-orin');
    expect(route!.model).toBe('qwen3:4b-instruct');
  });

  test('discoverLlamaCppNode derives installed/warm from /props and load from busy /slots', async () => {
    const fetchImpl = fakeFetchLlama({
      'http://192.168.0.23:18080': { model: 'fara-7b', busySlots: 2 },
    });
    const d = await discoverLlamaCppNode('laptop-fara', 'http://192.168.0.23:18080', () => false, {
      fetchImpl,
    });
    expect(d).not.toBeNull();
    expect(d!.installed).toEqual(['fara-7b']); // the single loaded model
    expect(d!.warm.has('fara-7b')).toBe(true); // resident by definition once /health is ok
    // Busy-slot count scaled to a byte-ish magnitude so it is comparable to Ollama VRAM load.
    expect(d!.loadScore).toBe(2_000_000_000);
  });

  test('discoverLlamaCppNode returns null when /health is not ok', async () => {
    const fetchImpl = fakeFetchLlama({
      'http://192.168.0.23:18080': { model: 'fara-7b', healthy: false },
    });
    const d = await discoverLlamaCppNode('laptop-fara', 'http://192.168.0.23:18080', () => false, {
      fetchImpl,
    });
    expect(d).toBeNull();
  });

  test('discoverLlamaCppNode requires the exact ready /health body', async () => {
    for (const healthBody of [
      { status: 'loading model' },
      { status: 'error' },
      {},
      { status: 'ok', extra: true },
      'ok',
    ]) {
      const fetchImpl = fakeFetchLlama({
        'http://192.168.0.23:18080': { model: 'fara-7b', healthBody },
      });
      const discovered = await discoverLlamaCppNode(
        'laptop-fara',
        'http://192.168.0.23:18080',
        () => false,
        { fetchImpl }
      );
      expect(discovered).toBeNull();
    }
  });

  test('discoverLlamaCppNode rejects malformed /props payloads before model use', async () => {
    for (const propsBody of [
      null,
      [],
      { model: 7 },
      { default_generation_settings: 'invalid' },
      { default_generation_settings: { model: 7 } },
    ]) {
      const fetchImpl = fakeFetchLlama({
        'http://192.168.0.23:18080': { model: 'fara-7b', propsBody },
      });
      const discovered = await discoverLlamaCppNode(
        'laptop-fara',
        'http://192.168.0.23:18080',
        () => false,
        { fetchImpl }
      );
      expect(discovered).toBeNull();
    }
  });

  test('drops malformed llama /props while a healthy Ollama peer still answers', async () => {
    const fetchImpl = fakeFetchLlama(
      {
        'http://192.168.0.23:18080': {
          model: 'fara-7b',
          propsBody: { default_generation_settings: { model: 7 } },
        },
      },
      { 'http://holojetson.local:11434': { tags: ['qwen3:4b-instruct'], ps: [] } }
    );
    const route = await pickFleetModel(LLAMA_SPEC, {
      model: 'qwen3:4b-instruct',
      resolveEndpoint: resolveLlama,
      fetchImpl,
    });
    expect(route?.handle).toBe('jetson-orin');
  });

  test('discoverLlamaCppNode returns null when required /slots telemetry is non-OK', async () => {
    const fetchImpl: FetchLike = async (url: string) => {
      if (url.endsWith('/health')) return { ok: true, json: async () => ({ status: 'ok' }) };
      if (url.endsWith('/props')) {
        return {
          ok: true,
          json: async () => ({ default_generation_settings: { model: 'fara-7b' } }),
        };
      }
      if (url.endsWith('/slots')) return { ok: false, json: async () => [] };
      throw new Error('unexpected route');
    };

    const discovered = await discoverLlamaCppNode(
      'laptop-fara',
      'http://192.168.0.23:18080',
      () => false,
      { fetchImpl }
    );
    expect(discovered).toBeNull();
  });

  test('discoverLlamaCppNode drops the node when /health passes but /props yields no model', async () => {
    // /health ok, but /props returns null (503 mid-load / transient) → no fabricated handle-as-model.
    const fetchImpl: FetchLike = async (url: string) => {
      if (url.endsWith('/health')) return { ok: true, json: async () => ({ status: 'ok' }) };
      if (url.endsWith('/props')) return { ok: false, json: async () => ({}) };
      if (url.endsWith('/slots')) return { ok: true, json: async () => [] };
      throw new Error('ECONNREFUSED');
    };
    const d = await discoverLlamaCppNode('laptop-fara', 'http://192.168.0.23:18080', () => false, {
      fetchImpl,
    });
    expect(d).toBeNull(); // dropped, not offered as model 'laptop-fara'
  });

  test('a blacklisted served model yields no installed candidate (node dropped)', async () => {
    const fetchImpl = fakeFetchLlama({ 'http://192.168.0.23:18080': { model: 'qwen2.5-coder' } });
    const d = await discoverLlamaCppNode(
      'laptop-fara',
      'http://192.168.0.23:18080',
      (n) => n.includes('qwen2.5'),
      {
        fetchImpl,
      }
    );
    expect(d!.installed).toEqual([]); // blocked → not a routable model
  });
});

// ── pytorch-holo backend node kind (HoloServe, D.118) ──────────────────────────
// A fleet where one node runs the native PyTorch-direct sovereign server
// (ai-ecosystem scripts/holoserve.py): same /health + /props + /slots surface as a
// llama-server, but /health must ASSERT sovereignty before the node is admitted.

const TEST_HOLOSERVE_REGISTRY_SCHEMA = 'holoscript.holoserve-model-artifact-registry.v0.1.0';
const TEST_HOLOSERVE_BINDING_SCHEMA = 'holoscript.holoserve-model-artifact-binding.v0.1.0';
const TEST_HOLOSERVE_BINS_SCHEMA = 'holoscript.holoserve-bins-binding.v0.1.0';

function testHoloServeHealth(model: string, checkpointDigit = '1'): Record<string, unknown> {
  const tokenizerSha256 = `sha256:${'2'.repeat(64)}`;
  const files = {
    'meta.json': `sha256:${'3'.repeat(64)}`,
    'tokenizer.json': tokenizerSha256,
  };
  const binsPayload = { files, schema: TEST_HOLOSERVE_BINS_SCHEMA };
  const bindingSha256 = `sha256:${createHash('sha256').update(JSON.stringify(binsPayload), 'utf8').digest('hex')}`;
  return {
    status: 'ok',
    backend: 'pytorch-holo',
    sovereign: true,
    llama_cpp: false,
    gguf: false,
    model: { name: model, params_millions: 85 },
    models: [model],
    model_artifact_bindings: {
      schema: TEST_HOLOSERVE_REGISTRY_SCHEMA,
      defaultModel: model,
      models: {
        [model]: {
          schema: TEST_HOLOSERVE_BINDING_SCHEMA,
          available: true,
          checkpointSha256: `sha256:${checkpointDigit.repeat(64)}`,
          tokenizerSha256,
          bins: { schema: TEST_HOLOSERVE_BINS_SCHEMA, files, bindingSha256 },
        },
      },
    },
  };
}

function addTestHoloServeModel(
  health: Record<string, unknown>,
  model: string,
  checkpointDigit: string
): void {
  const registry = health.model_artifact_bindings as {
    models: Record<string, unknown>;
  };
  const extraRegistry = testHoloServeHealth(model, checkpointDigit).model_artifact_bindings as {
    models: Record<string, unknown>;
  };
  registry.models[model] = extraRegistry.models[model];
  health.models = Object.keys(registry.models).sort();
}

/**
 * Injected fetch answering a HoloServe node (/health with the sovereign claim,
 * /props with the model name, /slots with the single generation slot) plus Ollama
 * nodes. `holo` maps baseURL → served model, busy state, and health-claim knobs.
 */
function fakeFetchHolo(
  holo: Record<
    string,
    {
      model: string;
      propsModel?: string;
      propsModels?: string[];
      propsTotalSlots?: unknown;
      busy?: boolean;
      healthy?: boolean;
      sovereign?: boolean;
      llamaCpp?: boolean;
      health?: unknown;
      finalHealth?: unknown;
      slots?: unknown;
    }
  >,
  ollama: Record<string, { tags: string[]; ps?: Array<{ name: string; vram: number }> }> = {}
): FetchLike {
  const healthCalls = new Map<string, number>();
  return async (url: string) => {
    if (/\/(health|props|slots)$/.test(url)) {
      const base = url.replace(/\/(health|props|slots)$/, '');
      const n = holo[base];
      if (!n) throw new Error('ECONNREFUSED');
      if (url.endsWith('/health')) {
        if (n.healthy === false) return { ok: false, json: async () => ({}) };
        const call = healthCalls.get(base) ?? 0;
        healthCalls.set(base, call + 1);
        const defaultHealth = {
          ...testHoloServeHealth(n.model),
          sovereign: n.sovereign ?? true,
          llama_cpp: n.llamaCpp ?? false,
        };
        const body =
          call > 0 ? (n.finalHealth ?? n.health ?? defaultHealth) : (n.health ?? defaultHealth);
        return {
          ok: true,
          json: async () => body,
        };
      }
      if (url.endsWith('/props')) {
        const healthModels = Object.keys(
          (n.health as { model_artifact_bindings?: { models?: Record<string, unknown> } })
            ?.model_artifact_bindings?.models ?? { [n.model]: {} }
        );
        return {
          ok: true,
          json: async () => ({
            default_generation_settings: { model: n.propsModel ?? n.model, n_ctx: 512 },
            model: n.propsModel ?? n.model,
            model_path: `.scratch/holorunner/s0/fleet-ckpt/ckpt.pt`,
            total_slots: n.propsTotalSlots ?? 1,
            backend: 'pytorch-holo',
            sovereign: true,
            models: n.propsModels ?? healthModels,
          }),
        };
      }
      // /slots — HoloServe serializes generation under one lock → exactly one slot.
      const busy = n.busy === true;
      return {
        ok: true,
        json: async () =>
          Object.prototype.hasOwnProperty.call(n, 'slots')
            ? n.slots
            : [{ id: 0, state: busy ? 1 : 0, is_processing: busy, model: n.model }],
      };
    }
    const base = url.replace(/\/api\/(tags|ps)$/, '');
    const node = ollama[base];
    if (!node) throw new Error('ECONNREFUSED');
    if (url.endsWith('/api/tags')) {
      return { ok: true, json: async () => ({ models: node.tags.map((name) => ({ name })) }) };
    }
    return {
      ok: true,
      json: async () => ({
        models: (node.ps ?? []).map((p) => ({ name: p.name, size_vram: p.vram })),
      }),
    };
  };
}

const HOLO_BRAIN = `
@model_fleet {
  jetson {
    node: "jetson-orin"
    models: ["qwen3:4b-instruct"]
  }
  laptopHolo {
    node: "laptop-holoserve"
    backend: "pytorch-holo"
    models: ["holorunner-s0"]
  }
  strategy: "least-loaded"
  warm_preferred: true
}
`;
const HOLO_SPEC: FleetSpec = parseFleetSpec(HOLO_BRAIN)!;
const HOLO_ENDPOINTS: Record<string, string> = {
  'jetson-orin': 'http://holojetson.local:11434',
  'laptop-holoserve': 'http://192.168.0.23:8099',
};
const resolveHolo = async (h: string): Promise<string | null> => HOLO_ENDPOINTS[h] ?? null;

describe('pytorch-holo backend node kind (HoloServe)', () => {
  test('parseFleetSpec reads backend: "pytorch-holo"', () => {
    const holo = HOLO_SPEC.nodes.find((n) => n.handle === 'laptop-holoserve')!;
    expect(holo.backend).toBe('pytorch-holo');
  });

  test('routes to a HoloServe node: model from /props, warm, backend carried on the route', async () => {
    const fetchImpl = fakeFetchHolo(
      { 'http://192.168.0.23:8099': { model: 'holorunner-s0' } },
      { 'http://holojetson.local:11434': { tags: ['qwen3:4b-instruct'], ps: [] } }
    );
    const route = await pickFleetModel(HOLO_SPEC, {
      model: 'holorunner-s0',
      resolveEndpoint: resolveHolo,
      fetchImpl,
    });
    expect(route!.handle).toBe('laptop-holoserve');
    expect(route!.model).toBe('holorunner-s0'); // from /props, NOT "ckpt.pt" from model_path
    expect(route!.warm).toBe(true); // resident once /health is ok
    expect(route!.backend).toBe('pytorch-holo'); // consumer now knows the API shape
  });

  test('backend is carried for the other kinds too (ollama route reports "ollama")', async () => {
    const fetchImpl = fakeFetchHolo(
      {},
      { 'http://holojetson.local:11434': { tags: ['qwen3:4b-instruct'], ps: [] } }
    );
    const route = await pickFleetModel(HOLO_SPEC, {
      model: 'qwen3:4b-instruct',
      resolveEndpoint: resolveHolo,
      fetchImpl,
    });
    expect(route!.handle).toBe('jetson-orin');
    expect(route!.backend).toBe('ollama');
  });

  test('SOVEREIGNTY GATE: a reachable node whose /health does not assert sovereign:true is dropped', async () => {
    const fetchImpl = fakeFetchHolo(
      { 'http://192.168.0.23:8099': { model: 'holorunner-s0', sovereign: false } },
      { 'http://holojetson.local:11434': { tags: ['qwen3:4b-instruct'], ps: [] } }
    );
    const route = await pickFleetModel(HOLO_SPEC, {
      model: 'holorunner-s0',
      resolveEndpoint: resolveHolo,
      fetchImpl,
    });
    // The declared-sovereign node failed its claim → dropped; fleet degrades to the Ollama node.
    expect(route!.handle).toBe('jetson-orin');
  });

  test('SOVEREIGNTY GATE: a llama_cpp:true masquerade behind a pytorch-holo declaration is dropped', async () => {
    const fetchImpl = fakeFetchHolo({
      'http://192.168.0.23:8099': { model: 'holorunner-s0', llamaCpp: true },
    });
    const d = await discoverPytorchHoloNode(
      'laptop-holoserve',
      'http://192.168.0.23:8099',
      () => false,
      { fetchImpl }
    );
    expect(d).toBeNull();
  });

  test('ARTIFACT GATE: a sovereign-labelled node with no exact binding registry is dropped', async () => {
    const health = testHoloServeHealth('holorunner-s0');
    delete health.model_artifact_bindings;
    const fetchImpl = fakeFetchHolo({
      'http://192.168.0.23:8099': { model: 'holorunner-s0', health },
    });
    const d = await discoverPytorchHoloNode(
      'laptop-holoserve',
      'http://192.168.0.23:8099',
      () => false,
      { fetchImpl }
    );
    expect(d).toBeNull();
  });

  test('ARTIFACT GATE: a non-canonical nested bins hash is dropped', async () => {
    const health = testHoloServeHealth('holorunner-s0');
    const registry = health.model_artifact_bindings as {
      models: Record<string, { bins: { bindingSha256: string } }>;
    };
    registry.models['holorunner-s0'].bins.bindingSha256 = `sha256:${'f'.repeat(64)}`;
    const fetchImpl = fakeFetchHolo({
      'http://192.168.0.23:8099': { model: 'holorunner-s0', health },
    });
    const d = await discoverPytorchHoloNode(
      'laptop-holoserve',
      'http://192.168.0.23:8099',
      () => false,
      {
        fetchImpl,
      }
    );
    expect(d).toBeNull();
  });

  test('MODEL GATE: /props must equal the artifact registry default model', async () => {
    const fetchImpl = fakeFetchHolo({
      'http://192.168.0.23:8099': { model: 'holorunner-s0', propsModel: 'wrong-model' },
    });
    const d = await discoverPytorchHoloNode(
      'laptop-holoserve',
      'http://192.168.0.23:8099',
      () => false,
      {
        fetchImpl,
      }
    );
    expect(d).toBeNull();
  });

  test('DRIFT GATE: a registry mutation between health probes drops the node', async () => {
    const fetchImpl = fakeFetchHolo({
      'http://192.168.0.23:8099': {
        model: 'holorunner-s0',
        finalHealth: testHoloServeHealth('holorunner-s0', '4'),
      },
    });
    const d = await discoverPytorchHoloNode(
      'laptop-holoserve',
      'http://192.168.0.23:8099',
      () => false,
      {
        fetchImpl,
      }
    );
    expect(d).toBeNull();
  });

  test('STRICT JSON GATE: non-finite health telemetry drops the node', async () => {
    const health = testHoloServeHealth('holorunner-s0');
    (health.model as { params_millions: number }).params_millions = Number.NaN;
    const fetchImpl = fakeFetchHolo({
      'http://192.168.0.23:8099': { model: 'holorunner-s0', health },
    });
    const d = await discoverPytorchHoloNode(
      'laptop-holoserve',
      'http://192.168.0.23:8099',
      () => false,
      { fetchImpl }
    );
    expect(d).toBeNull();
  });

  test('discoverPytorchHoloNode: exact registry + /props identity is installed, warm, and load-scored', async () => {
    const fetchImpl = fakeFetchHolo({
      'http://192.168.0.23:8099': { model: 'holorunner-s0', busy: true },
    });
    const d = await discoverPytorchHoloNode(
      'laptop-holoserve',
      'http://192.168.0.23:8099',
      () => false,
      { fetchImpl }
    );
    expect(d).not.toBeNull();
    expect(d!.installed).toEqual(['holorunner-s0']);
    expect(d!.warm.has('holorunner-s0')).toBe(true);
    expect(d!.loadScore).toBe(1_000_000_000); // one busy slot, byte-ish scaled
    expect(d!.backend).toBe('pytorch-holo');
  });

  test('MULTI-MODEL GATE: every exact-bound resident model is installed and routable by name', async () => {
    const health = testHoloServeHealth('default-model');
    addTestHoloServeModel(health, 'secondary-model', '4');
    const fetchImpl = fakeFetchHolo({
      'http://192.168.0.23:8099': {
        model: 'default-model',
        health,
        propsModels: ['default-model', 'secondary-model'],
      },
    });
    const spec = parseFleetSpec(`
      @model_fleet {
        holo { node: "laptop-holoserve" backend: "pytorch-holo" models: ["default-model", "secondary-model"] }
        strategy: "least-loaded"
      }
    `);
    const route = await pickFleetModel(spec, {
      model: 'secondary-model',
      resolveEndpoint: () => 'http://192.168.0.23:8099',
      fetchImpl,
    });
    expect(route).toMatchObject({
      handle: 'laptop-holoserve',
      model: 'secondary-model',
      warm: true,
      backend: 'pytorch-holo',
    });
  });

  test('SLOT GATE: missing, empty, or non-finite HoloServe telemetry drops the node', async () => {
    for (const slots of [
      null,
      [],
      [{ id: 0, state: Number.NaN, is_processing: false, model: 'holorunner-s0' }],
    ]) {
      const fetchImpl = fakeFetchHolo({
        'http://192.168.0.23:8099': { model: 'holorunner-s0', slots },
      });
      const discovered = await discoverPytorchHoloNode(
        'laptop-holoserve',
        'http://192.168.0.23:8099',
        () => false,
        { fetchImpl }
      );
      expect(discovered).toBeNull();
    }
  });

  test('discoverPytorchHoloNode returns null when /health is unreachable', async () => {
    const fetchImpl = fakeFetchHolo({
      'http://192.168.0.23:8099': { model: 'holorunner-s0', healthy: false },
    });
    const d = await discoverPytorchHoloNode(
      'laptop-holoserve',
      'http://192.168.0.23:8099',
      () => false,
      { fetchImpl }
    );
    expect(d).toBeNull();
  });

  test('embedAcrossFleet SKIPS a single-model node that won the route (no /api/embed POST into a 404)', async () => {
    const embedCalls: string[] = [];
    const inner = fakeFetchHolo({ 'http://192.168.0.23:8099': { model: 'nomic-embed-text' } });
    const fetchImpl: FetchLike = async (url, init) => {
      if (url.endsWith('/api/embed')) {
        embedCalls.push(url);
        return { ok: true, json: async () => ({ embeddings: [[9, 9, 9]] }) };
      }
      return inner(url, init);
    };
    const vec = await embedAcrossFleet('x', {
      spec: HOLO_SPEC,
      resolveEndpoint: resolveHolo,
      fetchImpl,
    });
    expect(vec).toBeNull(); // guarded: pytorch-holo cannot answer Ollama /api/embed
    expect(embedCalls).toEqual([]); // and it was never asked to
  });
});

describe('embedAcrossFleet', () => {
  test('routes the embed to the node that has nomic-embed-text and returns the vector', async () => {
    const fetchImpl = fakeFetchWithEmbed(
      {
        'http://holojetson.local:11434': {
          tags: ['nomic-embed-text', 'qwen3:4b-instruct'],
          ps: [],
        },
        'http://192.168.0.23:11434': { tags: ['qwen3:4b-instruct'], ps: [] }, // no embed model here
      },
      { 'http://holojetson.local:11434': { embeddings: [[0.1, 0.2, 0.3]] } }
    );
    const vec = await embedAcrossFleet('how do HoloScript traits compose?', {
      spec: SPEC,
      resolveEndpoint,
      fetchImpl,
    });
    expect(vec).toEqual([0.1, 0.2, 0.3]);
  });

  test('routes through a `:latest`-tagged nomic install (the live Jetson shape)', async () => {
    const fetchImpl = fakeFetchWithEmbed(
      {
        'http://holojetson.local:11434': {
          tags: ['nomic-embed-text:latest', 'qwen3:4b-instruct'],
          ps: [],
        },
      },
      { 'http://holojetson.local:11434': { embeddings: [[0.4, 0.5, 0.6]] } }
    );
    const vec = await embedAcrossFleet('how do HoloScript traits compose?', {
      spec: SPEC,
      resolveEndpoint,
      fetchImpl,
    });
    expect(vec).toEqual([0.4, 0.5, 0.6]);
  });

  test('accepts the legacy single-vector {embedding} response shape', async () => {
    const fetchImpl = fakeFetchWithEmbed(
      { 'http://holojetson.local:11434': { tags: ['nomic-embed-text'], ps: [] } },
      { 'http://holojetson.local:11434': { embedding: [1, 0, 0] } }
    );
    const vec = await embedAcrossFleet('x', { spec: SPEC, resolveEndpoint, fetchImpl });
    expect(vec).toEqual([1, 0, 0]);
  });

  test('returns null when no node has the embed model installed (best-effort)', async () => {
    const fetchImpl = fakeFetchWithEmbed(
      {
        'http://holojetson.local:11434': { tags: ['qwen3:4b-instruct'], ps: [] },
        'http://192.168.0.23:11434': { tags: ['qwen3:4b-instruct'], ps: [] },
      },
      {}
    );
    // pickFleetModel falls back to a chat model → picked.model !== nomic → null.
    const vec = await embedAcrossFleet('x', { spec: SPEC, resolveEndpoint, fetchImpl });
    expect(vec).toBeNull();
  });

  test('returns null when /api/embed responds non-ok (node down mid-embed)', async () => {
    const fetchImpl = fakeFetchWithEmbed(
      { 'http://holojetson.local:11434': { tags: ['nomic-embed-text'], ps: [] } },
      { 'http://holojetson.local:11434': { ok: false } }
    );
    const vec = await embedAcrossFleet('x', { spec: SPEC, resolveEndpoint, fetchImpl });
    expect(vec).toBeNull();
  });

  test('returns null when no fleet spec is available (no brain → no embed route)', async () => {
    const vec = await embedAcrossFleet('x', { resolveEndpoint, fetchImpl: fakeFetch({}) });
    expect(vec).toBeNull();
  });
});

describe('cosineSimilarity', () => {
  test('identical vectors → 1', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 10);
  });
  test('orthogonal vectors → 0', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
  });
  test('opposite vectors → -1', () => {
    expect(cosineSimilarity([1, 1], [-1, -1])).toBeCloseTo(-1, 10);
  });
  test('length mismatch → 0 (no throw)', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2])).toBe(0);
  });
  test('zero vector → 0 (no NaN from divide-by-zero)', () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
  });
  test('ranks a closer vector above a farther one', () => {
    const q = [1, 0.5, 0];
    const near = cosineSimilarity(q, [1, 0.4, 0]);
    const far = cosineSimilarity(q, [0, 0, 1]);
    expect(near).toBeGreaterThan(far);
  });
});
