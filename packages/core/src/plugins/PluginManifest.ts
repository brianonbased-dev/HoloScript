/**
 * PluginManifest — Plugin manifest schema and validation
 *
 * Defines the structure of plugin.json files, including Hololand Platform
 * extension points for custom providers.
 *
 * @version 1.0.0
 */

import type { PluginPermission } from './PluginLoader';

/**
 * Plugin author information
 */
export interface PluginAuthor {
  name: string;
  email?: string;
  url?: string;
}

/**
 * Plugin dependency specification
 */
export interface PluginDependency {
  /** Plugin identifier */
  id: string;

  /** Version range (semver) */
  version: string;

  /** Whether dependency is optional */
  optional?: boolean;
}

/**
 * Hololand VRR sync provider declaration
 */
export interface HololandVRRProvider {
  /** Provider type */
  type: 'weather' | 'events' | 'inventory';

  /** Provider identifier (must be unique) */
  id: string;

  /** Display name */
  displayName: string;

  /** Description of what this provider does */
  description?: string;

  /** Implementation class name */
  className: string;

  /** Configuration schema (JSON Schema) */
  configSchema?: Record<string, unknown>;
}

/**
 * Hololand AI provider declaration
 */
export interface HololandAIProvider {
  /** Provider identifier (must be unique) */
  id: string;

  /** Display name */
  displayName: string;

  /** Description of capabilities */
  description?: string;

  /** Implementation class name */
  className: string;

  /** Supported features */
  features: {
    narrativeGeneration?: boolean;
    questGeneration?: boolean;
    dialogueGeneration?: boolean;
  };

  /** Configuration schema (JSON Schema) */
  configSchema?: Record<string, unknown>;
}

/**
 * Hololand payment processor declaration
 */
export interface HololandPaymentProcessor {
  /** Processor identifier (must be unique) */
  id: string;

  /** Display name */
  displayName: string;

  /** Description of payment method */
  description?: string;

  /** Implementation class name */
  className: string;

  /** Supported currencies */
  supportedCurrencies?: string[];

  /** Whether blockchain-based */
  blockchain?: boolean;

  /** Configuration schema (JSON Schema) */
  configSchema?: Record<string, unknown>;
}

/**
 * Hololand Platform features declaration
 */
export interface HololandFeatures {
  /** VRR sync providers offered by this plugin */
  vrrProviders?: HololandVRRProvider[];

  /** AI providers offered by this plugin */
  aiProviders?: HololandAIProvider[];

  /** Payment processors offered by this plugin */
  paymentProcessors?: HololandPaymentProcessor[];

  /** Whether plugin extends AR functionality */
  arExtensions?: boolean;

  /** Whether plugin extends Quest Builder */
  questBuilderExtensions?: boolean;

  /** Whether plugin extends AgentKit */
  agentkitExtensions?: boolean;
}

/**
 * Complete plugin manifest schema
 */
export interface PluginManifest {
  // =========================================================================
  // CORE METADATA
  // =========================================================================

  /** Plugin identifier (unique, kebab-case) */
  id: string;

  /** Plugin display name */
  name: string;

  /** Plugin version (semver) */
  version: string;

  /** Short description */
  description: string;

  /** Plugin author */
  author: PluginAuthor | string;

  /** License identifier (SPDX) */
  license?: string;

  /** Homepage URL */
  homepage?: string;

  /** Repository URL */
  repository?: string;

  /** Keywords for searchability */
  keywords?: string[];

  // =========================================================================
  // PLUGIN SYSTEM
  // =========================================================================

  /** Entry point file (relative to plugin root) */
  main: string;

  /** Plugin dependencies */
  dependencies?: PluginDependency[];

  /** Minimum HoloScript version required */
  holoscriptVersion?: string;

  /** Permissions requested by this plugin */
  permissions?: PluginPermission[];

  // =========================================================================
  // HOLOLAND PLATFORM EXTENSIONS
  // =========================================================================

  /** Hololand Platform features offered by this plugin */
  hololandFeatures?: HololandFeatures;

  // =========================================================================
  // LIFECYCLE HOOKS
  // =========================================================================

  /** Activation events (when plugin should load) */
  activationEvents?: string[];

  /** Configuration schema (JSON Schema) */
  contributes?: {
    configuration?: Record<string, unknown>;
    commands?: Array<{
      command: string;
      title: string;
      category?: string;
    }>;
  };
}

/**
 * Validate a plugin manifest
 */
export function validatePluginManifest(manifest: unknown): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!manifest || typeof manifest !== 'object') {
    return { valid: false, errors: ['Manifest must be an object'] };
  }

  const m = manifest as Partial<PluginManifest>;

  // Required fields
  if (!m.id || typeof m.id !== 'string') {
    errors.push('Missing or invalid field: id');
  } else if (!/^[a-z0-9-]+$/.test(m.id)) {
    errors.push('Plugin id must be lowercase kebab-case');
  }

  if (!m.name || typeof m.name !== 'string') {
    errors.push('Missing or invalid field: name');
  }

  if (!m.version || typeof m.version !== 'string') {
    errors.push('Missing or invalid field: version');
  } else if (!/^\d+\.\d+\.\d+/.test(m.version)) {
    errors.push('Version must follow semver format (X.Y.Z)');
  }

  if (!m.description || typeof m.description !== 'string') {
    errors.push('Missing or invalid field: description');
  }

  if (!m.main || typeof m.main !== 'string') {
    errors.push('Missing or invalid field: main');
  }

  // Validate Hololand features if present
  if (m.hololandFeatures) {
    const hf = m.hololandFeatures;

    if (hf.vrrProviders) {
      hf.vrrProviders.forEach((provider, idx) => {
        if (!provider.id || !provider.displayName || !provider.className) {
          errors.push(`VRR provider at index ${idx} missing required fields`);
        }
        if (!['weather', 'events', 'inventory'].includes(provider.type)) {
          errors.push(`VRR provider at index ${idx} has invalid type: ${provider.type}`);
        }
      });
    }

    if (hf.aiProviders) {
      hf.aiProviders.forEach((provider, idx) => {
        if (!provider.id || !provider.displayName || !provider.className) {
          errors.push(`AI provider at index ${idx} missing required fields`);
        }
      });
    }

    if (hf.paymentProcessors) {
      hf.paymentProcessors.forEach((processor, idx) => {
        if (!processor.id || !processor.displayName || !processor.className) {
          errors.push(`Payment processor at index ${idx} missing required fields`);
        }
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Create a minimal valid plugin manifest
 */
export function createPluginManifest(options: {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string | PluginAuthor;
  main?: string;
}): PluginManifest {
  return {
    id: options.id,
    name: options.name,
    version: options.version,
    description: options.description,
    author: options.author,
    main: options.main || 'index.js',
  };
}
