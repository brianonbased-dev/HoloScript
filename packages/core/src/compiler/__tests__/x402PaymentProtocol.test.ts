import { describe, it, expect } from 'vitest';
import {
  compilePaymentBlock,
  paymentToUnity,
  paymentToGodot,
  paymentToVRChat,
  paymentToR3F,
  paymentToUSDA,
} from '../DomainBlockCompilerMixin';
import type { HoloDomainBlock } from '../../parser/HoloCompositionTypes';

function makePaymentBlock(overrides: Partial<HoloDomainBlock> = {}): HoloDomainBlock {
  return {
    type: 'DomainBlock',
    domain: 'payment',
    keyword: 'paywall',
    name: 'PremiumGate',
    traits: ['x402_paywall'],
    properties: {
      price: 5.0,
      asset: 'USDC',
      network: 'base',
      recipient: '0xCreatorWallet123',
    },
    children: [],
    ...overrides,
  } as HoloDomainBlock;
}

describe('x402 Payment Protocol', () => {
  // =========== compilePaymentBlock ===========

  it('extracts price, asset, and network from properties', () => {
    const block = makePaymentBlock({
      properties: {
        price: 9.99,
        asset: 'ETH',
        network: 'ethereum',
        recipient: '0xABC',
      },
    });
    const compiled = compilePaymentBlock(block);
    expect(compiled.name).toBe('PremiumGate');
    expect(compiled.price).toBe(9.99);
    expect(compiled.asset).toBe('ETH');
    expect(compiled.network).toBe('ethereum');
    expect(compiled.recipient).toBe('0xABC');
    expect(compiled.type).toBe('one_time');
  });

  it('defaults to USDC on Base for unspecified fields', () => {
    const block = makePaymentBlock({
      properties: { price: 1 },
    });
    const compiled = compilePaymentBlock(block);
    expect(compiled.asset).toBe('USDC');
    expect(compiled.network).toBe('base');
    expect(compiled.price).toBe(1);
    expect(compiled.type).toBe('one_time');
  });

  it('extracts gated content list from properties', () => {
    const block = makePaymentBlock({
      properties: {
        price: 5,
        gated_content: ['PremiumStage', 'VIPLounge', 'BonusLevel'],
      },
    });
    const compiled = compilePaymentBlock(block);
    expect(compiled.gatedContent).toEqual(['PremiumStage', 'VIPLounge', 'BonusLevel']);
  });

  it('extracts gated content from children', () => {
    const block = makePaymentBlock({
      children: [
        {
          type: 'DomainBlock',
          name: 'PremiumRoom',
          keyword: 'object',
          properties: {},
          children: [],
          traits: [],
        },
        {
          type: 'DomainBlock',
          name: 'SecretArea',
          keyword: 'object',
          properties: {},
          children: [],
          traits: [],
        },
      ] as any,
    });
    const compiled = compilePaymentBlock(block);
    expect(compiled.gatedContent).toEqual(['PremiumRoom', 'SecretArea']);
  });

  it('extracts revenue split configuration', () => {
    const block = makePaymentBlock({
      properties: {
        price: 20,
        revenue_split: { creator: 70, platform: 20, agent: 10 },
      },
    });
    const compiled = compilePaymentBlock(block);
    expect(compiled.revenueSplit).toEqual({ creator: 70, platform: 20, agent: 10 });
  });

  it('sets subscription type from keyword', () => {
    const block = makePaymentBlock({
      keyword: 'subscription',
      properties: { price: 9.99 },
    });
    const compiled = compilePaymentBlock(block);
    expect(compiled.type).toBe('subscription');
  });

  it('sets tip type from tip_jar keyword', () => {
    const block = makePaymentBlock({
      keyword: 'tip_jar',
      properties: { price: 0 },
    });
    const compiled = compilePaymentBlock(block);
    expect(compiled.type).toBe('tip');
  });

  it('returns sensible defaults for empty paywall', () => {
    const block = makePaymentBlock({
      name: '',
      properties: {},
    });
    const compiled = compilePaymentBlock(block);
    expect(compiled.name).toBe('unnamed');
    expect(compiled.price).toBe(0);
    expect(compiled.asset).toBe('USDC');
    expect(compiled.network).toBe('base');
    expect(compiled.type).toBe('one_time');
    expect(compiled.gatedContent).toBeUndefined();
    expect(compiled.revenueSplit).toBeUndefined();
  });

  // =========== paymentToUnity ===========

  it('generates C# ScriptableObject code', () => {
    const compiled = compilePaymentBlock(makePaymentBlock());
    const code = paymentToUnity(compiled);
    expect(code).toContain('CreateAssetMenu');
    expect(code).toContain('ScriptableObject');
    expect(code).toContain('PremiumGatePaywall');
    expect(code).toContain('price = 5m');
    expect(code).toContain('"USDC"');
    expect(code).toContain('"base"');
    expect(code).toContain('0xCreatorWallet123');
    expect(code).toContain('RequestPayment');
  });

  // =========== paymentToGodot ===========

  it('generates GDScript with payment signals', () => {
    const compiled = compilePaymentBlock(makePaymentBlock());
    const code = paymentToGodot(compiled);
    expect(code).toContain('extends Node');
    expect(code).toContain('signal payment_required');
    expect(code).toContain('signal payment_verified');
    expect(code).toContain('signal access_granted');
    expect(code).toContain('var price: float = 5');
    expect(code).toContain('func request_payment');
    expect(code).toContain('func verify_payment');
  });

  // =========== paymentToVRChat ===========

  it('generates UdonSharp with synced unlock state', () => {
    const compiled = compilePaymentBlock(makePaymentBlock());
    const code = paymentToVRChat(compiled);
    expect(code).toContain('UdonSharpBehaviour');
    expect(code).toContain('[UdonSynced] public bool isUnlocked');
    expect(code).toContain('BehaviourSyncMode.Manual');
    expect(code).toContain('hololand.app/pay/PremiumGate');
    expect(code).toContain('"USDC"');
    expect(code).toContain('Interact()');
  });

  // =========== paymentToR3F ===========

  it('generates React payment gate config', () => {
    const compiled = compilePaymentBlock(
      makePaymentBlock({
        properties: {
          price: 5,
          asset: 'USDC',
          network: 'base',
          recipient: '0xCreatorWallet123',
          description: 'Access premium content',
          gated_content: ['PremiumStage'],
          revenue_split: { creator: 80, platform: 10, agent: 10 },
        },
      })
    );
    const code = paymentToR3F(compiled);
    expect(code).toContain('PremiumGatePaywallConfig');
    expect(code).toContain('price: 5');
    expect(code).toContain('"USDC"');
    expect(code).toContain('"base"');
    expect(code).toContain('gatedContent:');
    expect(code).toContain('"PremiumStage"');
    expect(code).toContain('revenueSplit:');
    expect(code).toContain('creator: 80');
  });

  // =========== paymentToUSDA ===========

  it('generates USD customData annotations', () => {
    const compiled = compilePaymentBlock(
      makePaymentBlock({
        properties: {
          price: 5,
          asset: 'USDC',
          network: 'base',
          recipient: '0xCreatorWallet123',
        },
      })
    );
    const usda = paymentToUSDA(compiled);
    expect(usda).toContain('def Scope "Paywall_PremiumGate"');
    expect(usda).toContain('holoscript:paywallType = "one_time"');
    expect(usda).toContain('holoscript:price = 5');
    expect(usda).toContain('holoscript:asset = "USDC"');
    expect(usda).toContain('holoscript:network = "base"');
    expect(usda).toContain('holoscript:recipient = "0xCreatorWallet123"');
  });
});
