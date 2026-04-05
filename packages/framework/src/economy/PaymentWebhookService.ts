/**
 * PaymentWebhookService — Webhook processing for payment confirmations
 *
 * Receives payment provider webhooks, verifies HMAC-SHA256 signatures,
 * updates LedgerEntry settlement status, and emits telemetry events.
 *
 * Part of HoloScript v5.8 "Live Economy".
 *
 * @version 1.0.0
 */

import type { TelemetryCollector } from './_core-stubs';
import type { LedgerEntry } from './x402-facilitator';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Supported webhook providers.
 */
export type WebhookProvider = 'x402' | 'stripe' | 'coinbase' | 'custom';

/**
 * Webhook event types.
 */
export type WebhookEventType =
  | 'payment.confirmed'
  | 'payment.failed'
  | 'payment.refunded'
  | 'settlement.completed'
  | 'settlement.failed'
  | 'subscription.renewed'
  | 'subscription.cancelled';

/**
 * Incoming webhook payload.
 */
export interface WebhookPayload {
  /** Provider-specific event ID */
  eventId: string;
  /** Event type */
  type: WebhookEventType;
  /** Provider name */
  provider: WebhookProvider;
  /** Timestamp of the event (ISO 8601) */
  timestamp: string;
  /** Provider-specific data */
  data: Record<string, unknown>;
  /** Ledger entry ID (if applicable) */
  ledgerEntryId?: string;
  /** Transaction hash (if on-chain) */
  transactionHash?: string;
  /** Amount in USDC base units */
  amount?: number;
  /** Payer identifier */
  payer?: string;
  /** Recipient identifier */
  recipient?: string;
}

/**
 * Webhook verification result.
 */
export interface WebhookVerificationResult {
  /** Whether the webhook signature is valid */
  verified: boolean;
  /** Provider name */
  provider: WebhookProvider;
  /** Error message if verification failed */
  error?: string;
  /** Parsed payload (if verified) */
  payload?: WebhookPayload;
}

/**
 * Webhook processing result.
 */
export interface WebhookProcessingResult {
  /** Whether processing succeeded */
  success: boolean;
  /** Event ID that was processed */
  eventId: string;
  /** Event type */
  type: WebhookEventType;
  /** Updated ledger entry (if applicable) */
  updatedEntry?: LedgerEntry;
  /** Error message if processing failed */
  error?: string;
}

/**
 * Webhook handler function type.
 */
export type WebhookHandler = (
  payload: WebhookPayload
) => Promise<WebhookProcessingResult> | WebhookProcessingResult;

/**
 * Configuration for the webhook service.
 */
export interface WebhookServiceConfig {
  /** HMAC secrets per provider */
  secrets: Partial<Record<WebhookProvider, string>>;
  /** Maximum age for webhook events (ms, default: 5 minutes) */
  maxAgeMs?: number;
  /** Maximum retry attempts for failed deliveries */
  maxRetries?: number;
  /** Retry backoff base (ms) */
  retryBackoffMs?: number;
  /** Telemetry collector */
  telemetry?: TelemetryCollector;
}

/**
 * Retry queue entry.
 */
interface RetryEntry {
  payload: WebhookPayload;
  attempts: number;
  nextRetryAt: number;
  lastError?: string;
}

// =============================================================================
// HMAC UTILITIES
// =============================================================================

/**
 * Compute HMAC-SHA256 hex digest (Node.js crypto).
 */
function computeHmac(payload: string, secret: string): string {
  // Use dynamic import pattern to work in both Node and test environments
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const crypto = require('crypto');
    return crypto.createHmac('sha256', secret).update(payload).digest('hex');
  } catch {
    // Fallback for environments without crypto
    // Simple hash for testing — never use in production
    let hash = 0;
    const combined = payload + secret;
    for (let i = 0; i < combined.length; i++) {
      const char = combined.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
  }
}

/**
 * Timing-safe string comparison.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

// =============================================================================
// PAYMENT WEBHOOK SERVICE
// =============================================================================

export class PaymentWebhookService {
  private config: Required<Omit<WebhookServiceConfig, 'telemetry'>> & {
    telemetry?: TelemetryCollector;
  };
  private handlers: Map<WebhookEventType, WebhookHandler[]> = new Map();
  private processedEvents: Set<string> = new Set();
  private retryQueue: RetryEntry[] = [];
  private ledgerUpdateCallback?: (entryId: string, updates: Partial<LedgerEntry>) => void;

  // Stats
  private stats = {
    received: 0,
    verified: 0,
    processed: 0,
    failed: 0,
    retried: 0,
    rejected: 0,
    duplicates: 0,
  };

  constructor(config: WebhookServiceConfig) {
    this.config = {
      secrets: config.secrets,
      maxAgeMs: config.maxAgeMs ?? 5 * 60 * 1000, // 5 minutes
      maxRetries: config.maxRetries ?? 3,
      retryBackoffMs: config.retryBackoffMs ?? 1000,
      telemetry: config.telemetry,
    };
  }

  // ===========================================================================
  // VERIFICATION
  // ===========================================================================

  /**
   * Verify a webhook's HMAC-SHA256 signature.
   */
  verifySignature(
    rawBody: string,
    signature: string,
    provider: WebhookProvider
  ): WebhookVerificationResult {
    this.stats.received++;

    const secret = this.config.secrets[provider];
    if (!secret) {
      this.stats.rejected++;
      return {
        verified: false,
        provider,
        error: `No secret configured for provider: ${provider}`,
      };
    }

    const expected = computeHmac(rawBody, secret);
    const isValid = timingSafeEqual(expected, signature);

    if (!isValid) {
      this.stats.rejected++;
      this.emitTelemetry('webhook_signature_invalid', { provider });
      return {
        verified: false,
        provider,
        error: 'Invalid HMAC-SHA256 signature',
      };
    }

    // Parse payload
    let payload: WebhookPayload;
    try {
      payload = JSON.parse(rawBody) as WebhookPayload;
    } catch {
      this.stats.rejected++;
      return {
        verified: false,
        provider,
        error: 'Invalid JSON payload',
      };
    }

    // Check age
    const eventAge = Date.now() - new Date(payload.timestamp).getTime();
    if (eventAge > this.config.maxAgeMs) {
      this.stats.rejected++;
      return {
        verified: false,
        provider,
        error: `Webhook too old: ${Math.round(eventAge / 1000)}s (max: ${Math.round(this.config.maxAgeMs / 1000)}s)`,
      };
    }

    this.stats.verified++;
    this.emitTelemetry('webhook_verified', { provider, eventId: payload.eventId });

    return {
      verified: true,
      provider,
      payload,
    };
  }

  // ===========================================================================
  // PROCESSING
  // ===========================================================================

  /**
   * Process a verified webhook payload.
   */
  async processWebhook(payload: WebhookPayload): Promise<WebhookProcessingResult> {
    // Idempotency check
    if (this.processedEvents.has(payload.eventId)) {
      this.stats.duplicates++;
      return {
        success: true,
        eventId: payload.eventId,
        type: payload.type,
      };
    }

    // Update ledger entry if applicable
    let updatedEntry: LedgerEntry | undefined;
    if (payload.ledgerEntryId && this.ledgerUpdateCallback) {
      try {
        if (payload.type === 'payment.confirmed' || payload.type === 'settlement.completed') {
          this.ledgerUpdateCallback(payload.ledgerEntryId, {
            settled: true,
            settlementTx: payload.transactionHash || null,
          });
        } else if (payload.type === 'payment.failed' || payload.type === 'settlement.failed') {
          this.ledgerUpdateCallback(payload.ledgerEntryId, {
            settled: false,
            settlementTx: null,
          });
        }
      } catch (err) {
        // Log but don't fail — handlers may still want this event
        this.emitTelemetry('webhook_ledger_update_error', {
          eventId: payload.eventId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Invoke registered handlers
    const handlers = this.handlers.get(payload.type) || [];
    const errors: string[] = [];

    for (const handler of handlers) {
      try {
        const result = await handler(payload);
        if (!result.success && result.error) {
          errors.push(result.error);
        }
        if (result.updatedEntry) {
          updatedEntry = result.updatedEntry;
        }
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err));
      }
    }

    if (errors.length > 0) {
      this.stats.failed++;
      this.emitTelemetry('webhook_processing_failed', {
        eventId: payload.eventId,
        type: payload.type,
        errors,
      });

      // Add to retry queue
      this.addToRetryQueue(payload, errors.join('; '));

      return {
        success: false,
        eventId: payload.eventId,
        type: payload.type,
        error: errors.join('; '),
      };
    }

    // Mark as processed (idempotency)
    this.processedEvents.add(payload.eventId);

    // Trim processed events set if too large
    if (this.processedEvents.size > 10000) {
      const entries = [...this.processedEvents];
      this.processedEvents = new Set(entries.slice(-5000));
    }

    this.stats.processed++;
    this.emitTelemetry('webhook_processed', {
      eventId: payload.eventId,
      type: payload.type,
      provider: payload.provider,
    });

    return {
      success: true,
      eventId: payload.eventId,
      type: payload.type,
      updatedEntry,
    };
  }

  // ===========================================================================
  // HANDLER REGISTRATION
  // ===========================================================================

  /**
   * Register a handler for a specific webhook event type.
   */
  on(eventType: WebhookEventType, handler: WebhookHandler): void {
    const existing = this.handlers.get(eventType) || [];
    existing.push(handler);
    this.handlers.set(eventType, existing);
  }

  /**
   * Remove a handler for a specific webhook event type.
   */
  off(eventType: WebhookEventType, handler: WebhookHandler): void {
    const existing = this.handlers.get(eventType) || [];
    this.handlers.set(
      eventType,
      existing.filter((h) => h !== handler)
    );
  }

  /**
   * Set callback for ledger entry updates.
   */
  onLedgerUpdate(callback: (entryId: string, updates: Partial<LedgerEntry>) => void): void {
    this.ledgerUpdateCallback = callback;
  }

  // ===========================================================================
  // RETRY QUEUE
  // ===========================================================================

  /**
   * Add a failed webhook to the retry queue.
   */
  private addToRetryQueue(payload: WebhookPayload, error: string): void {
    const existing = this.retryQueue.find((r) => r.payload.eventId === payload.eventId);
    if (existing) {
      existing.attempts++;
      existing.lastError = error;
      existing.nextRetryAt =
        Date.now() + this.config.retryBackoffMs * Math.pow(2, existing.attempts - 1);
      return;
    }

    if (this.retryQueue.length >= 1000) {
      // Evict oldest
      this.retryQueue.shift();
    }

    this.retryQueue.push({
      payload,
      attempts: 1,
      nextRetryAt: Date.now() + this.config.retryBackoffMs,
      lastError: error,
    });
  }

  /**
   * Process retry queue entries that are ready.
   */
  async processRetryQueue(): Promise<number> {
    const now = Date.now();
    const ready = this.retryQueue.filter(
      (r) => r.nextRetryAt <= now && r.attempts < this.config.maxRetries
    );

    let processed = 0;
    for (const entry of ready) {
      const result = await this.processWebhook(entry.payload);
      if (result.success) {
        // Remove from queue
        const idx = this.retryQueue.indexOf(entry);
        if (idx >= 0) this.retryQueue.splice(idx, 1);
        this.stats.retried++;
        processed++;
      }
    }

    // Remove entries that exceeded max retries
    this.retryQueue = this.retryQueue.filter((r) => r.attempts < this.config.maxRetries);

    return processed;
  }

  /**
   * Get retry queue length.
   */
  getRetryQueueLength(): number {
    return this.retryQueue.length;
  }

  // ===========================================================================
  // QUERIES
  // ===========================================================================

  /**
   * Check if an event has been processed.
   */
  isProcessed(eventId: string): boolean {
    return this.processedEvents.has(eventId);
  }

  /**
   * Get comprehensive stats.
   */
  getStats(): typeof this.stats & { retryQueueLength: number } {
    return {
      ...this.stats,
      retryQueueLength: this.retryQueue.length,
    };
  }

  /**
   * Create a webhook signature for testing purposes.
   */
  createSignature(rawBody: string, provider: WebhookProvider): string {
    const secret = this.config.secrets[provider];
    if (!secret) throw new Error(`No secret for provider: ${provider}`);
    return computeHmac(rawBody, secret);
  }

  // ===========================================================================
  // TELEMETRY
  // ===========================================================================

  private emitTelemetry(type: string, data?: Record<string, unknown>): void {
    this.config.telemetry?.record({
      type,
      severity:
        type.includes('error') || type.includes('failed') || type.includes('invalid')
          ? 'error'
          : 'info',
      agentId: 'payment-webhook-service',
      data,
    });
  }
}
