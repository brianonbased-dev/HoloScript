/**
 * HoloScript Partner SDK
 *
 * Official SDK for partners integrating with the HoloScript ecosystem.
 *
 * @module @holoscript/partner-sdk
 *
 * @example
 * ```typescript
 * import { createRegistryClient, createWebhookHandler, createPartnerAnalytics } from '@holoscript/partner-sdk';
 *
 * // Create API client
 * const client = createRegistryClient({
 *   credentials: {
 *     partnerId: 'your-partner-id',
 *     apiKey: 'your-api-key',
 *   },
 * });
 *
 * // Get package info
 * const pkg = await client.getPackage('@your-org/package');
 *
 * // Set up webhooks
 * const webhooks = createWebhookHandler({
 *   signingSecret: 'your-webhook-secret',
 *   partnerId: 'your-partner-id',
 * });
 *
 * webhooks.onPackagePublished((event) => {
 *   console.log('New package published:', event.data.name);
 * });
 *
 * // Access analytics
 * const analytics = createPartnerAnalytics({
 *   partnerId: 'your-partner-id',
 *   apiKey: 'your-api-key',
 * });
 *
 * const stats = await analytics.getDownloadStats('@your-org/package', 'month');
 * ```
 */

// Internal imports for use within this file
import {
  RegistryClient as _RegistryClient,
  createRegistryClient as _createRegistryClient,
  type PartnerCredentials as PartnerCredentials,
} from './api';
import {
  WebhookHandler as WebhookHandler,
  createWebhookHandler as _createWebhookHandler,
} from './webhooks';
import {
  PartnerAnalytics as PartnerAnalytics,
  createPartnerAnalytics as _createPartnerAnalytics,
} from './analytics';

// API exports
export {
  RegistryClient,
  createRegistryClient,
  RateLimitError,
  AuthenticationError,
  type PartnerCredentials,
  type RegistryClientConfig,
  type PackageInfo,
  type VersionInfo,
  type SearchResult,
  type ApiResponse,
} from './api';

// Webhook exports
export {
  WebhookHandler,
  createWebhookHandler,
  WebhookVerificationError,
  type WebhookEventType,
  type WebhookPayload,
  type WebhookHandlerConfig,
  type WebhookCallback,
  type PackagePublishedData,
  type VersionDeprecatedData,
  type CertificationResultData,
  type DownloadMilestoneData,
  type SecurityAlertData,
} from './webhooks';

// Analytics exports
export {
  PartnerAnalytics,
  createPartnerAnalytics,
  type AnalyticsPeriod,
  type DownloadStats,
  type EngagementMetrics,
  type PackageHealth,
  type RevenueMetrics,
  type DependencyAnalytics,
  type CompetitorAnalysis,
  type ExportFormat,
} from './analytics';

// Runtime exports (embedding HoloScript in partner apps)
export {
  HoloScriptRuntime,
  createRuntime,
  type RuntimeConfig,
  type RuntimePermission,
  type RendererAdapter,
  type PhysicsAdapter,
  type AudioAdapter,
  type SceneObject,
  type RuntimeEvent,
  type RuntimeEventData,
} from './runtime';

// Engine adapter exports (export to Unity/Unreal/Godot)
export {
  UnityExportAdapter,
  createUnityAdapter,
  UnrealExportAdapter,
  createUnrealAdapter,
  GodotExportAdapter,
  createGodotAdapter,
  type UnityExportConfig,
  type UnityExportResult,
  type UnrealExportConfig,
  type UnrealExportResult,
  type GodotExportConfig,
  type GodotExportResult,
} from './adapters';

// Branding exports (partner badges, brand assets)
export {
  BrandingKit,
  createBrandingKit,
  BRAND_COLORS,
  TYPOGRAPHY,
  LOGO_ASSETS,
  type BrandAsset,
  type ColorPalette,
  type Typography,
  type BadgeConfig,
} from './branding';

/**
 * SDK version
 */
export const SDK_VERSION = '1.0.0';

/**
 * Quick start helper - creates all SDK components with shared credentials
 */
export function createPartnerSDK(config: {
  partnerId: string;
  apiKey: string;
  secretKey?: string;
  webhookSecret?: string;
  baseUrl?: string;
}): {
  api: _RegistryClient;
  webhooks: WebhookHandler | null;
  analytics: PartnerAnalytics;
} {
  const credentials: PartnerCredentials = {
    partnerId: config.partnerId,
    apiKey: config.apiKey,
    secretKey: config.secretKey,
  };

  const api = _createRegistryClient({
    credentials,
    baseUrl: config.baseUrl,
  });

  const webhooks = config.webhookSecret
    ? _createWebhookHandler({
        signingSecret: config.webhookSecret,
        partnerId: config.partnerId,
      })
    : null;

  const analytics = _createPartnerAnalytics(credentials, config.baseUrl);

  return { api, webhooks, analytics };
}

// Business Quest Tools (Hololand Integration Phase 2)
export {
  BusinessQuestTools,
  type BusinessQuestConfig,
  type BusinessQuestStep,
  type QuestReward,
} from './BusinessQuestTools';
