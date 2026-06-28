/**
 * world-render-tools.ts — MCP tool surface for rendering a Studio world on the
 * GPU fleet (`render_world_on_fleet`).
 *
 * Why this exists: fleet dispatch needs an orchestrator submit key (resolved from
 * HoloKey/env and sent as `x-mcp-api-key` to the mcp-orchestrator GPU queue) — a
 * high-privilege credential. We do NOT copy it into every client. Instead, a
 * Bearer-authed MCP client (Studio, Brittney, Cursor, a cloud Claude Code session)
 * calls `render_world_on_fleet` with the world source; THIS server holds the key
 * and makes the privileged POST /gpu/workload server-side. This is the dispatch
 * wiring that closes the FleetOrchestrator "can see the board, cannot dispatch" gap
 * for world rendering. Mirrors holo-ci-tools.ts (`holo_ci_dispatch`).
 *
 * The render-target registry + workload builder below is a faithful TypeScript port
 * of ai-ecosystem/scripts/lib/world-render-workload.mjs (the fleet-side canonical).
 * Duplicated rather than imported — HoloScript and ai-ecosystem are separate repos
 * with no shared module path (same convention as holo-ci-tools.ts). KEEP IN SYNC:
 * the worker runs ai-ecosystem/scripts/world-render-runner.mjs, so the target list +
 * command shape here must match that runner's flags.
 *
 * SAFE-BY-DEFAULT: previews the workload and submits nothing unless dryRun:false.
 * `engine:'pending'` targets (video/quilt/stills) need the GPU render-engine worker
 * image and are refused on submit (the runner would fail-loud anyway).
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { resolveServiceSecret } from './holokey-resolver';

// ─── Render-target registry (port of WORLD_RENDER_TARGETS) ───────────────────
type RenderMode = 'compile' | 'rasterize';
type RenderEngine = 'available' | 'pending';
interface RenderTarget {
  mode: RenderMode;
  compileTarget: string | null;
  artifactExt: string;
  requiresGpu: boolean;
  engine: RenderEngine;
  defaultEstimateSeconds: number;
  label: string;
}

const WORLD_RENDER_TARGETS: Record<string, RenderTarget> = {
  '3dgs': {
    mode: 'compile',
    compileTarget: '3dgs',
    artifactExt: 'gltf',
    requiresGpu: true,
    engine: 'available',
    defaultEstimateSeconds: 600,
    label: '3D Gaussian Splatting bake (KHR_gaussian_splatting glTF)',
  },
  gltf: {
    mode: 'compile',
    compileTarget: 'gltf',
    artifactExt: 'gltf',
    requiresGpu: false,
    engine: 'available',
    defaultEstimateSeconds: 120,
    label: 'glTF scene export',
  },
  webgpu: {
    mode: 'compile',
    compileTarget: 'webgpu',
    artifactExt: 'wgsl',
    requiresGpu: true,
    engine: 'available',
    defaultEstimateSeconds: 300,
    label: 'WebGPU / WGSL render bundle',
  },
  usd: {
    mode: 'compile',
    compileTarget: 'usd',
    artifactExt: 'usd',
    requiresGpu: false,
    engine: 'available',
    defaultEstimateSeconds: 180,
    label: 'OpenUSD stage export',
  },
  video: {
    mode: 'rasterize',
    compileTarget: null,
    artifactExt: 'mp4',
    requiresGpu: true,
    engine: 'pending',
    defaultEstimateSeconds: 900,
    label: 'Cinematic video render',
  },
  quilt: {
    mode: 'rasterize',
    compileTarget: null,
    artifactExt: 'png',
    requiresGpu: true,
    engine: 'pending',
    defaultEstimateSeconds: 600,
    label: 'Light-field quilt (Looking Glass)',
  },
  stills: {
    mode: 'rasterize',
    compileTarget: null,
    artifactExt: 'png',
    requiresGpu: true,
    engine: 'pending',
    defaultEstimateSeconds: 600,
    label: 'Path-traced high-resolution stills',
  },
};

const QUALITY_MULTIPLIER: Record<string, number> = { draft: 0.5, standard: 1, high: 2, ultra: 4 };

function availableTargets(): string[] {
  return Object.entries(WORLD_RENDER_TARGETS)
    .filter(([, t]) => t.engine === 'available')
    .map(([k]) => k);
}

/** POSIX single-quote escape so paths/base64/URLs survive `bash -lc "$cmd"`. */
function shellQuote(value: string): string {
  const s = String(value);
  if (/^[A-Za-z0-9_./:-]+$/.test(s)) return s;
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

const NODE_SELF_BOOTSTRAP =
  'command -v node >/dev/null 2>&1 || { curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null 2>&1 && apt-get install -y -qq nodejs >/dev/null 2>&1; }';

interface WorldRenderSpec {
  world?: string; // inline HoloScript source text (preferred for MCP/Studio callers)
  worldUrl?: string; // OR a fetchable URL
  worldPath?: string; // OR a repo-relative path on the worker
  target: string;
  quality?: string;
  worldId?: string;
  outputDir?: string;
  customer?: string;
}

interface BuiltWorldRender {
  workload: Record<string, unknown>;
  target: RenderTarget;
  estimateSeconds: number;
}

function buildWorldRenderWorkload(spec: WorldRenderSpec): BuiltWorldRender {
  const t = WORLD_RENDER_TARGETS[spec.target];
  if (!t) {
    throw new Error(
      `unknown target "${spec.target}" — known: ${Object.keys(WORLD_RENDER_TARGETS).join(', ')}`
    );
  }
  if (!spec.world && !spec.worldUrl && !spec.worldPath) {
    throw new Error('one of world (inline source), worldUrl, or worldPath is required');
  }
  const quality = spec.quality && spec.quality in QUALITY_MULTIPLIER ? spec.quality : 'standard';
  const estimateSeconds = Math.ceil(t.defaultEstimateSeconds * (QUALITY_MULTIPLIER[quality] ?? 1));
  const worldId = spec.worldId || 'world';
  const id = `world-render-${spec.target}-${worldId}`;
  const outputDir = spec.outputDir || './render-output';

  let worldArg: string;
  if (spec.world) {
    worldArg = `--world-b64 ${shellQuote(Buffer.from(spec.world, 'utf8').toString('base64'))}`;
  } else if (spec.worldUrl) {
    worldArg = `--world-url ${shellQuote(spec.worldUrl)}`;
  } else {
    worldArg = `--world ${shellQuote(spec.worldPath as string)}`;
  }

  const runnerCommand = [
    'node',
    'scripts/world-render-runner.mjs',
    worldArg,
    `--target ${spec.target}`,
    `--quality ${quality}`,
    `--output-dir ${shellQuote(outputDir)}`,
    spec.worldId ? `--world-id ${shellQuote(spec.worldId)}` : '',
    '--write-receipt',
  ]
    .filter(Boolean)
    .join(' ');
  const command = `${NODE_SELF_BOOTSTRAP}; ${runnerCommand}`;

  const workload = {
    id,
    name: `World render: ${t.label}`,
    description: `Render world ${worldId} to ${spec.target} (${t.label}) on the GPU fleet.`,
    billing: {
      rate_usd_per_sec: 0.0003,
      credits_per_usd: 100.0,
      buffer: 0.15,
      margin: 0.3,
      customer: spec.customer || 'studio-world-render',
    },
    render: {
      target: spec.target,
      mode: t.mode,
      engine: t.engine,
      requiresGpu: t.requiresGpu,
      artifactExt: t.artifactExt,
    },
    jobs: [
      {
        id: `${id}-render`,
        job_type: 'render',
        description: `Render ${spec.target} (${t.label}) for world ${worldId}`,
        command,
        estimate_seconds: estimateSeconds,
        requires_webgpu: t.requiresGpu,
        tier: 'T2',
      },
    ],
  };

  return { workload, target: t, estimateSeconds };
}

// ─── Orchestrator helpers (mirror holo-ci-tools.ts) ──────────────────────────
const ORCHESTRATOR_KEY_NAMES = [
  'HOLOSCRIPT_ORCHESTRATOR_API_KEY',
  'MCP_ORCHESTRATOR_API_KEY',
  'ORCHESTRATOR_API_KEY',
  'MCP_API_KEY',
  'HOLOSCRIPT_API_KEY',
] as const;

async function resolveOrchestratorKey(): Promise<string> {
  for (const name of ORCHESTRATOR_KEY_NAMES) {
    const value = await resolveServiceSecret(name);
    if (value) return value;
  }
  return '';
}

function orchestratorUrl(): string {
  return (
    process.env.MCP_ORCHESTRATOR_URL || 'https://mcp-orchestrator-production-45f9.up.railway.app'
  ).replace(/\/$/, '');
}

// ─── Tool definition ─────────────────────────────────────────────────────────
export const worldRenderTools: Tool[] = [
  {
    name: 'render_world_on_fleet',
    description:
      'Render a HoloScript world on the vast.ai GPU fleet via the mcp-orchestrator GPU queue. The orchestrator key is held server-side, so any authenticated MCP client (Studio, Brittney, an agent) can dispatch a render without holding fleet credentials. SAFE-BY-DEFAULT: this PREVIEWS the workload and submits nothing unless dryRun:false (which incurs real GPU spend). Compile-backed targets (3dgs/gltf/webgpu/usd) render to render-ready data + a SHA-256 receipt today; rasterize targets (video/quilt/stills) need the GPU render-engine image and are refused on submit. Returns the submitted workload id; poll job status via GET /gpu/job/:id.',
    inputSchema: {
      type: 'object',
      properties: {
        world: {
          type: 'string',
          description:
            'The HoloScript world source text (inline). Preferred for Studio/in-memory worlds — it is base64-shipped to the worker.',
        },
        worldUrl: {
          type: 'string',
          description: 'Alternative to `world`: a fetchable URL to the world source.',
        },
        worldPath: {
          type: 'string',
          description:
            'Alternative: a repo-relative path to the world on the worker (e.g. workloads/samples/demo-cube.hs).',
        },
        target: {
          type: 'string',
          enum: Object.keys(WORLD_RENDER_TARGETS),
          description:
            'Render target. Available now: 3dgs, gltf, webgpu, usd. Pending (GPU image): video, quilt, stills.',
        },
        quality: {
          type: 'string',
          enum: Object.keys(QUALITY_MULTIPLIER),
          description: 'Render quality (scales the billing estimate). Default standard.',
        },
        worldId: { type: 'string', description: 'Identifier for receipt provenance.' },
        dryRun: {
          type: 'boolean',
          description:
            'Default TRUE (safe): build + return the workload WITHOUT submitting (no key, no spend). Pass false to ACTUALLY submit to the fleet and incur real spend.',
        },
      },
      required: ['target'],
    },
  },
];

// ─── Handler ─────────────────────────────────────────────────────────────────
/**
 * Handle `render_world_on_fleet`. `callerToken` is the requesting client's token
 * (used only if a future per-caller spend cap is added; not stored). Returns null
 * for any other tool name.
 */
export async function handleWorldRenderTool(
  name: string,
  args: Record<string, unknown>,
  _callerToken?: string
): Promise<unknown | null> {
  if (name !== 'render_world_on_fleet') return null;

  const target = typeof args.target === 'string' ? args.target : '';
  // Safe-by-default: preview unless the caller EXPLICITLY opts into real GPU spend.
  const dryRun = args.dryRun !== false;

  let built: BuiltWorldRender;
  try {
    built = buildWorldRenderWorkload({
      world: typeof args.world === 'string' ? args.world : undefined,
      worldUrl: typeof args.worldUrl === 'string' ? args.worldUrl : undefined,
      worldPath: typeof args.worldPath === 'string' ? args.worldPath : undefined,
      target,
      quality: typeof args.quality === 'string' ? args.quality : undefined,
      worldId: typeof args.worldId === 'string' ? args.worldId : undefined,
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  const enginePending = built.target.engine === 'pending';

  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      enginePending,
      render: built.workload.render,
      estimateSeconds: built.estimateSeconds,
      workload: built.workload,
      note: enginePending
        ? `Target "${target}" needs the GPU render-engine image (engine: pending); submit will be refused. Available now: ${availableTargets().join(', ')}.`
        : undefined,
    };
  }

  // ── non-dry submit path ──
  if (enginePending) {
    return {
      ok: false,
      enginePending: true,
      error: `Target "${target}" (${built.target.label}) needs the GPU render-engine worker image (engine: pending). Available now: ${availableTargets().join(', ')}.`,
    };
  }

  const apiKey = await resolveOrchestratorKey();
  if (!apiKey) {
    return {
      ok: false,
      error:
        'Orchestrator key not provisioned on this server via HoloKey/env (HOLOSCRIPT_ORCHESTRATOR_API_KEY / MCP_ORCHESTRATOR_API_KEY / ORCHESTRATOR_API_KEY / MCP_API_KEY / HOLOSCRIPT_API_KEY unset). Re-run with dryRun:true to preview, or provision the key. Do not use HOLOSCRIPT_MCP_API_KEY or HOLOMESH_API_KEY for fleet submit auth.',
      workload: built.workload,
    };
  }

  try {
    const res = await fetch(`${orchestratorUrl()}/gpu/workload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'x-mcp-api-key': apiKey },
      body: JSON.stringify(built.workload),
      signal: AbortSignal.timeout(20_000),
    });
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      /* leave as text */
    }
    if (!res.ok) {
      return {
        ok: false,
        error: `orchestrator /gpu/workload → ${res.status}`,
        detail: typeof parsed === 'string' ? parsed.slice(0, 400) : parsed,
      };
    }
    const wlId =
      (parsed as { id?: string; workload_id?: string })?.id ??
      (parsed as { workload_id?: string })?.workload_id ??
      (built.workload as { id?: string }).id;
    return {
      ok: true,
      dispatched: true,
      target,
      workloadId: wlId,
      estimateSeconds: built.estimateSeconds,
      render: built.workload.render,
      orchestrator: parsed,
      note: 'Worker claims via GET /gpu/next; artifact + SHA-256 receipt return via POST /gpu/job/:id/done. Poll GET /gpu/job/:id.',
    };
  } catch (err) {
    return {
      ok: false,
      error: `orchestrator submit failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
