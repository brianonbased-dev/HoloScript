/**
 * SSO Trait
 *
 * Implements Single Sign-On integration for HoloScript enterprise multi-tenant
 * deployments. Supports:
 *
 * - SAML 2.0: Enterprise SSO with identity providers (Okta, Azure AD, OneLogin, etc.)
 * - OIDC (OpenID Connect): Modern OAuth 2.0 based SSO (Google, Auth0, Keycloak, etc.)
 *
 * Features:
 * - Identity provider (IdP) metadata management
 * - Session management with configurable timeouts
 * - Just-in-time (JIT) user provisioning
 * - Attribute mapping (IdP attributes -> HoloScript roles/properties)
 * - Multi-IdP support per tenant
 * - Token validation and refresh
 * - Logout (single and global)
 *
 * @version 1.0.0
 * @category enterprise
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

/** SSO protocol types */
export type SSOProtocol = 'saml2' | 'oidc';

/** SSO session states */
export type SSOSessionStatus = 'active' | 'expired' | 'revoked' | 'pending_mfa';

/** SAML 2.0 binding types */
export type SAMLBinding = 'HTTP-POST' | 'HTTP-Redirect' | 'SOAP';

/** SAML NameID format */
export type SAMLNameIDFormat =
  | 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress'
  | 'urn:oasis:names:tc:SAML:2.0:nameid-format:persistent'
  | 'urn:oasis:names:tc:SAML:2.0:nameid-format:transient'
  | 'urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified';

/** Identity Provider configuration */
export interface IdPConfig {
  /** Unique IdP identifier */
  idpId: string;
  /** Human-readable name */
  name: string;
  /** SSO protocol */
  protocol: SSOProtocol;
  /** Whether this IdP is the default for the tenant */
  isDefault: boolean;
  /** Whether this IdP is enabled */
  enabled: boolean;

  // SAML 2.0 specific
  saml?: {
    /** IdP Entity ID */
    entityId: string;
    /** SSO Service URL */
    ssoUrl: string;
    /** SLO (Single Logout) Service URL */
    sloUrl?: string;
    /** IdP signing certificate (PEM or fingerprint) */
    certificate: string;
    /** Preferred binding */
    binding: SAMLBinding;
    /** NameID format */
    nameIdFormat: SAMLNameIDFormat;
    /** Whether to sign authn requests */
    signAuthnRequests: boolean;
    /** Whether to require signed assertions */
    requireSignedAssertions: boolean;
  };

  // OIDC specific
  oidc?: {
    /** Issuer URL */
    issuer: string;
    /** Client ID */
    clientId: string;
    /** Client secret (encrypted) */
    clientSecretEncrypted: string;
    /** Authorization endpoint */
    authorizationEndpoint: string;
    /** Token endpoint */
    tokenEndpoint: string;
    /** Userinfo endpoint */
    userinfoEndpoint: string;
    /** JWKS URI for token verification */
    jwksUri: string;
    /** Scopes to request */
    scopes: string[];
    /** Response type */
    responseType: 'code' | 'id_token' | 'code id_token';
    /** PKCE enabled */
    pkceEnabled: boolean;
  };

  /** Attribute mapping (IdP attribute -> HoloScript attribute) */
  attributeMapping: Record<string, string>;
  /** Role mapping (IdP group/role -> HoloScript RBAC role) */
  roleMapping: Record<string, string>;
}

/** SSO Session */
export interface SSOSession {
  /** Session ID */
  sessionId: string;
  /** User identifier from IdP */
  externalUserId: string;
  /** Internal user ID (after mapping) */
  internalUserId: string;
  /** Tenant context */
  tenantId: string;
  /** IdP that authenticated this user */
  idpId: string;
  /** Protocol used */
  protocol: SSOProtocol;
  /** Session status */
  status: SSOSessionStatus;
  /** Authentication timestamp */
  authenticatedAt: string;
  /** Session expiry */
  expiresAt: string;
  /** Last activity */
  lastActivityAt: string;
  /** Mapped attributes */
  attributes: Record<string, string>;
  /** Mapped roles */
  roles: string[];
  /** Token data (for OIDC) */
  tokenData?: {
    accessToken: string;
    refreshToken?: string;
    idToken: string;
    tokenType: string;
    expiresIn: number;
  };
  /** SAML session data */
  samlData?: {
    nameId: string;
    sessionIndex: string;
  };
  /** IP address of the session */
  ipAddress?: string;
  /** User agent */
  userAgent?: string;
}

/** SSO configuration for trait handler */
export interface SSOConfig {
  /** Tenant this SSO belongs to */
  tenantId: string;
  /** Whether SSO is enabled */
  enabled: boolean;
  /** Whether to enforce SSO (disable password login) */
  enforceSso: boolean;
  /** Service Provider Entity ID (for SAML) */
  spEntityId: string;
  /** Assertion Consumer Service URL (for SAML) */
  acsUrl: string;
  /** Default session timeout in minutes */
  sessionTimeoutMinutes: number;
  /** Maximum concurrent sessions per user */
  maxSessionsPerUser: number;
  /** Whether to enable JIT provisioning */
  jitProvisioningEnabled: boolean;
  /** Default role for JIT-provisioned users */
  jitDefaultRole: string;
  /** Whether to sync roles on every login */
  syncRolesOnLogin: boolean;
  /** Allowed redirect URIs after authentication */
  allowedRedirectUris: string[];
  /** Whether to require MFA after SSO */
  requireMfaAfterSso: boolean;
}

/** Internal state for SSO */
interface SSOState {
  /** Registered identity providers */
  idps: Map<string, IdPConfig>;
  /** Active sessions */
  sessions: Map<string, SSOSession>;
  /** Pending auth requests (nonce -> metadata) */
  pendingAuthRequests: Map<string, { createdAt: string; idpId: string; redirectUri: string }>;
  /** JIT-provisioned users */
  jitProvisionedUsers: Set<string>;
  /** Authentication event log */
  authLog: SSOAuthEvent[];
}

/** Authentication event */
export interface SSOAuthEvent {
  timestamp: string;
  type: 'login' | 'logout' | 'token_refresh' | 'session_expired' | 'jit_provision' | 'auth_failure';
  tenantId: string;
  userId?: string;
  idpId?: string;
  protocol?: SSOProtocol;
  details: Record<string, unknown>;
}

// =============================================================================
// SSO TRAIT HANDLER
// =============================================================================

export const ssoSamlHandler: TraitHandler<SSOConfig> = {
  name: 'sso_saml',

  defaultConfig: {
    tenantId: '',
    enabled: false,
    enforceSso: false,
    spEntityId: '',
    acsUrl: '',
    sessionTimeoutMinutes: 480,
    maxSessionsPerUser: 5,
    jitProvisioningEnabled: true,
    jitDefaultRole: 'viewer',
    syncRolesOnLogin: true,
    allowedRedirectUris: [],
    requireMfaAfterSso: false,
  },

  onAttach(node, config, context) {
    if (!config.tenantId) {
      context.emit('sso_error', {
        node,
        error: 'TENANT_ID_REQUIRED',
        message: 'SSO must be associated with a tenant',
      });
      return;
    }

    const state: SSOState = {
      idps: new Map(),
      sessions: new Map(),
      pendingAuthRequests: new Map(),
      jitProvisionedUsers: new Set(),
      authLog: [],
    };

    node.__ssoState = state;

    context.emit('sso_initialized', {
      node,
      tenantId: config.tenantId,
      protocol: 'saml2',
    });
    context.emit('audit_log', {
      action: 'sso.initialize',
      tenantId: config.tenantId,
      details: { protocol: 'saml2', enforceSso: config.enforceSso },
      timestamp: new Date().toISOString(),
    });
  },

  onDetach(node, config, context) {
    const state = node.__ssoState as SSOState | undefined;
    if (state) {
      // Invalidate all sessions
      for (const [sessionId, session] of state.sessions) {
        session.status = 'revoked';
        context.emit('sso_session_revoked', {
          node,
          sessionId,
          userId: session.internalUserId,
        });
      }

      context.emit('audit_log', {
        action: 'sso.teardown',
        tenantId: config.tenantId,
        details: {
          sessionsRevoked: state.sessions.size,
          totalAuthEvents: state.authLog.length,
        },
        timestamp: new Date().toISOString(),
      });
    }
    delete node.__ssoState;
  },

  onUpdate(node, config, context, _delta) {
    const state = node.__ssoState as SSOState | undefined;
    if (!state || !config.enabled) return;

    const now = new Date();

    // Expire sessions
    for (const [sessionId, session] of state.sessions) {
      if (session.status === 'active' && new Date(session.expiresAt) <= now) {
        session.status = 'expired';
        state.authLog.push({
          timestamp: now.toISOString(),
          type: 'session_expired',
          tenantId: config.tenantId,
          userId: session.internalUserId,
          idpId: session.idpId,
          details: { sessionId },
        });
        context.emit('sso_session_expired', {
          node,
          sessionId,
          userId: session.internalUserId,
        });
      }
    }

    // Clean up expired pending auth requests (5 min timeout)
    for (const [nonce, request] of state.pendingAuthRequests) {
      if (now.getTime() - new Date(request.createdAt).getTime() > 5 * 60 * 1000) {
        state.pendingAuthRequests.delete(nonce);
      }
    }

    // Trim auth log
    if (state.authLog.length > 10000) {
      state.authLog = state.authLog.slice(-10000);
    }
  },

  onEvent(node, config, context, event) {
    const state = node.__ssoState as SSOState | undefined;
    if (!state) return;

    if (event.type === 'sso_register_idp') {
      const idpConfig = (event as Record<string, unknown>).idp as IdPConfig;
      if (!idpConfig || !idpConfig.idpId) return;

      state.idps.set(idpConfig.idpId, { ...idpConfig });

      context.emit('sso_idp_registered', {
        node,
        tenantId: config.tenantId,
        idpId: idpConfig.idpId,
        name: idpConfig.name,
        protocol: idpConfig.protocol,
      });
      context.emit('audit_log', {
        action: 'sso.idp.register',
        tenantId: config.tenantId,
        details: {
          idpId: idpConfig.idpId,
          name: idpConfig.name,
          protocol: idpConfig.protocol,
        },
        timestamp: new Date().toISOString(),
      });
    } else if (event.type === 'sso_remove_idp') {
      const idpId = (event as Record<string, unknown>).idpId as string;
      if (idpId && state.idps.has(idpId)) {
        state.idps.delete(idpId);

        // Revoke sessions for this IdP
        for (const [sessionId, session] of state.sessions) {
          if (session.idpId === idpId && session.status === 'active') {
            session.status = 'revoked';
            context.emit('sso_session_revoked', { node, sessionId });
          }
        }

        context.emit('sso_idp_removed', {
          node,
          tenantId: config.tenantId,
          idpId,
        });
        context.emit('audit_log', {
          action: 'sso.idp.remove',
          tenantId: config.tenantId,
          details: { idpId },
          timestamp: new Date().toISOString(),
        });
      }
    } else if (event.type === 'sso_init_auth') {
      const idpId = (event as Record<string, unknown>).idpId as string;
      const redirectUri = (event as Record<string, unknown>).redirectUri as string;
      const idp = state.idps.get(idpId);

      if (!idp || !idp.enabled) {
        context.emit('sso_auth_error', {
          node,
          error: 'IDP_NOT_FOUND_OR_DISABLED',
          idpId,
        });
        return;
      }

      const nonce = `auth_${Date.now()}_${Math.random().toString(36).substring(2, 16)}`;
      state.pendingAuthRequests.set(nonce, {
        createdAt: new Date().toISOString(),
        idpId,
        redirectUri: redirectUri || '',
      });

      if (idp.protocol === 'saml2' && idp.saml) {
        context.emit('sso_saml_authn_request', {
          node,
          nonce,
          tenantId: config.tenantId,
          idpId,
          ssoUrl: idp.saml.ssoUrl,
          spEntityId: config.spEntityId,
          acsUrl: config.acsUrl,
          binding: idp.saml.binding,
          nameIdFormat: idp.saml.nameIdFormat,
          signRequest: idp.saml.signAuthnRequests,
        });
      } else if (idp.protocol === 'oidc' && idp.oidc) {
        context.emit('sso_oidc_auth_redirect', {
          node,
          nonce,
          tenantId: config.tenantId,
          idpId,
          authorizationEndpoint: idp.oidc.authorizationEndpoint,
          clientId: idp.oidc.clientId,
          scopes: idp.oidc.scopes,
          responseType: idp.oidc.responseType,
          pkce: idp.oidc.pkceEnabled,
          redirectUri,
        });
      }
    } else if (event.type === 'sso_auth_callback') {
      const nonce = (event as Record<string, unknown>).nonce as string;
      const pending = state.pendingAuthRequests.get(nonce);

      if (!pending) {
        state.authLog.push({
          timestamp: new Date().toISOString(),
          type: 'auth_failure',
          tenantId: config.tenantId,
          details: { reason: 'invalid_nonce', nonce },
        });
        context.emit('sso_auth_error', {
          node,
          error: 'INVALID_NONCE',
          nonce,
        });
        return;
      }

      state.pendingAuthRequests.delete(nonce);
      const idp = state.idps.get(pending.idpId);
      if (!idp) return;

      // Extract user info from callback
      const externalUserId = (event as Record<string, unknown>).externalUserId as string;
      const attributes =
        ((event as Record<string, unknown>).attributes as Record<string, string>) ||
        ({} as Record<string, string>);
      const internalUserId =
        ((event as Record<string, unknown>).internalUserId as string) || externalUserId;

      // Map roles from IdP
      const mappedRoles: string[] = [];
      const idpRoles = ((event as Record<string, unknown>).idpRoles as string[]) || [];
      for (const idpRole of idpRoles) {
        const mappedRole = idp.roleMapping[idpRole];
        if (mappedRole) {
          mappedRoles.push(mappedRole);
        }
      }

      // JIT provisioning
      let isJitProvisioned = false;
      if (config.jitProvisioningEnabled && !state.jitProvisionedUsers.has(internalUserId)) {
        state.jitProvisionedUsers.add(internalUserId);
        isJitProvisioned = true;
        if (mappedRoles.length === 0) {
          mappedRoles.push(config.jitDefaultRole);
        }
        state.authLog.push({
          timestamp: new Date().toISOString(),
          type: 'jit_provision',
          tenantId: config.tenantId,
          userId: internalUserId,
          idpId: idp.idpId,
          details: { externalUserId, roles: mappedRoles },
        });
        context.emit('sso_user_provisioned', {
          node,
          tenantId: config.tenantId,
          userId: internalUserId,
          externalUserId,
          roles: mappedRoles,
          attributes,
        });
      }

      // Check concurrent session limit
      let userSessionCount = 0;
      for (const session of state.sessions.values()) {
        if (session.internalUserId === internalUserId && session.status === 'active') {
          userSessionCount++;
        }
      }
      if (userSessionCount >= config.maxSessionsPerUser) {
        // Revoke oldest session
        let oldest: SSOSession | null = null;
        let oldestId: string | null = null;
        for (const [sid, session] of state.sessions) {
          if (
            session.internalUserId === internalUserId &&
            session.status === 'active' &&
            (!oldest || session.authenticatedAt < oldest.authenticatedAt)
          ) {
            oldest = session;
            oldestId = sid;
          }
        }
        if (oldest && oldestId) {
          oldest.status = 'revoked';
          context.emit('sso_session_revoked', {
            node,
            sessionId: oldestId,
            reason: 'max_sessions',
          });
        }
      }

      // Create session
      const sessionId = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 12)}`;
      const now = new Date();
      const session: SSOSession = {
        sessionId,
        externalUserId,
        internalUserId,
        tenantId: config.tenantId,
        idpId: idp.idpId,
        protocol: idp.protocol,
        status: config.requireMfaAfterSso ? 'pending_mfa' : 'active',
        authenticatedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + config.sessionTimeoutMinutes * 60 * 1000).toISOString(),
        lastActivityAt: now.toISOString(),
        attributes,
        roles: mappedRoles,
        tokenData: (event as Record<string, unknown>).tokenData as any,
        samlData: (event as Record<string, unknown>).samlData as any,
        ipAddress: (event as Record<string, unknown>).ipAddress as string,
        userAgent: (event as Record<string, unknown>).userAgent as string,
      };

      state.sessions.set(sessionId, session);

      state.authLog.push({
        timestamp: now.toISOString(),
        type: 'login',
        tenantId: config.tenantId,
        userId: internalUserId,
        idpId: idp.idpId,
        protocol: idp.protocol,
        details: {
          sessionId,
          isJitProvisioned,
          roles: mappedRoles,
          ipAddress: session.ipAddress,
        },
      });

      context.emit('sso_authenticated', {
        node,
        sessionId,
        tenantId: config.tenantId,
        userId: internalUserId,
        externalUserId,
        idpId: idp.idpId,
        protocol: idp.protocol,
        roles: mappedRoles,
        attributes,
        isJitProvisioned,
        requiresMfa: config.requireMfaAfterSso,
      });

      // Sync roles if configured
      if (config.syncRolesOnLogin && mappedRoles.length > 0) {
        context.emit('rbac_sync_roles', {
          node,
          tenantId: config.tenantId,
          userId: internalUserId,
          roles: mappedRoles,
          source: 'sso',
        });
      }

      context.emit('audit_log', {
        action: 'sso.login',
        tenantId: config.tenantId,
        details: {
          userId: internalUserId,
          idpId: idp.idpId,
          protocol: idp.protocol,
          sessionId,
          isJitProvisioned,
          ipAddress: session.ipAddress,
        },
        timestamp: now.toISOString(),
      });
    } else if (event.type === 'sso_logout') {
      const sessionId = (event as Record<string, unknown>).sessionId as string;
      const globalLogout = (event as Record<string, unknown>).global as boolean;
      const userId = (event as Record<string, unknown>).userId as string;

      if (globalLogout && userId) {
        // Revoke all sessions for user
        let revokedCount = 0;
        for (const [sid, session] of state.sessions) {
          if (session.internalUserId === userId && session.status === 'active') {
            session.status = 'revoked';
            revokedCount++;
            context.emit('sso_session_revoked', { node, sessionId: sid });
          }
        }
        state.authLog.push({
          timestamp: new Date().toISOString(),
          type: 'logout',
          tenantId: config.tenantId,
          userId,
          details: { global: true, sessionsRevoked: revokedCount },
        });
        context.emit('sso_global_logout', {
          node,
          tenantId: config.tenantId,
          userId,
          sessionsRevoked: revokedCount,
        });
        context.emit('audit_log', {
          action: 'sso.logout.global',
          tenantId: config.tenantId,
          details: { userId, sessionsRevoked: revokedCount },
          timestamp: new Date().toISOString(),
        });
      } else if (sessionId) {
        const session = state.sessions.get(sessionId);
        if (session && session.status === 'active') {
          session.status = 'revoked';
          state.authLog.push({
            timestamp: new Date().toISOString(),
            type: 'logout',
            tenantId: config.tenantId,
            userId: session.internalUserId,
            idpId: session.idpId,
            details: { sessionId },
          });

          // Initiate SLO if SAML
          if (session.protocol === 'saml2' && session.samlData) {
            const idp = state.idps.get(session.idpId);
            if (idp?.saml?.sloUrl) {
              context.emit('sso_saml_slo_request', {
                node,
                tenantId: config.tenantId,
                sloUrl: idp.saml.sloUrl,
                nameId: session.samlData.nameId,
                sessionIndex: session.samlData.sessionIndex,
              });
            }
          }

          context.emit('sso_session_revoked', { node, sessionId });
          context.emit('audit_log', {
            action: 'sso.logout',
            tenantId: config.tenantId,
            details: { userId: session.internalUserId, sessionId },
            timestamp: new Date().toISOString(),
          });
        }
      }
    } else if (event.type === 'sso_validate_session') {
      const sessionId = (event as Record<string, unknown>).sessionId as string;
      const session = state.sessions.get(sessionId);

      let valid = false;
      let reason = 'session_not_found';

      if (session) {
        if (session.status !== 'active') {
          reason = `session_${session.status}`;
        } else if (new Date(session.expiresAt) <= new Date()) {
          session.status = 'expired';
          reason = 'session_expired';
        } else {
          valid = true;
          reason = 'valid';
          session.lastActivityAt = new Date().toISOString();
        }
      }

      context.emit('sso_session_validation', {
        node,
        checkId: (event as Record<string, unknown>).checkId,
        sessionId,
        valid,
        reason,
        session: valid
          ? {
              userId: session!.internalUserId,
              roles: session!.roles,
              attributes: session!.attributes,
              expiresAt: session!.expiresAt,
            }
          : undefined,
      });
    } else if (event.type === 'sso_query') {
      context.emit('sso_info', {
        queryId: (event as Record<string, unknown>).queryId,
        node,
        tenantId: config.tenantId,
        enabled: config.enabled,
        enforceSso: config.enforceSso,
        idpCount: state.idps.size,
        activeSessions: Array.from(state.sessions.values()).filter((s) => s.status === 'active')
          .length,
        jitProvisionedUsers: state.jitProvisionedUsers.size,
        totalAuthEvents: state.authLog.length,
        idps: Array.from(state.idps.values()).map((idp) => ({
          idpId: idp.idpId,
          name: idp.name,
          protocol: idp.protocol,
          enabled: idp.enabled,
          isDefault: idp.isDefault,
        })),
      });
    }
  },
};

// OIDC handler shares the same implementation with different default name
export const ssoOidcHandler: TraitHandler<SSOConfig> = {
  ...ssoSamlHandler,
  name: 'sso_oidc',
};

export default ssoSamlHandler;
