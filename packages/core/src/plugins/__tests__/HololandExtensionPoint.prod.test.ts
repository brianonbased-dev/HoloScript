/**
 * HololandExtensionPoint — Base Provider Production Tests
 *
 * Tests the concrete behavior of BaseWeatherProvider, BaseAIProvider,
 * and BasePaymentProcessor from HololandExtensionPoint.ts.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  BaseWeatherProvider,
  BaseAIProvider,
  BasePaymentProcessor,
  VRRSyncProviderConfig,
  AIProviderConfig,
  PaymentProcessorConfig,
} from '../../plugins/HololandExtensionPoint';
import type { WeatherData, AIGeneratedNarrative, AIGeneratedQuest, PaymentRequest, PaymentReceipt } from '../../plugins/HololandTypes';

// =============================================================================
// CONCRETE IMPLEMENTATIONS FOR TESTING
// =============================================================================

class TestWeatherProvider extends BaseWeatherProvider {
  readonly id = 'test-weather';
  fetchWeather = vi.fn().mockResolvedValue({ temperature: 22, condition: 'sunny' } as any);
}

class TestAIProvider extends BaseAIProvider {
  readonly id = 'test-ai';
  generateNarrative = vi.fn().mockResolvedValue({ text: 'Once upon a time...' } as AIGeneratedNarrative);
  generateQuest = vi.fn().mockResolvedValue({ title: 'Mighty Quest' } as AIGeneratedQuest);
  checkAvailability = vi.fn().mockResolvedValue(true);
  // exposes protected updateStats for testing
  public callUpdateStats(tokens: number, cost?: number) {
    this.updateStats(tokens, cost);
  }
}

class TestPaymentProcessor extends BasePaymentProcessor {
  readonly id = 'test-payment';
  processPayment = vi.fn().mockResolvedValue({ txHash: 'abc', amount: 100n, timestamp: Date.now() } as any);
  verifyPayment = vi.fn().mockResolvedValue({ valid: true, amount: 100, timestamp: Date.now() });
  checkAvailability = vi.fn().mockResolvedValue(true);
  // exposes protected recordPayment
  public addPayment(receipt: PaymentReceipt) {
    this.recordPayment(receipt);
  }
}

// =============================================================================
// WEATHER PROVIDER
// =============================================================================

describe('BaseWeatherProvider — Production Tests', () => {
  let provider: TestWeatherProvider;
  const config: VRRSyncProviderConfig = { providerId: 'test', displayName: 'Test' };

  beforeEach(() => {
    provider = new TestWeatherProvider();
  });

  it('id is set correctly', () => {
    expect(provider.id).toBe('test-weather');
  });

  it('initialize stores config', async () => {
    await provider.initialize(config);
    // config stored — verify by checking no error thrown
    await expect(provider.initialize(config)).resolves.toBeUndefined();
  });

  it('subscribeToWeather returns unsubscribe function', () => {
    const cb = vi.fn();
    const unsub = provider.subscribeToWeather('Seattle', cb);
    expect(typeof unsub).toBe('function');
  });

  it('subscription callback receives notifications', () => {
    const cb = vi.fn();
    provider.subscribeToWeather('Seattle', cb);
    // Trigger notification via protected method by subclassing
    (provider as any).notifySubscribers('Seattle', { temperature: 20 } as any);
    expect(cb).toHaveBeenCalledWith({ temperature: 20 });
  });

  it('multiple subscribers for same location all receive notification', () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    provider.subscribeToWeather('NYC', cb1);
    provider.subscribeToWeather('NYC', cb2);
    (provider as any).notifySubscribers('NYC', { temperature: 5 } as any);
    expect(cb1).toHaveBeenCalled();
    expect(cb2).toHaveBeenCalled();
  });

  it('unsubscribe prevents further callbacks', () => {
    const cb = vi.fn();
    const unsub = provider.subscribeToWeather('LA', cb);
    unsub();
    (provider as any).notifySubscribers('LA', { temperature: 30 } as any);
    expect(cb).not.toHaveBeenCalled();
  });

  it('notifySubscribers for different location does not invoke callback', () => {
    const cb = vi.fn();
    provider.subscribeToWeather('NYC', cb);
    (provider as any).notifySubscribers('Paris', { temperature: 18 } as any);
    expect(cb).not.toHaveBeenCalled();
  });

  it('dispose clears all subscriptions', () => {
    const cb = vi.fn();
    provider.subscribeToWeather('Tokyo', cb);
    provider.dispose();
    (provider as any).notifySubscribers('Tokyo', {} as any);
    expect(cb).not.toHaveBeenCalled();
  });
});

// =============================================================================
// AI PROVIDER
// =============================================================================

describe('BaseAIProvider — Production Tests', () => {
  let provider: TestAIProvider;
  const config: AIProviderConfig = { providerId: 'gpt4', displayName: 'GPT-4', model: 'gpt-4o' };

  beforeEach(() => {
    provider = new TestAIProvider();
  });

  it('id is set correctly', () => {
    expect(provider.id).toBe('test-ai');
  });

  it('initialize stores config without error', async () => {
    await expect(provider.initialize(config)).resolves.toBeUndefined();
  });

  it('getUsageStats starts at zero', () => {
    const stats = provider.getUsageStats();
    expect(stats.tokensUsed).toBe(0);
    expect(stats.requestCount).toBe(0);
  });

  it('updateStats accumulates tokens and requestCount', () => {
    provider.callUpdateStats(100);
    provider.callUpdateStats(200);
    const stats = provider.getUsageStats();
    expect(stats.tokensUsed).toBe(300);
    expect(stats.requestCount).toBe(2);
  });

  it('updateStats accumulates estimated cost', () => {
    provider.callUpdateStats(100, 0.01);
    provider.callUpdateStats(50, 0.005);
    expect(provider.getUsageStats().estimatedCost).toBeCloseTo(0.015);
  });

  it('getUsageStats returns a copy (not mutate internal)', () => {
    provider.callUpdateStats(50);
    const stats = provider.getUsageStats();
    stats.tokensUsed = 9999;
    expect(provider.getUsageStats().tokensUsed).toBe(50);
  });

  it('dispose resets stats to zero', () => {
    provider.callUpdateStats(500, 1.0);
    provider.dispose();
    const stats = provider.getUsageStats();
    expect(stats.tokensUsed).toBe(0);
    expect(stats.requestCount).toBe(0);
  });

  it('generateDialogue delegates to generateNarrative and splits lines', async () => {
    provider.generateNarrative.mockResolvedValueOnce({ text: 'Hello there.\nHow are you?\nFarewell.' } as AIGeneratedNarrative);
    const lines = await provider.generateDialogue('Bob', 'gruff', 'barkeep setting');
    expect(lines).toEqual(['Hello there.', 'How are you?', 'Farewell.']);
  });

  it('generateDialogue filters empty lines', async () => {
    provider.generateNarrative.mockResolvedValueOnce({ text: 'Line one.\n\n\nLine two.' } as AIGeneratedNarrative);
    const lines = await provider.generateDialogue('X', 'Y', 'Z');
    expect(lines).toHaveLength(2);
  });
});

// =============================================================================
// PAYMENT PROCESSOR
// =============================================================================

describe('BasePaymentProcessor — Production Tests', () => {
  let processor: TestPaymentProcessor;
  const config: PaymentProcessorConfig = { processorId: 'stripe', displayName: 'Stripe' };

  function makeReceipt(amount: bigint, timestamp: number): PaymentReceipt {
    return { txHash: `tx-${timestamp}`, amount, timestamp } as any;
  }

  beforeEach(() => {
    processor = new TestPaymentProcessor();
  });

  it('id is set correctly', () => {
    expect(processor.id).toBe('test-payment');
  });

  it('initialize resolves without error', async () => {
    await expect(processor.initialize(config)).resolves.toBeUndefined();
  });

  it('getTotalProcessed returns "0" when empty', () => {
    expect(processor.getTotalProcessed()).toBe('0');
  });

  it('getTotalProcessed sums all payment amounts', () => {
    processor.addPayment(makeReceipt(100n, 1000));
    processor.addPayment(makeReceipt(250n, 2000));
    expect(processor.getTotalProcessed()).toBe('350');
  });

  it('getPaymentHistory returns all records when no options', async () => {
    processor.addPayment(makeReceipt(10n, 1000));
    processor.addPayment(makeReceipt(20n, 2000));
    const history = await processor.getPaymentHistory();
    expect(history).toHaveLength(2);
  });

  it('getPaymentHistory filters by startDate', async () => {
    processor.addPayment(makeReceipt(10n, 1000));
    processor.addPayment(makeReceipt(20n, 5000));
    const history = await processor.getPaymentHistory({ startDate: 3000 });
    expect(history).toHaveLength(1);
    expect(history[0].timestamp).toBe(5000);
  });

  it('getPaymentHistory filters by endDate', async () => {
    processor.addPayment(makeReceipt(10n, 1000));
    processor.addPayment(makeReceipt(20n, 5000));
    const history = await processor.getPaymentHistory({ endDate: 3000 });
    expect(history).toHaveLength(1);
    expect(history[0].timestamp).toBe(1000);
  });

  it('getPaymentHistory limits by maxResults (last N)', async () => {
    processor.addPayment(makeReceipt(1n, 1000));
    processor.addPayment(makeReceipt(2n, 2000));
    processor.addPayment(makeReceipt(3n, 3000));
    const history = await processor.getPaymentHistory({ maxResults: 2 });
    expect(history).toHaveLength(2);
    expect(history[1].timestamp).toBe(3000); // last 2
  });

  it('dispose clears payment history', () => {
    processor.addPayment(makeReceipt(100n, 1000));
    processor.dispose();
    expect(processor.getTotalProcessed()).toBe('0');
  });
});
