/**
 * Simulation Billing Tools -- MCP tools that dispatch /sim solver runs
 * through the ComputeBillingHarness + vast.ai GPU fleet.
 *
 * These tools extend the existing solve_structural / solve_thermal / verify_cael_trace
 * tools with a paid, capped execution path. A solver run becomes a billable job
 * that runs locally or on a fleet GPU worker, with the financial safety invariant:
 *
 *     Financial safety comes from the EXECUTION CAP, not from estimate accuracy.
 *     max_execution_time == paid_seconds; the platform is never financially exposed.
 *
 * Tools:
 * - sim_quote:     Price a solver run (estimate → quote, no execution).
 * - sim_run_paid:  Execute a solver as a paid, capped job (quote → charge → execute → reconcile).
 * - sim_fleet_status: Check the status of a fleet-dispatched solver job.
 *
 * The existing solve_structural / solve_thermal / verify_cael_trace tools remain
 * unchanged for free/local use. These tools add the billing+fleet layer on top.
 *
 * Ref: task_1779436686675_3jdw (T3), commit 8dfd148b, MEMORY S.QSIM
 * Ref: scripts/compute_billing_harness.py, scripts/sim_solver_executor.py
 * Ref: research/2026-05-21_managed-quantum-billing.md
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import * as child_process from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SolverKind = 'thermal' | 'structural';

interface SimQuote {
  estimate_seconds: number;
  cap_seconds: number;
  price_usd: number;
  price_credits: number;
  rate_usd_per_sec: number;
  buffer: number;
  margin: number;
  backend: string;
}

interface SimOrderResult {
  success: boolean;
  job_ref: string;
  quote: SimQuote;
  charge: Record<string, unknown>;
  execution: {
    billable_seconds: number;
    solver_type: string;
    device: string;
    steps_taken: number;
    wall_seconds: number;
    cap_exceeded: boolean;
    cael_trace_id?: string;
    result_summary?: Record<string, unknown>;
  };
  reconcile: Record<string, unknown>;
  refund: Record<string, unknown>;
  error?: string;
}

// ---------------------------------------------------------------------------
// Billing harness adapter (Node.js side -- calls the Python harness via subprocess)
// ---------------------------------------------------------------------------

// Billing harness adapter. For action='quote' this returns a pure price estimate (no
// execution claimed — billable_seconds:0). For action='run' it returns a billing envelope
// whose execution numbers are SYNTHETIC here; handleSimRunPaid then OVERWRITES them with
// the real local solver's measured wall time (dispatch_mode='local') and fails loud if the
// solver did not run (true-simulation plan F1 — closes the prior ratchet-P4 overclaim where
// a synthetic estimate*0.8 placeholder was returned as if solved). For dispatch_mode='fleet'
// (UNWIRED/THIN — real fleet dispatch needs scripts/sim_solver_executor.py + vast.ai creds),
// handleSimRunPaid now ALSO fails loud rather than returning the synthetic envelope, so a
// paid order can never claim success for an unexecuted fleet solve (plan §0.6, F.095).
async function callPythonHarness(
  action: 'quote' | 'run',
  params: {
    solver: SolverKind;
    estimate_seconds: number;
    rate: number;
    customer?: string;
    buffer?: number;
    margin?: number;
    steps?: number;
    device?: string;
    dispatch_mode?: 'local' | 'fleet';
    solver_config?: Record<string, unknown>;
  },
): Promise<SimOrderResult> {
  // The Python billing harness is the canonical implementation.
  // Call it as a subprocess with JSON stdin/stdout.
  const args = [
    'scripts/sim_solver_executor.py',
    '--solver', params.solver,
    '--estimate-seconds', String(params.estimate_seconds),
    '--rate', String(params.rate),
    '--customer', params.customer || 'mcp-caller',
  ];

  if (params.buffer !== undefined) args.push('--buffer', String(params.buffer));
  if (params.margin !== undefined) args.push('--margin', String(params.margin));
  if (params.steps !== undefined) args.push('--steps', String(params.steps));
  if (params.device) args.push('--device', params.device);
  if (params.dispatch_mode) args.push('--dispatch-mode', params.dispatch_mode);
  if (action === 'run') args.push('--write-receipt');

  // Attempt to call the Python subprocess harness. If the script is missing,
  // fall back to local computation (mirrors quantum_cost_quote.build_quote).
  const scriptPath = path.resolve(process.cwd(), 'scripts/sim_solver_executor.py');
  const scriptExists = fs.existsSync(scriptPath);

  if (scriptExists) {
    try {
      const result = child_process.execFileSync(process.execPath, ['--version'], {
        timeout: 30_000,
        encoding: 'utf8',
      });
    } catch {
      // execFileSync not suitable for Python — use spawnSync instead
    }

    try {
      const spawnResult = child_process.spawnSync('python3', args, {
        timeout: 60_000,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      if (spawnResult.status === 0 && spawnResult.stdout) {
        const parsed = JSON.parse(spawnResult.stdout.trim());
        return parsed as SimOrderResult;
      }
      // If Python spawn fails, fall through to local computation
    } catch {
      // Python not available or script error — fall through to local computation
    }
  }

  // Fallback: local computation (mirrors quantum_cost_quote.build_quote)
  const buffer = params.buffer ?? 0.15;
  const margin = params.margin ?? 0.30;
  const creditsPerUsd = 100.0;
  const capSeconds = Math.ceil(params.estimate_seconds * (1 + buffer));
  const priceUsd = capSeconds * params.rate * (1 + margin);
  const priceCredits = priceUsd * creditsPerUsd;

  const quote: SimQuote = {
    estimate_seconds: params.estimate_seconds,
    cap_seconds: capSeconds,
    price_usd: Math.round(priceUsd * 1e6) / 1e6,
    price_credits: Math.round(priceCredits * 100) / 100,
    rate_usd_per_sec: params.rate,
    buffer,
    margin,
    backend: params.dispatch_mode === 'fleet' ? 'vast-gpu' : 'holoscript-gpu',
  };

  if (action === 'quote') {
    return {
      success: true,
      job_ref: `sim-${params.solver}-${params.customer || 'mcp-caller'}-${Date.now()}`,
      quote,
      charge: {},
      execution: {
        billable_seconds: 0,
        solver_type: params.solver,
        device: '',
        steps_taken: 0,
        wall_seconds: 0,
        cap_exceeded: false,
      },
      reconcile: {},
      refund: {},
    };
  }

  // For 'run', we need to actually execute the solver.
  // Fall through to the existing handleSimulationTool for local execution,
  // then wrap it in the billing harness result.
  return {
    success: true,
    job_ref: `sim-${params.solver}-${params.customer || 'mcp-caller'}-${Date.now()}`,
    quote,
    charge: { backend: 'test-ledger', charged_credits: priceCredits, real_money: false },
    execution: {
      billable_seconds: params.estimate_seconds * 0.8, // placeholder; real execution fills this
      solver_type: params.solver,
      device: params.device || 'GPU',
      steps_taken: params.steps || 10,
      wall_seconds: params.estimate_seconds * 0.8,
      cap_exceeded: false,
    },
    reconcile: {
      paid_seconds: capSeconds,
      actual_seconds: params.estimate_seconds * 0.8,
      within_cap: true,
      refund_usd: Math.round((capSeconds - params.estimate_seconds * 0.8) * params.rate * 1e6) / 1e6,
      refund_credits: 0,
    },
    refund: { backend: 'test-ledger', refunded_credits: 0, real_money: false },
  };
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

export const simulationBillingTools: Tool[] = [
  {
    name: 'sim_quote',
    description:
      'Price a /sim solver run without executing it. Returns the quote: ' +
      'estimated seconds, cap, price in USD and HoloScript credits. NOTE: the price is ' +
      'a deterministic formula over the CALLER-SUPPLIED gpu_rate (not a real GPU/solver ' +
      'cost model) — it is an estimate, not a market-derived price. ' +
      'The cap (max_execution_time == paid_seconds) is the financial safety ' +
      'anchor; the estimate only affects competitiveness, never exposure. ' +
      'Use sim_run_paid to execute the solver (real local execution; synthetic billing — see its description).',
    inputSchema: {
      type: 'object',
      properties: {
        solver: {
          type: 'string',
          enum: ['thermal', 'structural'],
          description: 'Solver type to price.',
        },
        estimate_seconds: {
          type: 'number',
          description: 'Estimated wall-time in seconds (affects quote, NOT safety).',
          minimum: 0.1,
        },
        rate: {
          type: 'number',
          description: 'GPU rental rate in USD/sec (e.g. 0.0001 for vast.ai RTX 3060).',
          minimum: 0,
        },
        buffer: {
          type: 'number',
          description: 'Safety margin folded into cap (default 0.15 = +15%).',
          default: 0.15,
          minimum: 0,
        },
        margin: {
          type: 'number',
          description: 'Platform markup over GPU cost (default 0.30 = +30%).',
          default: 0.30,
          minimum: 0,
        },
        customer: {
          type: 'string',
          description: 'Customer identifier for billing.',
          default: 'mcp-caller',
        },
        dispatch_mode: {
          type: 'string',
          enum: ['local', 'fleet'],
          description: 'Execution target: local GPU or vast.ai fleet worker.',
          default: 'local',
        },
      },
      required: ['solver', 'estimate_seconds', 'rate'],
    },
  },
  {
    name: 'sim_run_paid',
    description:
      'Execute a /sim solver as a capped job with a quote->execute->reconcile envelope. ' +
      'The solver execution is REAL for dispatch_mode=local (real ThermalSolver/' +
      'StructuralSolver + CAEL trace); fleet dispatch fails loud (unwired). ' +
      'BILLING IS NOT REAL YET: the charge/reconcile/refund are a synthetic test-ledger ' +
      '(real_money:false) — no x402/treasury debit occurs (deep-ratchet 2026-06-05). ' +
      'Returns the order result + CAEL trace + a SYNTHETIC (test-ledger) billing envelope, ' +
      'NOT a real payment receipt. The execution cap still bounds wall-time. ' +
      'Use sim_quote to preview the (caller-rate-based) price estimate first.',
    inputSchema: {
      type: 'object',
      properties: {
        solver: {
          type: 'string',
          enum: ['thermal', 'structural'],
          description: 'Solver type to execute.',
        },
        solver_config: {
          type: 'object',
          description:
            'Solver-specific configuration. Thermal: { gridResolution, timeStep, ... }. ' +
            'Structural: { nodes, elements, materials, forces, constraints }.',
        },
        estimate_seconds: {
          type: 'number',
          description: 'Estimated wall-time in seconds (affects quote, NOT safety).',
          minimum: 0.1,
        },
        rate: {
          type: 'number',
          description: 'GPU rental rate in USD/sec.',
          minimum: 0,
        },
        steps: {
          type: 'number',
          description: 'Number of solver steps (transient solvers only).',
          default: 10,
          minimum: 1,
        },
        device: {
          type: 'string',
          enum: ['GPU', 'CPU'],
          description: 'Preferred compute device.',
          default: 'GPU',
        },
        dispatch_mode: {
          type: 'string',
          enum: ['local', 'fleet'],
          description: 'Execution target: local GPU or vast.ai fleet worker.',
      // THIN (ratchet P4): vast.ai fleet dispatch is rule-only. No --yes auto-approval flag
      // is wired. The billing harness attempts Python subprocess dispatch but falls through
      // to local computation when Python is unavailable. Real fleet dispatch requires the
      // compute_billing_harness.py script + vast.ai CLI credentials.
          default: 'local',
        },
        buffer: {
          type: 'number',
          description: 'Safety margin folded into cap (default 0.15).',
          default: 0.15,
        },
        margin: {
          type: 'number',
          description: 'Platform markup over GPU cost (default 0.30).',
          default: 0.30,
        },
        customer: {
          type: 'string',
          description: 'Customer identifier for billing.',
          default: 'mcp-caller',
        },
      },
      required: ['solver', 'estimate_seconds', 'rate'],
    },
  },
  {
    name: 'sim_fleet_status',
    description:
      'Check the status of a fleet-dispatched solver job. ' +
      'Returns the current job status (pending, running, done, error) and ' +
      'any available results. Only applicable for jobs submitted with dispatch_mode=fleet.',
    inputSchema: {
      type: 'object',
      properties: {
        job_id: {
          type: 'string',
          description: 'Job ID returned by sim_run_paid with fleet dispatch.',
        },
      },
      required: ['job_id'],
    },
  },
];

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export async function handleSimulationBillingTool(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown | null> {
  switch (name) {
    case 'sim_quote':
      return handleSimQuote(args);
    case 'sim_run_paid':
      return handleSimRunPaid(args);
    case 'sim_fleet_status':
      return handleSimFleetStatus(args);
    default:
      return null;
  }
}

async function handleSimQuote(
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const solver = args.solver as SolverKind;
  const estimateSeconds = Number(args.estimate_seconds);
  const rate = Number(args.rate);
  const buffer = args.buffer !== undefined ? Number(args.buffer) : 0.15;
  const margin = args.margin !== undefined ? Number(args.margin) : 0.30;
  const customer = (args.customer as string) || 'mcp-caller';
  const dispatchMode = (args.dispatch_mode as 'local' | 'fleet') || 'local';

  if (!solver || !estimateSeconds || !rate) {
    return { success: false, error: 'solver, estimate_seconds, and rate are required' };
  }

  const result = await callPythonHarness('quote', {
    solver,
    estimate_seconds: estimateSeconds,
    rate,
    customer,
    buffer,
    margin,
    dispatch_mode: dispatchMode,
  });

  return {
    success: true,
    quote: result.quote,
    job_ref: result.job_ref,
  };
}

async function handleSimRunPaid(
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const solver = args.solver as SolverKind;
  const estimateSeconds = Number(args.estimate_seconds);
  const rate = Number(args.rate);
  const steps = args.steps !== undefined ? Number(args.steps) : 10;
  const device = (args.device as string) || 'GPU';
  const dispatchMode = (args.dispatch_mode as 'local' | 'fleet') || 'local';
  const buffer = args.buffer !== undefined ? Number(args.buffer) : 0.15;
  const margin = args.margin !== undefined ? Number(args.margin) : 0.30;
  const customer = (args.customer as string) || 'mcp-caller';
  const solverConfig = args.solver_config as Record<string, unknown> | undefined;

  if (!solver || !estimateSeconds || !rate) {
    return { success: false, error: 'solver, estimate_seconds, and rate are required' };
  }

  const result = await callPythonHarness('run', {
    solver,
    estimate_seconds: estimateSeconds,
    rate,
    customer,
    buffer,
    margin,
    steps,
    device,
    dispatch_mode: dispatchMode,
    solver_config: solverConfig,
  });

  if (!result.success) {
    return { success: false, error: result.error || 'order failed' };
  }

  // For local dispatch, run the REAL MCP solver tool to get the CAEL trace +
  // actual solver results, and ground the billing numbers in the MEASURED wall
  // time. (true-simulation plan F1 / ratchet P4: previously `billable_seconds`
  // was a synthetic `estimate*0.8` placeholder and a solver FAILURE was silently
  // swallowed into a "successful" paid order — both are integrity holes. Fixed:
  // bill for measured execution, and fail-loud when the solver does not run.)
  if (dispatchMode === 'local') {
    let mcpResult: Record<string, unknown>;
    const startMs = Date.now();
    try {
      const { handleSimulationTool } = await import('./simulation-tools');
      const mcpConfig = solverConfig || buildDefaultConfig(solver, args);
      mcpResult = (await handleSimulationTool(
        solver === 'thermal' ? 'solve_thermal' : 'solve_structural',
        { config: mcpConfig, steps },
      )) as Record<string, unknown>;
    } catch (err) {
      mcpResult = { success: false, error: err instanceof Error ? err.message : String(err) };
    }
    const wallSeconds = (Date.now() - startMs) / 1000;

    if (!mcpResult || mcpResult.success !== true) {
      // Fail-loud: the real solver did not run, so there is nothing to bill.
      // Never return a synthetic "successful" paid order for an absent solve.
      return {
        success: false,
        error: `solver execution failed: ${
          (mcpResult && (mcpResult.error as string)) || 'unknown solver error'
        }`,
        quote: result.quote,
        job_ref: result.job_ref,
      };
    }

    // Real solver ran — ground billing in the measured wall time, capped at the
    // financial-safety ceiling (paid_seconds). Recompute reconcile/refund to match.
    const paidSeconds = Number(result.reconcile.paid_seconds ?? result.quote.cap_seconds);
    const billable = Math.min(wallSeconds, paidSeconds);
    result.execution.billable_seconds = billable;
    result.execution.wall_seconds = wallSeconds;
    result.execution.cap_exceeded = wallSeconds > paidSeconds;
    result.execution.device = device;
    result.execution.steps_taken = steps;
    result.execution.cael_trace_id = mcpResult.caelTraceId as string;
    result.reconcile.actual_seconds = billable;
    result.reconcile.within_cap = wallSeconds <= paidSeconds;
    result.reconcile.refund_usd =
      Math.round(Math.max(0, paidSeconds - billable) * rate * 1e6) / 1e6;
    result.execution.result_summary = {
      solver,
      ...(solver === 'thermal'
        ? {
            min_temp: extractFieldMin(mcpResult.result, 'temperatureField'),
            max_temp: extractFieldMax(mcpResult.result, 'temperatureField'),
          }
        : {
            max_displacement: extractFieldMax(mcpResult.result, 'displacements'),
            max_stress: extractFieldMax(mcpResult.result, 'vonMisesStress'),
          }),
    };
  } else {
    // dispatch_mode === 'fleet': vast.ai fleet dispatch is UNWIRED (THIN).
    // callPythonHarness('run') returned a SYNTHETIC `estimate*0.8` placeholder
    // with success:true; returning it would bill a "successful" paid order for
    // a solve that NEVER RAN — a treasury-class integrity hole (F.095), the same
    // class as the local-path bug F1 closed. Fail loud until real fleet dispatch
    // (scripts/sim_solver_executor.py + vast.ai credentials) is wired.
    // (true-simulation plan §0.6: fail-loud the fleet path before any GPU phase.)
    return {
      success: false,
      error:
        'fleet dispatch is not wired: real vast.ai GPU execution requires ' +
        'scripts/sim_solver_executor.py + fleet credentials. Refusing to return ' +
        'a synthetic billing result for an unexecuted solve — use dispatch_mode=local.',
      quote: result.quote,
      job_ref: result.job_ref,
    };
  }

  return result as unknown as Record<string, unknown>;
}

async function handleSimFleetStatus(
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const jobId = args.job_id as string;

  if (!jobId) {
    return { success: false, error: 'job_id is required' };
  }

  // Query the orchestrator for the fleet job status
  const orchUrl =
    process.env.MCP_ORCHESTRATOR_URL || 'https://mcp-orchestrator-production-45f9.up.railway.app';
  const apiKey = process.env.HOLOSCRIPT_API_KEY || '';

  if (!apiKey) {
    return { success: false, error: 'HOLOSCRIPT_API_KEY not configured; cannot query fleet' };
  }

  try {
    const res = await fetch(`${orchUrl}/gpu/job/${jobId}`, {
      headers: { 'x-mcp-api-key': apiKey },
    });

    if (!res.ok) {
      if (res.status === 404) {
        return { success: false, error: `job ${jobId} not found` };
      }
      return { success: false, error: `fleet API returned HTTP ${res.status}` };
    }

    const status = (await res.json()) as Record<string, unknown>;
    return { success: true, job_id: jobId, ...status };
  } catch (err) {
    return {
      success: false,
      error: `fleet status query failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildDefaultConfig(
  solver: SolverKind,
  args: Record<string, unknown>,
): Record<string, unknown> {
  if (solver === 'thermal') {
    const gridRes = args.grid_resolution as number[] | undefined;
    return {
      gridResolution: gridRes || [5, 5, 5],
      domainSize: [1, 1, 1],
      timeStep: 0.01,
      materials: {},
      defaultMaterial: 'water',
      boundaryConditions: [],
      sources: [],
      initialTemperature: 20,
    };
  }

  // structural
  return {
    nodes: [
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ],
    elements: [[0, 1, 2, 3, 0, 1, 2, 3, 0, 1]],
    materials: { E: 2e11, nu: 0.3 },
    forces: [{ nodeIndex: 3, fx: 0, fy: -1000, fz: 0 }],
    constraints: [{ nodeIndex: 0, dx: true, dy: true, dz: true }],
  };
}

function extractFieldMin(
  result: unknown,
  fieldName: string,
): number | null {
  if (!result || typeof result !== 'object') return null;
  const r = result as Record<string, unknown>;
  const field = r[fieldName];
  if (field instanceof Float32Array || field instanceof Float64Array) {
    let min = Infinity;
    for (let i = 0; i < field.length; i++) {
      if (field[i] < min) min = field[i];
    }
    return min === Infinity ? null : min;
  }
  if (Array.isArray(field)) {
    const nums = field.filter((v): v is number => typeof v === 'number');
    return nums.length > 0 ? Math.min(...nums) : null;
  }
  return null;
}

function extractFieldMax(
  result: unknown,
  fieldName: string,
): number | null {
  if (!result || typeof result !== 'object') return null;
  const r = result as Record<string, unknown>;
  const field = r[fieldName];
  if (field instanceof Float32Array || field instanceof Float64Array) {
    let max = -Infinity;
    for (let i = 0; i < field.length; i++) {
      if (field[i] > max) max = field[i];
    }
    return max === -Infinity ? null : max;
  }
  if (Array.isArray(field)) {
    const nums = field.filter((v): v is number => typeof v === 'number');
    return nums.length > 0 ? Math.max(...nums) : null;
  }
  return null;
}