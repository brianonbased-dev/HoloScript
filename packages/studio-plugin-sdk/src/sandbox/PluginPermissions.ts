/**
 * PluginPermissions - Runtime permission enforcement for sandboxed plugins
 *
 * Provides a centralized permission validator that checks plugin capabilities
 * against their declared manifest. This module enforces the principle of
 * least privilege at runtime.
 *
 * Security model:
 * - Plugins declare required permissions in their manifest
 * - The host grants a subset of requested permissions
 * - Every API call is validated against granted permissions
 * - Permission violations are logged and can trigger termination
 *
 * @module @holoscript/studio-plugin-sdk/sandbox
 */

import type { SandboxPermission, PluginSandboxManifest, _NetworkPolicy } from './types.js';

// ── Permission Categories ──────────────────────────────────────────────────

/**
 * Permission risk levels for UI display and policy decisions.
 */
export type PermissionRiskLevel = 'low' | 'medium' | 'high' | 'critical';

/**
 * Permission metadata for UI display and policy enforcement.
 */
export interface PermissionMetadata {
  /** The permission identifier */
  permission: SandboxPermission;
  /** Human-readable label */
  label: string;
  /** Description of what this permission grants */
  description: string;
  /** Risk level for UI indication */
  riskLevel: PermissionRiskLevel;
  /** Category for grouping in UI */
  category: string;
  /** Whether this permission requires user approval (vs auto-grant) */
  requiresApproval: boolean;
}

/**
 * Complete permission catalog with metadata for all sandbox permissions.
 */
export const PERMISSION_CATALOG: PermissionMetadata[] = [
  // Scene permissions
  {
    permission: 'scene:read',
    label: 'Read Scene',
    description: 'Read scene graph, nodes, and properties',
    riskLevel: 'low',
    category: 'Scene',
    requiresApproval: false,
  },
  {
    permission: 'scene:write',
    label: 'Modify Scene',
    description: 'Add, remove, or modify scene nodes and properties',
    riskLevel: 'high',
    category: 'Scene',
    requiresApproval: true,
  },
  {
    permission: 'scene:subscribe',
    label: 'Scene Notifications',
    description: 'Receive real-time scene change notifications',
    riskLevel: 'low',
    category: 'Scene',
    requiresApproval: false,
  },

  // Editor permissions
  {
    permission: 'editor:selection',
    label: 'Selection Access',
    description: 'Read and modify current selection',
    riskLevel: 'medium',
    category: 'Editor',
    requiresApproval: false,
  },
  {
    permission: 'editor:viewport',
    label: 'Viewport Control',
    description: 'Read and control the viewport camera and zoom',
    riskLevel: 'medium',
    category: 'Editor',
    requiresApproval: false,
  },
  {
    permission: 'editor:undo',
    label: 'Undo Stack',
    description: 'Push operations to the undo/redo stack',
    riskLevel: 'medium',
    category: 'Editor',
    requiresApproval: true,
  },

  // UI permissions
  {
    permission: 'ui:panel',
    label: 'Custom Panels',
    description: 'Register custom UI panels',
    riskLevel: 'low',
    category: 'UI',
    requiresApproval: false,
  },
  {
    permission: 'ui:toolbar',
    label: 'Toolbar Buttons',
    description: 'Register toolbar buttons',
    riskLevel: 'low',
    category: 'UI',
    requiresApproval: false,
  },
  {
    permission: 'ui:menu',
    label: 'Menu Items',
    description: 'Register menu items',
    riskLevel: 'low',
    category: 'UI',
    requiresApproval: false,
  },
  {
    permission: 'ui:modal',
    label: 'Modal Dialogs',
    description: 'Show modal dialog windows',
    riskLevel: 'medium',
    category: 'UI',
    requiresApproval: false,
  },
  {
    permission: 'ui:notification',
    label: 'Notifications',
    description: 'Show toast notifications',
    riskLevel: 'low',
    category: 'UI',
    requiresApproval: false,
  },
  {
    permission: 'ui:theme',
    label: 'Theme Access',
    description: 'Read current theme for styling',
    riskLevel: 'low',
    category: 'UI',
    requiresApproval: false,
  },

  // Storage permissions
  {
    permission: 'storage:local',
    label: 'Local Storage',
    description: 'Read/write plugin-scoped local storage',
    riskLevel: 'low',
    category: 'Storage',
    requiresApproval: false,
  },
  {
    permission: 'storage:project',
    label: 'Project Storage',
    description: 'Read/write project-scoped storage',
    riskLevel: 'medium',
    category: 'Storage',
    requiresApproval: true,
  },

  // Network permissions
  {
    permission: 'network:fetch',
    label: 'HTTP Requests',
    description: 'Make HTTP requests to allowed domains',
    riskLevel: 'high',
    category: 'Network',
    requiresApproval: true,
  },
  {
    permission: 'network:websocket',
    label: 'WebSocket',
    description: 'Open WebSocket connections to allowed domains',
    riskLevel: 'high',
    category: 'Network',
    requiresApproval: true,
  },

  // Clipboard permissions
  {
    permission: 'clipboard:read',
    label: 'Read Clipboard',
    description: 'Read clipboard contents',
    riskLevel: 'high',
    category: 'Clipboard',
    requiresApproval: true,
  },
  {
    permission: 'clipboard:write',
    label: 'Write Clipboard',
    description: 'Write to clipboard',
    riskLevel: 'medium',
    category: 'Clipboard',
    requiresApproval: true,
  },

  // File system permissions
  {
    permission: 'fs:import',
    label: 'Import Files',
    description: 'Import files via file picker',
    riskLevel: 'medium',
    category: 'Files',
    requiresApproval: true,
  },
  {
    permission: 'fs:export',
    label: 'Export Files',
    description: 'Export/download files',
    riskLevel: 'medium',
    category: 'Files',
    requiresApproval: true,
  },

  // User info permissions
  {
    permission: 'user:read',
    label: 'User Info',
    description: 'Read current user name and preferences',
    riskLevel: 'medium',
    category: 'User',
    requiresApproval: true,
  },

  // Node registration permissions
  {
    permission: 'nodes:workflow',
    label: 'Workflow Nodes',
    description: 'Register custom workflow nodes',
    riskLevel: 'medium',
    category: 'Nodes',
    requiresApproval: true,
  },
  {
    permission: 'nodes:behaviortree',
    label: 'Behavior Tree Nodes',
    description: 'Register custom behavior tree nodes',
    riskLevel: 'medium',
    category: 'Nodes',
    requiresApproval: true,
  },

  // Keyboard permissions
  {
    permission: 'keyboard:shortcuts',
    label: 'Keyboard Shortcuts',
    description: 'Register keyboard shortcuts',
    riskLevel: 'medium',
    category: 'Keyboard',
    requiresApproval: true,
  },
];

// ── Permission Validation Result ───────────────────────────────────────────

/**
 * Result of a permission check.
 */
export interface PermissionCheckResult {
  /** Whether the permission is granted */
  granted: boolean;
  /** The permission that was checked */
  permission: SandboxPermission;
  /** Reason for denial (if not granted) */
  reason?: string;
  /** Risk level of the permission */
  riskLevel?: PermissionRiskLevel;
}

/**
 * Result of validating an entire manifest.
 */
export interface ManifestValidationResult {
  /** Whether the manifest is valid */
  valid: boolean;
  /** Permissions that will be auto-granted */
  autoGranted: SandboxPermission[];
  /** Permissions requiring user approval */
  requiresApproval: SandboxPermission[];
  /** Invalid or unknown permissions */
  invalid: string[];
  /** Warnings about risky permission combinations */
  warnings: string[];
}

// ── PluginPermissions Class ────────────────────────────────────────────────

/**
 * PluginPermissions manages runtime permission enforcement for a plugin.
 *
 * @example
 * ```typescript
 * const permissions = new PluginPermissions('my-plugin', manifest, grantedPermissions);
 *
 * // Check permission before API call
 * const check = permissions.check('scene:write');
 * if (!check.granted) {
 *   console.warn(`Permission denied: ${check.reason}`);
 *   return;
 * }
 *
 * // Validate network URL against policy
 * const urlAllowed = permissions.isUrlAllowed('https://api.example.com/data');
 * ```
 */
export class PluginPermissions {
  private readonly pluginId: string;
  private readonly manifest: PluginSandboxManifest;
  private readonly grantedPermissions: Set<SandboxPermission>;
  private violationCount: number = 0;
  private violationLog: Array<{
    timestamp: number;
    permission: SandboxPermission;
    details: string;
  }> = [];

  constructor(
    pluginId: string,
    manifest: PluginSandboxManifest,
    grantedPermissions: SandboxPermission[]
  ) {
    this.pluginId = pluginId;
    this.manifest = manifest;
    this.grantedPermissions = new Set(grantedPermissions);
  }

  /**
   * Check if a specific permission is granted.
   */
  check(permission: SandboxPermission): PermissionCheckResult {
    if (this.grantedPermissions.has(permission)) {
      const metadata = PERMISSION_CATALOG.find((p) => p.permission === permission);
      return {
        granted: true,
        permission,
        riskLevel: metadata?.riskLevel,
      };
    }

    // Record violation
    this.violationCount++;
    const details = `Plugin '${this.pluginId}' attempted to use '${permission}' without grant`;
    this.violationLog.push({ timestamp: Date.now(), permission, details });

    // Cap violation log
    if (this.violationLog.length > 200) {
      this.violationLog.shift();
    }

    return {
      granted: false,
      permission,
      reason: this.manifest.permissions.includes(permission)
        ? `Permission '${permission}' was requested but not granted by user`
        : `Permission '${permission}' was not declared in plugin manifest`,
    };
  }

  /**
   * Check multiple permissions at once.
   * Returns granted=true only if ALL permissions are granted.
   */
  checkAll(permissions: SandboxPermission[]): PermissionCheckResult {
    for (const perm of permissions) {
      const result = this.check(perm);
      if (!result.granted) {
        return result;
      }
    }
    return { granted: true, permission: permissions[0] };
  }

  /**
   * Check if any of the given permissions are granted.
   */
  checkAny(permissions: SandboxPermission[]): PermissionCheckResult {
    for (const perm of permissions) {
      if (this.grantedPermissions.has(perm)) {
        return { granted: true, permission: perm };
      }
    }

    this.violationCount++;
    return {
      granted: false,
      permission: permissions[0],
      reason: `None of the permissions [${permissions.join(', ')}] are granted`,
    };
  }

  /**
   * Validate a URL against the plugin's network policy.
   */
  isUrlAllowed(url: string): boolean {
    if (
      !this.grantedPermissions.has('network:fetch') &&
      !this.grantedPermissions.has('network:websocket')
    ) {
      return false;
    }

    const policy = this.manifest.networkPolicy;
    if (!policy) return false;

    try {
      const parsed = new URL(url);
      const hostname = parsed.hostname;

      // Check localhost
      if ((hostname === 'localhost' || hostname === '127.0.0.1') && !policy.allowLocalhost) {
        return false;
      }

      // Check against allowed domains
      return policy.allowedDomains.some((pattern) => {
        if (pattern.startsWith('*.')) {
          const baseDomain = pattern.slice(2);
          return hostname === baseDomain || hostname.endsWith(`.${baseDomain}`);
        }
        return hostname === pattern;
      });
    } catch {
      return false;
    }
  }

  /**
   * Get the total number of permission violations.
   */
  getViolationCount(): number {
    return this.violationCount;
  }

  /**
   * Get the violation log.
   */
  getViolationLog(): Array<{ timestamp: number; permission: SandboxPermission; details: string }> {
    return [...this.violationLog];
  }

  /**
   * Get all granted permissions.
   */
  getGrantedPermissions(): SandboxPermission[] {
    return [...this.grantedPermissions];
  }

  /**
   * Check if the plugin should be terminated due to excessive violations.
   */
  shouldTerminate(maxViolations: number = 50): boolean {
    return this.violationCount >= maxViolations;
  }

  /**
   * Validate a plugin manifest and return the validation result.
   * Static method for use before sandbox creation.
   */
  static validateManifest(manifest: PluginSandboxManifest): ManifestValidationResult {
    const knownPermissions = new Set(PERMISSION_CATALOG.map((p) => p.permission));
    const autoGranted: SandboxPermission[] = [];
    const requiresApproval: SandboxPermission[] = [];
    const invalid: string[] = [];
    const warnings: string[] = [];

    for (const perm of manifest.permissions) {
      if (!knownPermissions.has(perm)) {
        invalid.push(perm);
        continue;
      }

      const metadata = PERMISSION_CATALOG.find((p) => p.permission === perm)!;
      if (metadata.requiresApproval) {
        requiresApproval.push(perm);
      } else {
        autoGranted.push(perm);
      }
    }

    // Check for risky combinations
    if (
      manifest.permissions.includes('network:fetch') &&
      manifest.permissions.includes('clipboard:read')
    ) {
      warnings.push(
        'Plugin requests both network and clipboard read access - potential data exfiltration risk'
      );
    }
    if (
      manifest.permissions.includes('scene:write') &&
      manifest.permissions.includes('network:fetch')
    ) {
      warnings.push(
        'Plugin requests both scene write and network access - could modify scene based on external input'
      );
    }
    if (manifest.permissions.includes('network:fetch') && !manifest.networkPolicy) {
      warnings.push(
        'Plugin requests network:fetch but has no networkPolicy - all network requests will be blocked'
      );
    }

    return {
      valid: invalid.length === 0,
      autoGranted,
      requiresApproval,
      invalid,
      warnings,
    };
  }

  /**
   * Get metadata for a permission.
   */
  static getPermissionMetadata(permission: SandboxPermission): PermissionMetadata | undefined {
    return PERMISSION_CATALOG.find((p) => p.permission === permission);
  }

  /**
   * Get all permissions grouped by category.
   */
  static getPermissionsByCategory(): Map<string, PermissionMetadata[]> {
    const categories = new Map<string, PermissionMetadata[]>();
    for (const meta of PERMISSION_CATALOG) {
      const list = categories.get(meta.category) || [];
      list.push(meta);
      categories.set(meta.category, list);
    }
    return categories;
  }
}
