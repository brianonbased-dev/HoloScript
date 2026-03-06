/**
 * HololandExtensionPoint — Extension contracts for Hololand Platform features
 *
 * Defines interfaces for third-party developers to extend Hololand functionality
 * with custom VRR sync providers, AI providers, and payment processors.
 *
 * @version 1.0.0
 */

import type {
  WeatherData,
  EventData,
  InventoryData,
  AIGeneratedNarrative,
  AIGeneratedQuest,
  PaymentRequest,
  PaymentReceipt,
} from './HololandTypes';

// ============================================================================
// VRR SYNC PROVIDER EXTENSION POINT
// ============================================================================

/**
 * Base configuration for VRR sync providers
 */
export interface VRRSyncProviderConfig {
  /** Provider identifier (e.g., 'weather-gov', 'openweather', 'custom') */
  providerId: string;

  /** Display name shown to users */
  displayName: string;

  /** API key or authentication token */
  apiKey?: string;

  /** Additional provider-specific configuration */
  [key: string]: unknown;
}

/**
 * Weather data provider interface
 */
export interface IWeatherProvider {
  /**
   * Provider identifier
   */
  readonly id: string;

  /**
   * Initialize the weather provider with configuration
   */
  initialize(config: VRRSyncProviderConfig): Promise<void>;

  /**
   * Fetch current weather data for a location
   * @param location - Location identifier (lat/lon, city name, zip code, etc.)
   */
  fetchWeather(location: string): Promise<WeatherData>;

  /**
   * Subscribe to weather updates
   * @param location - Location identifier
   * @param callback - Called when weather data updates
   * @returns Unsubscribe function
   */
  subscribeToWeather(
    location: string,
    callback: (weather: WeatherData) => void
  ): () => void;

  /**
   * Cleanup provider resources
   */
  dispose(): void;
}

/**
 * Events data provider interface
 */
export interface IEventsProvider {
  /**
   * Provider identifier
   */
  readonly id: string;

  /**
   * Initialize the events provider with configuration
   */
  initialize(config: VRRSyncProviderConfig): Promise<void>;

  /**
   * Fetch events for a location
   * @param location - Location identifier
   * @param options - Query options (date range, category, etc.)
   */
  fetchEvents(
    location: string,
    options?: {
      startDate?: number;
      endDate?: number;
      category?: string;
      maxResults?: number;
    }
  ): Promise<EventData[]>;

  /**
   * Subscribe to event updates
   * @param location - Location identifier
   * @param callback - Called when events update
   * @returns Unsubscribe function
   */
  subscribeToEvents(
    location: string,
    callback: (events: EventData[]) => void
  ): () => void;

  /**
   * Cleanup provider resources
   */
  dispose(): void;
}

/**
 * Inventory data provider interface
 */
export interface IInventoryProvider {
  /**
   * Provider identifier
   */
  readonly id: string;

  /**
   * Initialize the inventory provider with configuration
   */
  initialize(config: VRRSyncProviderConfig): Promise<void>;

  /**
   * Fetch inventory data for a business
   * @param businessId - Business identifier
   */
  fetchInventory(businessId: string): Promise<InventoryData>;

  /**
   * Subscribe to inventory updates
   * @param businessId - Business identifier
   * @param callback - Called when inventory updates
   * @returns Unsubscribe function
   */
  subscribeToInventory(
    businessId: string,
    callback: (inventory: InventoryData) => void
  ): () => void;

  /**
   * Cleanup provider resources
   */
  dispose(): void;
}

// ============================================================================
// AI PROVIDER EXTENSION POINT
// ============================================================================

/**
 * Base configuration for AI providers
 */
export interface AIProviderConfig {
  /** Provider identifier (e.g., 'openai', 'anthropic', 'gemini', 'custom') */
  providerId: string;

  /** Display name shown to users */
  displayName: string;

  /** API key or authentication token */
  apiKey?: string;

  /** Model identifier (e.g., 'gpt-4', 'claude-3-opus', 'gemini-pro') */
  model?: string;

  /** Temperature for generation (0-2) */
  temperature?: number;

  /** Maximum tokens to generate */
  maxTokens?: number;

  /** Additional provider-specific configuration */
  [key: string]: unknown;
}

/**
 * AI narrative generation provider interface
 */
export interface IAIProvider {
  /**
   * Provider identifier
   */
  readonly id: string;

  /**
   * Initialize the AI provider with configuration
   */
  initialize(config: AIProviderConfig): Promise<void>;

  /**
   * Generate narrative content
   * @param prompt - Generation prompt
   * @param theme - Narrative theme
   * @returns Generated narrative
   */
  generateNarrative(prompt: string, theme: string): Promise<AIGeneratedNarrative>;

  /**
   * Generate quest content
   * @param businessId - Business identifier
   * @param theme - Quest theme
   * @returns Generated quest
   */
  generateQuest(businessId: string, theme: string): Promise<AIGeneratedQuest>;

  /**
   * Generate dialogue for NPCs
   * @param characterName - Character name
   * @param personality - Character personality traits
   * @param context - Conversation context
   * @returns Generated dialogue lines
   */
  generateDialogue(
    characterName: string,
    personality: string,
    context: string
  ): Promise<string[]>;

  /**
   * Check if the provider is available (API key valid, service reachable)
   */
  checkAvailability(): Promise<boolean>;

  /**
   * Get usage statistics (tokens used, cost estimate, etc.)
   */
  getUsageStats(): {
    tokensUsed: number;
    requestCount: number;
    estimatedCost?: number;
  };

  /**
   * Cleanup provider resources
   */
  dispose(): void;
}

// ============================================================================
// PAYMENT PROCESSOR EXTENSION POINT
// ============================================================================

/**
 * Base configuration for payment processors
 */
export interface PaymentProcessorConfig {
  /** Processor identifier (e.g., 'x402', 'stripe', 'coinbase', 'custom') */
  processorId: string;

  /** Display name shown to users */
  displayName: string;

  /** API key or authentication credentials */
  apiKey?: string;

  /** Network/chain identifier for blockchain processors */
  network?: string;

  /** Simulation mode flag */
  simulationMode?: boolean;

  /** Additional processor-specific configuration */
  [key: string]: unknown;
}

/**
 * Payment processor interface
 */
export interface IPaymentProcessor {
  /**
   * Processor identifier
   */
  readonly id: string;

  /**
   * Initialize the payment processor with configuration
   */
  initialize(config: PaymentProcessorConfig): Promise<void>;

  /**
   * Process a payment
   * @param request - Payment request details
   * @returns Payment receipt
   */
  processPayment(request: PaymentRequest): Promise<PaymentReceipt>;

  /**
   * Verify a payment receipt
   * @param txHash - Transaction hash
   * @returns Verification result
   */
  verifyPayment(txHash: string): Promise<{
    valid: boolean;
    amount: number;
    timestamp: number;
  }>;

  /**
   * Get payment history
   * @param options - Query options
   * @returns Payment receipts
   */
  getPaymentHistory(options?: {
    startDate?: number;
    endDate?: number;
    maxResults?: number;
  }): Promise<PaymentReceipt[]>;

  /**
   * Get total amount processed
   * @returns Total amount in wei
   */
  getTotalProcessed(): string;

  /**
   * Check if processor is available (API key valid, network reachable)
   */
  checkAvailability(): Promise<boolean>;

  /**
   * Cleanup processor resources
   */
  dispose(): void;
}

// ============================================================================
// EXTENSION POINT REGISTRY
// ============================================================================

/**
 * Registry for Hololand extension providers
 */
export interface IHololandExtensionRegistry {
  /**
   * Register a weather provider
   */
  registerWeatherProvider(provider: IWeatherProvider): void;

  /**
   * Register an events provider
   */
  registerEventsProvider(provider: IEventsProvider): void;

  /**
   * Register an inventory provider
   */
  registerInventoryProvider(provider: IInventoryProvider): void;

  /**
   * Register an AI provider
   */
  registerAIProvider(provider: IAIProvider): void;

  /**
   * Register a payment processor
   */
  registerPaymentProcessor(processor: IPaymentProcessor): void;

  /**
   * Get all registered weather providers
   */
  getWeatherProviders(): IWeatherProvider[];

  /**
   * Get all registered events providers
   */
  getEventsProviders(): IEventsProvider[];

  /**
   * Get all registered inventory providers
   */
  getInventoryProviders(): IInventoryProvider[];

  /**
   * Get all registered AI providers
   */
  getAIProviders(): IAIProvider[];

  /**
   * Get all registered payment processors
   */
  getPaymentProcessors(): IPaymentProcessor[];

  /**
   * Get a specific provider by ID
   */
  getWeatherProvider(id: string): IWeatherProvider | undefined;
  getEventsProvider(id: string): IEventsProvider | undefined;
  getInventoryProvider(id: string): IInventoryProvider | undefined;
  getAIProvider(id: string): IAIProvider | undefined;
  getPaymentProcessor(id: string): IPaymentProcessor | undefined;

  /**
   * Unregister a provider
   */
  unregisterWeatherProvider(id: string): void;
  unregisterEventsProvider(id: string): void;
  unregisterInventoryProvider(id: string): void;
  unregisterAIProvider(id: string): void;
  unregisterPaymentProcessor(id: string): void;
}

// ============================================================================
// BASE PROVIDER IMPLEMENTATIONS
// ============================================================================

/**
 * Abstract base class for weather providers
 */
export abstract class BaseWeatherProvider implements IWeatherProvider {
  abstract readonly id: string;
  protected config?: VRRSyncProviderConfig;
  protected subscriptions: Map<string, Set<(weather: WeatherData) => void>> = new Map();

  async initialize(config: VRRSyncProviderConfig): Promise<void> {
    this.config = config;
  }

  abstract fetchWeather(location: string): Promise<WeatherData>;

  subscribeToWeather(
    location: string,
    callback: (weather: WeatherData) => void
  ): () => void {
    if (!this.subscriptions.has(location)) {
      this.subscriptions.set(location, new Set());
    }
    this.subscriptions.get(location)!.add(callback);

    return () => {
      this.subscriptions.get(location)?.delete(callback);
    };
  }

  protected notifySubscribers(location: string, weather: WeatherData): void {
    this.subscriptions.get(location)?.forEach((callback) => callback(weather));
  }

  dispose(): void {
    this.subscriptions.clear();
  }
}

/**
 * Abstract base class for AI providers
 */
export abstract class BaseAIProvider implements IAIProvider {
  abstract readonly id: string;
  protected config?: AIProviderConfig;
  protected stats = {
    tokensUsed: 0,
    requestCount: 0,
    estimatedCost: 0,
  };

  async initialize(config: AIProviderConfig): Promise<void> {
    this.config = config;
  }

  abstract generateNarrative(prompt: string, theme: string): Promise<AIGeneratedNarrative>;
  abstract generateQuest(businessId: string, theme: string): Promise<AIGeneratedQuest>;

  async generateDialogue(
    characterName: string,
    personality: string,
    context: string
  ): Promise<string[]> {
    // Default implementation - can be overridden
    const prompt = `Generate dialogue for ${characterName} with personality: ${personality}. Context: ${context}`;
    const narrative = await this.generateNarrative(prompt, 'dialogue');
    return narrative.text.split('\n').filter((line) => line.trim().length > 0);
  }

  abstract checkAvailability(): Promise<boolean>;

  getUsageStats() {
    return { ...this.stats };
  }

  protected updateStats(tokens: number, cost?: number): void {
    this.stats.tokensUsed += tokens;
    this.stats.requestCount += 1;
    if (cost !== undefined) {
      this.stats.estimatedCost += cost;
    }
  }

  dispose(): void {
    this.stats = { tokensUsed: 0, requestCount: 0, estimatedCost: 0 };
  }
}

/**
 * Abstract base class for payment processors
 */
export abstract class BasePaymentProcessor implements IPaymentProcessor {
  abstract readonly id: string;
  protected config?: PaymentProcessorConfig;
  protected paymentHistory: PaymentReceipt[] = [];

  async initialize(config: PaymentProcessorConfig): Promise<void> {
    this.config = config;
  }

  abstract processPayment(request: PaymentRequest): Promise<PaymentReceipt>;
  abstract verifyPayment(txHash: string): Promise<{
    valid: boolean;
    amount: number;
    timestamp: number;
  }>;
  abstract checkAvailability(): Promise<boolean>;

  async getPaymentHistory(options?: {
    startDate?: number;
    endDate?: number;
    maxResults?: number;
  }): Promise<PaymentReceipt[]> {
    let history = [...this.paymentHistory];

    if (options?.startDate) {
      history = history.filter((r) => r.timestamp >= options.startDate!);
    }
    if (options?.endDate) {
      history = history.filter((r) => r.timestamp <= options.endDate!);
    }
    if (options?.maxResults) {
      history = history.slice(-options.maxResults);
    }

    return history;
  }

  getTotalProcessed(): string {
    return this.paymentHistory
      .reduce((sum, r) => sum + BigInt(r.amount), BigInt(0))
      .toString();
  }

  protected recordPayment(receipt: PaymentReceipt): void {
    this.paymentHistory.push(receipt);
  }

  dispose(): void {
    this.paymentHistory = [];
  }
}
