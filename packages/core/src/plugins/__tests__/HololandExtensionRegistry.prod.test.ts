import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  HololandExtensionRegistry,
  getHololandRegistry,
} from '../../plugins/HololandExtensionRegistry';
import type {
  IWeatherProvider,
  IEventsProvider,
  IInventoryProvider,
  IAIProvider,
  IPaymentProcessor,
} from '../../plugins/HololandExtensionPoint';

// Reset singleton between tests
afterEach(() => {
  HololandExtensionRegistry.reset();
});

function makeWeather(id: string): IWeatherProvider {
  return {
    id,
    initialize: vi.fn().mockResolvedValue(undefined),
    fetchWeather: vi.fn().mockResolvedValue({}),
    subscribeToWeather: vi.fn().mockReturnValue(() => {}),
    dispose: vi.fn(),
  };
}

function makeEvents(id: string): IEventsProvider {
  return {
    id,
    initialize: vi.fn().mockResolvedValue(undefined),
    fetchEvents: vi.fn().mockResolvedValue([]),
    subscribeToEvents: vi.fn().mockReturnValue(() => {}),
    dispose: vi.fn(),
  };
}

function makeInventory(id: string): IInventoryProvider {
  return {
    id,
    initialize: vi.fn().mockResolvedValue(undefined),
    fetchInventory: vi.fn().mockResolvedValue({}),
    subscribeToInventory: vi.fn().mockReturnValue(() => {}),
    dispose: vi.fn(),
  };
}

function makeAI(id: string): IAIProvider {
  return {
    id,
    initialize: vi.fn().mockResolvedValue(undefined),
    generateNarrative: vi.fn().mockResolvedValue({ text: '' }),
    generateQuest: vi.fn().mockResolvedValue({ title: '' }),
    generateDialogue: vi.fn().mockResolvedValue([]),
    checkAvailability: vi.fn().mockResolvedValue(true),
    getUsageStats: vi.fn().mockReturnValue({ tokensUsed: 0, requestCount: 0 }),
    dispose: vi.fn(),
  };
}

function makePayment(id: string): IPaymentProcessor {
  return {
    id,
    initialize: vi.fn().mockResolvedValue(undefined),
    processPayment: vi.fn().mockResolvedValue({}),
    verifyPayment: vi.fn().mockResolvedValue({ valid: true, amount: 0, timestamp: 0 }),
    getPaymentHistory: vi.fn().mockResolvedValue([]),
    getTotalProcessed: vi.fn().mockReturnValue('0'),
    checkAvailability: vi.fn().mockResolvedValue(true),
    dispose: vi.fn(),
  };
}

describe('HololandExtensionRegistry — Production Tests', () => {
  let reg: HololandExtensionRegistry;

  beforeEach(() => {
    reg = HololandExtensionRegistry.getInstance();
  });

  describe('singleton', () => {
    it('getInstance returns same instance', () => {
      const a = HololandExtensionRegistry.getInstance();
      const b = HololandExtensionRegistry.getInstance();
      expect(a).toBe(b);
    });

    it('getHololandRegistry() returns the singleton', () => {
      expect(getHololandRegistry()).toBe(reg);
    });

    it('reset() creates fresh instance on next getInstance()', () => {
      const before = HololandExtensionRegistry.getInstance();
      before.registerWeatherProvider(makeWeather('w1'));
      HololandExtensionRegistry.reset();
      const after = HololandExtensionRegistry.getInstance();
      expect(after.getWeatherProviders().length).toBe(0);
    });
  });

  describe('Weather Providers', () => {
    it('registers and retrieves by id', () => {
      reg.registerWeatherProvider(makeWeather('openweather'));
      expect(reg.getWeatherProvider('openweather')).toBeDefined();
    });

    it('getWeatherProviders returns all', () => {
      reg.registerWeatherProvider(makeWeather('w1'));
      reg.registerWeatherProvider(makeWeather('w2'));
      expect(reg.getWeatherProviders().length).toBe(2);
    });

    it('unregister calls dispose and removes', () => {
      const p = makeWeather('w1');
      reg.registerWeatherProvider(p);
      reg.unregisterWeatherProvider('w1');
      expect(p.dispose).toHaveBeenCalledOnce();
      expect(reg.getWeatherProvider('w1')).toBeUndefined();
    });

    it('re-registration replaces existing provider', () => {
      reg.registerWeatherProvider(makeWeather('w1'));
      const p2 = makeWeather('w1');
      reg.registerWeatherProvider(p2);
      expect(reg.getWeatherProvider('w1')).toBe(p2);
    });

    it('unregister non-existent is a no-op', () => {
      expect(() => reg.unregisterWeatherProvider('ghost')).not.toThrow();
    });
  });

  describe('Events Providers', () => {
    it('registers and retrieves by id', () => {
      reg.registerEventsProvider(makeEvents('ticketmaster'));
      expect(reg.getEventsProvider('ticketmaster')).toBeDefined();
    });

    it('unregister calls dispose and removes', () => {
      const p = makeEvents('e1');
      reg.registerEventsProvider(p);
      reg.unregisterEventsProvider('e1');
      expect(p.dispose).toHaveBeenCalledOnce();
      expect(reg.getEventsProvider('e1')).toBeUndefined();
    });
  });

  describe('Inventory Providers', () => {
    it('registers and retrieves by id', () => {
      reg.registerInventoryProvider(makeInventory('shopify'));
      expect(reg.getInventoryProvider('shopify')).toBeDefined();
    });

    it('unregister calls dispose', () => {
      const p = makeInventory('i1');
      reg.registerInventoryProvider(p);
      reg.unregisterInventoryProvider('i1');
      expect(p.dispose).toHaveBeenCalledOnce();
    });
  });

  describe('AI Providers', () => {
    it('registers and retrieves by id', () => {
      reg.registerAIProvider(makeAI('openai'));
      expect(reg.getAIProvider('openai')).toBeDefined();
    });

    it('getAIProviders returns all', () => {
      reg.registerAIProvider(makeAI('a1'));
      reg.registerAIProvider(makeAI('a2'));
      expect(reg.getAIProviders().length).toBe(2);
    });

    it('unregister calls dispose and removes', () => {
      const p = makeAI('ai1');
      reg.registerAIProvider(p);
      reg.unregisterAIProvider('ai1');
      expect(p.dispose).toHaveBeenCalledOnce();
      expect(reg.getAIProvider('ai1')).toBeUndefined();
    });
  });

  describe('Payment Processors', () => {
    it('registers and retrieves by id', () => {
      reg.registerPaymentProcessor(makePayment('stripe'));
      expect(reg.getPaymentProcessor('stripe')).toBeDefined();
    });

    it('unregister calls dispose', () => {
      const p = makePayment('pay1');
      reg.registerPaymentProcessor(p);
      reg.unregisterPaymentProcessor('pay1');
      expect(p.dispose).toHaveBeenCalledOnce();
    });
  });

  describe('getTotalProviderCount() / getRegistrySummary()', () => {
    it('starts at zero', () => {
      expect(reg.getTotalProviderCount()).toBe(0);
    });

    it('counts across all categories', () => {
      reg.registerWeatherProvider(makeWeather('w'));
      reg.registerEventsProvider(makeEvents('e'));
      reg.registerAIProvider(makeAI('a'));
      expect(reg.getTotalProviderCount()).toBe(3);
    });

    it('getRegistrySummary returns correct breakdown', () => {
      reg.registerWeatherProvider(makeWeather('w'));
      reg.registerWeatherProvider(makeWeather('w2'));
      reg.registerPaymentProcessor(makePayment('p'));
      const summary = reg.getRegistrySummary();
      expect(summary.weather).toBe(2);
      expect(summary.payment).toBe(1);
      expect(summary.total).toBe(3);
    });
  });

  describe('disposeAll()', () => {
    it('calls dispose on all providers and clears maps', () => {
      const w = makeWeather('w');
      const ai = makeAI('ai');
      reg.registerWeatherProvider(w);
      reg.registerAIProvider(ai);
      reg.disposeAll();
      expect(w.dispose).toHaveBeenCalledOnce();
      expect(ai.dispose).toHaveBeenCalledOnce();
      expect(reg.getTotalProviderCount()).toBe(0);
    });
  });
});
