import { describe, expect, it } from 'vitest';

import { simulationBillingTools } from '../simulation-billing-tools';
import { handleSimulationBillingTool } from '../simulation-billing-tools';

describe('simulation billing tools', () => {
  it('exports 3 tools: sim_quote, sim_run_paid, sim_fleet_status', () => {
    const names = simulationBillingTools.map((t) => t.name);
    expect(names).toContain('sim_quote');
    expect(names).toContain('sim_run_paid');
    expect(names).toContain('sim_fleet_status');
    expect(names).toHaveLength(3);
  });

  it('sim_quote tool has required input schema properties', () => {
    const tool = simulationBillingTools.find((t) => t.name === 'sim_quote');
    expect(tool).toBeDefined();
    const props = (tool?.inputSchema as { properties: Record<string, unknown> }).properties;
    expect(props).toHaveProperty('solver');
    expect(props).toHaveProperty('estimate_seconds');
    expect(props).toHaveProperty('rate');
  });

  it('sim_run_paid tool has required input schema properties', () => {
    const tool = simulationBillingTools.find((t) => t.name === 'sim_run_paid');
    expect(tool).toBeDefined();
    const props = (tool?.inputSchema as { properties: Record<string, unknown> }).properties;
    expect(props).toHaveProperty('solver');
    expect(props).toHaveProperty('estimate_seconds');
    expect(props).toHaveProperty('rate');
    expect(props).toHaveProperty('dispatch_mode');
  });

  it('sim_quote returns a quote with correct fields', async () => {
    const result = (await handleSimulationBillingTool('sim_quote', {
      solver: 'thermal',
      estimate_seconds: 5,
      rate: 0.0001,
    })) as Record<string, unknown>;

    expect(result.success).toBe(true);
    const quote = result.quote as Record<string, unknown>;
    expect(quote.estimate_seconds).toBe(5);
    expect(quote.cap_seconds).toBe(6); // ceil(5 * 1.15)
    expect(quote.rate_usd_per_sec).toBe(0.0001);
    expect(typeof quote.price_usd).toBe('number');
    expect(typeof quote.price_credits).toBe('number');
  });

  it('sim_quote rejects missing required fields', async () => {
    const result = (await handleSimulationBillingTool('sim_quote', {
      solver: 'thermal',
      // missing estimate_seconds and rate
    })) as Record<string, unknown>;

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('sim_run_paid returns an order result with billing fields', async () => {
    const result = (await handleSimulationBillingTool('sim_run_paid', {
      solver: 'thermal',
      estimate_seconds: 5,
      rate: 0.0001,
      steps: 10,
      device: 'GPU',
    })) as Record<string, unknown>;

    expect(result.success).toBe(true);
    expect(result.job_ref).toBeDefined();
    expect(result.quote).toBeDefined();
    expect(result.charge).toBeDefined();
    expect(result.execution).toBeDefined();
    expect(result.reconcile).toBeDefined();
    expect(result.refund).toBeDefined();

    const exec = result.execution as Record<string, unknown>;
    expect(exec.solver_type).toBe('thermal');
    // F1 integrity: billing is grounded in a REAL solver run — a CAEL trace id is
    // present and wall time is a measured number, not the old estimate*0.8 placeholder.
    expect(exec.cael_trace_id).toBeDefined();
    expect(typeof exec.wall_seconds).toBe('number');
    const reconcile = result.reconcile as Record<string, unknown>;
    expect(typeof reconcile.actual_seconds).toBe('number');
  });

  it('sim_run_paid fails loud when the real solver cannot run (no synthetic success)', async () => {
    // A structurally-invalid config (empty mesh) must make the real solver fail —
    // and the paid order must NOT return a synthetic "success". Closes ratchet-P4.
    const result = (await handleSimulationBillingTool('sim_run_paid', {
      solver: 'structural',
      estimate_seconds: 5,
      rate: 0.0001,
      solver_config: { nodes: [], elements: [], materials: { E: 2e11, nu: 0.3 } },
    })) as Record<string, unknown>;

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(String(result.error)).toContain('solver execution failed');
  });

  it('sim_fleet_status rejects missing job_id', async () => {
    const result = (await handleSimulationBillingTool('sim_fleet_status', {})) as Record<
      string,
      unknown
    >;

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('returns null for unknown tool name', async () => {
    const result = await handleSimulationBillingTool('unknown_tool', {});
    expect(result).toBeNull();
  });

  it('sim_quote with fleet dispatch returns vast-gpu backend', async () => {
    const result = (await handleSimulationBillingTool('sim_quote', {
      solver: 'thermal',
      estimate_seconds: 10,
      rate: 0.0002,
      dispatch_mode: 'fleet',
    })) as Record<string, unknown>;

    expect(result.success).toBe(true);
    const quote = result.quote as Record<string, unknown>;
    expect(quote.backend).toBe('vast-gpu');
  });

  it('sim_quote with local dispatch returns holoscript-gpu backend', async () => {
    const result = (await handleSimulationBillingTool('sim_quote', {
      solver: 'thermal',
      estimate_seconds: 10,
      rate: 0.0002,
      dispatch_mode: 'local',
    })) as Record<string, unknown>;

    expect(result.success).toBe(true);
    const quote = result.quote as Record<string, unknown>;
    expect(quote.backend).toBe('holoscript-gpu');
  });

  it('cap_seconds equals ceil(estimate * (1 + buffer))', async () => {
    // With default buffer=0.15: ceil(10 * 1.15) = ceil(11.5) = 12
    const result = (await handleSimulationBillingTool('sim_quote', {
      solver: 'structural',
      estimate_seconds: 10,
      rate: 0.0001,
    })) as Record<string, unknown>;

    const quote = result.quote as Record<string, unknown>;
    expect(quote.cap_seconds).toBe(12);
  });

  it('price includes margin markup', async () => {
    // cap=12, rate=0.0001, margin=0.30
    // price_usd = 12 * 0.0001 * (1 + 0.30) = 12 * 0.0001 * 1.3 = 0.00156
    const result = (await handleSimulationBillingTool('sim_quote', {
      solver: 'thermal',
      estimate_seconds: 10,
      rate: 0.0001,
      margin: 0.30,
    })) as Record<string, unknown>;

    const quote = result.quote as Record<string, unknown>;
    expect(quote.price_usd).toBeCloseTo(0.00156, 5);
  });
});