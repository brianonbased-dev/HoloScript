export const maxDuration = 30;

/**
 * /api/capabilities — grounded capability inventory for the Operations console
 * "Capabilities" tab (D.081: Studio = operate surface; CLI/MCP ops graduate to a
 * perceivable + triggerable Studio surface. Closes the W.GOLD.343 surface gap —
 * capabilities without surfaces are invisible).
 *
 * AWARE half of the surface. Returns `{ capabilities: [...], summary }` where each
 * entry carries REAL provenance (`backing` = an on-disk script path, an orchestrator
 * endpoint, or an MCP tool name — never invented) plus where it currently lives:
 *   surface: 'live'          → already perceivable + wired (e.g. serve/status panel)
 *            'orphaned-cli'   → ships as an ai-ecosystem CLI script, no Studio surface
 *            'orphaned-tool'  → ships as an MCP tool, no Studio surface
 *            'orphaned-route' → ships as a server route subsystem with zero Studio caller
 *            'admin-only'     → exists but is founder/admin-gated; state-only, never a trigger
 *   gate:   'safe' | 'spend' | 'admin'   (governs the UTILIZE tier in the panel)
 *   triggerable: whether the Studio panel offers a (safe or file-as-request) action.
 *
 * GROUNDING: the static registry below was verified on-disk 2026-06-12 — every
 * `backing` path/tool was confirmed present. The `live` entries are enriched
 * server-side from the SAME read-only orchestrator endpoints the operations proxy
 * already allowlists (serve/status, gpu/lotus-status); if the orchestrator is
 * unreachable the entry degrades to a note and `triggerable` stays honest.
 *
 * SAFETY: read-only. This route NEVER triggers a fleet/GPU/spend action. The
 * UTILIZE actions live in the panel and route through (a) the existing dry-run
 * fleet-dispatch plan endpoint or (b) a board task filed to the canonical board
 * route (file-as-request, F.025/F.115/D.080; the board route enforces signing
 * server-side) — never a browser-initiated vast.ai provision.
 */

import { NextResponse } from 'next/server';
import { ENDPOINTS } from '@holoscript/config';
import { corsHeaders } from '../_lib/cors';

const ORCH = process.env.MCP_ORCHESTRATOR_URL || ENDPOINTS.MCP_ORCHESTRATOR;
// Same agent-role key resolution the orchestrator proxy uses (route.ts in
// app/api/orchestrator). Used here only for read-only GETs against the two
// already-allowlisted telemetry endpoints.
const ORCH_KEY =
  process.env.MCP_ORCHESTRATOR_API_KEY ||
  process.env.HOLOSCRIPT_API_KEY ||
  process.env.HOLOMESH_API_KEY ||
  '';

export type CapabilitySurface =
  | 'live'
  | 'orphaned-cli'
  | 'orphaned-tool'
  | 'orphaned-route'
  | 'admin-only';
export type CapabilityGate = 'safe' | 'spend' | 'admin';

export interface CapabilityEntry {
  id: string;
  label: string;
  category: string;
  /** Real provenance: a script path, an orchestrator endpoint, or an MCP tool. Never invented. */
  backing: string;
  surface: CapabilitySurface;
  gate: CapabilityGate;
  /** Whether the panel offers an action (a safe direct call, or a file-as-request board task). */
  triggerable: boolean;
  note?: string;
  /** Optional live metric attached server-side (e.g. warm replicas, queue depth). */
  live?: Record<string, number | string | null>;
}

/**
 * STATIC REGISTRY — grounded, verified on-disk 2026-06-12.
 *
 * (a) ai-ecosystem fleet ops — confirmed present under ai-ecosystem/scripts.
 *     Studio CANNOT import them (different repo); they surface as inventory +
 *     a file-as-request action. gate='spend' (they rent vast.ai) except the
 *     watchdog (read-only health → 'safe').
 */
const FLEET_CLI_OPS: CapabilityEntry[] = [
  {
    id: 'fleet-bench-provision',
    label: 'TP serving + throughput benchmark provision',
    category: 'Fleet / Serving',
    backing: 'ai-ecosystem/scripts/fleet-bench-provision.py',
    surface: 'orphaned-cli',
    gate: 'spend',
    triggerable: true,
    note: 'Provisions a tensor-parallel vLLM serving box on vast.ai and benchmarks throughput. Spend — file-as-request only.',
  },
  {
    id: 'fleet-job-run',
    label: 'Run-to-completion fleet job',
    category: 'Fleet / Compute',
    backing: 'ai-ecosystem/scripts/fleet-job-run.py',
    surface: 'orphaned-cli',
    gate: 'spend',
    triggerable: true,
    note: 'Rents a GPU box, runs a job to completion, tears down. Spend — file-as-request only.',
  },
  {
    id: 'serving-fleet-watchdog',
    label: 'Serving fleet watchdog (health verdict)',
    category: 'Fleet / Serving',
    backing: 'ai-ecosystem/scripts/serving-fleet-watchdog.mjs',
    surface: 'orphaned-cli',
    gate: 'safe',
    triggerable: false,
    note: 'Read-only verdict (dark_under_demand / stale_workers / no_serving_proof). Already mirrored by the Fleet Watchdog Verdict card on the Infra tab.',
  },
  {
    id: 'fleet-throughput-bench',
    label: 'Serving throughput benchmark',
    category: 'Fleet / Serving',
    backing: 'ai-ecosystem/scripts/fleet-throughput-bench.mjs',
    surface: 'orphaned-cli',
    gate: 'spend',
    triggerable: true,
    note: 'Drives load at a warm serving endpoint and measures tok/s. Spend (keeps a box warm) — file-as-request only.',
  },
  {
    id: 'quantum-scaleup-cuquantum',
    label: 'cuQuantum scale-up simulation',
    category: 'Fleet / Quantum',
    backing: 'ai-ecosystem/scripts/quantum-scaleup/run-cuquantum-job.sh',
    surface: 'orphaned-cli',
    gate: 'spend',
    triggerable: true,
    note: 'Rents a cuQuantum GPU box for state-vector scale-up runs. Spend — file-as-request only.',
  },
];

/**
 * (b) LIVE — already perceivable + wired in Studio, enriched below with real
 *     counts from the read-only orchestrator endpoints.
 */
const LIVE_OPS: CapabilityEntry[] = [
  {
    id: 'serve-status',
    label: 'Sovereign serving (warm replicas + demand)',
    category: 'Fleet / Serving',
    backing: 'orchestrator GET /serve/status',
    surface: 'live',
    gate: 'safe',
    triggerable: true,
    note: 'Scale-to-zero LLM serving that backs Brittney. Surfaced by the Sovereign Serving card; refreshable here.',
  },
  {
    id: 'lotus-status',
    label: 'Lotus gate + GPU/CI job queue',
    category: 'Fleet / CI',
    backing: 'orchestrator GET /gpu/lotus-status',
    surface: 'live',
    gate: 'safe',
    triggerable: true,
    note: 'Paper-bench Lotus gate + per-lane queue depth. Surfaced on the Infra tab; refreshable here.',
  },
  {
    id: 'fleet-dispatch-plan',
    label: 'Fleet dispatch (dry-run plan)',
    category: 'Fleet / Compute',
    backing: 'studio POST /api/agents/fleet/dispatch {dryRun:true}',
    surface: 'live',
    gate: 'safe',
    triggerable: true,
    note: 'SpendGovernor-bounded planner. dryRun=true returns the plan only (no spend) — safe to run from the browser.',
  },
  {
    id: 'fairness-sweep',
    label: 'Verifiable fairness sweep + receipt',
    category: 'Governance / Fairness',
    backing: 'studio POST /api/fairness/sweep → /operations Fairness tab (engine Simulation.runFairnessSweep, in-process)',
    surface: 'live',
    gate: 'safe',
    triggerable: true,
    note: 'Runs the real FairnessSweep in-process and renders the sovereign FairnessReceipt (4/5ths adverse-impact + determinism grade + regulator crosswalk + replay fingerprint) as a verify card. Also wraps explain_fairness_receipt via /api/mcp/call. D.057 — the receipt IS the product (was orphaned-tool, now surfaced).',
  },
];

/**
 * (c) ORPHANED — capabilities the platform ships but does NOT surface in Studio.
 *     Verified on-disk 2026-06-12 (MCP tool names + route files present).
 */
const ORPHANED_TOOLS: CapabilityEntry[] = [
  {
    id: 'twin-earth-identity-safety-robot',
    label: 'Twin-Earth identity / safety / robot tools (16)',
    category: 'Twin-Earth / Embodiment',
    backing:
      'MCP twin_earth_* (register_identity, grant/validate_permission, *_safety_envelope, robot_actuate …)',
    surface: 'orphaned-tool',
    gate: 'admin',
    triggerable: false,
    note: 'Identity registry, permission grants, safety envelopes, and robot actuation. Real MCP tool family; no Studio surface. State/admin only.',
  },
  {
    id: 'holo-reconstruct',
    label: 'Reconstruction tools (4)',
    category: 'Reconstruction / 3DGS',
    backing:
      'MCP holo_reconstruct_anchor / holo_reconstruct_step / holo_reconstruct_from_video / holo_reconstruct_export',
    surface: 'orphaned-tool',
    gate: 'safe',
    triggerable: false,
    note: 'Video → anchored 3D reconstruction pipeline. Real MCP tools; no Studio surface.',
  },
  {
    id: 'render-world-on-fleet',
    label: 'Render world on fleet',
    category: 'Render / Fleet',
    backing: 'MCP render_world_on_fleet (mcp-server/src/world-render-tools.ts)',
    surface: 'orphaned-tool',
    gate: 'spend',
    triggerable: false,
    note: 'Offloads a world render to a GPU fleet box. Real MCP tool; no Studio surface. Spend-class — surface state before wiring a trigger.',
  },
];

const ORPHANED_ROUTES: CapabilityEntry[] = [
  {
    id: 'bounty-subsystem',
    label: 'Bounty subsystem',
    category: 'Economy',
    backing: 'mcp-server/src/holomesh/routes/bounty-routes.ts',
    surface: 'orphaned-route',
    gate: 'safe',
    triggerable: false,
    note: 'Bounty routes ship on the MCP server; no Studio surface consumes them.',
  },
  {
    id: 'vault-lease-subsystem',
    label: 'Vault-lease subsystem',
    category: 'Economy',
    backing: 'mcp-server/src/holomesh/routes/vault-lease-routes.ts',
    surface: 'orphaned-route',
    gate: 'safe',
    triggerable: false,
    note: 'Vault-lease routes ship on the MCP server; no Studio surface consumes them.',
  },
  {
    id: 'storyweaver-subsystem',
    label: 'StoryWeaver generation subsystem',
    category: 'Generation',
    backing: 'mcp-server/src/holomesh/routes/storyweaver-generation-routes.ts',
    surface: 'orphaned-route',
    gate: 'safe',
    triggerable: false,
    note: 'StoryWeaver generation routes ship on the MCP server; no Studio surface consumes them.',
  },
];

const ADMIN_ONLY: CapabilityEntry[] = [
  {
    id: 'custodial-wallet-subsystem',
    label: 'Custodial wallet subsystem',
    category: 'Economy / Custody',
    backing: 'mcp-server/src/holomesh/routes/custodial-wallet-routes.ts',
    surface: 'admin-only',
    gate: 'admin',
    triggerable: false,
    note: 'Founder/admin-gated wallet custody. State-only here — NEVER a browser trigger (Tier-2 custody, D.080).',
  },
  {
    id: 'gpu-jobs-admin',
    label: 'GPU job dump / seat mutation',
    category: 'Fleet / Admin',
    backing: 'orchestrator /gpu/jobs, /gpu/seats (NOT proxied — admin role)',
    surface: 'admin-only',
    gate: 'admin',
    triggerable: false,
    note: 'Admin job dump + seat mutation. Deliberately excluded from the read-only orchestrator proxy allowlist. State/admin only.',
  },
];

function staticRegistry(): CapabilityEntry[] {
  return [...LIVE_OPS, ...FLEET_CLI_OPS, ...ORPHANED_TOOLS, ...ORPHANED_ROUTES, ...ADMIN_ONLY];
}

async function fetchOrchestrator<T>(path: string): Promise<T | null> {
  if (!ORCH_KEY) return null;
  try {
    const r = await fetch(`${ORCH}/${path}`, {
      method: 'GET',
      headers: { 'x-mcp-api-key': ORCH_KEY, Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

interface ServeStatusLite {
  counts?: { warm?: number; draining?: number; models_with_demand?: number };
  endpoints?: unknown[];
  demand?: unknown[];
}
interface LotusStatusLite {
  queue?: { queued?: number; running?: number; done?: number };
  lotus_gate?: { papers_with_rtx_bench?: number; total_papers?: number };
}

export async function GET() {
  const capabilities = staticRegistry();

  // Enrich the LIVE entries with real counts from the read-only orchestrator
  // endpoints (same ones the operations proxy allowlists). Best-effort — on any
  // failure the entry simply renders without a live metric.
  const [serve, lotus] = await Promise.all([
    fetchOrchestrator<ServeStatusLite>('serve/status'),
    fetchOrchestrator<LotusStatusLite>('gpu/lotus-status'),
  ]);

  for (const cap of capabilities) {
    if (cap.id === 'serve-status' && serve) {
      cap.live = {
        warm: Number(serve.counts?.warm ?? (serve.endpoints?.length ?? 0)),
        modelsWithDemand: Number(serve.counts?.models_with_demand ?? (serve.demand?.length ?? 0)),
      };
    }
    if (cap.id === 'lotus-status' && lotus) {
      cap.live = {
        queued: Number(lotus.queue?.queued ?? 0),
        running: Number(lotus.queue?.running ?? 0),
        papersBenched: Number(lotus.lotus_gate?.papers_with_rtx_bench ?? 0),
        totalPapers: Number(lotus.lotus_gate?.total_papers ?? 0),
      };
    }
  }

  const surfaced = capabilities.filter((c) => c.surface === 'live').length;
  const orphaned = capabilities.length - surfaced;

  return NextResponse.json(
    {
      capabilities,
      summary: {
        total: capabilities.length,
        surfaced,
        orphaned,
        orchestratorReachable: Boolean(serve || lotus),
        bySurface: {
          live: capabilities.filter((c) => c.surface === 'live').length,
          'orphaned-cli': capabilities.filter((c) => c.surface === 'orphaned-cli').length,
          'orphaned-tool': capabilities.filter((c) => c.surface === 'orphaned-tool').length,
          'orphaned-route': capabilities.filter((c) => c.surface === 'orphaned-route').length,
          'admin-only': capabilities.filter((c) => c.surface === 'admin-only').length,
        },
        note: 'Grounded inventory — every backing path/tool verified on-disk. This is a curated top-orphaned set, not the full capability scan.',
      },
    },
    { headers: { 'cache-control': 'no-store' } }
  );
}

export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, OPTIONS' }),
  });
}
