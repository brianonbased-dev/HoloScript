/**
 * Express middleware + routes for X402-gated retrieval of licensed AST assets.
 *
 * Sibling of the prophetic-GI / TTU-feed Phase 2 commits — this is the third
 * sibling (task _zoje). It wires the framework-side `ASTLicenseRegistry` and
 * `ASTLicenseGate` (in `@holoscript/framework/economy`) to a real HTTP
 * surface so agents and humans can:
 *
 *   - register a licensed AST asset (POST /api/v1/ast-assets)
 *   - read its public manifest (GET /api/v1/ast-assets/:id/manifest)
 *   - list registered assets (GET /api/v1/ast-assets)
 *   - retrieve the AST payload behind an x402 paywall
 *     (GET /api/v1/ast-assets/:id) — returns 402 PaymentRequired with a
 *     WWW-Authenticate header until a valid X-PAYMENT base64 payload is
 *     attached.
 *
 * The retrieval path is the canonical x402 flow — same headers + body shape
 * that `x402PaymentService.return402Response` already uses, so existing x402
 * clients (CDP, PayAI, Meridian) work without changes.
 */

import express, { type Request, type Response, type NextFunction, type Router } from 'express';
import {
  ASTLicenseRegistry,
  ASTLicenseGate,
  astAssetLicenseSchema,
  createLicensedASTAsset,
  X402Facilitator,
  type ASTAssetManifest,
  type X402PaymentPayload,
} from '@holoscript/framework/economy';
import { safeParseX402PaymentPayload } from '@holoscript/framework/economy';

// =============================================================================
// CONFIG
// =============================================================================

export interface ASTLicenseRouteOptions {
  /** Registry instance — caller-controlled for test injection. */
  registry?: ASTLicenseRegistry;
  /** Optional shared facilitator. If omitted, each gate builds its own. */
  facilitator?: X402Facilitator;
  /** Resource path prefix used when emitting 402 responses. */
  resourcePathPrefix?: string;
}

// =============================================================================
// MIDDLEWARE — gates a single resource handler behind a license
// =============================================================================

/**
 * Express middleware factory. Wraps a downstream handler so it only runs when
 * the requester has either:
 *   - a free / cached / settled gate access, OR
 *   - a valid X-PAYMENT header that the gate accepts.
 *
 * The middleware looks up the asset by `req.params.assetId`. On 402 it sets
 * the `WWW-Authenticate` header in the same shape as `x402PaymentService` so
 * existing facilitator clients reuse the same parser.
 */
export function requireASTLicense(registry: ASTLicenseRegistry) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const assetId = req.params.assetId;
    const gate = registry.getGate(assetId);
    if (!gate) {
      res.status(404).json({ error: 'Unknown asset', assetId });
      return;
    }

    // Optional payer hint (so cached grants short-circuit before payment).
    const payer =
      typeof req.headers['x-x402-payer'] === 'string'
        ? (req.headers['x-x402-payer'] as string)
        : undefined;

    const xPayment = req.headers['x-payment'];

    // Fast path: no payment supplied — try cache, otherwise 402.
    if (!xPayment) {
      const attempt = gate.attemptAccess(payer);
      if (attempt.granted) {
        (req as Request & { astGate?: ASTLicenseGate }).astGate = gate;
        next();
        return;
      }
      respond402(res, gate, attempt);
      return;
    }

    // Slow path: a payment was attached. Decode + submit.
    const decoded = decodeXPaymentHeader(xPayment);
    if (!decoded) {
      res.status(400).json({ error: 'Malformed X-PAYMENT header' });
      return;
    }
    const settled = await gate.submitPayment(decoded);
    if (settled.granted) {
      (req as Request & { astGate?: ASTLicenseGate }).astGate = gate;
      // Always echo X-PAYMENT-RESPONSE on success so clients can persist receipt.
      if ('receipt' in settled && settled.receipt) {
        res.setHeader(
          'X-PAYMENT-RESPONSE',
          X402Facilitator.createPaymentResponseHeader(settled.receipt)
        );
      }
      next();
      return;
    }
    respond402(res, gate, settled);
  };
}

function decodeXPaymentHeader(raw: unknown): X402PaymentPayload | null {
  if (typeof raw !== 'string') return null;
  // Try base64-decoded JSON first (canonical x402 wire shape).
  const decoded = X402Facilitator.decodeXPaymentHeader(raw);
  if (decoded) return decoded;
  // Fall back to plain JSON (some test agents send unencoded).
  try {
    const parsed: unknown = JSON.parse(raw);
    const v = safeParseX402PaymentPayload(parsed);
    return v.success ? (v.data as X402PaymentPayload) : null;
  } catch {
    return null;
  }
}

function respond402(
  res: Response,
  gate: ASTLicenseGate,
  attempt: { granted: false; paymentRequired: unknown; requiredAmountBaseUnits: string; resource: string }
) {
  const license = gate.getPublicManifest().license;
  res
    .status(402)
    .header(
      'WWW-Authenticate',
      `x402 price="${license.priceUSDC}" asset="USDC" network="${license.chain}" resource="${attempt.resource}"`
    )
    .json({
      error: 'Payment required',
      assetId: gate.getPublicManifest().assetId,
      license: gate.getPublicManifest().license,
      requiredAmountBaseUnits: attempt.requiredAmountBaseUnits,
      x402: attempt.paymentRequired,
    });
}

// =============================================================================
// ROUTER
// =============================================================================

export interface RegisterRequestBody {
  source: string;
  author: string;
  /** Optional override of any in-source @license directive. */
  license?: Partial<import('@holoscript/framework/economy').ASTAssetLicense>;
  assetId?: string;
}

/**
 * Build the AST-asset router. Mounted at `/api/v1` in the marketplace server,
 * giving:
 *   POST   /api/v1/ast-assets                 — register
 *   GET    /api/v1/ast-assets                 — list manifests
 *   GET    /api/v1/ast-assets/:assetId/manifest  — public manifest only
 *   GET    /api/v1/ast-assets/:assetId         — gated retrieval (returns 402)
 */
export function createASTAssetRouter(opts: ASTLicenseRouteOptions = {}): Router {
  const registry =
    opts.registry ??
    new ASTLicenseRegistry({
      facilitator: opts.facilitator,
      resourcePathPrefix: opts.resourcePathPrefix ?? '/api/v1/ast-assets',
    });
  const router = express.Router();

  // ── REGISTER ───────────────────────────────────────────────────────────────
  router.post('/ast-assets', async (req: Request, res: Response) => {
    try {
      const body = req.body as RegisterRequestBody;
      if (!body || typeof body.source !== 'string' || typeof body.author !== 'string') {
        res.status(400).json({ error: 'source and author are required' });
        return;
      }
      const validatedLicense = body.license
        ? astAssetLicenseSchema.partial().safeParse(body.license)
        : { success: true as const, data: undefined };
      if (!validatedLicense.success) {
        res.status(400).json({ error: 'Invalid license override', detail: validatedLicense.error.issues });
        return;
      }
      const reg = await createLicensedASTAsset({
        source: body.source,
        author: body.author,
        license: validatedLicense.data as Partial<import('@holoscript/framework/economy').ASTAssetLicense>,
        assetId: body.assetId,
      });
      try {
        registry.register(reg.asset);
      } catch (err) {
        res
          .status(409)
          .json({ error: 'Asset already registered', detail: (err as Error).message });
        return;
      }
      res.status(201).json({
        manifest: reg.asset.manifest,
        licenseFromAST: reg.licenseFromAST,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(400).json({ error: 'Registration failed', detail: msg });
    }
  });

  // ── LIST ───────────────────────────────────────────────────────────────────
  router.get('/ast-assets', (_req: Request, res: Response) => {
    const items: ASTAssetManifest[] = registry.list();
    res.json({ count: items.length, items });
  });

  // ── PUBLIC MANIFEST (no payment) ───────────────────────────────────────────
  router.get('/ast-assets/:assetId/manifest', (req: Request, res: Response) => {
    const gate = registry.getGate(req.params.assetId);
    if (!gate) {
      res.status(404).json({ error: 'Unknown asset', assetId: req.params.assetId });
      return;
    }
    res.json({ manifest: gate.getPublicManifest() });
  });

  // ── GATED RETRIEVAL ────────────────────────────────────────────────────────
  router.get(
    '/ast-assets/:assetId',
    requireASTLicense(registry),
    (req: Request, res: Response) => {
      const gate = (req as Request & { astGate?: ASTLicenseGate }).astGate;
      if (!gate) {
        res.status(500).json({ error: 'Gate missing on granted request — internal error' });
        return;
      }
      const payload = gate.releasePayload();
      res.json({
        manifest: payload.manifest,
        source: payload.source,
        ast: payload.astRoot,
      });
    }
  );

  // Expose the registry for tests and ops endpoints.
  (router as Router & { _registry?: ASTLicenseRegistry })._registry = registry;
  return router;
}

/** Get the registry attached to a router (for tests / external coordination). */
export function getRegistryFromRouter(router: Router): ASTLicenseRegistry | undefined {
  return (router as Router & { _registry?: ASTLicenseRegistry })._registry;
}
