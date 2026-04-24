import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadSupervisorConfig, parseSupervisorConfig } from '../supervisor-config.js';

const VALID = {
  agents: [
    {
      handle: 'security-auditor',
      brainPath: 'compositions/security-auditor-brain.hsplus',
      provider: 'anthropic',
      model: 'claude-opus-4-7',
      walletEnvKey: 'WALLET_SEC',
      bearerEnvKey: 'BEARER_SEC',
      budgetUsdPerDay: 5,
      scopeTier: 'warm',
      enableCommitHook: true,
      outputDir: 'research/agent-out',
    },
    {
      handle: 'lean-theorist',
      brainPath: 'compositions/lean-theorist-brain.hsplus',
      provider: 'anthropic',
      model: 'claude-opus-4-7',
      walletEnvKey: 'WALLET_LEAN',
      bearerEnvKey: 'BEARER_LEAN',
      enabled: false,
    },
  ],
  globalBudgetUsdPerDay: 25,
  defaultTickIntervalMs: 60000,
};

describe('parseSupervisorConfig', () => {
  it('accepts a valid config and preserves all fields', () => {
    const cfg = parseSupervisorConfig(JSON.stringify(VALID));
    expect(cfg.agents).toHaveLength(2);
    expect(cfg.agents[0].handle).toBe('security-auditor');
    expect(cfg.agents[0].provider).toBe('anthropic');
    expect(cfg.agents[0].budgetUsdPerDay).toBe(5);
    expect(cfg.agents[0].enableCommitHook).toBe(true);
    expect(cfg.agents[1].enabled).toBe(false);
    expect(cfg.globalBudgetUsdPerDay).toBe(25);
    expect(cfg.defaultTickIntervalMs).toBe(60000);
  });

  it('rejects empty agents array (supervisor with zero agents is meaningless)', () => {
    expect(() =>
      parseSupervisorConfig(JSON.stringify({ ...VALID, agents: [] }))
    ).toThrowError(/at least one entry/);
  });

  it('rejects duplicate handles (each agent must have a distinct identity)', () => {
    const dup = {
      agents: [VALID.agents[0], { ...VALID.agents[1], handle: 'security-auditor' }],
    };
    expect(() => parseSupervisorConfig(JSON.stringify(dup))).toThrowError(/Duplicate agent handle/);
  });

  it('rejects shell-injection-vector handles', () => {
    const bad = { agents: [{ ...VALID.agents[0], handle: 'bad; rm -rf /' }] };
    expect(() => parseSupervisorConfig(JSON.stringify(bad))).toThrowError(/handle/);
  });

  it('rejects unknown providers (Phase 2 lock — extending the set is a code change)', () => {
    const bad = { agents: [{ ...VALID.agents[0], provider: 'qwen-cloud' }] };
    expect(() => parseSupervisorConfig(JSON.stringify(bad))).toThrowError(/provider/);
  });

  it('rejects sub-5s tick intervals (mesh-friendly floor)', () => {
    const fast = { ...VALID, defaultTickIntervalMs: 1000 };
    expect(() => parseSupervisorConfig(JSON.stringify(fast))).toThrowError(/>= 5000/);
    const fastAgent = { agents: [{ ...VALID.agents[0], tickIntervalMs: 1000 }] };
    expect(() => parseSupervisorConfig(JSON.stringify(fastAgent))).toThrowError(/>= 5000/);
  });

  it('rejects non-positive budgets (founder ruling Q1 hard-kill ceiling)', () => {
    expect(() =>
      parseSupervisorConfig(JSON.stringify({ ...VALID, globalBudgetUsdPerDay: 0 }))
    ).toThrowError(/positive/);
    expect(() =>
      parseSupervisorConfig(JSON.stringify({ agents: [{ ...VALID.agents[0], budgetUsdPerDay: -1 }] }))
    ).toThrowError(/positive/);
  });

  it('requires brainPath / walletEnvKey / bearerEnvKey on every agent', () => {
    const { brainPath: _brain, ...noBrain } = VALID.agents[0];
    expect(() => parseSupervisorConfig(JSON.stringify({ agents: [noBrain] }))).toThrowError(/brainPath/);
    const { walletEnvKey: _w, ...noWallet } = VALID.agents[0];
    expect(() => parseSupervisorConfig(JSON.stringify({ agents: [noWallet] }))).toThrowError(/walletEnvKey/);
    const { bearerEnvKey: _b, ...noBearer } = VALID.agents[0];
    expect(() => parseSupervisorConfig(JSON.stringify({ agents: [noBearer] }))).toThrowError(/bearerEnvKey/);
  });

  it('loadSupervisorConfig reads and parses a file path', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sup-cfg-'));
    const path = join(dir, 'agents.json');
    writeFileSync(path, JSON.stringify(VALID), 'utf8');
    const cfg = loadSupervisorConfig(path);
    expect(cfg.agents).toHaveLength(2);
  });
});
