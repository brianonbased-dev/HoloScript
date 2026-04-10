/**
 * HololandExtensionRegistry — Central registry for Hololand extension providers
 *
 * Manages registration and retrieval of custom VRR sync providers,
 * AI providers, and payment processors.
 *
 * @version 1.0.0
 */

import type {
  IHololandExtensionRegistry,
  IWeatherProvider,
  IEventsProvider,
  IInventoryProvider,
  IAIProvider,
  IPaymentProcessor,
} from './HololandExtensionPoint';

/**
 * Singleton registry for Hololand extension providers
 */
export class HololandExtensionRegistry implements IHololandExtensionRegistry {
  private static instance: HololandExtensionRegistry;

  private weatherProviders: Map<string, IWeatherProvider> = new Map();
  private eventsProviders: Map<string, IEventsProvider> = new Map();
  private inventoryProviders: Map<string, IInventoryProvider> = new Map();
  private aiProviders: Map<string, IAIProvider> = new Map();
  private paymentProcessors: Map<string, IPaymentProcessor> = new Map();

  private constructor() {}

  /**
   * Get the singleton instance
   */
  static getInstance(): HololandExtensionRegistry {
    if (!HololandExtensionRegistry.instance) {
      HololandExtensionRegistry.instance = new HololandExtensionRegistry();
    }
    return HololandExtensionRegistry.instance;
  }

  // =========================================================================
  // WEATHER PROVIDERS
  // =========================================================================

  registerWeatherProvider(provider: IWeatherProvider): void {
    if (this.weatherProviders.has(provider.id)) {
      console.warn(
        `[HololandRegistry] Weather provider '${provider.id}' already registered. Replacing.`
      );
    }
    this.weatherProviders.set(provider.id, provider);
  }

  getWeatherProviders(): IWeatherProvider[] {
    return Array.from(this.weatherProviders.values());
  }

  getWeatherProvider(id: string): IWeatherProvider | undefined {
    return this.weatherProviders.get(id);
  }

  unregisterWeatherProvider(id: string): void {
    const provider = this.weatherProviders.get(id);
    if (provider) {
      provider.dispose();
      this.weatherProviders.delete(id);
    }
  }

  // =========================================================================
  // EVENTS PROVIDERS
  // =========================================================================

  registerEventsProvider(provider: IEventsProvider): void {
    if (this.eventsProviders.has(provider.id)) {
      console.warn(
        `[HololandRegistry] Events provider '${provider.id}' already registered. Replacing.`
      );
    }
    this.eventsProviders.set(provider.id, provider);
  }

  getEventsProviders(): IEventsProvider[] {
    return Array.from(this.eventsProviders.values());
  }

  getEventsProvider(id: string): IEventsProvider | undefined {
    return this.eventsProviders.get(id);
  }

  unregisterEventsProvider(id: string): void {
    const provider = this.eventsProviders.get(id);
    if (provider) {
      provider.dispose();
      this.eventsProviders.delete(id);
    }
  }

  // =========================================================================
  // INVENTORY PROVIDERS
  // =========================================================================

  registerInventoryProvider(provider: IInventoryProvider): void {
    if (this.inventoryProviders.has(provider.id)) {
      console.warn(
        `[HololandRegistry] Inventory provider '${provider.id}' already registered. Replacing.`
      );
    }
    this.inventoryProviders.set(provider.id, provider);
  }

  getInventoryProviders(): IInventoryProvider[] {
    return Array.from(this.inventoryProviders.values());
  }

  getInventoryProvider(id: string): IInventoryProvider | undefined {
    return this.inventoryProviders.get(id);
  }

  unregisterInventoryProvider(id: string): void {
    const provider = this.inventoryProviders.get(id);
    if (provider) {
      provider.dispose();
      this.inventoryProviders.delete(id);
    }
  }

  // =========================================================================
  // AI PROVIDERS
  // =========================================================================

  registerAIProvider(provider: IAIProvider): void {
    if (this.aiProviders.has(provider.id)) {
      console.warn(
        `[HololandRegistry] AI provider '${provider.id}' already registered. Replacing.`
      );
    }
    this.aiProviders.set(provider.id, provider);
  }

  getAIProviders(): IAIProvider[] {
    return Array.from(this.aiProviders.values());
  }

  getAIProvider(id: string): IAIProvider | undefined {
    return this.aiProviders.get(id);
  }

  unregisterAIProvider(id: string): void {
    const provider = this.aiProviders.get(id);
    if (provider) {
      provider.dispose();
      this.aiProviders.delete(id);
    }
  }

  // =========================================================================
  // PAYMENT PROCESSORS
  // =========================================================================

  registerPaymentProcessor(processor: IPaymentProcessor): void {
    if (this.paymentProcessors.has(processor.id)) {
      console.warn(
        `[HololandRegistry] Payment processor '${processor.id}' already registered. Replacing.`
      );
    }
    this.paymentProcessors.set(processor.id, processor);
  }

  getPaymentProcessors(): IPaymentProcessor[] {
    return Array.from(this.paymentProcessors.values());
  }

  getPaymentProcessor(id: string): IPaymentProcessor | undefined {
    return this.paymentProcessors.get(id);
  }

  unregisterPaymentProcessor(id: string): void {
    const processor = this.paymentProcessors.get(id);
    if (processor) {
      processor.dispose();
      this.paymentProcessors.delete(id);
    }
  }

  // =========================================================================
  // UTILITY METHODS
  // =========================================================================

  /**
   * Get total count of all registered providers
   */
  getTotalProviderCount(): number {
    return (
      this.weatherProviders.size +
      this.eventsProviders.size +
      this.inventoryProviders.size +
      this.aiProviders.size +
      this.paymentProcessors.size
    );
  }

  /**
   * Get summary of all registered providers
   */
  getRegistrySummary(): {
    weather: number;
    events: number;
    inventory: number;
    ai: number;
    payment: number;
    total: number;
  } {
    return {
      weather: this.weatherProviders.size,
      events: this.eventsProviders.size,
      inventory: this.inventoryProviders.size,
      ai: this.aiProviders.size,
      payment: this.paymentProcessors.size,
      total: this.getTotalProviderCount(),
    };
  }

  /**
   * Dispose all registered providers
   */
  disposeAll(): void {
    this.weatherProviders.forEach((p) => p.dispose());
    this.eventsProviders.forEach((p) => p.dispose());
    this.inventoryProviders.forEach((p) => p.dispose());
    this.aiProviders.forEach((p) => p.dispose());
    this.paymentProcessors.forEach((p) => p.dispose());

    this.weatherProviders.clear();
    this.eventsProviders.clear();
    this.inventoryProviders.clear();
    this.aiProviders.clear();
    this.paymentProcessors.clear();
  }

  /**
   * Reset the singleton instance (for testing)
   */
  static reset(): void {
    if (HololandExtensionRegistry.instance) {
      HololandExtensionRegistry.instance.disposeAll();
      HololandExtensionRegistry.instance = undefined!;
    }
  }
}

/**
 * Get the global Hololand extension registry
 */
export function getHololandRegistry(): HololandExtensionRegistry {
  return HololandExtensionRegistry.getInstance();
}
