/**
 * Tests for PopMiddleware — Express-compatible PoP (proof-of-possession)
 * verification middleware and the requirePermission / requireWorkflowStep
 * guards.
 *
 * Previously untested (zero references in repo). This middleware is the HTTP
 * trust gate: every guard path (missing auth, invalid token, legacy bypass,
 * missing JWK thumbprint, permission/workflow checks) is a place where a wrong
 * decision admits an unauthenticated or unauthorized request. The tests use a
 * fake token issuer so the decision logic is exercised without full crypto.
 */

import { describe, it, expect } from 'vitest';
import {
  createPopMiddleware,
  requirePermission,
  requireWorkflowStep,
  type AuthenticatedRequest,
  type HttpResponse,
} from '../PopMiddleware';
import type { AgentTokenIssuer } from '../AgentTokenIssuer';
import { AgentPermission, type IntentTokenPayload } from '../AgentIdentity';

/** Capturing mock of the Express-style response object. */
function mockRes() {
  const res = {
    statusCode: 0 as number,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this as unknown as HttpResponse;
    },
    json(body: unknown) {
      this.body = body;
    },
  };
  return res;
}

/** Minimal next() spy. */
function mockNext() {
  const fn = ((err?: unknown) => {
    fn.called = true;
    fn.error = err;
  }) as ((err?: unknown) => void) & { called: boolean; error?: unknown };
  fn.called = false;
  return fn;
}

/** Build a fake token issuer with controllable extract/verify behavior. */
function fakeIssuer(opts: {
  extracted?: string | null;
  verify?: { valid: boolean; payload?: IntentTokenPayload; errorCode?: string; error?: string };
}): AgentTokenIssuer {
  return {
    extractToken: () => (opts.extracted === undefined ? 'tok' : opts.extracted),
    verifyToken: () => opts.verify ?? { valid: false, errorCode: 'INVALID_TOKEN', error: 'no' },
  } as unknown as AgentTokenIssuer;
}

/** Build a valid-looking intent token payload. */
function payload(overrides: Partial<IntentTokenPayload> = {}): IntentTokenPayload {
  return {
    agent_role: 'code_generator',
    permissions: [AgentPermission.WRITE_CODE],
    intent: { workflow_step: 'generate_code' },
    ...overrides,
  } as unknown as IntentTokenPayload;
}

function baseReq(overrides: Partial<AuthenticatedRequest> = {}): AuthenticatedRequest {
  return {
    method: 'POST',
    url: '/api/compile',
    path: '/api/compile',
    headers: {},
    ...overrides,
  };
}

describe('createPopMiddleware', () => {
  it('skips verification for excluded paths', async () => {
    const mw = createPopMiddleware({ excludePaths: ['/health'], tokenIssuer: fakeIssuer({}) });
    const res = mockRes();
    const next = mockNext();
    await mw(baseReq({ path: '/health/live' }), res as unknown as HttpResponse, next);
    expect(next.called).toBe(true);
    expect(res.statusCode).toBe(0);
  });

  it('rejects a request with no Authorization header (401)', async () => {
    const mw = createPopMiddleware({ tokenIssuer: fakeIssuer({}) });
    const res = mockRes();
    const next = mockNext();
    await mw(baseReq(), res as unknown as HttpResponse, next);
    expect(res.statusCode).toBe(401);
    expect((res.body as { code: string }).code).toBe('MISSING_AUTH');
    expect(next.called).toBe(false);
  });

  it('rejects when the token cannot be extracted (401)', async () => {
    const mw = createPopMiddleware({ tokenIssuer: fakeIssuer({ extracted: null }) });
    const res = mockRes();
    const next = mockNext();
    await mw(
      baseReq({ headers: { authorization: 'garbage' } }),
      res as unknown as HttpResponse,
      next
    );
    expect(res.statusCode).toBe(401);
    expect((res.body as { code: string }).code).toBe('INVALID_AUTH');
  });

  it('rejects when token verification fails (401)', async () => {
    const mw = createPopMiddleware({
      tokenIssuer: fakeIssuer({ verify: { valid: false, errorCode: 'EXPIRED', error: 'old' } }),
    });
    const res = mockRes();
    const next = mockNext();
    await mw(
      baseReq({ headers: { authorization: 'Bearer x' } }),
      res as unknown as HttpResponse,
      next
    );
    expect(res.statusCode).toBe(401);
    expect((res.body as { code: string }).code).toBe('EXPIRED');
  });

  it('allows a legacy (unsigned) request when allowLegacy is true', async () => {
    const mw = createPopMiddleware({
      allowLegacy: true,
      tokenIssuer: fakeIssuer({ verify: { valid: true, payload: payload() } }),
    });
    const res = mockRes();
    const next = mockNext();
    const req = baseReq({ headers: { authorization: 'Bearer x' } });
    await mw(req, res as unknown as HttpResponse, next);
    expect(next.called).toBe(true);
    expect(req.agent).toBeDefined();
    expect(req.agentToken).toBe('tok');
  });

  it('rejects an unsigned request when allowLegacy is false (401)', async () => {
    const mw = createPopMiddleware({
      allowLegacy: false,
      tokenIssuer: fakeIssuer({ verify: { valid: true, payload: payload() } }),
    });
    const res = mockRes();
    const next = mockNext();
    await mw(
      baseReq({ headers: { authorization: 'Bearer x' } }),
      res as unknown as HttpResponse,
      next
    );
    expect(res.statusCode).toBe(401);
    expect((res.body as { code: string }).code).toBe('MISSING_SIGNATURE');
  });

  it('rejects a signed request whose token lacks a JWK thumbprint (400)', async () => {
    const mw = createPopMiddleware({
      allowLegacy: false,
      tokenIssuer: fakeIssuer({ verify: { valid: true, payload: payload() } }),
    });
    const res = mockRes();
    const next = mockNext();
    await mw(
      baseReq({
        headers: {
          authorization: 'Bearer x',
          signature: 'sig1=:abc:',
          'signature-input': 'sig1=("@method");created=1;nonce="n"',
        },
      }),
      res as unknown as HttpResponse,
      next
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as { code: string }).code).toBe('MISSING_JKT');
  });
});

describe('requirePermission', () => {
  it('rejects when no agent identity is attached (401)', () => {
    const res = mockRes();
    const next = mockNext();
    requirePermission(AgentPermission.WRITE_CODE)(baseReq(), res as unknown as HttpResponse, next);
    expect(res.statusCode).toBe(401);
    expect(next.called).toBe(false);
  });

  it('rejects when the agent lacks the permission (403)', () => {
    const res = mockRes();
    const next = mockNext();
    const req = baseReq({ agent: payload({ permissions: [] }) });
    requirePermission(AgentPermission.WRITE_CODE)(req, res as unknown as HttpResponse, next);
    expect(res.statusCode).toBe(403);
    expect((res.body as { code: string }).code).toBe('FORBIDDEN');
  });

  it('calls next when the agent holds the permission', () => {
    const res = mockRes();
    const next = mockNext();
    const req = baseReq({ agent: payload({ permissions: [AgentPermission.WRITE_CODE] }) });
    requirePermission(AgentPermission.WRITE_CODE)(req, res as unknown as HttpResponse, next);
    expect(next.called).toBe(true);
    expect(res.statusCode).toBe(0);
  });
});

describe('requireWorkflowStep', () => {
  it('rejects when no agent identity is attached (401)', () => {
    const res = mockRes();
    const next = mockNext();
    requireWorkflowStep('generate_code')(baseReq(), res as unknown as HttpResponse, next);
    expect(res.statusCode).toBe(401);
  });

  it('rejects on a workflow-step mismatch (403)', () => {
    const res = mockRes();
    const next = mockNext();
    const req = baseReq({
      agent: payload({ intent: { workflow_step: 'parse_ast' } } as Partial<IntentTokenPayload>),
    });
    requireWorkflowStep('generate_code')(req, res as unknown as HttpResponse, next);
    expect(res.statusCode).toBe(403);
    expect((res.body as { code: string }).code).toBe('WORKFLOW_VIOLATION');
  });

  it('calls next when the workflow step matches', () => {
    const res = mockRes();
    const next = mockNext();
    const req = baseReq({ agent: payload() });
    requireWorkflowStep('generate_code')(req, res as unknown as HttpResponse, next);
    expect(next.called).toBe(true);
  });
});
