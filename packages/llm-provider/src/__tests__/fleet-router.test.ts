/**
 * fleet-router — parsing the native `@model_fleet` brain and routing one request
 * across the owned-metal GPU nodes (Jetson + laptop RTX 3060) least-loaded +
 * warm-preferred, with endpoints resolved by registry handle.
 *
 * Network + registry are injected (fetchImpl / resolveEndpoint) so the suite is
 * hermetic — no real Ollama, no real files.
 */
import { describe, expect, test } from 'vitest';
import {
  parseFleetSpec,
  pickFleetModel,
  embedAcrossFleet,
  cosineSimilarity,
  type FleetSpec,
  type FetchLike,
} from '../fleet-router';

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
  blacklist: ["qwen2.5"]
}

@provider_policy {
  prefer: "qwen3:4b-instruct"
}
`;

/** Build an injected fetch from a map of baseURL → {tags, ps}. Unknown host = unreachable. */
function fakeFetch(nodes: Record<string, { tags: string[]; ps?: Array<{ name: string; vram: number }> }>): FetchLike {
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
      json: async () => ({ models: (node.ps ?? []).map((p) => ({ name: p.name, size_vram: p.vram })) }),
    };
  };
}

const ENDPOINTS: Record<string, string> = {
  'jetson-orin': 'http://holojetson.local:11434',
  'laptop-rtx3060': 'http://192.168.0.23:11434',
};
const resolveEndpoint = async (h: string): Promise<string | null> => ENDPOINTS[h] ?? null;

describe('parseFleetSpec', () => {
  test('extracts both nodes by handle, strategy, warm-preferred, blacklist', () => {
    const spec = parseFleetSpec(BRAIN_SRC);
    expect(spec).not.toBeNull();
    expect(spec!.nodes.map((n) => n.handle)).toEqual(['jetson-orin', 'laptop-rtx3060']);
    expect(spec!.strategy).toBe('least-loaded');
    expect(spec!.warmPreferred).toBe(true);
    expect(spec!.blacklist).toEqual(['qwen2.5']);
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
    const route = await pickFleetModel(SPEC, { model: 'qwen3:4b-instruct', resolveEndpoint, fetchImpl });
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
    const route = await pickFleetModel(SPEC, { model: 'qwen3:4b-instruct', resolveEndpoint, fetchImpl });
    expect(route!.handle).toBe('laptop-rtx3060'); // load 0 < jetson's 6GB
  });

  test('requested model installed on only one node → routes there', async () => {
    const fetchImpl = fakeFetch({
      'http://holojetson.local:11434': { tags: ['qwen3:4b'], ps: [] }, // no -instruct here
      'http://192.168.0.23:11434': { tags: ['qwen3:4b-instruct', 'nomic-embed-text:latest'], ps: [] },
    });
    const route = await pickFleetModel(SPEC, { model: 'qwen3:4b-instruct', resolveEndpoint, fetchImpl });
    expect(route!.handle).toBe('laptop-rtx3060');
    expect(route!.model).toBe('qwen3:4b-instruct');
  });

  test('unreachable node is dropped; fleet still answers from the reachable one', async () => {
    const fetchImpl = fakeFetch({
      // laptop offline (Ollama bound 127.0.0.1) — only the Jetson answers
      'http://holojetson.local:11434': { tags: ['qwen3:4b'], ps: [] },
    });
    const route = await pickFleetModel(SPEC, { model: 'qwen3:4b-instruct', resolveEndpoint, fetchImpl });
    expect(route!.handle).toBe('jetson-orin');
    // requested -instruct not installed on the Jetson → falls back to its installed model
    expect(route!.model).toBe('qwen3:4b');
    expect(route!.reason).toContain('not installed');
  });

  test('all nodes unreachable → null (caller falls back to single-endpoint path)', async () => {
    const route = await pickFleetModel(SPEC, { model: 'qwen3:4b-instruct', resolveEndpoint, fetchImpl: fakeFetch({}) });
    expect(route).toBeNull();
  });

  test('blacklisted models are never installed candidates nor routed to', async () => {
    const fetchImpl = fakeFetch({
      'http://holojetson.local:11434': { tags: ['qwen2.5-coder:7b'], ps: [] }, // only a blacklisted model
      'http://192.168.0.23:11434': { tags: ['qwen3:4b-instruct'], ps: [] },
    });
    // Jetson offers only a blacklisted model → it has 0 usable installed → dropped.
    const route = await pickFleetModel(SPEC, { model: 'qwen3:4b-instruct', resolveEndpoint, fetchImpl });
    expect(route!.handle).toBe('laptop-rtx3060');
    expect(route!.model).toBe('qwen3:4b-instruct');
  });

  test('a blacklisted requested model is ignored in favour of a clean installed one', async () => {
    const fetchImpl = fakeFetch({
      'http://192.168.0.23:11434': { tags: ['qwen3:4b-instruct'], ps: [] },
    });
    const route = await pickFleetModel(SPEC, { model: 'qwen2.5-coder:7b', resolveEndpoint, fetchImpl });
    expect(route!.model).toBe('qwen3:4b-instruct'); // declared-and-installed fallback, not the blacklisted request
  });

  test('a node with no resolvable endpoint (not registered) is skipped', async () => {
    const onlyJetson = async (h: string): Promise<string | null> =>
      h === 'jetson-orin' ? 'http://holojetson.local:11434' : null;
    const fetchImpl = fakeFetch({ 'http://holojetson.local:11434': { tags: ['qwen3:4b'], ps: [] } });
    const route = await pickFleetModel(SPEC, { resolveEndpoint: onlyJetson, fetchImpl });
    expect(route!.handle).toBe('jetson-orin');
  });

  // Regression: a model pulled by bare name (`ollama pull nomic-embed-text`) is
  // reported by /api/tags as `nomic-embed-text:latest`. A bare request MUST still
  // match it (this was live: embed routing fell back to a chat model and returned null).
  test('a bare requested model matches a `:latest`-tagged install (and echoes the bare name)', async () => {
    const fetchImpl = fakeFetch({
      'http://holojetson.local:11434': { tags: ['nomic-embed-text:latest', 'qwen3:4b-instruct'], ps: [] },
    });
    const route = await pickFleetModel(SPEC, { model: 'nomic-embed-text', resolveEndpoint, fetchImpl });
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
    const route = await pickFleetModel(SPEC, { model: 'nomic-embed-text', resolveEndpoint, fetchImpl });
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
      json: async () => ({ models: (node.ps ?? []).map((p) => ({ name: p.name, size_vram: p.vram })) }),
    };
  };
}

// Brain with the Jetson declared PRIMARY (founder: jetson = main inference, laptop = on top).
const PRIMARY_BRAIN = BRAIN_SRC.replace('  warm_preferred: true', '  warm_preferred: true\n  primary: "jetson-orin"\n  primary_max_load_gb: "6"');
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
    const route = await pickFleetModel(PRIMARY_SPEC, { model: 'qwen3:4b-instruct', resolveEndpoint, fetchImpl });
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
    const route = await pickFleetModel(PRIMARY_SPEC, { model: 'qwen3:4b-instruct', resolveEndpoint, fetchImpl });
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
    const route = await pickFleetModel(PRIMARY_SPEC, { model: 'qwen3:4b-instruct', resolveEndpoint, fetchImpl });
    expect(route!.handle).toBe('laptop-rtx3060');
    expect(route!.reason).toContain('overflow');
  });

  test('falls back to the laptop when the primary is unreachable', async () => {
    const fetchImpl = fakeFetch({
      'http://192.168.0.23:11434': { tags: ['qwen3:4b-instruct'], ps: [] }, // only the laptop answers
    });
    const route = await pickFleetModel(PRIMARY_SPEC, { model: 'qwen3:4b-instruct', resolveEndpoint, fetchImpl });
    expect(route!.handle).toBe('laptop-rtx3060');
  });
});

describe('embedAcrossFleet', () => {
  test('routes the embed to the node that has nomic-embed-text and returns the vector', async () => {
    const fetchImpl = fakeFetchWithEmbed(
      {
        'http://holojetson.local:11434': { tags: ['nomic-embed-text', 'qwen3:4b-instruct'], ps: [] },
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
      { 'http://holojetson.local:11434': { tags: ['nomic-embed-text:latest', 'qwen3:4b-instruct'], ps: [] } },
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
