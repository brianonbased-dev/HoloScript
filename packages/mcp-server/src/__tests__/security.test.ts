/**
 * Security Module Tests — OAuth 2.1 + Triple-Gate + Audit Logging
 *
 * Tests cover:
 * 1. OAuth 2.1: client registration, PKCE flow, token rotation, introspection, revocation
 * 2. Gate 1: prompt validation (size, depth, injection, rate limiting)
 * 3. Gate 2: per-tool scope authorization
 * 4. Gate 3: StdlibPolicy enforcement (path traversal, network, GPU)
 * 5. Triple-gate integration
 * 6. Audit logging: PII redaction, query, compliance stats
 * 7. Legacy API key backwards compatibility
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHash } from 'crypto';
import {
  OAuth21Service,
  resetOAuth21Service,
  SCOPE_CATEGORIES,
  type TokenIntrospection,
} from '../security/oauth21';
import {
  authorizeToolCall,
  getToolRiskLevel,
  getToolScopes,
  getToolsForScope,
} from '../security/tool-scopes';
import {
  gate1ValidateRequest,
  gate3EnforcePolicy,
  runTripleGate,
  DEFAULT_GATE1_CONFIG,
} from '../security/gates';
import {
  getAuditLogger,
  resetAuditLogger,
  redactPII,
} from '../security/audit-log';

// ═══════════════════════════════════════════════════════════════════════════════
// 1. OAuth 2.1 Token Service
// ═══════════════════════════════════════════════════════════════════════════════

describe('OAuth21Service', () => {
  let oauth: OAuth21Service;

  beforeEach(() => {
    resetOAuth21Service();
    oauth = new OAuth21Service({
      tokenSecret: 'test-secret-that-is-at-least-32-bytes-long-for-hmac',
      migrationMode: 'permissive',
      legacyApiKey: 'test-legacy-key',
    });
  });

  afterEach(() => {
    resetOAuth21Service();
  });

  describe('Client Registration', () => {
    it('should register a confidential client', () => {
      const { clientId, clientSecret } = oauth.registerClient({
        clientName: 'test-agent',
        redirectUris: ['https://example.com/callback'],
        scopes: ['tools:read', 'tools:write'],
      });

      expect(clientId).toMatch(/^hsc_/);
      expect(clientSecret).toMatch(/^hs_/);

      const client = oauth.getClient(clientId);
      expect(client).toBeDefined();
      expect(client!.clientName).toBe('test-agent');
      expect(client!.clientType).toBe('confidential');
      expect(client!.scopes).toEqual(['tools:read', 'tools:write']);
    });

    it('should register a public client', () => {
      const { clientId } = oauth.registerClient({
        clientName: 'browser-app',
        redirectUris: ['https://app.holoscript.net/callback'],
        scopes: ['tools:read'],
        clientType: 'public',
      });

      const client = oauth.getClient(clientId);
      expect(client!.clientType).toBe('public');
    });

    it('should revoke a client and all its tokens', () => {
      const { clientId, clientSecret } = oauth.registerClient({
        clientName: 'disposable',
        redirectUris: [],
        scopes: ['tools:read'],
      });

      // Issue tokens
      const tokenResponse = oauth.exchangeClientCredentials({
        clientId,
        clientSecret,
        scopes: ['tools:read'],
      });

      expect(oauth.introspect(tokenResponse.access_token).active).toBe(true);

      // Revoke client
      const revoked = oauth.revokeClient(clientId);
      expect(revoked).toBe(true);

      // Tokens should be invalid
      expect(oauth.introspect(tokenResponse.access_token).active).toBe(false);
      expect(oauth.getClient(clientId)).toBeUndefined();
    });
  });

  describe('Client Credentials Flow', () => {
    it('should issue access and refresh tokens', () => {
      const { clientId, clientSecret } = oauth.registerClient({
        clientName: 'backend-service',
        redirectUris: [],
        scopes: ['tools:read', 'tools:write'],
      });

      const response = oauth.exchangeClientCredentials({
        clientId,
        clientSecret,
        scopes: ['tools:read'],
      });

      expect(response.access_token).toMatch(/^hs_/);
      expect(response.refresh_token).toMatch(/^hs_/);
      expect(response.token_type).toBe('Bearer');
      expect(response.expires_in).toBe(900);
      expect(response.scope).toBe('tools:read');
    });

    it('should reject invalid client credentials', () => {
      const { clientId } = oauth.registerClient({
        clientName: 'test',
        redirectUris: [],
        scopes: ['tools:read'],
      });

      expect(() => oauth.exchangeClientCredentials({
        clientId,
        clientSecret: 'wrong-secret',
        scopes: ['tools:read'],
      })).toThrow('Invalid client credentials');
    });

    it('should reject scopes not authorized for client', () => {
      const { clientId, clientSecret } = oauth.registerClient({
        clientName: 'limited',
        redirectUris: [],
        scopes: ['tools:read'],
      });

      expect(() => oauth.exchangeClientCredentials({
        clientId,
        clientSecret,
        scopes: ['tools:admin'],
      })).toThrow('Scopes not authorized');
    });

    it('should reject public clients from using client_credentials grant', () => {
      const { clientId, clientSecret } = oauth.registerClient({
        clientName: 'public-app',
        redirectUris: ['https://example.com/cb'],
        scopes: ['tools:read'],
        clientType: 'public',
      });

      expect(() => oauth.exchangeClientCredentials({
        clientId,
        clientSecret,
      })).toThrow('Client credentials grant requires confidential client');
    });
  });

  describe('Authorization Code Flow (PKCE)', () => {
    it('should complete full PKCE flow', () => {
      const { clientId, clientSecret } = oauth.registerClient({
        clientName: 'pkce-client',
        redirectUris: ['https://example.com/callback'],
        scopes: ['tools:read', 'tools:write'],
      });

      // Generate PKCE verifier and challenge
      const codeVerifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
      const codeChallenge = createHash('sha256')
        .update(codeVerifier)
        .digest('base64url');

      // Step 1: Create authorization code
      const code = oauth.createAuthorizationCode({
        clientId,
        redirectUri: 'https://example.com/callback',
        scopes: ['tools:read'],
        codeChallenge,
        codeChallengeMethod: 'S256',
      });

      expect(code).toMatch(/^hs_/);

      // Step 2: Exchange code for tokens
      const response = oauth.exchangeAuthorizationCode({
        code,
        clientId,
        clientSecret,
        redirectUri: 'https://example.com/callback',
        codeVerifier,
      });

      expect(response.access_token).toBeTruthy();
      expect(response.refresh_token).toBeTruthy();
      expect(response.scope).toBe('tools:read');
    });

    it('should reject authorization code reuse', () => {
      const { clientId, clientSecret } = oauth.registerClient({
        clientName: 'reuse-test',
        redirectUris: ['https://example.com/cb'],
        scopes: ['tools:read'],
      });

      const codeVerifier = 'test-verifier-string-that-is-long-enough';
      const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');

      const code = oauth.createAuthorizationCode({
        clientId,
        redirectUri: 'https://example.com/cb',
        scopes: ['tools:read'],
        codeChallenge,
        codeChallengeMethod: 'S256',
      });

      // First use: succeeds
      oauth.exchangeAuthorizationCode({
        code, clientId, clientSecret,
        redirectUri: 'https://example.com/cb',
        codeVerifier,
      });

      // Second use: fails
      expect(() => oauth.exchangeAuthorizationCode({
        code, clientId, clientSecret,
        redirectUri: 'https://example.com/cb',
        codeVerifier,
      })).toThrow('Authorization code already used');
    });

    it('should reject wrong PKCE verifier', () => {
      const { clientId, clientSecret } = oauth.registerClient({
        clientName: 'pkce-fail',
        redirectUris: ['https://example.com/cb'],
        scopes: ['tools:read'],
      });

      const codeChallenge = createHash('sha256').update('correct-verifier').digest('base64url');

      const code = oauth.createAuthorizationCode({
        clientId,
        redirectUri: 'https://example.com/cb',
        scopes: ['tools:read'],
        codeChallenge,
        codeChallengeMethod: 'S256',
      });

      expect(() => oauth.exchangeAuthorizationCode({
        code, clientId, clientSecret,
        redirectUri: 'https://example.com/cb',
        codeVerifier: 'wrong-verifier',
      })).toThrow('PKCE verification failed');
    });
  });

  describe('Token Rotation', () => {
    it('should rotate refresh tokens', () => {
      const { clientId, clientSecret } = oauth.registerClient({
        clientName: 'rotation-test',
        redirectUris: [],
        scopes: ['tools:read'],
      });

      const initial = oauth.exchangeClientCredentials({ clientId, clientSecret });
      const refreshed = oauth.refreshAccessToken({
        refreshToken: initial.refresh_token!,
        clientId,
        clientSecret,
      });

      expect(refreshed.access_token).not.toBe(initial.access_token);
      expect(refreshed.refresh_token).not.toBe(initial.refresh_token);
    });

    it('should detect refresh token replay and revoke chain', () => {
      const { clientId, clientSecret } = oauth.registerClient({
        clientName: 'replay-test',
        redirectUris: [],
        scopes: ['tools:read'],
      });

      const initial = oauth.exchangeClientCredentials({ clientId, clientSecret });
      const oldRefresh = initial.refresh_token!;

      // Rotate once
      oauth.refreshAccessToken({
        refreshToken: oldRefresh,
        clientId,
        clientSecret,
      });

      // Replay old token
      expect(() => oauth.refreshAccessToken({
        refreshToken: oldRefresh,
        clientId,
        clientSecret,
      })).toThrow('Refresh token replay detected');
    });
  });

  describe('Token Introspection & Revocation', () => {
    it('should introspect active tokens', () => {
      const { clientId, clientSecret } = oauth.registerClient({
        clientName: 'introspect-test',
        redirectUris: [],
        scopes: ['tools:read', 'tools:codebase'],
      });

      const response = oauth.exchangeClientCredentials({
        clientId,
        clientSecret,
        agentId: 'my-agent-v1',
      });

      const introspection = oauth.introspect(response.access_token);
      expect(introspection.active).toBe(true);
      expect(introspection.clientId).toBe(clientId);
      expect(introspection.scopes).toContain('tools:read');
      expect(introspection.agentId).toBe('my-agent-v1');
    });

    it('should revoke access tokens', () => {
      const { clientId, clientSecret } = oauth.registerClient({
        clientName: 'revoke-test',
        redirectUris: [],
        scopes: ['tools:read'],
      });

      const response = oauth.exchangeClientCredentials({ clientId, clientSecret });
      expect(oauth.introspect(response.access_token).active).toBe(true);

      oauth.revokeToken(response.access_token);
      expect(oauth.introspect(response.access_token).active).toBe(false);
    });
  });

  describe('Legacy API Key Compatibility', () => {
    it('should accept legacy Bearer token in permissive mode', () => {
      const result = oauth.authenticateRequest({
        authorization: 'Bearer test-legacy-key',
      });
      expect(result.active).toBe(true);
      expect(result.agentId).toBe('legacy-api-key');
    });

    it('should accept legacy x-api-key header', () => {
      const result = oauth.authenticateRequest({
        'x-api-key': 'test-legacy-key',
      });
      expect(result.active).toBe(true);
    });

    it('should reject invalid legacy key', () => {
      const result = oauth.authenticateRequest({
        'x-api-key': 'wrong-key',
      });
      expect(result.active).toBe(false);
    });
  });

  describe('OpenID Configuration', () => {
    it('should return valid discovery document', () => {
      const config = oauth.getOpenIDConfiguration();
      expect(config.issuer).toBeTruthy();
      expect(config.token_endpoint).toContain('/oauth/token');
      expect(config.grant_types_supported).toContain('authorization_code');
      expect(config.code_challenge_methods_supported).toContain('S256');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. Gate 1: Prompt Validation
// ═══════════════════════════════════════════════════════════════════════════════

describe('Gate 1: Prompt Validation', () => {
  it('should pass valid tool arguments', () => {
    const result = gate1ValidateRequest(
      'parse_hs',
      { code: 'object Cube { position: [0,1,0] }' },
      'test-client',
    );
    expect(result.passed).toBe(true);
  });

  it('should block oversized arguments', () => {
    const result = gate1ValidateRequest(
      'parse_hs',
      { code: 'x'.repeat(2 * 1024 * 1024) },
      'test-client',
      { ...DEFAULT_GATE1_CONFIG, maxBodySize: 1024 },
    );
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('exceeds maximum size');
  });

  it('should block deep nesting', () => {
    // Build deeply nested object
    let nested: Record<string, unknown> = { value: 'leaf' };
    for (let i = 0; i < 15; i++) {
      nested = { inner: nested };
    }

    const result = gate1ValidateRequest(
      'parse_hs',
      nested,
      'test-client',
    );
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('nesting depth');
  });

  it('should detect shell injection patterns', () => {
    const result = gate1ValidateRequest(
      'parse_hs',
      { code: '; rm -rf /' },
      'test-client',
    );
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('Suspicious patterns');
  });

  it('should detect path traversal', () => {
    const result = gate1ValidateRequest(
      'parse_hs',
      { code: '../../../etc/passwd' },
      'test-client',
    );
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('Suspicious patterns');
  });

  it('should detect prototype pollution attempts', () => {
    // V8 strips __proto__ from object literals, so we need to use Object.create
    const malicious: Record<string, unknown> = {};
    Object.defineProperty(malicious, 'constructor', {
      value: { prototype: 'polluted' },
      enumerable: true,
    });
    malicious['__proto__'] = { isAdmin: true };

    const result = gate1ValidateRequest(
      'parse_hs',
      malicious,
      'test-client-proto',
    );
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('Prototype pollution');
  });

  it('should enforce rate limiting', () => {
    const config = { ...DEFAULT_GATE1_CONFIG, rateLimitPerMinute: 3 };

    for (let i = 0; i < 3; i++) {
      const r = gate1ValidateRequest('parse_hs', { code: 'test' }, 'rate-test-client', config);
      expect(r.passed).toBe(true);
    }

    const limited = gate1ValidateRequest('parse_hs', { code: 'test' }, 'rate-test-client', config);
    expect(limited.passed).toBe(false);
    expect(limited.reason).toContain('Rate limit exceeded');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. Gate 2: Tool Scope Authorization
// ═══════════════════════════════════════════════════════════════════════════════

describe('Gate 2: Tool Scope Authorization', () => {
  it('should authorize read-only tool with tools:read scope', () => {
    const result = authorizeToolCall('parse_hs', ['tools:read']);
    expect(result.authorized).toBe(true);
    expect(result.riskLevel).toBe('low');
  });

  it('should deny write tool with only read scope', () => {
    const result = authorizeToolCall('generate_scene', ['tools:read']);
    expect(result.authorized).toBe(false);
    expect(result.reason).toContain('Insufficient scope');
    expect(result.requiredScopes).toContain('tools:write');
  });

  it('should authorize all tools with admin:* scope', () => {
    const criticalTools = ['holo_self_diagnose', 'execute_holotest', 'browser_launch'];
    for (const tool of criticalTools) {
      const result = authorizeToolCall(tool, ['admin:*']);
      expect(result.authorized).toBe(true);
    }
  });

  it('should authorize codebase tools with tools:codebase scope', () => {
    const result = authorizeToolCall('holo_absorb_repo', ['tools:codebase']);
    expect(result.authorized).toBe(true);
  });

  it('should deny browser tools without tools:browser scope', () => {
    const result = authorizeToolCall('browser_launch', ['tools:read', 'tools:write']);
    expect(result.authorized).toBe(false);
  });

  it('should return correct risk levels', () => {
    expect(getToolRiskLevel('parse_hs')).toBe('low');
    expect(getToolRiskLevel('generate_scene')).toBe('medium');
    expect(getToolRiskLevel('browser_execute')).toBe('high');
    expect(getToolRiskLevel('holo_self_diagnose')).toBe('critical');
  });

  it('should list tools for a scope', () => {
    const readTools = getToolsForScope('tools:read');
    expect(readTools).toContain('parse_hs');
    expect(readTools).toContain('validate_holoscript');
    expect(readTools).not.toContain('generate_scene');
  });

  it('should return scopes for a tool', () => {
    const scopes = getToolScopes('compile_holoscript');
    expect(scopes).toContain('tools:write');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. Gate 3: StdlibPolicy Enforcement
// ═══════════════════════════════════════════════════════════════════════════════

describe('Gate 3: StdlibPolicy Enforcement', () => {
  const auth: TokenIntrospection = {
    active: true,
    scopes: ['admin:*'],
    clientId: 'test-client',
    agentId: 'test-agent',
  };

  it('should pass for non-downstream tools (pure computation)', () => {
    const result = gate3EnforcePolicy('parse_hs', { code: 'test' }, auth);
    expect(result.passed).toBe(true);
  });

  it('should block path traversal in downstream tools', () => {
    const result = gate3EnforcePolicy(
      'edit_holo',
      { path: '../../etc/shadow' },
      auth,
    );
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('Path traversal blocked');
  });

  it('should block GPU access when policy denies it', () => {
    const result = gate3EnforcePolicy(
      'render_preview',
      { code: 'test', useGpu: true },
      auth,
    );
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('GPU compute access denied');
  });

  it('should block critical tools in open-dev-mode', () => {
    const devAuth: TokenIntrospection = {
      active: true,
      scopes: ['admin:*'],
      agentId: 'open-dev-mode',
    };

    const result = gate3EnforcePolicy('holo_self_diagnose', {}, devAuth);
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('Critical-risk tools require authenticated access');
  });

  it('should enforce video duration limits', () => {
    const result = gate3EnforcePolicy(
      'render_preview',
      { code: 'test', duration: 999_999_999 },
      auth,
    );
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('exceeds policy limit');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. Triple-Gate Integration
// ═══════════════════════════════════════════════════════════════════════════════

describe('Triple-Gate Integration', () => {
  it('should pass all gates for a valid authenticated request', () => {
    const auth: TokenIntrospection = {
      active: true,
      scopes: ['tools:read'],
      clientId: 'valid-client',
      agentId: 'my-agent',
    };

    const result = runTripleGate('parse_hs', { code: 'test' }, auth);
    expect(result.passed).toBe(true);
    expect(result.gate).toBe(3);
  });

  it('should fail at gate 0 for unauthenticated request', () => {
    const auth: TokenIntrospection = { active: false };

    const result = runTripleGate('parse_hs', { code: 'test' }, auth);
    expect(result.passed).toBe(false);
    expect(result.gate).toBe(0);
    expect(result.reason).toBe('Authentication required');
  });

  it('should fail at gate 2 for insufficient scopes', () => {
    const auth: TokenIntrospection = {
      active: true,
      scopes: ['tools:read'],
      clientId: 'limited-client',
    };

    const result = runTripleGate('browser_launch', { holoscriptFile: 'test.holo' }, auth);
    expect(result.passed).toBe(false);
    expect(result.gate).toBe(2);
    expect(result.reason).toContain('Insufficient scope');
  });

  it('should fail at gate 3 for policy violation', () => {
    const auth: TokenIntrospection = {
      active: true,
      scopes: ['admin:*'],
      agentId: 'open-dev-mode',
    };

    const result = runTripleGate('holo_self_diagnose', {}, auth);
    expect(result.passed).toBe(false);
    expect(result.gate).toBe(3);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. Audit Logging
// ═══════════════════════════════════════════════════════════════════════════════

describe('Audit Logging', () => {
  beforeEach(() => {
    resetAuditLogger();
  });

  afterEach(() => {
    resetAuditLogger();
  });

  describe('PII Redaction', () => {
    it('should redact email addresses', () => {
      const summary = redactPII({ email: 'test@example.com' });
      expect(summary.email).toBe('[REDACTED]');
    });

    it('should redact password fields', () => {
      const summary = redactPII({ password: 'secret123' });
      expect(summary.password).toBe('[REDACTED]');
    });

    it('should redact PII patterns in values', () => {
      const summary = redactPII({
        info: 'Contact me at user@example.com please',
      });
      expect(summary.info).toContain('[REDACTED:');
    });

    it('should truncate long strings', () => {
      const summary = redactPII({ code: 'x'.repeat(200) });
      expect(summary.code).toContain('[200 chars]');
    });

    it('should summarize arrays and objects', () => {
      const summary = redactPII({
        items: [1, 2, 3],
        nested: { a: 1, b: 2 },
      });
      expect(summary.items).toBe('[Array:3 items]');
      expect(summary.nested).toBe('[Object:2 keys]');
    });
  });

  describe('Audit Log Queries', () => {
    it('should log and query tool invocations', () => {
      const logger = getAuditLogger({ stdoutJsonl: false });
      const auth: TokenIntrospection = {
        active: true,
        scopes: ['tools:read'],
        clientId: 'test-client',
        agentId: 'test-agent',
      };

      const gateResult = {
        passed: true,
        gate: 3 as const,
        riskLevel: 'low' as const,
        gate1: { passed: true },
        gate2: { authorized: true },
        gate3: { passed: true },
      };

      logger.logToolInvocation({
        toolName: 'parse_hs',
        args: { code: 'test' },
        auth,
        gateResult,
      });

      const result = logger.query({ toolName: 'parse_hs' });
      expect(result.total).toBe(1);
      expect(result.entries[0].tool?.name).toBe('parse_hs');
      expect(result.entries[0].agent.clientId).toBe('test-client');
    });

    it('should filter by event type', () => {
      const logger = getAuditLogger({ stdoutJsonl: false });

      logger.logAuthEvent({
        event: 'auth_failure',
        reason: 'bad token',
      });

      logger.logAuthEvent({
        event: 'auth_success',
        clientId: 'good-client',
      });

      const failures = logger.query({ event: 'auth_failure' });
      expect(failures.total).toBe(1);

      const successes = logger.query({ event: 'auth_success' });
      expect(successes.total).toBe(1);
    });

    it('should support pagination', () => {
      const logger = getAuditLogger({ stdoutJsonl: false });

      for (let i = 0; i < 5; i++) {
        logger.logAuthEvent({ event: 'auth_success', clientId: `client-${i}` });
      }

      const page1 = logger.query({ limit: 2, offset: 0 });
      expect(page1.entries.length).toBe(2);
      expect(page1.total).toBe(5);

      const page2 = logger.query({ limit: 2, offset: 2 });
      expect(page2.entries.length).toBe(2);
    });
  });

  describe('Compliance Stats', () => {
    it('should return valid compliance report', () => {
      const logger = getAuditLogger({ stdoutJsonl: false });

      logger.logAuthEvent({ event: 'auth_success', clientId: 'test' });

      const stats = logger.getComplianceStats();
      expect(stats.compliance).toBe('eu-ai-act-articles-12-14');
      expect(stats.reporting_period).toBeDefined();
      expect((stats.reporting_period as any).last24h.totalEvents).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Export', () => {
    it('should export as JSON', () => {
      const logger = getAuditLogger({ stdoutJsonl: false });
      logger.logAuthEvent({ event: 'auth_success', clientId: 'test' });

      const exported = logger.export('json');
      const parsed = JSON.parse(exported);
      expect(parsed.compliance).toBe('eu-ai-act-articles-12-14');
      expect(parsed.entries.length).toBe(1);
    });

    it('should export as JSONL', () => {
      const logger = getAuditLogger({ stdoutJsonl: false });
      logger.logAuthEvent({ event: 'auth_success', clientId: 'a' });
      logger.logAuthEvent({ event: 'auth_success', clientId: 'b' });

      const exported = logger.export('jsonl');
      const lines = exported.split('\n').filter(Boolean);
      expect(lines.length).toBe(2);
      expect(JSON.parse(lines[0]).agent.clientId).toBe('a');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. Scope Categories
// ═══════════════════════════════════════════════════════════════════════════════

describe('Scope Categories', () => {
  it('should define all expected scopes', () => {
    const scopes = Object.keys(SCOPE_CATEGORIES);
    expect(scopes).toContain('tools:read');
    expect(scopes).toContain('tools:write');
    expect(scopes).toContain('tools:codebase');
    expect(scopes).toContain('tools:browser');
    expect(scopes).toContain('tools:admin');
    expect(scopes).toContain('a2a:tasks');
    expect(scopes).toContain('admin:*');
  });
});
