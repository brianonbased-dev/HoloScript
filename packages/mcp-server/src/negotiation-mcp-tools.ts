/**
 * Negotiation MCP Tools — task_1778175122619_xk5l.
 *
 * Exposes the xsp6 / qe2i agent-negotiation primitives as MCP tools so external
 * agents (Brittney, peer Claude windows, codex, kimi) can drive the full
 * request_quote → quote → accept → execute → settle / dispute cycle through the
 * standard MCP protocol. Stacks on:
 *
 *   - cbdab1387 — agent-negotiation.ts state machine + HTTP /message dispatch
 *   - 98b94e0e4 — signer.ts + chain-anchor.ts + settleNegotiationWithAnchor
 *   - aa63b2416 — chain-anchor wired into composition demo with MockSigner
 *   - 1ed8b10b4 — Trezor anchor proof on Base (tx 0x2abe2621... block 45636414)
 *
 * SCOPE GUARDRAIL: this module is a thin MCP-shape adapter. It does NOT
 * implement any new state machine code; every tool wraps an existing pure
 * function in `agent-negotiation.ts` (`createNegotiation`, `advanceNegotiation`,
 * `settleNegotiation`, `settleNegotiationWithAnchor`, `getNegotiation`,
 * `listNegotiationsForTeam`). The signing path is the same — the route handler
 * still verifies signatures via signing-middleware before dispatching, but the
 * tools surface accepts the already-recovered signerAddress as input so MCP
 * clients can drive the cycle from outside the HTTP team-routes path.
 *
 * Tools published:
 *
 *   - negotiation_request_quote — start a new cycle in 'open'
 *   - negotiation_quote          — responder posts quote (open → quoted)
 *   - negotiation_accept         — initiator accepts (quoted → accepted)
 *   - negotiation_reject         — initiator rejects (quoted → rejected, terminal)
 *   - negotiation_execute        — responder reports result (accepted → executed)
 *   - negotiation_settle         — co-signed settlement (executed → settled)
 *                                  optional `signer` triggers chain anchor
 *   - negotiation_dispute        — file dispute (executed/settled → disputed)
 *   - negotiation_list           — list all negotiations for a team
 *   - negotiation_get            — fetch one by id
 *
 * Pattern mirror: spatial-mcp-tools.ts (single tool, validate → wrap pure
 * logic) and hologram-content-tools.ts (multiple tools, dispatch by name in
 * one handler). This module follows the multi-tool dispatch shape because
 * the negotiation surface is bigger.
 *
 * @package @holoscript/mcp-server
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  advanceNegotiation,
  createNegotiation,
  getNegotiation,
  listNegotiationsForTeam,
  settleNegotiation,
  settleNegotiationWithAnchor,
  type AdvanceNegotiationResult,
  type Negotiation,
  type NegotiationQuote,
} from './holomesh/agent-negotiation';
import { MockSigner, type Signer } from './holomesh/signing/signer';

// =============================================================================
// JSON Schemas
// =============================================================================

const QUOTE_SCHEMA = {
  type: 'object',
  description:
    'Economic terms a responder offers. `currency` is a free-form string so deployments can use USD, USDC, sat, credits, etc.',
  properties: {
    toolName: {
      type: 'string',
      description: 'Tool name + capability_query echo — what the responder commits to deliver.',
    },
    description: { type: 'string', description: 'Free-form description of the work product.' },
    price: {
      type: 'number',
      description: 'Numeric price in `currency`. 0 = free / favor.',
      minimum: 0,
    },
    currency: { type: 'string', description: 'Currency code or token symbol (USD, USDC, sat, credits, ...).' },
    slaSeconds: {
      type: 'number',
      description: 'SLA target in wallclock seconds. 0 = best-effort.',
      minimum: 0,
    },
    expiresAt: {
      type: 'string',
      description: 'ISO-8601 expiration timestamp; quote is invalid after this point.',
    },
  },
  required: ['toolName', 'description', 'price', 'currency', 'slaSeconds', 'expiresAt'],
  additionalProperties: false,
} as const;

const REQUEST_PAYLOAD_SCHEMA = {
  type: 'object',
  description: 'The capability request the initiator is asking the responder to quote against.',
  properties: {
    toolName: { type: 'string', description: 'Tool name the initiator wants executed.' },
    capabilityQuery: {
      type: 'string',
      description: 'Capability tag / search predicate (e.g. "code-quality:typescript").',
    },
    args: {
      type: 'object',
      description: 'Optional arguments the initiator would pass to the tool on execute.',
      additionalProperties: true,
    },
  },
  required: ['toolName', 'capabilityQuery'],
  additionalProperties: false,
} as const;

// =============================================================================
// Tool Definitions
// =============================================================================

export const negotiationToolDefinitions: Tool[] = [
  {
    name: 'negotiation_request_quote',
    description:
      'Start a new agent-to-agent negotiation in state `open`. The initiator declares the responder, team, and the capability request. Server appends a seq=0 `request_quote` event signed by the initiator. Returns the new Negotiation aggregate (id + state + events). Use this as the entry point for the full cycle: request_quote → quote → accept → execute → settle. Stacks on agent-negotiation.ts (cbdab1387).',
    inputSchema: {
      type: 'object',
      properties: {
        teamId: { type: 'string', description: 'HoloMesh team id this negotiation belongs to.' },
        initiatorAgentId: { type: 'string', description: 'Agent id of the requester.' },
        initiatorAgentName: { type: 'string', description: 'Display name of the initiator.' },
        responderAgentId: { type: 'string', description: 'Agent id of the responder being asked to quote.' },
        responderAgentName: { type: 'string', description: 'Display name of the responder.' },
        request: REQUEST_PAYLOAD_SCHEMA,
        signerAddress: {
          type: 'string',
          description: 'Optional 0x-address of the initiator that signed the request envelope.',
        },
        id: {
          type: 'string',
          description: 'Optional pre-supplied negotiation id (mainly for deterministic tests).',
        },
      },
      required: [
        'teamId',
        'initiatorAgentId',
        'initiatorAgentName',
        'responderAgentId',
        'responderAgentName',
        'request',
      ],
      additionalProperties: false,
    },
  },
  {
    name: 'negotiation_quote',
    description:
      'Responder posts a quote against an open negotiation. Transitions the aggregate from `open` → `quoted` and stores `quote` on the negotiation. Only the responder may author this transition (wrong-actor errors otherwise). Returns updated Negotiation + the new event. Stacks on agent-negotiation.ts.advanceNegotiation.',
    inputSchema: {
      type: 'object',
      properties: {
        negotiationId: { type: 'string', description: 'Negotiation id returned by negotiation_request_quote.' },
        authorAgentId: { type: 'string', description: 'Agent id of the responder posting the quote.' },
        signerAddress: { type: 'string', description: 'Optional 0x-address that signed the envelope.' },
        quote: QUOTE_SCHEMA,
      },
      required: ['negotiationId', 'authorAgentId', 'quote'],
      additionalProperties: false,
    },
  },
  {
    name: 'negotiation_accept',
    description:
      'Initiator accepts the responder’s most recent quote. Transitions `quoted` → `accepted`. Wrong-actor (responder accepting their own quote) is rejected with reason=`wrong-actor`. Returns updated Negotiation + new event. Stacks on agent-negotiation.ts.advanceNegotiation.',
    inputSchema: {
      type: 'object',
      properties: {
        negotiationId: { type: 'string', description: 'Negotiation id.' },
        authorAgentId: { type: 'string', description: 'Agent id of the initiator.' },
        signerAddress: { type: 'string', description: 'Optional signer address.' },
      },
      required: ['negotiationId', 'authorAgentId'],
      additionalProperties: false,
    },
  },
  {
    name: 'negotiation_reject',
    description:
      'Initiator rejects the responder’s quote. Transitions `quoted` → `rejected` (TERMINAL — no further transitions accepted). Returns updated Negotiation + new event. Stacks on agent-negotiation.ts.advanceNegotiation.',
    inputSchema: {
      type: 'object',
      properties: {
        negotiationId: { type: 'string', description: 'Negotiation id.' },
        authorAgentId: { type: 'string', description: 'Agent id of the initiator.' },
        signerAddress: { type: 'string', description: 'Optional signer address.' },
        reason: { type: 'string', description: 'Optional human-readable rejection reason.' },
      },
      required: ['negotiationId', 'authorAgentId'],
      additionalProperties: false,
    },
  },
  {
    name: 'negotiation_execute',
    description:
      'Responder reports tool execution complete and posts the result. Transitions `accepted` → `executed`. The result body is hashed (SHA-256) for the eventual SettlementReceipt.resultHash. Only the responder may author this transition. Returns updated Negotiation + new event.',
    inputSchema: {
      type: 'object',
      properties: {
        negotiationId: { type: 'string', description: 'Negotiation id.' },
        authorAgentId: { type: 'string', description: 'Agent id of the responder.' },
        signerAddress: { type: 'string', description: 'Optional signer address.' },
        result: {
          description: 'Free-form result payload — hashed deterministically into receipt.resultHash.',
        },
      },
      required: ['negotiationId', 'authorAgentId'],
      additionalProperties: false,
    },
  },
  {
    name: 'negotiation_settle',
    description:
      'Apply the co-signed settlement receipt — both initiator and responder signatures required. Transitions `executed` → `settled` (TERMINAL except for dispute). Returns updated Negotiation, the new event, and the populated SettlementReceipt. If `useChainAnchor: true` is set, additionally anchors the EIP-712 hash on Base via eth_sendTransaction (F.041 / W.GOLD.514 pattern) using a deterministic MockSigner and returns the anchor result on `anchor`. For real-chain anchoring, the HTTP route layer should invoke `settleNegotiationWithAnchor` directly with a configured signer. Stacks on agent-negotiation.ts.settleNegotiation / settleNegotiationWithAnchor.',
    inputSchema: {
      type: 'object',
      properties: {
        negotiationId: { type: 'string', description: 'Negotiation id.' },
        authorAgentId: { type: 'string', description: 'Agent id of the party submitting the receipt.' },
        signerAddress: { type: 'string', description: 'Optional signer address.' },
        initiatorSignature: { type: 'string', description: 'Initiator’s signature of the receipt.' },
        initiatorAddress: { type: 'string', description: 'Initiator’s 0x-address.' },
        responderSignature: { type: 'string', description: 'Responder’s signature of the receipt.' },
        responderAddress: { type: 'string', description: 'Responder’s 0x-address.' },
        resultHash: {
          type: 'string',
          description:
            'Optional pre-computed SHA-256 hash of the executed result. If omitted, the server hashes the prior execute event payload.',
        },
        settlementTxHash: {
          type: 'string',
          description:
            'Optional caller-supplied chain anchor tx hash. Use `useChainAnchor: true` instead to have the runtime mint a real one via MockSigner.',
        },
        useChainAnchor: {
          type: 'boolean',
          description:
            'If true, mint a deterministic chain anchor with the EIP-712 hash as calldata via MockSigner. The returned response includes `anchor` with the eip712Hash + txHash + blockNumber + status. Default: false.',
        },
        mockChainAnchor: {
          type: 'object',
          description:
            'Optional MockSigner overrides for deterministic test fixtures. Only honored when useChainAnchor=true.',
          properties: {
            address: { type: 'string', description: '0x-address the mock signer reports.' },
            chainId: { type: 'number', description: 'Chain id the mock claims to be on.' },
            fixedTxHash: { type: 'string', description: '0x-hash the mock returns instead of computing one.' },
          },
          additionalProperties: false,
        },
      },
      required: [
        'negotiationId',
        'authorAgentId',
        'initiatorSignature',
        'initiatorAddress',
        'responderSignature',
        'responderAddress',
      ],
      additionalProperties: false,
    },
  },
  {
    name: 'negotiation_dispute',
    description:
      'File a dispute against an `executed` or `settled` negotiation. Either party may dispute. Transitions to `disputed` (TERMINAL). The dispute reason is recorded on the event payload. Returns updated Negotiation + new event.',
    inputSchema: {
      type: 'object',
      properties: {
        negotiationId: { type: 'string', description: 'Negotiation id.' },
        authorAgentId: { type: 'string', description: 'Agent id of the disputing party.' },
        signerAddress: { type: 'string', description: 'Optional signer address.' },
        reason: { type: 'string', description: 'Optional dispute reason recorded on the event.' },
      },
      required: ['negotiationId', 'authorAgentId'],
      additionalProperties: false,
    },
  },
  {
    name: 'negotiation_list',
    description:
      'List all negotiations for a team, newest first. Returns an array of Negotiation aggregates including their full event log. Read-only; no signatures required. Use this to populate a dashboard view of in-flight commerce.',
    inputSchema: {
      type: 'object',
      properties: {
        teamId: { type: 'string', description: 'HoloMesh team id.' },
        limit: {
          type: 'number',
          description: 'Optional max number of negotiations to return (default 50).',
          minimum: 1,
        },
      },
      required: ['teamId'],
      additionalProperties: false,
    },
  },
  {
    name: 'negotiation_get',
    description:
      'Fetch a single negotiation by id, including its full event log + (when settled) SettlementReceipt. Returns `{ ok: false, reason: "not-found" }` if the id is unknown.',
    inputSchema: {
      type: 'object',
      properties: {
        negotiationId: { type: 'string', description: 'Negotiation id.' },
      },
      required: ['negotiationId'],
      additionalProperties: false,
    },
  },
];

const NEGOTIATION_TOOL_NAMES = new Set(negotiationToolDefinitions.map((t) => t.name));

export function isNegotiationToolName(name: string): boolean {
  return NEGOTIATION_TOOL_NAMES.has(name);
}

// =============================================================================
// Helpers
// =============================================================================

interface MockSignerOptions {
  address?: string;
  chainId?: number;
  fixedTxHash?: string;
}

function buildMockSigner(opts: MockSignerOptions | undefined): Signer {
  return new MockSigner({
    address: opts?.address,
    chainId: opts?.chainId,
    fixedTxHash: opts?.fixedTxHash,
  });
}

/** Shape returned for state-mutating tools — pulled out so every adapter
 *  produces an identical contract for clients. */
interface NegotiationToolResult {
  ok: boolean;
  negotiation?: Negotiation;
  event?: AdvanceNegotiationResult['event'];
  receipt?: Negotiation['receipt'];
  anchor?: Awaited<ReturnType<typeof settleNegotiationWithAnchor>>['anchor'];
  reason?: AdvanceNegotiationResult['reason'];
  error?: string;
}

/** Convert an internal AdvanceNegotiationResult into the surface tool result.
 *  Keeps the receipt visible at the top level (not buried under negotiation)
 *  so MCP clients don't have to walk the aggregate. */
function shapeAdvanceResult(r: AdvanceNegotiationResult): NegotiationToolResult {
  if (!r.ok) {
    return { ok: false, reason: r.reason, error: r.error };
  }
  return {
    ok: true,
    negotiation: r.negotiation,
    event: r.event,
    receipt: r.negotiation?.receipt,
  };
}

// =============================================================================
// HANDLER
// =============================================================================

export async function handleNegotiationTool(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case 'negotiation_request_quote': {
      const teamId = String(args.teamId ?? '');
      const initiatorAgentId = String(args.initiatorAgentId ?? '');
      const initiatorAgentName = String(args.initiatorAgentName ?? '');
      const responderAgentId = String(args.responderAgentId ?? '');
      const responderAgentName = String(args.responderAgentName ?? '');
      const request = args.request as
        | { toolName?: string; capabilityQuery?: string; args?: Record<string, unknown> }
        | undefined;
      if (!teamId) return { ok: false, error: 'teamId required' };
      if (!initiatorAgentId || !responderAgentId) {
        return { ok: false, error: 'initiatorAgentId and responderAgentId required' };
      }
      if (initiatorAgentId === responderAgentId) {
        return {
          ok: false,
          reason: 'illegal-transition',
          error: 'initiator and responder must be distinct agents',
        };
      }
      if (!request || typeof request.toolName !== 'string' || !request.toolName) {
        return { ok: false, error: 'request.toolName required' };
      }
      if (typeof request.capabilityQuery !== 'string' || !request.capabilityQuery) {
        return { ok: false, error: 'request.capabilityQuery required' };
      }
      try {
        const negotiation = createNegotiation({
          teamId,
          initiatorAgentId,
          initiatorAgentName,
          responderAgentId,
          responderAgentName,
          request: {
            toolName: request.toolName,
            capabilityQuery: request.capabilityQuery,
            args: request.args,
          },
          id: typeof args.id === 'string' ? args.id : undefined,
          signerAddress: typeof args.signerAddress === 'string' ? args.signerAddress : undefined,
        });
        return { ok: true, negotiation, event: negotiation.events[0] };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    }

    case 'negotiation_quote': {
      const negotiationId = String(args.negotiationId ?? '');
      const authorAgentId = String(args.authorAgentId ?? '');
      const quote = args.quote as NegotiationQuote | undefined;
      if (!negotiationId || !authorAgentId || !quote) {
        return { ok: false, error: 'negotiationId, authorAgentId, and quote required' };
      }
      return shapeAdvanceResult(
        advanceNegotiation({
          negotiationId,
          authorAgentId,
          action: 'quote',
          signerAddress:
            typeof args.signerAddress === 'string' ? args.signerAddress : undefined,
          payload: { quote },
        }),
      );
    }

    case 'negotiation_accept': {
      const negotiationId = String(args.negotiationId ?? '');
      const authorAgentId = String(args.authorAgentId ?? '');
      if (!negotiationId || !authorAgentId) {
        return { ok: false, error: 'negotiationId and authorAgentId required' };
      }
      return shapeAdvanceResult(
        advanceNegotiation({
          negotiationId,
          authorAgentId,
          action: 'accept',
          signerAddress:
            typeof args.signerAddress === 'string' ? args.signerAddress : undefined,
        }),
      );
    }

    case 'negotiation_reject': {
      const negotiationId = String(args.negotiationId ?? '');
      const authorAgentId = String(args.authorAgentId ?? '');
      if (!negotiationId || !authorAgentId) {
        return { ok: false, error: 'negotiationId and authorAgentId required' };
      }
      const reason = typeof args.reason === 'string' ? args.reason : undefined;
      return shapeAdvanceResult(
        advanceNegotiation({
          negotiationId,
          authorAgentId,
          action: 'reject',
          signerAddress:
            typeof args.signerAddress === 'string' ? args.signerAddress : undefined,
          payload: reason ? { reason } : undefined,
        }),
      );
    }

    case 'negotiation_execute': {
      const negotiationId = String(args.negotiationId ?? '');
      const authorAgentId = String(args.authorAgentId ?? '');
      if (!negotiationId || !authorAgentId) {
        return { ok: false, error: 'negotiationId and authorAgentId required' };
      }
      const result = args.result;
      return shapeAdvanceResult(
        advanceNegotiation({
          negotiationId,
          authorAgentId,
          action: 'execute',
          signerAddress:
            typeof args.signerAddress === 'string' ? args.signerAddress : undefined,
          payload: result !== undefined ? { result } : undefined,
        }),
      );
    }

    case 'negotiation_settle': {
      const negotiationId = String(args.negotiationId ?? '');
      const authorAgentId = String(args.authorAgentId ?? '');
      const initiatorSignature = String(args.initiatorSignature ?? '');
      const initiatorAddress = String(args.initiatorAddress ?? '');
      const responderSignature = String(args.responderSignature ?? '');
      const responderAddress = String(args.responderAddress ?? '');
      if (
        !negotiationId ||
        !authorAgentId ||
        !initiatorSignature ||
        !initiatorAddress ||
        !responderSignature ||
        !responderAddress
      ) {
        return {
          ok: false,
          error:
            'negotiationId, authorAgentId, initiatorSignature, initiatorAddress, responderSignature, and responderAddress are all required',
        };
      }
      const useChainAnchor = args.useChainAnchor === true;
      const resultHash =
        typeof args.resultHash === 'string' ? args.resultHash : undefined;
      const signerAddress =
        typeof args.signerAddress === 'string' ? args.signerAddress : undefined;

      if (useChainAnchor) {
        const mockOpts = (args.mockChainAnchor ?? {}) as MockSignerOptions;
        const signer = buildMockSigner(mockOpts);
        const r = await settleNegotiationWithAnchor({
          negotiationId,
          authorAgentId,
          signerAddress,
          initiatorSignature,
          initiatorAddress,
          responderSignature,
          responderAddress,
          resultHash,
          signer,
        });
        if (!r.ok) {
          return { ok: false, reason: r.reason, error: r.error };
        }
        return {
          ok: true,
          negotiation: r.negotiation,
          event: r.event,
          receipt: r.negotiation?.receipt,
          anchor: r.anchor,
        };
      }

      const settlementTxHash =
        typeof args.settlementTxHash === 'string' ? args.settlementTxHash : undefined;
      return shapeAdvanceResult(
        settleNegotiation({
          negotiationId,
          authorAgentId,
          signerAddress,
          initiatorSignature,
          initiatorAddress,
          responderSignature,
          responderAddress,
          resultHash,
          settlementTxHash,
        }),
      );
    }

    case 'negotiation_dispute': {
      const negotiationId = String(args.negotiationId ?? '');
      const authorAgentId = String(args.authorAgentId ?? '');
      if (!negotiationId || !authorAgentId) {
        return { ok: false, error: 'negotiationId and authorAgentId required' };
      }
      const reason = typeof args.reason === 'string' ? args.reason : undefined;
      return shapeAdvanceResult(
        advanceNegotiation({
          negotiationId,
          authorAgentId,
          action: 'dispute',
          signerAddress:
            typeof args.signerAddress === 'string' ? args.signerAddress : undefined,
          payload: reason ? { reason } : undefined,
        }),
      );
    }

    case 'negotiation_list': {
      const teamId = String(args.teamId ?? '');
      if (!teamId) return { ok: false, error: 'teamId required' };
      const limit =
        typeof args.limit === 'number' && args.limit > 0
          ? Math.floor(args.limit)
          : 50;
      const negotiations = listNegotiationsForTeam(teamId).slice(0, limit);
      return { ok: true, count: negotiations.length, negotiations };
    }

    case 'negotiation_get': {
      const negotiationId = String(args.negotiationId ?? '');
      if (!negotiationId) return { ok: false, error: 'negotiationId required' };
      const n = getNegotiation(negotiationId);
      if (!n) {
        return { ok: false, reason: 'not-found', error: `negotiation ${negotiationId} not found` };
      }
      return { ok: true, negotiation: n };
    }

    default:
      throw new Error(`Unknown negotiation tool: ${name}`);
  }
}
