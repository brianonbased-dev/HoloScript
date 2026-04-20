/**
 * @holoscript/framework - X402 AST Asset Licensing (task _zoje)
 *
 * Sibling of:
 *   - 56bbe2998 feat(snn-webgpu): prophetic GI foundation (txpy)
 *   - e53ee0b93 feat(mesh): TTU multi-agent feed (0v98)
 *
 * Adds **decentralized licensing for HoloScript AST assets** on top of the
 * existing x402 facilitator. The honest cut here is:
 *
 *   1. A typed `ASTAssetLicense` metadata schema that any AST node can carry
 *      via a `@license(...)` directive parsed by `@holoscript/core`
 *      (F.014: never regex .hs/.hsplus outside core).
 *   2. A `LicensedASTAsset` wrapper that binds the parsed AST + content hash
 *      + license metadata + optional EIP-191 signed manifest.
 *   3. An `ASTLicenseGate` that converts a license into the x402
 *      `X402PaymentRequired` body and verifies x402 settlement before
 *      releasing the asset payload.
 *
 * The retrieval HTTP surface lives in `@holoscript/marketplace-api`
 * (`ast-licensing-middleware.ts` + `ast-asset-routes.ts`) — this module is
 * transport-agnostic so it can also be used directly from MCP tools, the
 * studio runtime, or any other consumer of the framework `economy/` surface.
 *
 * What this is NOT:
 *   - A new on-chain settlement layer. We compose `X402Facilitator` /
 *     `PaymentGateway` for verification + settlement.
 *   - A new parser. We delegate to `@holoscript/core`'s `parse()`.
 *   - A token / NFT contract. The license manifest is a signed off-chain
 *     receipt; on-chain anchoring is out of scope for the foundation cut.
 */

import { createHash } from 'node:crypto';
import { z } from 'zod';
import * as HoloScriptCore from '@holoscript/core';
import type { HSPlusNode } from '@holoscript/core';
import {
  X402Facilitator,
  PaymentGateway,
  type SettlementChain,
  type X402PaymentRequired,
  type X402PaymentPayload,
  type X402SettlementResult,
} from './x402-facilitator';

/**
 * Minimal directive shape we actually rely on. The full `HSPlusLikeDirective`
 * union lives in `@holoscript/core-types` but isn't re-exported through
 * `@holoscript/core`'s emitted `.d.ts` bundle, so depending on it would force
 * a new package dep. We only need `type` + the optional `name` / `config` /
 * arbitrary keys produced by the parser fallback.
 */
interface HSPlusLikeDirective {
  type: string;
  name?: string;
  config?: Record<string, unknown>;
  [key: string]: unknown;
}

/** Narrow `parse()` output shape — see `HSPlusCompileResult` in core-types. */
interface ParseLikeResult {
  success?: boolean;
  errors?: Array<{ message?: string; line?: number; column?: number }>;
  ast?: unknown;
  [key: string]: unknown;
}

function callCoreParse(source: string): ParseLikeResult {
  const fn = (HoloScriptCore as { parse?: (s: string, o?: unknown) => unknown }).parse;
  if (typeof fn !== 'function') {
    throw new Error(
      "createLicensedASTAsset: '@holoscript/core' does not export parse(); rebuild core to refresh dist"
    );
  }
  const result = fn(source, { strict: false, enableVRTraits: true }) as unknown;
  if (!result || typeof result !== 'object') {
    throw new Error('createLicensedASTAsset: parser returned a non-object result');
  }
  return result as ParseLikeResult;
}

// =============================================================================
// LICENSE SCHEMA
// =============================================================================

/**
 * License kinds for AST assets. These mirror common open-source / commercial
 * licensing patterns and are intentionally finite — bespoke `terms` text goes
 * in the `terms` field, not as a new kind.
 */
export const LICENSE_KINDS = [
  'commercial',
  'noncommercial',
  'attribution',
  'view-only',
  'derivative-allowed',
  'derivative-restricted',
  'subscription',
  'one-time',
] as const;

export type LicenseKind = (typeof LICENSE_KINDS)[number];

/**
 * Zod schema for `ASTAssetLicense`. Used at trust boundaries (HTTP body
 * intake, parsed-directive intake) so malformed / prototype-polluted
 * payloads are rejected before they reach the gate.
 */
export const astAssetLicenseSchema = z
  .object({
    /** Stable, caller-provided license identifier. */
    licenseId: z.string().min(3).max(128),
    /** License kind (drives default contract terms). */
    kind: z.enum(LICENSE_KINDS),
    /** Price in USDC (human-readable, e.g. 0.05 = 5 cents). 0 = free / view-only. */
    priceUSDC: z.number().min(0).max(10_000),
    /** Settlement chain — must match a `SettlementChain` recognised by x402. */
    chain: z.enum(['base', 'base-sepolia', 'solana', 'solana-devnet']),
    /** Recipient wallet address that receives x402 settlement. */
    recipient: z
      .string()
      .min(8)
      .max(128)
      .regex(/^[A-Za-z0-9]+$/, 'recipient must be alphanumeric (hex / base58)'),
    /** Human-readable terms description (shown to payers + agents). */
    terms: z.string().min(1).max(2_000),
    /**
     * Hard expiry as a unix-seconds timestamp. `0` = never expires.
     * Subscription licenses use this in tandem with `subscriptionPeriodSec`.
     */
    expiresAt: z.number().int().min(0).default(0),
    /** Subscription period in seconds. Only used when `kind === 'subscription'`. */
    subscriptionPeriodSec: z.number().int().min(0).max(60 * 60 * 24 * 366).default(0),
    /** Whether derivatives may be redistributed. Defaults from `kind`. */
    derivativesAllowed: z.boolean().default(false),
    /** Whether attribution is required when derivatives are allowed. */
    attributionRequired: z.boolean().default(true),
    /**
     * Optional license version tag — bumped when terms change. Lets gates
     * key receipts to a specific revision.
     */
    revision: z.number().int().min(1).default(1),
  })
  .strict();

export type ASTAssetLicense = z.infer<typeof astAssetLicenseSchema>;

// =============================================================================
// SIGNED MANIFEST
// =============================================================================

/**
 * Deterministic, signable representation of an AST asset's licensing
 * commitment. The manifest is what an offline party (auditor, mirror,
 * downstream agent) needs to verify the chain
 *   contentHash → license → recipient → (optional) signature
 * without re-parsing the original `.hsplus` source.
 */
export interface ASTAssetManifest {
  /** Stable asset identifier — caller-supplied or derived from content hash. */
  assetId: string;
  /** SHA-256 of the canonical .hsplus source (lf-normalised). */
  contentHash: string;
  /** Frozen license metadata at time of registration. */
  license: ASTAssetLicense;
  /** Wallet address declared as the asset author. */
  author: string;
  /** Unix-seconds creation time. */
  createdAt: number;
  /**
   * Optional EIP-191 personal_sign-style signature over
   * `JSON.stringify({ assetId, contentHash, license, author, createdAt })`
   * with deterministic key ordering. Verifier must reconstruct the same
   * canonical bytes.
   */
  signature?: string;
}

/**
 * Wrapper holding the parsed AST root next to its license metadata.
 * The runtime never serialises `astRoot` over the wire on a 402 — only the
 * public `manifest` (license + content hash) is exposed pre-payment.
 */
export interface LicensedASTAsset {
  manifest: ASTAssetManifest;
  /** Parsed root node (full HSPlusNode tree). Released only after settlement. */
  astRoot: HSPlusNode;
  /** Raw .hsplus source — kept for hash verification + re-parsing. */
  source: string;
}

// =============================================================================
// CANONICAL HASHING
// =============================================================================

/**
 * LF-normalise text + strip BOM before hashing. Prevents Windows CRLF and
 * editor BOMs from changing the content hash across machines (W.067a).
 */
function canonicaliseSource(source: string): string {
  let s = source;
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  return s.replace(/\r\n?/g, '\n');
}

/** SHA-256 hex of the canonical source. */
export function hashASTSource(source: string): string {
  const canonical = canonicaliseSource(source);
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/** Deterministic JSON for signing/verifying manifests. Keys sorted recursively. */
export function canonicalManifestBytes(
  m: Omit<ASTAssetManifest, 'signature'>
): string {
  return canonicalJSONStringify({
    assetId: m.assetId,
    contentHash: m.contentHash,
    license: sortKeysDeep(m.license) as Record<string, unknown>,
    author: m.author,
    createdAt: m.createdAt,
  });
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      out[k] = sortKeysDeep((value as Record<string, unknown>)[k]);
    }
    return out;
  }
  return value;
}

function canonicalJSONStringify(v: unknown): string {
  return JSON.stringify(sortKeysDeep(v));
}

// =============================================================================
// DIRECTIVE EXTRACTION
// =============================================================================

/**
 * Result of scanning a parsed AST root for a license directive.
 */
export interface ExtractedLicense {
  /** The (unvalidated) license fields harvested from the directive. */
  raw: Record<string, unknown>;
  /** Source: which directive shape we found it on. */
  source: 'license-directive' | 'asset-license-field' | 'credit-trait';
}

/**
 * Walk the AST root looking for license metadata. The parser turns
 *   @license(licenseId: "x", kind: "commercial", priceUSDC: 0.05, ...)
 * into `{ type: 'trait', name: 'license', config: {...} }` (the unknown-
 * directive fallback in `HoloScriptPlusParser.parseDirective`).
 *
 * It also accepts:
 *   - `@asset { license: { ... } }` — license nested inside an asset directive
 *   - `@credit(price: 0.05, chain: 'base', recipient: '0x..')` — promoted to
 *     a derived `commercial` license so existing creditTrait users get
 *     license coverage for free.
 *
 * Returns the first match in pre-order traversal.
 */
export function extractASTLicense(root: HSPlusNode): ExtractedLicense | null {
  const stack: HSPlusNode[] = [root];
  while (stack.length > 0) {
    const node = stack.pop()!;
    const directives = ((node as unknown as Record<string, unknown>).directives ?? []) as HSPlusLikeDirective[];

    for (const d of directives) {
      // 1. @license(...) — generic-trait fallback shape
      if (d.type === 'trait' && (d as { name?: string }).name === 'license') {
        const cfg = (d as { config?: Record<string, unknown> }).config ?? {};
        return { raw: { ...cfg }, source: 'license-directive' };
      }

      // 2. @asset { license: { ... } }
      if (d.type === 'asset') {
        const license = (d as Record<string, unknown>).license;
        if (license && typeof license === 'object') {
          return { raw: { ...(license as Record<string, unknown>) }, source: 'asset-license-field' };
        }
      }

      // 3. @credit(price, chain, recipient, ...) — derive a commercial license
      if (d.type === 'trait' && (d as { name?: string }).name === 'credit') {
        const cfg = (d as { config?: Record<string, unknown> }).config ?? {};
        const price = cfg.price;
        const chain = cfg.chain;
        const recipient = cfg.recipient;
        const description = (cfg.description as string) ?? 'x402-licensed AST asset';
        if (
          typeof price === 'number' &&
          typeof chain === 'string' &&
          typeof recipient === 'string'
        ) {
          return {
            raw: {
              licenseId: `credit-derived-${recipient.slice(0, 12)}`,
              kind: 'commercial' as LicenseKind,
              priceUSDC: price,
              chain,
              recipient,
              terms: description,
              expiresAt: 0,
              subscriptionPeriodSec: 0,
              derivativesAllowed: false,
              attributionRequired: true,
              revision: 1,
            },
            source: 'credit-trait',
          };
        }
      }
    }

    // Push children for traversal (HSPlusNode has optional `children`).
    const children = (node as { children?: HSPlusNode[] }).children;
    if (Array.isArray(children)) {
      for (const c of children) stack.push(c);
    }
  }
  return null;
}

// =============================================================================
// REGISTRATION
// =============================================================================

export interface CreateLicensedASTAssetOptions {
  /** .hsplus source — parsed via `@holoscript/core` (F.014, no regex). */
  source: string;
  /** Author wallet address — bound into the manifest. */
  author: string;
  /**
   * Override or supply the license. If omitted, we attempt to extract one
   * from the AST via `extractASTLicense()`. If both are present, the
   * explicit override wins.
   */
  license?: Partial<ASTAssetLicense>;
  /** Override the asset id. Defaults to the first 16 hex of the content hash. */
  assetId?: string;
  /** Optional creation timestamp for deterministic tests. Defaults to now. */
  createdAt?: number;
  /**
   * Optional async signer (wallet personal_sign). Receives the canonical
   * manifest bytes and returns a signature. If omitted, the manifest is
   * unsigned (still verifiable via contentHash).
   */
  signer?: (canonicalBytes: string) => Promise<string>;
}

export interface RegistrationResult {
  asset: LicensedASTAsset;
  /** True when the license was extracted from the AST itself. */
  licenseFromAST: boolean;
}

/** Build a `LicensedASTAsset` from .hsplus source + license. */
export async function createLicensedASTAsset(
  opts: CreateLicensedASTAssetOptions
): Promise<RegistrationResult> {
  const source = opts.source;
  if (typeof source !== 'string' || source.length === 0) {
    throw new Error('createLicensedASTAsset: source must be a non-empty string');
  }
  if (typeof opts.author !== 'string' || opts.author.length < 8) {
    throw new Error('createLicensedASTAsset: author wallet address required');
  }

  // F.014: parse via @holoscript/core, never regex.
  const compileResult = callCoreParse(source);
  if (compileResult.success === false) {
    const firstErr = compileResult.errors?.[0];
    throw new Error(
      `createLicensedASTAsset: source failed to parse${
        firstErr ? ` — ${firstErr.message ?? ''} (line ${firstErr.line ?? '?'})` : ''
      }`
    );
  }
  const astAny = compileResult.ast as
    | { root?: HSPlusNode; body?: HSPlusNode[] }
    | HSPlusNode
    | undefined;
  const astRoot: HSPlusNode | undefined =
    (astAny as { root?: HSPlusNode } | undefined)?.root ??
    ((astAny as { body?: HSPlusNode[] } | undefined)?.body?.[0] as HSPlusNode | undefined) ??
    (astAny as HSPlusNode | undefined);

  if (!astRoot || typeof astRoot !== 'object') {
    throw new Error('createLicensedASTAsset: parser returned no AST root');
  }

  // Resolve license: explicit override > extracted from AST.
  let licenseFromAST = false;
  let raw: Record<string, unknown> = {};
  const extracted = extractASTLicense(astRoot);
  if (extracted) {
    raw = { ...extracted.raw };
    licenseFromAST = true;
  }
  if (opts.license) {
    raw = { ...raw, ...opts.license };
    licenseFromAST = false;
  }

  // Apply schema defaults (Zod fills in expiresAt, derivativesAllowed, etc.)
  const license = astAssetLicenseSchema.parse(raw);

  const contentHash = hashASTSource(source);
  const assetId = opts.assetId ?? `ast_${contentHash.slice(0, 24)}`;
  const createdAt = opts.createdAt ?? Math.floor(Date.now() / 1000);

  const baseManifest: Omit<ASTAssetManifest, 'signature'> = {
    assetId,
    contentHash,
    license,
    author: opts.author,
    createdAt,
  };

  let signature: string | undefined;
  if (opts.signer) {
    signature = await opts.signer(canonicalManifestBytes(baseManifest));
  }

  const manifest: ASTAssetManifest = signature
    ? { ...baseManifest, signature }
    : { ...baseManifest };

  return {
    asset: { manifest, astRoot, source },
    licenseFromAST,
  };
}

// =============================================================================
// MANIFEST VERIFICATION
// =============================================================================

export interface ManifestVerificationResult {
  ok: boolean;
  /** Reason for failure (null when ok). */
  error: string | null;
  /** Recomputed content hash for inspection. */
  recomputedContentHash: string;
}

/**
 * Verify a manifest against the source it claims to describe.
 *
 * Checks:
 *   1. SHA-256 of canonicalised source matches `manifest.contentHash`.
 *   2. License re-validates against the schema (catches tampering).
 *   3. If `manifest.signature` is set and a `verify` function is provided,
 *      the signature recovers to `manifest.author` over the canonical bytes.
 */
export async function verifyASTAssetManifest(
  manifest: ASTAssetManifest,
  source: string,
  verify?: (params: {
    canonicalBytes: string;
    signature: string;
    author: string;
  }) => Promise<boolean>
): Promise<ManifestVerificationResult> {
  const recomputedContentHash = hashASTSource(source);
  if (recomputedContentHash !== manifest.contentHash) {
    return {
      ok: false,
      error: 'Content hash mismatch — source does not match manifest',
      recomputedContentHash,
    };
  }
  const licenseCheck = astAssetLicenseSchema.safeParse(manifest.license);
  if (!licenseCheck.success) {
    return {
      ok: false,
      error: `License schema invalid: ${licenseCheck.error.issues[0]?.message ?? 'unknown'}`,
      recomputedContentHash,
    };
  }
  if (manifest.signature && verify) {
    const canonicalBytes = canonicalManifestBytes({
      assetId: manifest.assetId,
      contentHash: manifest.contentHash,
      license: manifest.license,
      author: manifest.author,
      createdAt: manifest.createdAt,
    });
    const signed = await verify({
      canonicalBytes,
      signature: manifest.signature,
      author: manifest.author,
    });
    if (!signed) {
      return {
        ok: false,
        error: 'Signature does not recover to declared author',
        recomputedContentHash,
      };
    }
  }
  return { ok: true, error: null, recomputedContentHash };
}

// =============================================================================
// ASTLicenseGate — the "gated retrieval" path
// =============================================================================

export interface ASTLicenseGateOptions {
  /** Pre-built facilitator. If omitted, we build one per-license from the manifest. */
  facilitator?: X402Facilitator;
  /** Pre-built gateway (for refunds + audit events). Optional. */
  gateway?: PaymentGateway;
  /** Resource path emitted in the 402 PaymentRequired body. */
  resourcePathPrefix?: string;
}

/**
 * Result returned by `ASTLicenseGate.attemptAccess()`.
 *
 * `granted: true` means the consumer is cleared to receive `astRoot` /
 * `source`. `granted: false` means the consumer must satisfy `paymentRequired`
 * and retry with `submitPayment()`.
 */
export type AccessAttemptResult =
  | {
      granted: true;
      mode: 'free' | 'cached' | 'settled';
      receipt?: X402SettlementResult;
    }
  | {
      granted: false;
      paymentRequired: X402PaymentRequired;
      requiredAmountBaseUnits: string;
      resource: string;
    };

interface CachedAccessGrant {
  payer: string;
  grantedAt: number;
  expiresAt: number;
  settlementId: string;
}

/**
 * Stateful gate that converts an `ASTAssetLicense` into x402 challenges
 * + verifies x402 receipts before releasing the asset payload.
 *
 * One gate per asset. Holds the facilitator + cached access grants for that
 * asset. Safe to share across requests — no per-request state.
 */
export class ASTLicenseGate {
  private readonly asset: LicensedASTAsset;
  private readonly license: ASTAssetLicense;
  private readonly facilitator: X402Facilitator;
  private readonly gateway?: PaymentGateway;
  private readonly resource: string;
  private readonly cache = new Map<string, CachedAccessGrant>();

  constructor(asset: LicensedASTAsset, opts: ASTLicenseGateOptions = {}) {
    this.asset = asset;
    this.license = asset.manifest.license;
    this.gateway = opts.gateway;
    const prefix = opts.resourcePathPrefix ?? '/api/ast-assets';
    this.resource = `${prefix.replace(/\/+$/, '')}/${asset.manifest.assetId}`;

    if (opts.facilitator) {
      this.facilitator = opts.facilitator;
    } else if (opts.gateway) {
      this.facilitator = opts.gateway.getFacilitator();
    } else {
      this.facilitator = new X402Facilitator({
        recipientAddress: this.license.recipient,
        chain: this.license.chain as SettlementChain,
        resourceDescription: this.license.terms,
        // Subscription windows are honored at grant time, not in the facilitator.
        maxTimeoutSeconds: 60,
        optimisticExecution: true,
      });
    }
  }

  /** Get the public-facing manifest (license + hash, never the AST). */
  getPublicManifest(): ASTAssetManifest {
    return this.asset.manifest;
  }

  /** Required amount in USDC base units (6 decimals) as a decimal string. */
  getRequiredAmountBaseUnits(): string {
    return Math.round(this.license.priceUSDC * 1_000_000).toString();
  }

  /**
   * Attempt access. Returns `granted: true` immediately for free / view-only
   * licenses or for cached payers. Otherwise returns the 402 challenge.
   */
  attemptAccess(payer?: string): AccessAttemptResult {
    // Free / view-only licenses skip the payment loop.
    if (this.license.priceUSDC <= 0) {
      return { granted: true, mode: 'free' };
    }
    if (payer) {
      const cached = this.cache.get(payer.toLowerCase());
      if (cached && (cached.expiresAt === 0 || cached.expiresAt > Date.now())) {
        return { granted: true, mode: 'cached' };
      }
    }
    return {
      granted: false,
      paymentRequired: this.facilitator.createPaymentRequired(
        this.resource,
        this.license.priceUSDC,
        this.license.terms
      ),
      requiredAmountBaseUnits: this.getRequiredAmountBaseUnits(),
      resource: this.resource,
    };
  }

  /**
   * Verify + settle a payment. On success grants cached access keyed on the
   * payer address. Subscription licenses get the configured period; one-time
   * licenses get a 24-hour grant (the on-chain receipt is the durable
   * record).
   */
  async submitPayment(
    payment: X402PaymentPayload | string
  ): Promise<AccessAttemptResult> {
    if (this.license.priceUSDC <= 0) {
      return { granted: true, mode: 'free' };
    }

    let result: X402SettlementResult;
    if (this.gateway) {
      result = await this.gateway.settlePayment(
        payment,
        this.resource,
        this.getRequiredAmountBaseUnits()
      );
    } else {
      const decoded =
        typeof payment === 'string'
          ? X402Facilitator.decodeXPaymentHeader(payment)
          : payment;
      if (!decoded) {
        return this.attemptAccess();
      }
      result = await this.facilitator.processPayment(
        decoded,
        this.resource,
        this.getRequiredAmountBaseUnits()
      );
    }

    if (!result.success) {
      return this.attemptAccess();
    }

    const payerKey = result.payer.toLowerCase();
    const now = Date.now();
    let expiresAt = 0;
    if (this.license.kind === 'subscription' && this.license.subscriptionPeriodSec > 0) {
      expiresAt = now + this.license.subscriptionPeriodSec * 1000;
    } else if (this.license.expiresAt > 0) {
      expiresAt = this.license.expiresAt * 1000;
    } else {
      // One-time / commercial / etc. — give a 24h cache window for the
      // payer; the durable record is the on-chain receipt.
      expiresAt = now + 24 * 60 * 60 * 1000;
    }
    this.cache.set(payerKey, {
      payer: payerKey,
      grantedAt: now,
      expiresAt,
      settlementId: result.transaction ?? '',
    });

    return { granted: true, mode: 'settled', receipt: result };
  }

  /** Release the asset payload — only call after `attemptAccess` returns granted. */
  releasePayload(): { manifest: ASTAssetManifest; astRoot: HSPlusNode; source: string } {
    return {
      manifest: this.asset.manifest,
      astRoot: this.asset.astRoot,
      source: this.asset.source,
    };
  }

  /** Inspect the cache (mainly for tests + debugging). */
  hasCachedAccess(payer: string): boolean {
    const cached = this.cache.get(payer.toLowerCase());
    if (!cached) return false;
    return cached.expiresAt === 0 || cached.expiresAt > Date.now();
  }

  /** Drop a cached payer (revoke). */
  revoke(payer: string): boolean {
    return this.cache.delete(payer.toLowerCase());
  }

  /** Convenience: total cached payers (for stats endpoints). */
  getStats(): { cachedPayers: number; resource: string; priceUSDC: number } {
    return {
      cachedPayers: this.cache.size,
      resource: this.resource,
      priceUSDC: this.license.priceUSDC,
    };
  }
}

// =============================================================================
// IN-MEMORY REGISTRY (used by the marketplace HTTP layer)
// =============================================================================

/**
 * Minimal in-memory registry of licensed AST assets. Concrete deployments
 * back this with Postgres / S3 / etc., but the in-memory implementation is
 * what the marketplace tests + the local dev server use today.
 */
export class ASTLicenseRegistry {
  private readonly assets = new Map<string, LicensedASTAsset>();
  private readonly gates = new Map<string, ASTLicenseGate>();
  private readonly gateOptions: ASTLicenseGateOptions;

  constructor(gateOptions: ASTLicenseGateOptions = {}) {
    this.gateOptions = gateOptions;
  }

  register(asset: LicensedASTAsset): ASTLicenseGate {
    const id = asset.manifest.assetId;
    if (this.assets.has(id)) {
      throw new Error(`ASTLicenseRegistry: asset ${id} already registered`);
    }
    this.assets.set(id, asset);
    const gate = new ASTLicenseGate(asset, this.gateOptions);
    this.gates.set(id, gate);
    return gate;
  }

  getAsset(assetId: string): LicensedASTAsset | undefined {
    return this.assets.get(assetId);
  }

  getGate(assetId: string): ASTLicenseGate | undefined {
    return this.gates.get(assetId);
  }

  list(): ASTAssetManifest[] {
    return Array.from(this.assets.values()).map((a) => a.manifest);
  }

  unregister(assetId: string): boolean {
    this.gates.delete(assetId);
    return this.assets.delete(assetId);
  }

  size(): number {
    return this.assets.size;
  }
}
