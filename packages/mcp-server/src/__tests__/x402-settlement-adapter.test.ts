import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  X402SettlementAdapter,
  createX402SettlementAdapterFromEnv,
  type X402SettlementMode,
} from '../x402-settlement-adapter';

const contract = {
  contractId: 'contract-1',
  payer: 'agent-1',
  amount: 25_000,
  resourceType: 'inference',
} as const;

describe('X402SettlementAdapter', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([
    ['disabled', 'no_x402_facilitator'],
    ['dry_run', 'dry_run'],
    ['mock', 'mock_payment'],
    ['live', 'live_unavailable'],
  ] as const)('%s mode performs zero network I/O', (mode, status) => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const result = new X402SettlementAdapter({ mode }).execute(contract);

    expect(result.status).toBe(status);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('preserves the legacy default no-facilitator response', () => {
    const result = new X402SettlementAdapter().execute(contract);

    expect(result).toMatchObject({
      success: false,
      status: 'no_x402_facilitator',
      amount: 25_000,
    });
  });

  it('preserves legacy mock fields while making its ID deterministic', () => {
    const adapter = new X402SettlementAdapter({ mode: 'mock' });
    const first = adapter.execute(contract);
    const second = adapter.execute(contract);

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      status: 'mock_payment',
      amount: 25_000,
      balanceRemaining: -1,
      provisioning: 'none',
    });
    expect('transactionId' in first ? first.transactionId : '').toMatch(/^mock-tx-[a-f0-9]{24}$/);
  });

  it('keeps invalid mode configuration fail-closed and offline', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const adapter = createX402SettlementAdapterFromEnv({
      X402_FACILITATOR_MODE: 'unsafe-mode',
    } as NodeJS.ProcessEnv);

    expect(adapter.execute(contract).status).toBe('invalid_configuration');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('keeps the legacy ALLOW_MOCK_X402 switch deterministic and offline', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const adapter = createX402SettlementAdapterFromEnv({
      ALLOW_MOCK_X402: '1',
    } as NodeJS.ProcessEnv);
    const first = adapter.execute(contract);
    const second = adapter.execute(contract);

    expect(first).toEqual(second);
    expect(first.status).toBe('mock_payment');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each(['disabled', 'dry_run', 'mock', 'live'] satisfies X402SettlementMode[])(
    'rejects invalid input in %s mode without network I/O',
    (mode) => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const result = new X402SettlementAdapter({ mode }).execute({ ...contract, amount: 0 });

      expect(result.status).toBe('invalid_request');
      expect(fetchSpy).not.toHaveBeenCalled();
    }
  );
});
