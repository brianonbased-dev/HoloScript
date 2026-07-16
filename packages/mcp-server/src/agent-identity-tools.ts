/**
 * HoloScript MCP Agent Identity Tools
 *
 * Thin MCP wrapper around the compiler Agent Identity Framework. These tools
 * let autonomous agents issue, verify, and inspect workflow-bound identity
 * tokens without reimplementing the identity layer outside HoloScript.
 *
 * SOVEREIGN TOKEN PATH (dependency-sovereignty-ladder, 2026-07-16):
 * this path no longer touches the `jsonwebtoken` package. Tokens are UCAN-style
 * capability tokens signed in-tree:
 *   - issue_agent_token  → CapabilityTokenIssuer.issueRoot (Ed25519 / EdDSA),
 *     with workflow intent carried in the token facts, PLUS a HybridSigner
 *     ML-DSA-65 dual-signature envelope over the raw token (additive output).
 *   - verify_agent_token → FAIL CLOSED. Capability tokens verify through
 *     CapabilityTokenIssuer.verify (signature, expiry, not-before, replay).
 *     Any legacy jsonwebtoken/HS256-envelope token is rejected with an explicit
 *     reason (LEGACY_JWT_REJECTED) — never verified, never thrown.
 *     Every verify call emits an append-only NDJSON receipt (same pattern as
 *     compute-trace-store.ts / daemon-emergence-store.ts).
 *
 * Presentation cache: CapabilityTokenIssuer.verify consumes the token nonce
 * (replay protection), which would make a second inspection of the SAME raw
 * token fail. To keep the legacy inspect-many-times contract (verify →
 * check_permission → get_delegation_chain) working, successful verifications
 * are cached in-process keyed by the SHA-256 of the exact raw token bytes.
 * A byte-identical re-presentation is served from the cache (signature was
 * already proven for those exact bytes; expiry is re-checked on every hit).
 * Any tampered token differs in bytes, misses the cache, and fails signature
 * verification.
 *
 * PERMANENT CARVE-OUT: @noble/post-quantum remains the crypto primitive via
 * HybridCryptoProvider/HybridSigner. No signature math is implemented here.
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  AgentPermission,
  AgentRole,
  WorkflowStep,
  calculateAgentChecksum,
  generateAgentKeyPair,
  getDefaultPermissions,
  type AgentConfig,
} from '../../core/src/compiler/identity/AgentIdentity';
import {
  ACTION_TO_PERMISSION,
  CapabilityActions,
  HOLOSCRIPT_RESOURCE_ALL,
  HOLOSCRIPT_RESOURCE_SCHEME,
  PERMISSION_TO_ACTION,
  type AttenuationChain,
  type Capability,
  type CapabilityTokenPayload,
} from '../../core/src/compiler/identity/CapabilityToken';
import {
  getCapabilityTokenIssuer,
  resetCapabilityTokenIssuer,
} from '../../core/src/compiler/identity/CapabilityTokenIssuer';
import { HybridSigner } from '../../core/src/compiler/identity/HybridSigner';
import type { CompositeSignature } from '../../core/src/compiler/identity/HybridCryptoProvider';

const TOOL_NAMES = [
  'issue_agent_token',
  'verify_agent_token',
  'check_permission',
  'get_delegation_chain',
] as const;

type AgentIdentityToolName = (typeof TOOL_NAMES)[number];

const agentRoles = Object.values(AgentRole);
const agentPermissions = Object.values(AgentPermission);
const workflowSteps = Object.values(WorkflowStep);

const CAPABILITY_TOKEN_FORMAT = 'ucan-capability@0.10.0';
const DEFAULT_AUDIENCE = 'holoscript-compiler';

export const agentIdentityTools: Tool[] = [
  {
    name: 'issue_agent_token',
    description:
      'Issue a short-lived sovereign HoloScript capability token (UCAN-style, Ed25519/EdDSA-signed in-tree) ' +
      'with role-derived capabilities, workflow intent, and proof-of-possession public key binding. ' +
      'Also returns an ML-DSA-65 dual-signature envelope (HybridSigner) over the token.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        role: {
          type: 'string',
          enum: agentRoles,
          description: 'Compiler agent role receiving the token.',
        },
        name: {
          type: 'string',
          description: 'Stable agent instance name. Defaults to mcp-<role>.',
        },
        version: {
          type: 'string',
          description: 'Agent implementation version. Defaults to 1.0.0.',
        },
        workflowId: {
          type: 'string',
          description: 'Workflow/run identifier bound into the token intent.',
        },
        workflowStep: {
          type: 'string',
          enum: workflowSteps,
          description: 'Current compiler workflow step. Defaults to parse_tokens.',
        },
        initiatedBy: {
          type: 'string',
          enum: agentRoles,
          description: 'Agent role that initiated this delegation. Defaults to orchestrator.',
        },
        delegationChain: {
          type: 'array',
          items: { type: 'string', enum: agentRoles },
          description:
            'Prior delegation chain. The issued role is appended by the identity framework.',
        },
        scope: {
          type: 'string',
          description: 'Optional package/path scope restriction embedded in the token.',
        },
        tools: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional tool/capability labels included in the agent checksum.',
        },
        configuration: {
          type: 'object',
          description: 'Optional JSON configuration included in the agent checksum.',
        },
        executionContext: {
          type: 'object',
          description: 'Optional workflow execution context embedded in the token intent.',
        },
        tokenExpiration: {
          oneOf: [{ type: 'string' }, { type: 'number' }],
          description: 'Optional expiration, e.g. 15m, 24h, 7d, or a number of seconds.',
        },
        returnPrivateKey: {
          type: 'boolean',
          description:
            'Return the generated Ed25519 private key for PoP signing. Defaults false; only request when the caller will sign HTTP requests immediately.',
        },
      },
      required: ['role'],
    },
  },
  {
    name: 'verify_agent_token',
    description:
      'Verify a HoloScript sovereign capability token and return structured identity, capability, and workflow claims. ' +
      'FAIL CLOSED: legacy jsonwebtoken/HS256-envelope tokens are rejected with an explicit reason and are never verified. ' +
      'Every call emits an append-only NDJSON verification receipt.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: {
          type: 'string',
          description: 'Capability token returned by issue_agent_token (raw JWT-shaped string).',
        },
        includePayload: {
          type: 'boolean',
          description: 'Include decoded non-secret claims in the response. Defaults true.',
        },
        pqEnvelope: {
          type: 'object',
          description:
            'Optional ML-DSA-65 dual-signature envelope returned by issue_agent_token. When provided, the envelope must also verify (fail closed).',
          properties: {
            classicalSignature: {
              type: 'string',
              description: 'Base64 Ed25519 signature over the raw token.',
            },
            pqSignature: {
              type: 'string',
              description: 'Base64 ML-DSA-65 signature over the raw token.',
            },
            kid: { type: 'string', description: 'Key ID of the signing hybrid key pair.' },
            signedAt: { type: 'string', description: 'ISO timestamp the envelope was created.' },
          },
          required: ['classicalSignature'],
        },
      },
      required: ['token'],
    },
  },
  {
    name: 'check_permission',
    description:
      'Check whether a HoloScript capability token carries a permission (mapped to its UCAN capability action), optionally constrained to a workflow step. Fail closed on any non-capability token.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: {
          type: 'string',
          description: 'Agent capability token to check.',
        },
        permission: {
          type: 'string',
          enum: agentPermissions,
          description: 'Required compiler permission.',
        },
        workflowStep: {
          type: 'string',
          enum: workflowSteps,
          description: 'Optional expected workflow step.',
        },
      },
      required: ['token', 'permission'],
    },
  },
  {
    name: 'get_delegation_chain',
    description:
      'Read the workflow delegation chain and intent metadata from a HoloScript capability token. Fail closed on any non-capability token.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: {
          type: 'string',
          description: 'Agent capability token to inspect.',
        },
      },
      required: ['token'],
    },
  },
];

export function isAgentIdentityToolName(name: string): name is AgentIdentityToolName {
  return (TOOL_NAMES as readonly string[]).includes(name);
}

export async function handleAgentIdentityTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  if (!isAgentIdentityToolName(name)) {
    throw new Error(`Unknown agent identity tool: ${name}`);
  }

  switch (name) {
    case 'issue_agent_token':
      return issueAgentToken(args);
    case 'verify_agent_token':
      return verifyAgentToken(args);
    case 'check_permission':
      return checkPermission(args);
    case 'get_delegation_chain':
      return getDelegationChain(args);
  }
}

// ---------------------------------------------------------------------------
// ML-DSA-65 dual-signature envelope signer (HybridSigner singleton)
// ---------------------------------------------------------------------------

let envelopeSignerPromise: Promise<HybridSigner> | null = null;

/**
 * Lazily create the process-wide HybridSigner used to dual-sign issued tokens.
 * Prefers Ed25519 + ML-DSA-65 (via @noble/post-quantum — the permanent crypto
 * primitive); falls back to Ed25519-only if the PQ module cannot be loaded so
 * token issuance never depends on optional-module resolution.
 */
function getEnvelopeSigner(): Promise<HybridSigner> {
  if (!envelopeSignerPromise) {
    envelopeSignerPromise = (async () => {
      try {
        const signer = new HybridSigner();
        await signer.generateKeys('mcp-agent-identity');
        return signer;
      } catch {
        const fallback = new HybridSigner({ enablePQ: false });
        await fallback.generateKeys('mcp-agent-identity');
        return fallback;
      }
    })();
  }
  return envelopeSignerPromise;
}

// ---------------------------------------------------------------------------
// Verification receipts — append-only NDJSON
// (same write pattern as compute-trace-store.ts / daemon-emergence-store.ts)
// ---------------------------------------------------------------------------

interface VerifyReceiptRecord {
  /** Receipt schema tag. */
  receipt: 'agent-token-verify.v1';
  /** ISO timestamp of the verification. */
  ts: string;
  /** MCP tool that performed the verification. */
  tool: AgentIdentityToolName;
  /** SHA-256 hex of the exact raw token presented (the token itself is never logged). */
  tokenSha256: string;
  /** Detected token format. */
  tokenFormat: 'ucan-capability' | 'legacy-jwt' | 'unknown';
  /** Final verdict for this presentation. */
  valid: boolean;
  /** Whether the verdict was served from the in-process presentation cache. */
  cached: boolean;
  errorCode?: string;
  error?: string;
  issuer?: string;
  audience?: string;
  nonce?: string;
  workflowId?: string;
  /** Whether an ML-DSA-65 dual-signature envelope was presented and checked. */
  envelopeChecked: boolean;
  envelopeValid?: boolean;
}

function resolveReceiptPath(): string {
  const override = process.env.AGENT_IDENTITY_RECEIPT_PATH;
  if (typeof override === 'string' && override.trim().length > 0) {
    return override;
  }
  const dataRoot =
    process.env.HOLOMESH_DATA_DIR ||
    path.join(
      process.env.HOLOSCRIPT_CACHE_DIR || path.join(os.homedir(), '.holoscript'),
      'holomesh'
    );
  return path.join(dataRoot, 'agent-identity', 'agent-token-verify-receipts.ndjson');
}

/**
 * Persist one verification receipt. Best-effort — a persistence failure must
 * never change the verification verdict. Returns the receipt path when the
 * write succeeded.
 */
function emitVerifyReceipt(record: VerifyReceiptRecord): string | undefined {
  if (
    process.env.NODE_ENV === 'test' &&
    process.env.HOLOMESH_TEST_DISABLE_AGENT_IDENTITY_RECEIPTS === '1'
  ) {
    return undefined;
  }
  const receiptPath = resolveReceiptPath();
  try {
    fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
    fs.appendFileSync(receiptPath, `${JSON.stringify(record)}\n`, 'utf8');
    return receiptPath;
  } catch (err) {
    console.warn(`[AgentIdentityTools] receipt append failed: ${(err as Error).message}`);
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Token presentation (fail-closed verification core)
// ---------------------------------------------------------------------------

interface TokenPresentation {
  valid: boolean;
  tokenFormat: 'ucan-capability' | 'legacy-jwt' | 'unknown';
  cached: boolean;
  tokenSha256: string;
  payload?: CapabilityTokenPayload;
  chain?: AttenuationChain;
  error?: string;
  errorCode?: string;
}

interface CachedPresentation {
  payload: CapabilityTokenPayload;
  chain?: AttenuationChain;
}

/** Successful presentations keyed by SHA-256 of the exact raw token bytes. */
const presentationCache = new Map<string, CachedPresentation>();

function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function decodeJsonSegment(segment: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

function rejected(
  tokenSha256: string,
  tokenFormat: TokenPresentation['tokenFormat'],
  errorCode: string,
  error: string
): TokenPresentation {
  return { valid: false, tokenFormat, cached: false, tokenSha256, error, errorCode };
}

/**
 * Verify one raw token presentation. NEVER throws — every failure mode maps to
 * a rejected-with-explicit-reason result (fail closed).
 */
function verifyPresentation(rawToken: string): TokenPresentation {
  const tokenSha256 = sha256Hex(rawToken);

  try {
    const parts = rawToken.split('.');
    if (parts.length !== 3 || parts.some((part) => part.length === 0)) {
      return rejected(
        tokenSha256,
        'unknown',
        'MALFORMED_TOKEN',
        'Malformed token: expected a three-part header.payload.signature string.'
      );
    }

    const header = decodeJsonSegment(parts[0]);
    if (!header || typeof header.alg !== 'string') {
      return rejected(
        tokenSha256,
        'unknown',
        'MALFORMED_TOKEN',
        'Malformed token: header segment is not decodable JSON with an alg claim.'
      );
    }

    if (header.alg !== 'EdDSA') {
      // Legacy jsonwebtoken path issued HS256-envelope tokens. Reject them all
      // explicitly — the sovereign capability issuer is the only accepted path.
      return rejected(
        tokenSha256,
        'legacy-jwt',
        'LEGACY_JWT_REJECTED',
        `Legacy ${header.alg} jsonwebtoken envelope is no longer accepted. ` +
          'Reissue a sovereign capability token via issue_agent_token.'
      );
    }

    if (header.ucv !== '0.10.0') {
      return rejected(
        tokenSha256,
        'unknown',
        'UNSUPPORTED_TOKEN_FORMAT',
        'EdDSA token without a supported UCAN version (ucv) claim. Only capability tokens issued by issue_agent_token are accepted.'
      );
    }

    // Byte-identical re-presentation of an already-proven token: serve from the
    // presentation cache (re-checking expiry) instead of re-consuming the nonce.
    const cachedEntry = presentationCache.get(tokenSha256);
    if (cachedEntry) {
      const now = Math.floor(Date.now() / 1000);
      if (cachedEntry.payload.exp <= now) {
        presentationCache.delete(tokenSha256);
        return rejected(tokenSha256, 'ucan-capability', 'EXPIRED', 'Token expired');
      }
      return {
        valid: true,
        tokenFormat: 'ucan-capability',
        cached: true,
        tokenSha256,
        payload: cachedEntry.payload,
        chain: cachedEntry.chain,
      };
    }

    const payload = decodeJsonSegment(parts[1]);
    if (!payload) {
      return rejected(
        tokenSha256,
        'ucan-capability',
        'MALFORMED_TOKEN',
        'Malformed token: payload segment is not decodable JSON.'
      );
    }

    const facts = asRecord(payload.fct);
    const publicKey = asString(facts?.publicKey);
    if (!publicKey) {
      return rejected(
        tokenSha256,
        'ucan-capability',
        'MISSING_VERIFICATION_KEY',
        'Capability token does not embed its Ed25519 verification key (fct.publicKey). Fail closed.'
      );
    }

    const verification = getCapabilityTokenIssuer().verify(rawToken, publicKey);
    if (!verification.valid || !verification.payload) {
      return rejected(
        tokenSha256,
        'ucan-capability',
        verification.errorCode ?? 'INVALID_SIGNATURE',
        verification.error ?? 'Capability token verification failed.'
      );
    }

    presentationCache.set(tokenSha256, {
      payload: verification.payload,
      chain: verification.chain,
    });

    return {
      valid: true,
      tokenFormat: 'ucan-capability',
      cached: false,
      tokenSha256,
      payload: verification.payload,
      chain: verification.chain,
    };
  } catch (error: unknown) {
    // Fail closed — no verification error may escape as an unhandled throw.
    return rejected(
      tokenSha256,
      'unknown',
      'VERIFY_ERROR',
      error instanceof Error ? error.message : String(error)
    );
  }
}

function receiptFromPresentation(
  tool: AgentIdentityToolName,
  presentation: TokenPresentation,
  envelope?: { checked: boolean; valid?: boolean }
): VerifyReceiptRecord {
  const facts = asRecord(presentation.payload?.fct);
  const workflow = asRecord(facts?.workflow);
  return {
    receipt: 'agent-token-verify.v1',
    ts: new Date().toISOString(),
    tool,
    tokenSha256: presentation.tokenSha256,
    tokenFormat: presentation.tokenFormat,
    valid: presentation.valid,
    cached: presentation.cached,
    ...(presentation.errorCode ? { errorCode: presentation.errorCode } : {}),
    ...(presentation.error ? { error: presentation.error } : {}),
    ...(presentation.payload
      ? {
          issuer: presentation.payload.iss,
          audience: presentation.payload.aud,
          nonce: presentation.payload.nnc,
        }
      : {}),
    ...(asString(workflow?.workflow_id) ? { workflowId: asString(workflow?.workflow_id) } : {}),
    envelopeChecked: envelope?.checked ?? false,
    ...(envelope?.checked ? { envelopeValid: envelope.valid === true } : {}),
  };
}

// ---------------------------------------------------------------------------
// Tool handlers
// ---------------------------------------------------------------------------

async function issueAgentToken(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const role = parseAgentRole(args.role, 'role');
  const name = optionalString(args.name) ?? `mcp-${role}`;
  const version = optionalString(args.version) ?? '1.0.0';
  const workflowId = optionalString(args.workflowId) ?? `mcp-${Date.now()}`;
  const workflowStep =
    parseWorkflowStep(args.workflowStep, 'workflowStep', WorkflowStep.PARSE_TOKENS) ??
    WorkflowStep.PARSE_TOKENS;
  const initiatedBy = parseAgentRole(args.initiatedBy, 'initiatedBy', AgentRole.ORCHESTRATOR);
  const delegationChain = parseRoleArray(args.delegationChain, 'delegationChain') ?? [];
  const executionContext = optionalRecord(args.executionContext) ?? {};
  const configuration = optionalRecord(args.configuration);
  const tools = parseStringArray(args.tools, 'tools');
  const returnPrivateKey = args.returnPrivateKey === true;
  const scope = optionalString(args.scope);
  const lifetimeSec = parseTokenExpirationSeconds(args.tokenExpiration);

  const agentConfig: AgentConfig = {
    role,
    name,
    version,
    scope,
    tools,
    configuration,
  };
  const agentChecksum = calculateAgentChecksum(agentConfig);

  const keyPair = await generateAgentKeyPair(role);

  // Role permissions → UCAN capabilities (same bridge the identity framework uses).
  const permissions = getDefaultPermissions(role);
  const resource = scope ? `${HOLOSCRIPT_RESOURCE_SCHEME}${scope}` : HOLOSCRIPT_RESOURCE_ALL;
  const capabilities: Capability[] = permissions.map((perm) => ({
    with: resource,
    can: PERMISSION_TO_ACTION[perm] || perm,
  }));

  const updatedDelegationChain = [...delegationChain, role];

  const issuer = getCapabilityTokenIssuer();
  const token = await issuer.issueRoot(
    {
      issuer: `agent:${role}:${name}`,
      audience: DEFAULT_AUDIENCE,
      capabilities,
      ...(lifetimeSec !== undefined ? { lifetimeSec } : {}),
      facts: {
        agent: {
          role,
          name,
          version,
          checksum: agentChecksum,
        },
        workflow: {
          workflow_id: workflowId,
          workflow_step: workflowStep,
          executed_by: role,
          initiated_by: initiatedBy,
          delegation_chain: updatedDelegationChain,
          execution_context: executionContext,
        },
        ...(scope ? { scope } : {}),
        publicKey: keyPair.publicKey,
        kid: keyPair.kid,
        thumbprint: keyPair.thumbprint,
      },
    },
    keyPair
  );

  // ML-DSA-65 dual-signature envelope over the raw token (HybridSigner).
  const envelopeSigner = await getEnvelopeSigner();
  const envelopeSignature = await envelopeSigner.sign(token.raw);
  const envelopeKeyPair = envelopeSigner.getKeyPair();

  return {
    ok: true,
    token: token.raw,
    tokenType: 'Bearer',
    tokenFormat: CAPABILITY_TOKEN_FORMAT,
    agentRole: role,
    permissions,
    capabilities: token.payload.att,
    issuer: token.payload.iss,
    audience: token.payload.aud,
    nonce: token.payload.nnc,
    workflow: {
      workflowId,
      workflowStep,
      executedBy: role,
      initiatedBy,
      delegationChain: updatedDelegationChain,
      executionContext,
    },
    key: {
      kid: keyPair.kid,
      thumbprint: keyPair.thumbprint,
      publicKey: keyPair.publicKey,
      ...(returnPrivateKey ? { privateKey: keyPair.privateKey } : {}),
    },
    privateKeyReturned: returnPrivateKey,
    note: returnPrivateKey
      ? 'Private key returned because returnPrivateKey=true. Treat it as secret PoP signing material.'
      : 'Private key withheld. Call with returnPrivateKey=true only when the agent must sign PoP HTTP requests.',
    expiresAt: new Date(token.payload.exp * 1000).toISOString(),
    pqEnvelope: {
      algorithm: envelopeSignature.algorithm,
      kid: envelopeSignature.kid,
      signedAt: envelopeSignature.signedAt,
      classicalSignature: envelopeSignature.classicalSignature,
      ...(envelopeSignature.pqSignature ? { pqSignature: envelopeSignature.pqSignature } : {}),
      publicKeys: {
        classical: envelopeKeyPair?.classicalKey.publicKey,
        ...(envelopeKeyPair?.pqKey ? { pq: envelopeKeyPair.pqKey.publicKey } : {}),
      },
      note: 'Dual-signature envelope (Ed25519 + ML-DSA-65 when available) over the raw token. Pass back to verify_agent_token as pqEnvelope for post-quantum verification.',
    },
  };
}

async function verifyAgentToken(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const token = requiredString(args.token, 'token');
  const includePayload = args.includePayload !== false;

  const presentation = verifyPresentation(token);

  // Optional ML-DSA-65 dual-signature envelope check — fail closed when presented.
  let envelopeChecked = false;
  let envelopeValid: boolean | undefined;
  const envelopeArgs = optionalRecord(args.pqEnvelope);
  if (envelopeArgs) {
    envelopeChecked = true;
    envelopeValid = false;
    try {
      const classicalSignature = asString(envelopeArgs.classicalSignature);
      if (classicalSignature) {
        const composite: CompositeSignature = {
          classicalSignature,
          ...(asString(envelopeArgs.pqSignature)
            ? { pqSignature: asString(envelopeArgs.pqSignature) }
            : {}),
          algorithm: 'hybrid-ed25519-ml-dsa-65',
          signedAt: asString(envelopeArgs.signedAt) ?? new Date(0).toISOString(),
          kid: asString(envelopeArgs.kid) ?? 'unknown',
        };
        const signer = await getEnvelopeSigner();
        const result = await signer.verify(token, composite);
        envelopeValid = result.valid;
      }
    } catch {
      envelopeValid = false;
    }
  }

  const valid = presentation.valid && (!envelopeChecked || envelopeValid === true);
  const errorCode =
    presentation.errorCode ?? (envelopeChecked && envelopeValid !== true ? 'ENVELOPE_INVALID' : undefined);
  const error =
    presentation.error ??
    (envelopeChecked && envelopeValid !== true
      ? 'ML-DSA-65 dual-signature envelope did not verify against the issuing signer.'
      : undefined);

  const receipt = receiptFromPresentation('verify_agent_token', presentation, {
    checked: envelopeChecked,
    valid: envelopeValid,
  });
  receipt.valid = valid;
  if (!valid && errorCode && !receipt.errorCode) receipt.errorCode = errorCode;
  if (!valid && error && !receipt.error) receipt.error = error;
  const receiptPath = emitVerifyReceipt(receipt);

  return {
    ok: true,
    valid,
    tokenFormat: presentation.tokenFormat,
    cached: presentation.cached,
    error,
    errorCode,
    envelopeChecked,
    ...(envelopeChecked ? { envelopeValid } : {}),
    payload:
      includePayload && presentation.payload ? summarizePayload(presentation.payload) : undefined,
    receipt: {
      tokenSha256: presentation.tokenSha256,
      ...(receiptPath ? { path: receiptPath } : {}),
    },
  };
}

async function checkPermission(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const token = requiredString(args.token, 'token');
  const permission = parseAgentPermission(args.permission, 'permission');
  const workflowStep = parseWorkflowStep(args.workflowStep, 'workflowStep');

  const presentation = verifyPresentation(token);
  emitVerifyReceipt(receiptFromPresentation('check_permission', presentation));

  if (!presentation.valid || !presentation.payload) {
    return {
      ok: true,
      valid: false,
      allowed: false,
      error: presentation.error,
      errorCode: presentation.errorCode,
    };
  }

  const payload = presentation.payload;
  const facts = asRecord(payload.fct);
  const workflow = asRecord(facts?.workflow);
  const scope = asString(facts?.scope);
  const action = PERMISSION_TO_ACTION[permission] || permission;
  const resource = scope ? `${HOLOSCRIPT_RESOURCE_SCHEME}${scope}` : HOLOSCRIPT_RESOURCE_ALL;
  const semantics = getCapabilityTokenIssuer().getSemantics();

  let allowed = payload.att.some((cap) => semantics.canAccess(cap, resource, action));
  if (allowed && workflowStep) {
    allowed = asString(workflow?.workflow_step) === workflowStep;
  }

  return {
    ok: true,
    valid: true,
    allowed,
    permission,
    workflowStep,
    agentRole: asString(asRecord(facts?.agent)?.role),
    grantedPermissions: permissionsFromCapabilities(payload.att),
    reason: allowed
      ? 'Token carries the requested capability and workflow constraint.'
      : 'Token is valid but does not satisfy the requested capability or workflow constraint.',
  };
}

async function getDelegationChain(
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const token = requiredString(args.token, 'token');

  const presentation = verifyPresentation(token);
  emitVerifyReceipt(receiptFromPresentation('get_delegation_chain', presentation));

  if (!presentation.valid || !presentation.payload) {
    return {
      ok: true,
      valid: false,
      error: presentation.error,
      errorCode: presentation.errorCode,
      delegationChain: [],
    };
  }

  const payload = presentation.payload;
  const facts = asRecord(payload.fct);
  const workflow = asRecord(facts?.workflow);

  return {
    ok: true,
    valid: true,
    subject: payload.iss,
    agentRole: asString(asRecord(facts?.agent)?.role),
    workflowId: asString(workflow?.workflow_id),
    workflowStep: asString(workflow?.workflow_step),
    initiatedBy: asString(workflow?.initiated_by),
    executedBy: asString(workflow?.executed_by),
    delegationChain: asStringArray(workflow?.delegation_chain) ?? [],
    executionContext: asRecord(workflow?.execution_context) ?? {},
    attenuationChain: presentation.chain,
  };
}

// ---------------------------------------------------------------------------
// Summaries
// ---------------------------------------------------------------------------

function summarizePayload(payload: CapabilityTokenPayload): Record<string, unknown> {
  const facts = asRecord(payload.fct);
  const agent = asRecord(facts?.agent);
  const workflow = asRecord(facts?.workflow);
  return {
    issuer: payload.iss,
    audience: payload.aud,
    nonce: payload.nnc,
    ...(payload.nbf !== undefined ? { notBefore: new Date(payload.nbf * 1000).toISOString() } : {}),
    expiresAt: new Date(payload.exp * 1000).toISOString(),
    agentRole: asString(agent?.role),
    checksum: asRecord(agent?.checksum),
    permissions: permissionsFromCapabilities(payload.att),
    capabilities: payload.att,
    scope: asString(facts?.scope),
    intent: {
      workflowId: asString(workflow?.workflow_id),
      workflowStep: asString(workflow?.workflow_step),
      executedBy: asString(workflow?.executed_by),
      initiatedBy: asString(workflow?.initiated_by),
      delegationChain: asStringArray(workflow?.delegation_chain) ?? [],
      executionContext: asRecord(workflow?.execution_context) ?? {},
    },
    confirmation: asString(facts?.thumbprint) ? { jkt: asString(facts?.thumbprint) } : undefined,
    publicKey: asString(facts?.publicKey),
  };
}

function permissionsFromCapabilities(capabilities: Capability[]): AgentPermission[] {
  const perms = new Set<AgentPermission>();
  for (const cap of capabilities) {
    if (cap.can === CapabilityActions.ALL) {
      for (const perm of agentPermissions) perms.add(perm);
      continue;
    }
    const perm = ACTION_TO_PERMISSION[cap.can];
    if (perm) perms.add(perm);
  }
  return [...perms];
}

// ---------------------------------------------------------------------------
// Test/reset surface
// ---------------------------------------------------------------------------

/**
 * Reset all module singletons (presentation cache, envelope signer, and the
 * global CapabilityTokenIssuer). Intended for tests.
 */
export function resetAgentIdentityTools(): void {
  presentationCache.clear();
  envelopeSignerPromise = null;
  resetCapabilityTokenIssuer();
}

// ---------------------------------------------------------------------------
// Argument parsing helpers
// ---------------------------------------------------------------------------

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string.`);
  }
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function optionalRecord(value: unknown): Record<string, unknown> | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Expected a JSON object.');
  }
  return value as Record<string, unknown>;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  if (value.some((item) => typeof item !== 'string')) return undefined;
  return value as string[];
}

function parseStringArray(value: unknown, field: string): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`${field} must be an array of strings.`);
  }
  return value;
}

function parseRoleArray(value: unknown, field: string): AgentRole[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) {
    throw new Error(`${field} must be an array of agent roles.`);
  }
  return value.map((item, index) => parseAgentRole(item, `${field}[${index}]`));
}

function parseAgentRole(value: unknown, field: string, fallback?: AgentRole): AgentRole {
  if (value === undefined || value === null || value === '') {
    if (fallback) return fallback;
    throw new Error(`${field} is required.`);
  }
  if (typeof value === 'string' && agentRoles.includes(value as AgentRole)) {
    return value as AgentRole;
  }
  throw new Error(`${field} must be one of: ${agentRoles.join(', ')}.`);
}

function parseAgentPermission(value: unknown, field: string): AgentPermission {
  if (typeof value === 'string' && agentPermissions.includes(value as AgentPermission)) {
    return value as AgentPermission;
  }
  throw new Error(`${field} must be one of: ${agentPermissions.join(', ')}.`);
}

function parseWorkflowStep(
  value: unknown,
  field: string,
  fallback?: WorkflowStep
): WorkflowStep | undefined {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'string' && workflowSteps.includes(value as WorkflowStep)) {
    return value as WorkflowStep;
  }
  throw new Error(`${field} must be one of: ${workflowSteps.join(', ')}.`);
}

/**
 * Parse the legacy tokenExpiration input ('15m' / '24h' / '7d' / seconds) into
 * a lifetime in seconds for the capability issuer.
 */
function parseTokenExpirationSeconds(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error('tokenExpiration must be a positive finite number of seconds.');
    }
    return Math.floor(value);
  }
  if (typeof value === 'string') {
    const match = value.match(/^(\d+)([smhd])$/);
    if (!match) {
      throw new Error(
        `Invalid tokenExpiration format: ${value}. Use e.g. 30s, 15m, 24h, 7d, or a number of seconds.`
      );
    }
    const amount = parseInt(match[1], 10);
    const multipliers: Record<string, number> = { s: 1, m: 60, h: 60 * 60, d: 60 * 60 * 24 };
    return amount * multipliers[match[2]];
  }
  throw new Error('tokenExpiration must be a string or finite number.');
}
