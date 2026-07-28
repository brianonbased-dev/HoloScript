import { describe, expect, it } from 'vitest';
import { AgentKitIntegration, type AgentKitOptions } from '../AgentKitIntegration.js';

function options(mode?: 'live' | 'simulation'): AgentKitOptions {
  return {
    network: 'base',
    tee_enabled: false,
    gasless: false,
    mode,
  };
}

describe('AgentKitIntegration public safety contract', () => {
  it('rejects simulated settlement from the default live mode', async () => {
    const integration = new AgentKitIntegration(options());
    await expect(integration.trade('agent', 'USDC', 'ETH', 1)).rejects.toThrow(
      'no audited live settlement implementation'
    );
  });

  it('labels explicitly enabled simulation results', async () => {
    const integration = new AgentKitIntegration(options('simulation'));
    const wallet = await integration.initializeAgentWallet({
      agent_id: 'agent',
      initial_balance: 0,
    });
    const trade = await integration.trade('agent', 'USDC', 'ETH', 1);
    const payment = await integration.pay_x402('agent', {
      endpoint: 'https://example.test',
      price: 1,
      asset: 'USDC',
    });

    expect(wallet.address).toMatch(/^0x[0-9a-f]{40}$/);
    expect(trade.simulated).toBe(true);
    expect(payment.content.simulated).toBe(true);
  });
});
