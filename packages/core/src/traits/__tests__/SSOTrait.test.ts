import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ssoSamlHandler, ssoOidcHandler } from '../SSOTrait';
import type { HSPlusNode } from '../TraitTypes';

// =============================================================================
// HELPERS
// =============================================================================

function makeNode(overrides: Partial<HSPlusNode> = {}): HSPlusNode {
  return {
    type: 'object',
    name: 'SSOGateway',
    traits: [],
    children: [],
    properties: {},
    ...overrides,
  } as HSPlusNode;
}

function makeContext() {
  return {
    scene: {} as any,
    runtime: {} as any,
    dt: 0.016,
    emit: vi.fn(),
  };
}

function makeConfig() {
  return { ...ssoSamlHandler.defaultConfig!, tenantId: 'test-tenant-001', enabled: true };
}

function makeSamlIdP(overrides: Record<string, any> = {}) {
  return {
    idpId: 'test-idp-saml',
    name: 'Test SAML IdP',
    protocol: 'saml2' as const,
    isDefault: true,
    enabled: true,
    saml: {
      entityId: 'urn:test:idp',
      ssoUrl: 'https://idp.example.com/saml/sso',
      sloUrl: 'https://idp.example.com/saml/slo',
      certificate: 'MIIC...test',
      binding: 'HTTP-POST' as const,
      nameIdFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress' as const,
      signAuthnRequests: true,
      requireSignedAssertions: true,
    },
    attributeMapping: { email: 'user.email' },
    roleMapping: { admin: 'Administrator' },
    ...overrides,
  };
}

// Helper to set up a node with SSO state + registered IdP
function setupWithIdP() {
  const node = makeNode();
  const config = makeConfig();
  const ctx = makeContext();

  ssoSamlHandler.onAttach!(node, config, ctx);

  ssoSamlHandler.onEvent!(node, config, ctx, {
    type: 'sso_register_idp',
    idp: makeSamlIdP(),
  } as any);

  return { node, config, ctx };
}

// Helper to initiate auth and get the nonce
function initiateAuth(node: any, config: any, ctx: any) {
  ssoSamlHandler.onEvent!(node, config, ctx, {
    type: 'sso_init_auth',
    idpId: 'test-idp-saml',
    redirectUri: 'https://app.example.com/callback',
  } as any);

  const state = (node as any).__ssoState;
  const nonce = [...state.pendingAuthRequests.keys()][0];
  return nonce;
}

// =============================================================================
// TESTS
// =============================================================================

describe('SSOTrait', () => {
  // -------------------------------------------------------------------------
  // Handler metadata
  // -------------------------------------------------------------------------
  describe('handler metadata', () => {
    it('ssoSamlHandler should have name "sso_saml"', () => {
      expect(ssoSamlHandler.name).toBe('sso_saml');
    });

    it('ssoOidcHandler should have name "sso_oidc"', () => {
      expect(ssoOidcHandler.name).toBe('sso_oidc');
    });

    it('should have sensible default config', () => {
      const defaults = ssoSamlHandler.defaultConfig!;
      expect(defaults.enabled).toBe(false);
      expect(defaults.enforceSso).toBe(false);
      expect(defaults.sessionTimeoutMinutes).toBe(480);
      expect(defaults.maxSessionsPerUser).toBe(5);
      expect(defaults.jitProvisioningEnabled).toBe(true);
      expect(defaults.jitDefaultRole).toBe('viewer');
    });

    it('ssoOidcHandler should share implementation with ssoSamlHandler', () => {
      expect(ssoOidcHandler.onAttach).toBe(ssoSamlHandler.onAttach);
      expect(ssoOidcHandler.onDetach).toBe(ssoSamlHandler.onDetach);
      expect(ssoOidcHandler.onEvent).toBe(ssoSamlHandler.onEvent);
    });
  });

  // -------------------------------------------------------------------------
  // onAttach
  // -------------------------------------------------------------------------
  describe('onAttach', () => {
    it('should initialize SSO state on the node when tenantId is set', () => {
      const node = makeNode();
      const config = makeConfig();
      ssoSamlHandler.onAttach!(node, config, makeContext());

      const state = (node as any).__ssoState;
      expect(state).toBeDefined();
      expect(state.idps).toBeInstanceOf(Map);
      expect(state.sessions).toBeInstanceOf(Map);
      expect(state.pendingAuthRequests).toBeInstanceOf(Map);
      expect(state.jitProvisionedUsers).toBeInstanceOf(Set);
      expect(state.authLog).toEqual([]);
    });

    it('should emit sso_error when tenantId is missing', () => {
      const node = makeNode();
      const config = { ...ssoSamlHandler.defaultConfig! }; // no tenantId
      const ctx = makeContext();

      ssoSamlHandler.onAttach!(node, config, ctx);

      expect(ctx.emit).toHaveBeenCalledWith(
        'sso_error',
        expect.objectContaining({
          error: 'TENANT_ID_REQUIRED',
        })
      );
      expect((node as any).__ssoState).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // onDetach
  // -------------------------------------------------------------------------
  describe('onDetach', () => {
    it('should clear state from the node', () => {
      const node = makeNode();
      const config = makeConfig();
      const ctx = makeContext();

      ssoSamlHandler.onAttach!(node, config, ctx);
      expect((node as any).__ssoState).toBeDefined();

      ssoSamlHandler.onDetach!(node, config, ctx);
      expect((node as any).__ssoState).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // sso_register_idp
  // -------------------------------------------------------------------------
  describe('sso_register_idp', () => {
    it('should register a SAML identity provider', () => {
      const { node } = setupWithIdP();

      const state = (node as any).__ssoState;
      expect(state.idps.size).toBe(1);
      expect(state.idps.has('test-idp-saml')).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // sso_init_auth
  // -------------------------------------------------------------------------
  describe('sso_init_auth', () => {
    it('should create a pending auth request', () => {
      const { node, config, ctx } = setupWithIdP();

      initiateAuth(node, config, ctx);

      const state = (node as any).__ssoState;
      expect(state.pendingAuthRequests.size).toBe(1);
    });

    it('should emit sso_saml_authn_request for SAML IdPs', () => {
      const { node, config, ctx } = setupWithIdP();

      initiateAuth(node, config, ctx);

      expect(ctx.emit).toHaveBeenCalledWith(
        'sso_saml_authn_request',
        expect.objectContaining({
          tenantId: 'test-tenant-001',
          idpId: 'test-idp-saml',
        })
      );
    });
  });

  // -------------------------------------------------------------------------
  // sso_auth_callback (complete auth)
  // -------------------------------------------------------------------------
  describe('sso_auth_callback', () => {
    it('should create a session on successful auth callback', () => {
      const { node, config, ctx } = setupWithIdP();
      const nonce = initiateAuth(node, config, ctx);

      ssoSamlHandler.onEvent!(node, config, ctx, {
        type: 'sso_auth_callback',
        nonce,
        externalUserId: 'ext-user-123',
        internalUserId: 'int-user-456',
        attributes: { email: 'user@example.com' },
        idpRoles: ['admin'],
      } as any);

      const state = (node as any).__ssoState;
      expect(state.sessions.size).toBe(1);
      expect(state.pendingAuthRequests.size).toBe(0);
      expect(state.authLog.length).toBeGreaterThanOrEqual(1);
    });

    it('should emit sso_authenticated on success', () => {
      const { node, config, ctx } = setupWithIdP();
      const nonce = initiateAuth(node, config, ctx);

      ssoSamlHandler.onEvent!(node, config, ctx, {
        type: 'sso_auth_callback',
        nonce,
        externalUserId: 'ext-user-123',
        attributes: {},
      } as any);

      expect(ctx.emit).toHaveBeenCalledWith(
        'sso_authenticated',
        expect.objectContaining({
          tenantId: 'test-tenant-001',
        })
      );
    });

    it('should reject invalid nonce', () => {
      const { node, config, ctx } = setupWithIdP();

      ssoSamlHandler.onEvent!(node, config, ctx, {
        type: 'sso_auth_callback',
        nonce: 'invalid-nonce-xxx',
        externalUserId: 'ext-user-123',
      } as any);

      expect(ctx.emit).toHaveBeenCalledWith(
        'sso_auth_error',
        expect.objectContaining({
          error: 'INVALID_NONCE',
        })
      );
    });
  });

  // -------------------------------------------------------------------------
  // sso_logout
  // -------------------------------------------------------------------------
  describe('sso_logout', () => {
    it('should revoke session on single logout', () => {
      const { node, config, ctx } = setupWithIdP();
      const nonce = initiateAuth(node, config, ctx);

      // Complete auth
      ssoSamlHandler.onEvent!(node, config, ctx, {
        type: 'sso_auth_callback',
        nonce,
        externalUserId: 'ext-user-123',
        internalUserId: 'int-user-789',
        attributes: {},
      } as any);

      const state = (node as any).__ssoState;
      const sessionId = [...state.sessions.keys()][0];
      expect(state.sessions.get(sessionId)!.status).toBe('active');

      // Logout
      ssoSamlHandler.onEvent!(node, config, ctx, {
        type: 'sso_logout',
        sessionId,
      } as any);

      expect(state.sessions.get(sessionId)!.status).toBe('revoked');
      expect(state.authLog.some((e: any) => e.type === 'logout')).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // onUpdate — session expiration
  // -------------------------------------------------------------------------
  describe('onUpdate', () => {
    it('should not throw when called', () => {
      const node = makeNode();
      const config = makeConfig();
      const ctx = makeContext();
      ssoSamlHandler.onAttach!(node, config, ctx);

      expect(() => {
        ssoSamlHandler.onUpdate!(node, config, ctx, 0.016);
      }).not.toThrow();
    });
  });
});
