/**
 * HoloScript Webhook Handler
 *
 * Handles incoming webhooks from the HoloScript registry.
 */

import { hmacSha256, timingSafeEqual } from '../utils/crypto.js';

/**
 * Webhook event types
 */
export type WebhookEventType =
  | 'package.published'
  | 'package.updated'
  | 'package.deprecated'
  | 'package.deleted'
  | 'version.published'
  | 'version.deprecated'
  | 'certification.passed'
  | 'certification.failed'
  | 'certification.expired'
  | 'download.Sprint'
  | 'security.alert'
  | 'review.submitted'
  | 'review.updated';

/**
 * Base webhook payload
 */
export interface WebhookPayload {
  eventId: string;
  eventType: WebhookEventType;
  timestamp: string;
  partnerId: string;
  data: unknown;
}

/**
 * Package published event data
 */
export interface PackagePublishedData {
  name: string;
  version: string;
  description?: string;
  author: string;
  tarballUrl: string;
}

/**
 * Version deprecated event data
 */
export interface VersionDeprecatedData {
  name: string;
  version: string;
  reason: string;
  deprecatedBy: string;
}

/**
 * Certification result event data
 */
export interface CertificationResultData {
  name: string;
  version: string;
  certified: boolean;
  grade?: string;
  score?: number;
  certificateId?: string;
  failureReasons?: string[];
}

/**
 * Download Sprint event data
 */
export interface DownloadMilestoneData {
  name: string;
  Sprint: number;
  totalDownloads: number;
}

/**
 * Security alert event data
 */
export interface SecurityAlertData {
  name: string;
  version: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  vulnerabilityId: string;
  title: string;
  description: string;
  affectedVersions: string[];
  patchedVersion?: string;
}

/**
 * Webhook verification error
 */
export class WebhookVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebhookVerificationError';
  }
}

/**
 * Webhook handler callback type
 */
export type WebhookCallback<T = unknown> = (
  payload: WebhookPayload & { data: T }
) => void | Promise<void>;

/**
 * Webhook handler configuration
 */
export interface WebhookHandlerConfig {
  /**
   * Secret key for verifying webhook signatures
   */
  signingSecret: string;

  /**
   * Partner ID for validating webhooks
   */
  partnerId: string;

  /**
   * Maximum age of webhook timestamp (in seconds)
   * Webhooks older than this will be rejected
   */
  maxTimestampAge?: number;

  /**
   * Enable strict mode (reject unknown event types)
   */
  strictMode?: boolean;
}

/**
 * Webhook Handler
 *
 * Processes and verifies incoming webhooks from the HoloScript registry.
 */
export class WebhookHandler {
  private config: Required<WebhookHandlerConfig>;
  private handlers: Map<WebhookEventType | '*', WebhookCallback[]> = new Map();
  private processedEvents: Set<string> = new Set();
  private maxProcessedEvents = 10000;

  constructor(config: WebhookHandlerConfig) {
    this.config = {
      ...config,
      maxTimestampAge: config.maxTimestampAge || 300, // 5 minutes
      strictMode: config.strictMode ?? true,
    };
  }

  /**
   * Register a handler for a specific event type
   */
  on<T = unknown>(eventType: WebhookEventType | '*', callback: WebhookCallback<T>): void {
    const handlers = this.handlers.get(eventType) || [];
    handlers.push(callback as WebhookCallback);
    this.handlers.set(eventType, handlers);
  }

  /**
   * Register handler for package published events
   */
  onPackagePublished(callback: WebhookCallback<PackagePublishedData>): void {
    this.on('package.published', callback);
  }

  /**
   * Register handler for version deprecated events
   */
  onVersionDeprecated(callback: WebhookCallback<VersionDeprecatedData>): void {
    this.on('version.deprecated', callback);
  }

  /**
   * Register handler for certification results
   */
  onCertificationResult(callback: WebhookCallback<CertificationResultData>): void {
    this.on('certification.passed', callback);
    this.on('certification.failed', callback);
  }

  /**
   * Register handler for download milestones
   */
  onDownloadMilestone(callback: WebhookCallback<DownloadMilestoneData>): void {
    this.on('download.Sprint', callback);
  }

  /**
   * Register handler for security alerts
   */
  onSecurityAlert(callback: WebhookCallback<SecurityAlertData>): void {
    this.on('security.alert', callback);
  }

  /**
   * Process an incoming webhook request
   */
  async handle(
    payload: string | WebhookPayload,
    signature?: string,
    timestamp?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Parse payload if string
      const parsedPayload: WebhookPayload =
        typeof payload === 'string' ? JSON.parse(payload) : payload;

      // Verify signature if provided (HMAC-SHA256)
      if (signature && timestamp) {
        await this.verifySignature(
          typeof payload === 'string' ? payload : JSON.stringify(payload),
          signature,
          timestamp
        );
      }

      // Validate timestamp
      this.validateTimestamp(parsedPayload.timestamp);

      // Check for duplicate events (idempotency)
      if (this.processedEvents.has(parsedPayload.eventId)) {
        return { success: true }; // Already processed, skip
      }

      // Validate partner ID
      if (parsedPayload.partnerId !== this.config.partnerId) {
        throw new WebhookVerificationError('Partner ID mismatch');
      }

      // Validate event type in strict mode
      if (this.config.strictMode && !this.isKnownEventType(parsedPayload.eventType)) {
        throw new WebhookVerificationError(`Unknown event type: ${parsedPayload.eventType}`);
      }

      // Execute handlers
      await this.executeHandlers(parsedPayload);

      // Mark as processed
      this.markEventProcessed(parsedPayload.eventId);

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  }

  /**
   * Verify webhook signature using HMAC-SHA256
   */
  private async verifySignature(
    payload: string,
    signature: string,
    timestamp: string
  ): Promise<void> {
    const expectedSignature = await this.computeSignature(payload, timestamp);

    // Timing-safe comparison to prevent timing attacks
    if (!timingSafeEqual(signature, expectedSignature)) {
      throw new WebhookVerificationError('Invalid webhook signature');
    }
  }

  /**
   * Compute expected signature using HMAC-SHA256
   */
  private async computeSignature(payload: string, timestamp: string): Promise<string> {
    const data = `${timestamp}.${payload}`;
    return hmacSha256(data, this.config.signingSecret);
  }

  /**
   * Validate webhook timestamp
   */
  private validateTimestamp(timestamp: string): void {
    const webhookTime = new Date(timestamp).getTime();
    const now = Date.now();
    const age = Math.abs(now - webhookTime) / 1000;

    if (age > this.config.maxTimestampAge) {
      throw new WebhookVerificationError(
        `Webhook timestamp too old: ${age}s > ${this.config.maxTimestampAge}s`
      );
    }
  }

  /**
   * Check if event type is known
   */
  private isKnownEventType(eventType: string): eventType is WebhookEventType {
    const knownTypes: WebhookEventType[] = [
      'package.published',
      'package.updated',
      'package.deprecated',
      'package.deleted',
      'version.published',
      'version.deprecated',
      'certification.passed',
      'certification.failed',
      'certification.expired',
      'download.Sprint',
      'security.alert',
      'review.submitted',
      'review.updated',
    ];

    return knownTypes.includes(eventType as WebhookEventType);
  }

  /**
   * Execute registered handlers for an event
   */
  private async executeHandlers(payload: WebhookPayload): Promise<void> {
    const specificHandlers = this.handlers.get(payload.eventType) || [];
    const wildcardHandlers = this.handlers.get('*') || [];

    const allHandlers = [...specificHandlers, ...wildcardHandlers];

    for (const handler of allHandlers) {
      await handler(payload);
    }
  }

  /**
   * Mark event as processed for idempotency
   */
  private markEventProcessed(eventId: string): void {
    this.processedEvents.add(eventId);

    // Clean up old events if limit exceeded
    if (this.processedEvents.size > this.maxProcessedEvents) {
      const toDelete = Array.from(this.processedEvents).slice(0, this.maxProcessedEvents / 2);
      toDelete.forEach((id) => this.processedEvents.delete(id));
    }
  }

  /**
   * Create Express/Koa middleware
   */
  middleware(): (req: unknown, res: unknown, next?: unknown) => Promise<void> {
    return async (req: any, res: any, _next?: any) => {
      try {
        const payload = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
        const signature = req.headers['x-holoscript-signature'];
        const timestamp = req.headers['x-holoscript-timestamp'];

        const result = await this.handle(payload, signature, timestamp);

        if (result.success) {
          res.status?.(200).json?.({ received: true });
        } else {
          res.status?.(400).json?.({ error: result.error });
        }
      } catch (_error) {
        res.status?.(500).json?.({ error: 'Internal server error' });
      }
    };
  }
}

/**
 * Create a webhook handler instance
 */
export function createWebhookHandler(config: WebhookHandlerConfig): WebhookHandler {
  return new WebhookHandler(config);
}
