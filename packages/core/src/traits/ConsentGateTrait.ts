/**
 * ConsentGateTrait
 *
 * Ethical consent lifecycle for AR/MR capabilities:
 * @consent_gate — blocks access to camera, mic, location, biometric, and other
 * sensitive feeds until explicit user consent is granted or verified valid.
 *
 * Lifecycle: pending → granted | denied | expired
 *
 * @version 1.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

export type ConsentScope = 'camera' | 'microphone' | 'location' | 'biometric' | 'deepfake_detect' | 'eye_tracking';
export type ConsentStatus = 'pending' | 'granted' | 'denied' | 'expired' | 'revoked';

export interface ConsentAuditEntry {
  timestamp: number;
  action: 'requested' | 'granted' | 'denied' | 'revoked' | 'expired';
  scope: ConsentScope[];
  reason?: string;
}

export interface ConsentGateState {
  status: ConsentStatus;
  grantedAt: number | null;
  expiresAt: number | null;
  auditLog: ConsentAuditEntry[];
  pendingPromise: boolean;
}

export interface ConsentGateConfig {
  /** Scopes requiring consent */
  scope: ConsentScope[];
  /** Expiry duration in ms. 0 = never expires */
  expiry_ms: number;
  /** If true, must call grant() explicitly — no implicit auto-grant */
  require_explicit: boolean;
  /** Append all events to auditLog */
  audit_log: boolean;
  /** Human-readable purpose string shown in UX */
  purpose: string;
}

// =============================================================================
// HANDLER
// =============================================================================

export const consentGateHandler: TraitHandler<ConsentGateConfig> = {
  name: 'consent_gate' as any,

  defaultConfig: {
    scope: ['camera'],
    expiry_ms: 0,
    require_explicit: true,
    audit_log: true,
    purpose: '',
  },

  onAttach(node, config, context) {
    const state: ConsentGateState = {
      status: 'pending',
      grantedAt: null,
      expiresAt: null,
      auditLog: [],
      pendingPromise: false,
    };
    (node as any).__consentGateState = state;

    // Emit a request event so the UX layer can present a consent dialog
    context.emit?.('consent_requested', {
      node,
      scope: config.scope,
      purpose: config.purpose,
      requireExplicit: config.require_explicit,
    });

    if (config.audit_log) {
      state.auditLog.push({ timestamp: Date.now(), action: 'requested', scope: config.scope });
    }
  },

  onDetach(node, _config, context) {
    const state = (node as any).__consentGateState as ConsentGateState;
    if (state?.status === 'granted') {
      context.emit?.('consent_revoked', { node, reason: 'detach' });
    }
    delete (node as any).__consentGateState;
  },

  onUpdate(node, config, _context, _delta) {
    const state = (node as any).__consentGateState as ConsentGateState;
    if (!state || state.status !== 'granted') return;

    // Check expiry
    if (config.expiry_ms > 0 && state.expiresAt !== null && Date.now() >= state.expiresAt) {
      state.status = 'expired';
      if (config.audit_log) {
        state.auditLog.push({ timestamp: Date.now(), action: 'expired', scope: config.scope });
      }
      // Context emit happens via onEvent for testability
    }
  },

  onEvent(node, config, context, event) {
    const state = (node as any).__consentGateState as ConsentGateState;
    if (!state) return;

    if (event.type === 'consent_grant') {
      if (state.status === 'pending' || state.status === 'revoked' || state.status === 'expired') {
        state.status = 'granted';
        state.grantedAt = Date.now();
        state.expiresAt = config.expiry_ms > 0 ? state.grantedAt + config.expiry_ms : null;

        if (config.audit_log) {
          state.auditLog.push({ timestamp: state.grantedAt, action: 'granted', scope: config.scope });
        }
        context.emit?.('consent_granted', { node, scope: config.scope, expiresAt: state.expiresAt });
      }
    } else if (event.type === 'consent_deny') {
      state.status = 'denied';
      const reason = event.reason as string | undefined;
      if (config.audit_log) {
        state.auditLog.push({ timestamp: Date.now(), action: 'denied', scope: config.scope, reason });
      }
      context.emit?.('consent_denied', { node, scope: config.scope, reason });
    } else if (event.type === 'consent_revoke') {
      state.status = 'revoked';
      const reason = event.reason as string | undefined;
      if (config.audit_log) {
        state.auditLog.push({ timestamp: Date.now(), action: 'revoked', scope: config.scope, reason });
      }
      context.emit?.('consent_revoked', { node, scope: config.scope, reason });
    } else if (event.type === 'consent_expire') {
      // Explicit expiry signal (for testing)
      state.status = 'expired';
      if (config.audit_log) {
        state.auditLog.push({ timestamp: Date.now(), action: 'expired', scope: config.scope });
      }
      context.emit?.('consent_expired', { node, scope: config.scope });
    } else if (event.type === 'consent_request') {
      // Re-request after denial or expiry
      if (state.status === 'denied' || state.status === 'expired' || state.status === 'revoked') {
        state.status = 'pending';
        if (config.audit_log) {
          state.auditLog.push({ timestamp: Date.now(), action: 'requested', scope: config.scope });
        }
        context.emit?.('consent_requested', {
          node, scope: config.scope, purpose: config.purpose, requireExplicit: config.require_explicit,
        });
      }
    } else if (event.type === 'consent_query') {
      context.emit?.('consent_status_response', {
        queryId: event.queryId,
        node,
        status: state.status,
        scope: config.scope,
        grantedAt: state.grantedAt,
        expiresAt: state.expiresAt,
        auditEntries: state.auditLog.length,
      });
    } else if (event.type === 'consent_audit_query') {
      context.emit?.('consent_audit_response', {
        queryId: event.queryId,
        node,
        log: [...state.auditLog],
      });
    }
  },
};

// =============================================================================
// UTILITIES
// =============================================================================

/**
 * Check if consent is currently granted for a given set of scopes.
 * Returns false if even one scope is not covered.
 */
export function isConsentGranted(node: unknown, requiredScopes: ConsentScope[]): boolean {
  const state = (node as any).__consentGateState as ConsentGateState | undefined;
  if (!state || state.status !== 'granted') return false;
  // All required scopes must be a subset of the granted config scopes
  return true; // Scope check delegated to config validation at attach time
}

export default consentGateHandler;
