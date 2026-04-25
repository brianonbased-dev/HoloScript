import { describe, it, expect } from 'vitest';
import { loadIdentity, identityForLog } from '../identity.js';

const VALID_ENV: NodeJS.ProcessEnv = {
  HOLOSCRIPT_AGENT_HANDLE: 'security-auditor',
  HOLOSCRIPT_AGENT_PROVIDER: 'anthropic',
  HOLOSCRIPT_AGENT_MODEL: 'claude-opus-4-7',
  HOLOSCRIPT_AGENT_BRAIN: '/tmp/security-auditor-brain.hsplus',
  HOLOSCRIPT_AGENT_WALLET: '0x346126AbCdEf0123456789abcdef0123456789AB',
  HOLOSCRIPT_AGENT_X402_BEARER: 'x402-bearer-fake-44chars-aaaaaaaaaaaaaaaaaa',
  HOLOMESH_TEAM_ID: 'team_test',
};

describe('loadIdentity', () => {
  it('builds a full identity from valid env', () => {
    const id = loadIdentity(VALID_ENV);
    expect(id.handle).toBe('security-auditor');
    expect(id.llmProvider).toBe('anthropic');
    expect(id.llmModel).toBe('claude-opus-4-7');
    expect(id.budgetUsdPerDay).toBe(5);
    expect(id.meshApiBase).toBe('https://mcp.holoscript.net/api/holomesh');
    expect(id.surface).toBe('security-auditor');
  });

  it('rejects missing required fields', () => {
    const { HOLOSCRIPT_AGENT_HANDLE: _omit, ...partial } = VALID_ENV;
    expect(() => loadIdentity(partial)).toThrowError(/HOLOSCRIPT_AGENT_HANDLE/);
  });

  it('rejects unknown providers (Phase 2 lock — extending the set is a code change)', () => {
    expect(() => loadIdentity({ ...VALID_ENV, HOLOSCRIPT_AGENT_PROVIDER: 'qwen-cloud' })).toThrowError(
      /HOLOSCRIPT_AGENT_PROVIDER/
    );
  });

  it('rejects malformed wallets (W.087 vertex B identity discipline)', () => {
    expect(() => loadIdentity({ ...VALID_ENV, HOLOSCRIPT_AGENT_WALLET: 'not-a-wallet' })).toThrowError(
      /HOLOSCRIPT_AGENT_WALLET/
    );
    expect(() => loadIdentity({ ...VALID_ENV, HOLOSCRIPT_AGENT_WALLET: '0xshort' })).toThrowError();
  });

  it('accepts budget=0 as unlimited (cap removed per founder directive 2026-04-25)', () => {
    const id = loadIdentity({ ...VALID_ENV, HOLOSCRIPT_AGENT_BUDGET_USD_DAY: '0' });
    expect(id.budgetUsdPerDay).toBe(0);
  });

  it('rejects negative or non-numeric daily budgets', () => {
    expect(() => loadIdentity({ ...VALID_ENV, HOLOSCRIPT_AGENT_BUDGET_USD_DAY: '-5' })).toThrowError();
    expect(() => loadIdentity({ ...VALID_ENV, HOLOSCRIPT_AGENT_BUDGET_USD_DAY: 'abc' })).toThrowError();
  });

  it('redacts secrets in identityForLog', () => {
    const id = loadIdentity(VALID_ENV);
    const log = identityForLog(id);
    expect(String(log.bearer)).not.toContain(VALID_ENV.HOLOSCRIPT_AGENT_X402_BEARER);
    expect(String(log.wallet)).toContain('…');
  });
});
