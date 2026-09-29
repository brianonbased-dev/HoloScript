import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadIdentity, identityForLog, VALID_PROVIDERS } from '../identity.js';

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
    expect(() =>
      loadIdentity({ ...VALID_ENV, HOLOSCRIPT_AGENT_PROVIDER: 'qwen-cloud' })
    ).toThrowError(/HOLOSCRIPT_AGENT_PROVIDER/);
  });

  it('accepts xAI and OpenRouter providers once they are explicitly wired', () => {
    expect(loadIdentity({ ...VALID_ENV, HOLOSCRIPT_AGENT_PROVIDER: 'xai' }).llmProvider).toBe(
      'xai'
    );
    expect(
      loadIdentity({ ...VALID_ENV, HOLOSCRIPT_AGENT_PROVIDER: 'openrouter' }).llmProvider
    ).toBe('openrouter');
  });

  it('accepts sovereign (README + deploy example both use it, and buildProvider wires it)', () => {
    expect(
      loadIdentity({ ...VALID_ENV, HOLOSCRIPT_AGENT_PROVIDER: 'sovereign' }).llmProvider
    ).toBe('sovereign');
  });

  it('rejects bitnet (nothing in this package wires it — it would pass validation and then throw "not yet wired" at boot)', () => {
    expect(() =>
      loadIdentity({ ...VALID_ENV, HOLOSCRIPT_AGENT_PROVIDER: 'bitnet' })
    ).toThrowError(/HOLOSCRIPT_AGENT_PROVIDER/);
  });

  it('rejects malformed wallets (W.087 vertex B identity discipline)', () => {
    expect(() =>
      loadIdentity({ ...VALID_ENV, HOLOSCRIPT_AGENT_WALLET: 'not-a-wallet' })
    ).toThrowError(/HOLOSCRIPT_AGENT_WALLET/);
    expect(() => loadIdentity({ ...VALID_ENV, HOLOSCRIPT_AGENT_WALLET: '0xshort' })).toThrowError();
  });

  it('accepts budget=0 as unlimited (cap removed per founder directive 2026-04-25)', () => {
    const id = loadIdentity({ ...VALID_ENV, HOLOSCRIPT_AGENT_BUDGET_USD_DAY: '0' });
    expect(id.budgetUsdPerDay).toBe(0);
  });

  it('rejects negative or non-numeric daily budgets', () => {
    expect(() =>
      loadIdentity({ ...VALID_ENV, HOLOSCRIPT_AGENT_BUDGET_USD_DAY: '-5' })
    ).toThrowError();
    expect(() =>
      loadIdentity({ ...VALID_ENV, HOLOSCRIPT_AGENT_BUDGET_USD_DAY: 'abc' })
    ).toThrowError();
  });

  it('redacts secrets in identityForLog', () => {
    const id = loadIdentity(VALID_ENV);
    const log = identityForLog(id);
    expect(String(log.bearer)).not.toContain(VALID_ENV.HOLOSCRIPT_AGENT_X402_BEARER);
    expect(String(log.wallet)).toContain('…');
  });
});

/**
 * Drift guard: VALID_PROVIDERS (this file) is the single source of truth
 * supervisor-config.ts imports instead of keeping its own copy. That fixed
 * one drift (both sets had 'bitnet', which neither switch wired) but does
 * nothing to stop a NEW one — someone could add a provider to VALID_PROVIDERS
 * without ever adding the case index.ts's two factories need to actually
 * construct it. This test reads index.ts as text and fails loudly if that
 * ever happens again, instead of a config validating fine and then throwing
 * "not yet wired" at boot (exactly what happened with 'bitnet').
 *
 * Textual scan rather than invoking the real factories: `buildProvider`'s and
 * `supervisorProviderFactory`'s 'sovereign' case calls
 * resolveSovereignProviderAsync(), which does real fleet/cloud/Ollama probing
 * — invoking it from a unit test would be slow and network-dependent. Scanning
 * source text for the `case '<provider>':` a switch must have is a direct,
 * side-effect-free check of the same fact.
 */
describe('VALID_PROVIDERS / provider-switch parity (index.ts)', () => {
  function sliceFunctionBody(src: string, functionNamePattern: RegExp): string {
    const m = functionNamePattern.exec(src);
    if (!m) {
      throw new Error(`could not find a function matching ${functionNamePattern} in index.ts`);
    }
    const braceStart = src.indexOf('{', m.index + m[0].length);
    let depth = 1;
    for (let i = braceStart + 1; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') {
        depth--;
        if (depth === 0) return src.slice(braceStart + 1, i);
      }
    }
    throw new Error(`unbalanced braces scanning ${functionNamePattern} in index.ts`);
  }

  it('every provider in VALID_PROVIDERS has a case in both buildProvider (CLI) and supervisorProviderFactory (supervise)', () => {
    const indexSrc = readFileSync(resolve(import.meta.dirname, '../index.ts'), 'utf8');
    const buildProviderBody = sliceFunctionBody(indexSrc, /function buildProvider\(/);
    const supervisorFactoryBody = sliceFunctionBody(indexSrc, /function supervisorProviderFactory\(/);

    for (const provider of VALID_PROVIDERS) {
      expect(buildProviderBody, `buildProvider has no case for "${provider}"`).toMatch(
        new RegExp(`case '${provider}':`)
      );
      expect(
        supervisorFactoryBody,
        `supervisorProviderFactory has no case for "${provider}"`
      ).toMatch(new RegExp(`case '${provider}':`));
    }
  });

  it('the shared set is exactly the 8 providers this runtime wires today (sovereign in, bitnet out)', () => {
    expect([...VALID_PROVIDERS].sort()).toEqual(
      ['anthropic', 'gemini', 'local-llm', 'mock', 'openai', 'openrouter', 'sovereign', 'xai'].sort()
    );
  });
});
