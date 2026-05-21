/**
 * Paper26SimRunner — 15-day multi-agent CogVM simulation for Paper 26 §7
 *
 * Runs N=100 independent uAAL agents for T=1000 outer ticks each, collecting
 * M1–M4 metrics (Paper 26 §7.1–7.4).  Exposes a lightweight HTTP metrics
 * server so HoloTunnel can surface live progress.
 *
 * Architecture
 * ────────────
 * Each agent is an HSPlusNode with uAALComposedAgentHandler attached.
 * Agents run independently; RecursiveLink messages from each agent are
 * collected in-process but NOT cross-routed between agents (M1–M4 are
 * intra-agent + population-aggregate metrics; cross-agent routing is wired
 * in the secondary sycophancy evaluation via SyntheticPeer injection).
 *
 * Metrics collected per outer tick per agent:
 *   M1: hemisphereAgreement (γ) — from UAALAgentSnapshot.hemisphereAgreement
 *   M2: totalLoss, conservationLoss, bilateralLoss — from pillarjepa:loss events
 *   M3: diversityRatio (ρ) — from emitter:diversity_stats events
 *   M4: lifecycle — from UAALAgentSnapshot.lifecycle
 *
 * HTTP API (served on --port, default 4426)
 * ──────────────────────────────────────────
 *   GET /health              → { ok: true, tick, agents, elapsed_h }
 *   GET /metrics             → SimSnapshot (JSON)
 *   GET /metrics/stream      → SSE live-push (text/event-stream)
 *   GET /metrics/agent/:id   → per-agent trajectory (JSON array)
 *   GET /                    → HTML auto-refresh dashboard
 *
 * Checkpoints
 * ───────────
 * Full SimSnapshot written to --checkpoint-dir every --checkpoint-every ticks.
 * Final snapshot written on clean exit or SIGTERM.
 *
 * Usage
 * ─────
 *   npx tsx src/traits/pillar/sim/Paper26SimRunner.ts [options]
 *   node dist/traits/pillar/sim/Paper26SimRunner.js [options]
 *
 *   --agents N          Number of agents (default: 100)
 *   --ticks T           Outer ticks per agent (default: 1000)
 *   --inner-freq F      Inner ticks per outer tick (default: 10)
 *   --port P            HTTP metrics port (default: 4426)
 *   --checkpoint-dir D  Checkpoint output dir (default: ./sim-checkpoints)
 *   --checkpoint-every  Checkpoint interval in outer ticks (default: 100)
 *   --sycophancy-frac   Fraction of sycophantic agents for secondary eval (default: 0)
 *   --latent-dim DIM    JEPA latent dimension (default: 32)
 *   --label LABEL       Run label for checkpoint filenames (default: 'paper26')
 *   --knowledge-push    Push snapshots to MCP knowledge store (default: false)
 *   --knowledge-url URL MCP orchestrator base URL
 *   --knowledge-key KEY API key for MCP orchestrator
 *
 * @module
 */

import * as http from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseArgs } from 'node:util';

import {
  uAALComposedAgentHandler,
  getUAALAgentSnapshot,
  type UAALAgentConfig,
} from '../uAALComposedAgent.js';
import type { HSPlusNode, TraitContext } from '../../TraitTypes.js';

// ─────────────────────────────────────────────────────────────────────────────
// CLI args
// ─────────────────────────────────────────────────────────────────────────────

const { values: args } = parseArgs({
  allowPositionals: false,
  options: {
    agents:            { type: 'string', default: '100' },
    ticks:             { type: 'string', default: '1000' },
    'inner-freq':      { type: 'string', default: '10' },
    port:              { type: 'string', default: '4426' },
    'checkpoint-dir':  { type: 'string', default: './sim-checkpoints' },
    'checkpoint-every':{ type: 'string', default: '100' },
    'sycophancy-frac': { type: 'string', default: '0' },
    'latent-dim':      { type: 'string', default: '32' },
    label:             { type: 'string', default: 'paper26' },
    'knowledge-push':  { type: 'boolean', default: false },
    'knowledge-url':   { type: 'string', default: 'https://mcp-orchestrator-production-45f9.up.railway.app' },
    'knowledge-key':   { type: 'string', default: '' },
  },
});

const NUM_AGENTS       = parseInt(args['agents']!,             10);
const OUTER_TICKS      = parseInt(args['ticks']!,              10);
const INNER_FREQ       = parseInt(args['inner-freq']!,         10);
const HTTP_PORT        = parseInt(args['port']!,               10);
const CHECKPOINT_DIR   = args['checkpoint-dir']!;
const CHECKPOINT_EVERY = parseInt(args['checkpoint-every']!,   10);
const SYCO_FRAC        = parseFloat(args['sycophancy-frac']!);
const LATENT_DIM       = parseInt(args['latent-dim']!,         10);
const RUN_LABEL        = args['label']!;
const KNOWLEDGE_PUSH   = args['knowledge-push']!;
const KNOWLEDGE_URL    = args['knowledge-url']!;
const KNOWLEDGE_KEY    = args['knowledge-key'] || process.env['HOLOSCRIPT_API_KEY'] || '';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface AgentTickRecord {
  outerTick:           number;
  hemisphereAgreement: number;
  totalLoss:           number;
  conservationLoss:    number;
  bilateralLoss:       number;
  diversityRatio:      number;
  lifecycle:           string;
}

interface AgentState {
  node:      HSPlusNode;
  config:    UAALAgentConfig;
  ctx:       TraitContext;
  history:   AgentTickRecord[];
  /** Latest jepa:loss payload captured from event bus */
  lastLoss:  { totalLoss: number; conservationLoss: number; bilateralLoss: number } | null;
  /** Latest diversity_ratio captured from emitter:diversity_stats */
  lastDiversity: number;
  /** Is this a sycophantic agent (secondary eval)? */
  isSycophantic: boolean;
}

interface PopulationMetrics {
  tick:             number;
  /** Median hemisphere agreement across agents */
  medianGamma:      number;
  /** 90th percentile gamma */
  p90Gamma:         number;
  /** Mean total loss */
  meanTotalLoss:    number;
  /** Std total loss */
  stdTotalLoss:     number;
  /** Mean diversity ratio */
  meanDiversity:    number;
  /** Fraction of agents per lifecycle state */
  lifecycleDistrib: Record<string, number>;
}

interface SimSnapshot {
  label:          string;
  agents:         number;
  targetTicks:    number;
  currentTick:    number;
  elapsedMs:      number;
  population:     PopulationMetrics[];
  finalPopulation:PopulationMetrics | null;
  config: {
    innerFreq:       number;
    latentDim:       number;
    sycophancyFrac:  number;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// HSPlusNode + TraitContext factories (mirrors test pattern)
// ─────────────────────────────────────────────────────────────────────────────

function makeNode(): HSPlusNode {
  return {} as HSPlusNode;
}

function makeCtx(onEmit?: (name: string, payload: unknown) => void): TraitContext {
  return {
    emit(name: string, payload: unknown) { onEmit?.(name, payload); },
    getState:           () => ({}),
    setState:           () => {},
    getScaleMultiplier: () => 1,
    setScaleContext:    () => {},
    vr:      null,
    physics: null,
    audio:   null,
    haptics: null,
  } as unknown as TraitContext;
}

// ─────────────────────────────────────────────────────────────────────────────
// Agent factory
// ─────────────────────────────────────────────────────────────────────────────

function createAgent(agentIdx: number, isSycophantic: boolean): AgentState {
  const agent_id = `sim_agent_${String(agentIdx).padStart(3, '0')}`;
  const config: UAALAgentConfig = {
    agent_id,
    inner_frequency:  INNER_FREQ,
    emit_to_peers:    true,
    jepa_latent_dim:  LATENT_DIM,
  };

  const state: AgentState = {
    node:          makeNode(),
    config,
    ctx:           makeCtx() /* overwritten below */,
    history:       [],
    lastLoss:      null,
    lastDiversity: 1.0,
    isSycophantic,
  };

  // Wire event listener to capture metrics
  state.ctx = makeCtx((name, payload) => {
    if (name === 'pillarjepa:loss') {
      const p = payload as { totalLoss?: number; conservationLoss?: number; bilateralLoss?: number };
      state.lastLoss = {
        totalLoss:        p.totalLoss        ?? 0,
        conservationLoss: p.conservationLoss ?? 0,
        bilateralLoss:    p.bilateralLoss    ?? 0,
      };
    }
    if (name === 'emitter:diversity_stats') {
      const p = payload as { diversity_ratio?: number };
      state.lastDiversity = p.diversity_ratio ?? state.lastDiversity;
    }
  });

  uAALComposedAgentHandler.onAttach?.(state.node, state.config, state.ctx);
  return state;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tick helpers
// ─────────────────────────────────────────────────────────────────────────────

function tickAgent(agent: AgentState): void {
  for (let i = 0; i < INNER_FREQ; i++) {
    uAALComposedAgentHandler.onEvent?.(agent.node, agent.config, agent.ctx, {
      type: 'cogvm:tick',
      context: 'sim',
      metadata: { tick: agent.history.length },
    } as Parameters<NonNullable<typeof uAALComposedAgentHandler.onEvent>>[3]);
  }
}

function captureAgentMetrics(agent: AgentState, outerTick: number): AgentTickRecord {
  const snap = getUAALAgentSnapshot(agent.node);
  return {
    outerTick,
    hemisphereAgreement: snap?.hemisphereAgreement ?? 0,
    totalLoss:           agent.lastLoss?.totalLoss        ?? 0,
    conservationLoss:    agent.lastLoss?.conservationLoss ?? 0,
    bilateralLoss:       agent.lastLoss?.bilateralLoss    ?? 0,
    diversityRatio:      agent.lastDiversity,
    lifecycle:           snap?.lifecycle ?? 'init',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Population statistics
// ─────────────────────────────────────────────────────────────────────────────

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.max(0, Math.ceil(p * sorted.length) - 1);
  return sorted[idx]!;
}

function computePopulationMetrics(agents: AgentState[], tick: number): PopulationMetrics {
  const gammas        = agents.map(a => a.history.at(-1)?.hemisphereAgreement ?? 0).sort((a, b) => a - b);
  const losses        = agents.map(a => a.history.at(-1)?.totalLoss ?? 0);
  const diversities   = agents.map(a => a.history.at(-1)?.diversityRatio ?? 1);
  const lifecycles    = agents.map(a => a.history.at(-1)?.lifecycle ?? 'init');

  const meanLoss = losses.reduce((s, v) => s + v, 0) / losses.length;
  const varLoss  = losses.reduce((s, v) => s + (v - meanLoss) ** 2, 0) / losses.length;

  const lifecycleDistrib: Record<string, number> = {};
  for (const lc of lifecycles) {
    lifecycleDistrib[lc] = (lifecycleDistrib[lc] ?? 0) + 1 / lifecycles.length;
  }

  return {
    tick,
    medianGamma:   percentile(gammas, 0.5),
    p90Gamma:      percentile(gammas, 0.9),
    meanTotalLoss: meanLoss,
    stdTotalLoss:  Math.sqrt(varLoss),
    meanDiversity: diversities.reduce((s, v) => s + v, 0) / diversities.length,
    lifecycleDistrib,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Simulation state (module-level for HTTP access)
// ─────────────────────────────────────────────────────────────────────────────

let AGENTS: AgentState[]         = [];
let POPULATION_METRICS: PopulationMetrics[] = [];
let CURRENT_TICK   = 0;
let START_TIME_MS  = Date.now();
let SIM_RUNNING    = false;
let SSE_CLIENTS: http.ServerResponse[] = [];

function buildSnapshot(): SimSnapshot {
  return {
    label:           RUN_LABEL,
    agents:          NUM_AGENTS,
    targetTicks:     OUTER_TICKS,
    currentTick:     CURRENT_TICK,
    elapsedMs:       Date.now() - START_TIME_MS,
    population:      POPULATION_METRICS,
    finalPopulation: POPULATION_METRICS.at(-1) ?? null,
    config: {
      innerFreq:       INNER_FREQ,
      latentDim:       LATENT_DIM,
      sycophancyFrac:  SYCO_FRAC,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Checkpoint I/O
// ─────────────────────────────────────────────────────────────────────────────

function writeCheckpoint(tag: string): void {
  try {
    fs.mkdirSync(CHECKPOINT_DIR, { recursive: true });
    const file = path.join(CHECKPOINT_DIR, `${RUN_LABEL}-tick${String(CURRENT_TICK).padStart(5, '0')}-${tag}.json`);
    fs.writeFileSync(file, JSON.stringify(buildSnapshot(), null, 2), 'utf8');
    console.log(`[checkpoint] ${file}`);
  } catch (e) {
    console.error('[checkpoint] write failed:', e);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MCP knowledge store push
// ─────────────────────────────────────────────────────────────────────────────

async function pushToKnowledge(tick: number): Promise<void> {
  if (!KNOWLEDGE_PUSH || !KNOWLEDGE_KEY) return;
  const pm = POPULATION_METRICS.at(-1);
  if (!pm) return;
  try {
    const body = JSON.stringify({
      id:           `paper26.sim.${RUN_LABEL}.tick${tick}`,
      type:         'sim_snapshot',
      domain:       'paper26',
      content:      JSON.stringify(pm),
      workspace_id: 'ai-ecosystem',
      access:       'shared',
    });
    await fetch(`${KNOWLEDGE_URL}/knowledge/sync`, {
      method:  'POST',
      headers: { 'x-mcp-api-key': KNOWLEDGE_KEY, 'Content-Type': 'application/json' },
      body,
    });
  } catch {
    // Non-fatal — simulation continues even if knowledge push fails
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SSE broadcast
// ─────────────────────────────────────────────────────────────────────────────

function broadcastSSE(pm: PopulationMetrics): void {
  const data = `data: ${JSON.stringify(pm)}\n\n`;
  SSE_CLIENTS = SSE_CLIENTS.filter(res => {
    try { res.write(data); return true; }
    catch { return false; }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP server
// ─────────────────────────────────────────────────────────────────────────────

const HTML_DASHBOARD = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Paper 26 Simulation — Live Metrics</title>
  <style>
    body { font-family: monospace; background:#0d1117; color:#c9d1d9; padding:2rem; max-width:900px; margin:0 auto }
    h1 { color:#58a6ff; font-size:1.2rem }
    .card { background:#161b22; border:1px solid #30363d; border-radius:8px; padding:1rem; margin:1rem 0 }
    .stat { display:inline-block; margin:0.3rem 1rem 0.3rem 0 }
    .label { color:#8b949e; font-size:.75rem; display:block }
    .val { color:#e6edf3; font-size:1.1rem }
    .bar-wrap { background:#21262d; border-radius:4px; height:6px; width:200px; display:inline-block; vertical-align:middle }
    .bar { background:#238636; height:6px; border-radius:4px; transition:width .4s }
    pre { background:#010409; padding:1rem; border-radius:6px; overflow:auto; font-size:.75rem; max-height:300px }
    #log { color:#3fb950 }
  </style>
</head>
<body>
  <h1>🧠 Paper 26 — uAAL Multi-Agent Simulation</h1>
  <div class="card">
    <div class="stat"><span class="label">AGENTS</span><span class="val" id="agents">—</span></div>
    <div class="stat"><span class="label">TICK / TARGET</span><span class="val" id="tick">—</span></div>
    <div class="stat"><span class="label">ELAPSED</span><span class="val" id="elapsed">—</span></div>
    <div class="stat"><span class="label">PROGRESS</span>
      <div class="bar-wrap"><div class="bar" id="bar" style="width:0%"></div></div>
    </div>
  </div>
  <div class="card">
    <div class="stat"><span class="label">MEDIAN γ (hemisphere agreement)</span><span class="val" id="gamma">—</span></div>
    <div class="stat"><span class="label">p90 γ</span><span class="val" id="gamma90">—</span></div>
    <div class="stat"><span class="label">MEAN TOTAL LOSS</span><span class="val" id="loss">—</span></div>
    <div class="stat"><span class="label">MEAN DIVERSITY ρ</span><span class="val" id="diversity">—</span></div>
  </div>
  <div class="card">
    <div class="stat"><span class="label">LIFECYCLE DISTRIBUTION</span></div>
    <pre id="lifecycle">—</pre>
  </div>
  <div class="card">
    <span class="label">EVENT LOG</span>
    <pre id="log" style="max-height:160px"></pre>
  </div>
  <script>
    const src = new EventSource('/metrics/stream');
    const log = document.getElementById('log');
    const snap = {};
    src.onmessage = (e) => {
      const pm = JSON.parse(e.data);
      Object.assign(snap, pm);
      document.getElementById('agents').textContent   = (window._agents || '—');
      document.getElementById('tick').textContent     = pm.tick + ' / ' + (window._target || '?');
      document.getElementById('gamma').textContent    = (pm.medianGamma * 100).toFixed(1) + '%';
      document.getElementById('gamma90').textContent  = (pm.p90Gamma * 100).toFixed(1) + '%';
      document.getElementById('loss').textContent     = pm.meanTotalLoss.toFixed(4);
      document.getElementById('diversity').textContent= (pm.meanDiversity * 100).toFixed(1) + '%';
      document.getElementById('lifecycle').textContent= JSON.stringify(pm.lifecycleDistrib, null, 2);
      const pct = window._target ? (pm.tick / window._target * 100).toFixed(1) : 0;
      document.getElementById('bar').style.width = pct + '%';
      document.getElementById('elapsed').textContent  = pm.tick + ' ticks';
      const line = '> tick ' + pm.tick + ' γ=' + (pm.medianGamma*100).toFixed(1) + '% loss=' + pm.meanTotalLoss.toFixed(4);
      log.textContent = (log.textContent + '\\n' + line).split('\\n').slice(-20).join('\\n');
    };
    fetch('/metrics').then(r=>r.json()).then(d => {
      window._agents = d.agents; window._target = d.targetTicks;
    });
  </script>
</body>
</html>`;

function startHttpServer(): void {
  const server = http.createServer((req, res) => {
    const url = req.url ?? '/';

    if (url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok:       true,
        running:  SIM_RUNNING,
        tick:     CURRENT_TICK,
        agents:   NUM_AGENTS,
        elapsed_h: ((Date.now() - START_TIME_MS) / 3_600_000).toFixed(2),
      }));
      return;
    }

    if (url === '/metrics') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(buildSnapshot()));
      return;
    }

    if (url === '/metrics/stream') {
      res.writeHead(200, {
        'Content-Type':  'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection':    'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });
      res.write(': connected\n\n');
      SSE_CLIENTS.push(res);
      req.on('close', () => {
        SSE_CLIENTS = SSE_CLIENTS.filter(c => c !== res);
      });
      return;
    }

    if (url.startsWith('/metrics/agent/')) {
      const id = url.slice('/metrics/agent/'.length);
      const agent = AGENTS.find(a => a.config.agent_id === id);
      if (!agent) {
        res.writeHead(404); res.end('not found'); return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(agent.history));
      return;
    }

    // Default: HTML dashboard
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(HTML_DASHBOARD);
  });

  server.listen(HTTP_PORT, '0.0.0.0', () => {
    console.log(`[http] metrics server listening on http://0.0.0.0:${HTTP_PORT}`);
    console.log(`[http]   GET /         — live dashboard`);
    console.log(`[http]   GET /health   — health check`);
    console.log(`[http]   GET /metrics  — full JSON snapshot`);
    console.log(`[http]   GET /metrics/stream — SSE live feed`);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Main simulation loop
// ─────────────────────────────────────────────────────────────────────────────

async function runSimulation(): Promise<void> {
  console.log(`[sim] Paper 26 multi-agent simulation`);
  console.log(`[sim] agents=${NUM_AGENTS} outer_ticks=${OUTER_TICKS} inner_freq=${INNER_FREQ} latent_dim=${LATENT_DIM}`);
  if (SYCO_FRAC > 0) {
    console.log(`[sim] secondary eval: sycophancy_frac=${SYCO_FRAC}`);
  }

  // Initialise agents
  const numSycophantic = Math.round(NUM_AGENTS * SYCO_FRAC);
  AGENTS = Array.from({ length: NUM_AGENTS }, (_, i) =>
    createAgent(i, i < numSycophantic),
  );
  console.log(`[sim] ${NUM_AGENTS} agents initialised (${numSycophantic} sycophantic)`);

  START_TIME_MS = Date.now();
  SIM_RUNNING   = true;

  for (let outerTick = 1; outerTick <= OUTER_TICKS; outerTick++) {
    CURRENT_TICK = outerTick;

    // Tick all agents
    for (const agent of AGENTS) {
      tickAgent(agent);
      const record = captureAgentMetrics(agent, outerTick);
      agent.history.push(record);
    }

    // Compute + store population metrics
    const pm = computePopulationMetrics(AGENTS, outerTick);
    POPULATION_METRICS.push(pm);
    broadcastSSE(pm);

    // Log progress at reporting points
    if (outerTick % 100 === 0 || outerTick === 1) {
      const elapsed_h = ((Date.now() - START_TIME_MS) / 3_600_000).toFixed(2);
      console.log(
        `[sim] tick=${outerTick}/${OUTER_TICKS} γ_med=${(pm.medianGamma*100).toFixed(1)}% ` +
        `γ_p90=${(pm.p90Gamma*100).toFixed(1)}% loss=${pm.meanTotalLoss.toFixed(4)} ` +
        `ρ=${(pm.meanDiversity*100).toFixed(1)}% elapsed=${elapsed_h}h`,
      );
    }

    // Checkpoint
    if (outerTick % CHECKPOINT_EVERY === 0) {
      writeCheckpoint('auto');
      await pushToKnowledge(outerTick);
    }

    // Yield to event loop every 10 ticks so HTTP stays responsive
    if (outerTick % 10 === 0) {
      await new Promise<void>(r => setImmediate(r));
    }
  }

  SIM_RUNNING = false;
  writeCheckpoint('final');
  await pushToKnowledge(OUTER_TICKS);

  console.log('[sim] COMPLETE');
  const final = POPULATION_METRICS.at(-1)!;
  console.log(`[sim] Final γ_med=${(final.medianGamma*100).toFixed(1)}% γ_p90=${(final.p90Gamma*100).toFixed(1)}%`);
  console.log(`[sim] Final loss=${final.meanTotalLoss.toFixed(4)} ρ=${(final.meanDiversity*100).toFixed(1)}%`);
  console.log('[sim] Lifecycle distribution:', JSON.stringify(final.lifecycleDistrib, null, 2));
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────────────────

startHttpServer();
fs.mkdirSync(CHECKPOINT_DIR, { recursive: true });

process.on('SIGTERM', () => {
  console.log('[sim] SIGTERM received — writing final checkpoint');
  writeCheckpoint('sigterm');
  process.exit(0);
});
process.on('SIGINT', () => {
  console.log('[sim] SIGINT received — writing final checkpoint');
  writeCheckpoint('sigint');
  process.exit(0);
});

runSimulation().catch(err => {
  console.error('[sim] FATAL:', err);
  writeCheckpoint('fatal');
  process.exit(1);
});
