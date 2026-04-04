/**
 * Analytics client for HoloScript Studio.
 *
 * Integrates PostHog for product analytics and Sentry for error tracking.
 * Both are opt-in — no tracking without environment variables configured.
 *
 * Environment variables:
 *   - NEXT_PUBLIC_POSTHOG_KEY     → PostHog project API key
 *   - NEXT_PUBLIC_POSTHOG_HOST    → PostHog instance URL (default: https://app.posthog.com)
 *   - NEXT_PUBLIC_SENTRY_DSN      → Sentry DSN for error tracking
 */

let _posthog: unknown = null;
let _initialized = false;

/**
 * Initialize analytics (call once on app mount).
 * No-op if PostHog is not configured.
 */
export async function initAnalytics(userId?: string) {
  if (_initialized) return;
  _initialized = true;

  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://app.posthog.com';

  if (!key || typeof window === 'undefined') return;

  try {
    const posthog = (await import('posthog-js')).default;
    posthog.init(key, {
      api_host: host,
      capture_pageview: true,
      capture_pageleave: true,
      persistence: 'localStorage',
    });

    if (userId) {
      posthog.identify(userId);
    }

    _posthog = posthog;
  } catch {
    // PostHog not installed or failed to load — analytics disabled
  }
}

/**
 * Track a custom event.
 */
export function trackEvent(event: string, properties?: Record<string, unknown>) {
  _posthog?.capture(event, properties);
}

/**
 * Identify the current user (call after login).
 */
export function identifyUser(userId: string, traits?: Record<string, unknown>) {
  _posthog?.identify(userId, traits);
}

/**
 * Reset identity (call on logout).
 */
export function resetIdentity() {
  _posthog?.reset();
}

/**
 * Track a page view.
 */
export function trackPageView(path?: string) {
  _posthog?.capture('$pageview', path ? { $current_url: path } : undefined);
}

// ─── Pre-defined events for common Studio actions ───────────────────────────

export const StudioEvents = {
  // Projects
  sceneCreated: (sceneName: string) => trackEvent('scene_created', { sceneName }),

  projectExported: (format: string, sceneName?: string) =>
    trackEvent('project_exported', { format, sceneName }),

  exportFailed: (format: string, error: string) => trackEvent('export_failed', { format, error }),

  // Deploy
  projectDeployed: (deploymentId: string, target: string) =>
    trackEvent('project_deployed', { deploymentId, target }),

  deployFailed: (error: string) => trackEvent('deploy_failed', { error }),

  // Assets
  assetUploaded: (category: string, sizeKb: number) =>
    trackEvent('asset_uploaded', { category, sizeKb }),

  assetImported: (fileName: string, meshCount: number, isCharacter: boolean) =>
    trackEvent('asset_imported', { fileName, meshCount, isCharacter }),

  assetImportFailed: (fileName: string, error: string) =>
    trackEvent('asset_import_failed', { fileName, error }),

  // Marketplace
  marketplacePurchase: (listingId: string, amountCents: number) =>
    trackEvent('marketplace_purchase', { listingId, amountCents }),

  marketplacePublish: (contentType: string) => trackEvent('marketplace_publish', { contentType }),

  marketplaceDownload: (itemId: string) => trackEvent('marketplace_download', { itemId }),

  marketplaceFavorite: (itemId: string, favorited: boolean) =>
    trackEvent('marketplace_favorite', { itemId, favorited }),

  marketplaceRemix: (itemId: string) => trackEvent('marketplace_remix', { itemId }),

  // Collaboration
  collabSessionJoined: (roomId: string) => trackEvent('collab_session_joined', { roomId }),

  collabSessionLeft: (roomId: string) => trackEvent('collab_session_left', { roomId }),

  // AI / Brittney
  brittneyPromptSent: (textLength: number) => trackEvent('brittney_prompt_sent', { textLength }),

  brittneyToolCalled: (toolName: string, success: boolean) =>
    trackEvent('brittney_tool_called', { toolName, success }),

  sceneGenerated: (method: 'ai' | 'template' | 'manual') =>
    trackEvent('scene_generated', { method }),

  // Studio Wizard & Presets
  wizardCompleted: (
    presetId: string,
    category: string,
    subCategory: string,
    experienceLevel: string
  ) => trackEvent('wizard_completed', { presetId, category, subCategory, experienceLevel }),

  wizardCategorySelected: (category: string) =>
    trackEvent('wizard_category_selected', { category }),

  wizardSubCategorySelected: (subCategory: string) =>
    trackEvent('wizard_sub_category_selected', { subCategory }),

  presetApplied: (presetId: string, source: 'wizard' | 'quick_switch' | 'settings') =>
    trackEvent('preset_applied', { presetId, source }),

  presetSwitched: (fromPresetId: string | null, toPresetId: string) =>
    trackEvent('preset_switched', { fromPresetId, toPresetId }),
} as const;
