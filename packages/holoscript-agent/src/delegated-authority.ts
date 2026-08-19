import type { HolomeshClient } from './holomesh-client.js';
import type { ILLMProvider, LLMMessage } from '@holoscript/llm-provider';

// =============================================================================
// Types — Delegated Authority Protocol v1
// =============================================================================

export interface TeamMessage {
  id: string;
  fromAgentId: string;
  fromAgentName: string;
  content: string;
  messageType: string;
  createdAt: string;
}

export type AuthorityRequestType = 'owner-op' | 'founder-gated';

export type AuthorityRoute =
  | 'autonomous'
  | 'joseph-exact-four'
  | 'specialist-review'
  | 'platform-control'
  | 'prohibited-replan';

export interface AuthorityRequest {
  messageId: string;
  fromAgentId: string;
  fromAgentName: string;
  requestType: AuthorityRequestType;
  action: string;
  payload: Record<string, unknown>;
  rawContent: string;
}

export interface AuthorityReceipt {
  requestMessageId: string;
  status: 'executed' | 'ruled' | 'rejected' | 'escalated' | 'deferred';
  action: string;
  authorityRoute: AuthorityRoute;
  result?: unknown;
  ruling?: string;
  reason: string;
  timestamp: string;
}

export interface DelegatedAuthorityOptions {
  mesh: HolomeshClient;
  /** Optional exact-four pre-vetting provider. It never substitutes for Joseph's decision. */
  provider?: ILLMProvider;
  /** Policy corpus injected into the optional pre-vetting model. */
  systemPrompt?: string;
  /** Agents whose requests are accepted. Empty = accept all team members. */
  allowList?: Set<string>;
  /** Actions this handler is permitted to execute. Empty = all owner-ops. */
  permittedActions?: Set<string>;
  /** Message IDs already processed (persisted across ticks). */
  processedMessageIds?: Set<string>;
  /**
   * Bound on the processed-id set; the oldest ids are evicted first once it
   * is exceeded (default 10,000). Applies immediately to an injected
   * `processedMessageIds` set too, so a persisted set restored above the cap
   * is trimmed at construction rather than only once it grows further.
   */
  maxProcessedIds?: number;
}

// =============================================================================
// Bounded limits — untrusted input from team messages must never let this
// handler's per-tick work or memory grow unboundedly (task_1787108819456_41on,
// review Q-02).
// =============================================================================

/**
 * parseRequest() runs regexes against msg.content, which is untrusted text
 * any team member can send. Reject anything over this cap before a regex
 * ever sees it: measured against the structured-envelope regex, adversarial
 * content that never satisfies the trailing "}" shows ~O(n^2) backtracking
 * (8KB ~55ms, 200KB ~33s) — a message a little over 200KB would block the
 * agent's async tick for tens of seconds. At the cap itself even the
 * worst-case shape stays comfortably fast.
 */
const MAX_PARSE_CONTENT_LENGTH = 8 * 1024; // 8KB

/**
 * Default bound for the processed-message-id set. Without an eviction
 * policy this set grows for the life of a long-running session. Ids are
 * only ever checked for membership, never "touched" again once seen, so
 * eviction by insertion order (oldest-first) is equivalent to true LRU
 * here — the oldest-seen id is always the least-recently-used one.
 */
const DEFAULT_MAX_PROCESSED_IDS = 10_000;

// =============================================================================
// Delegated Authority Handler
//
// Implements the E4 protocol: agents send messages to Brittney; on her next
// tick she validates, executes owner-ops or routes typed authority, emits
// a receipt, and responds on the team feed.
// =============================================================================

export class DelegatedAuthorityHandler {
  private readonly mesh: HolomeshClient;
  private readonly provider?: ILLMProvider;
  private readonly systemPrompt?: string;
  private readonly allowList?: Set<string>;
  private readonly permittedActions?: Set<string>;
  private readonly processed: Set<string>;
  private readonly maxProcessedIds: number;

  constructor(opts: DelegatedAuthorityOptions) {
    this.mesh = opts.mesh;
    this.provider = opts.provider;
    this.systemPrompt = opts.systemPrompt;
    this.allowList = opts.allowList;
    this.permittedActions = opts.permittedActions;
    this.maxProcessedIds = opts.maxProcessedIds ?? DEFAULT_MAX_PROCESSED_IDS;
    this.processed = opts.processedMessageIds ?? new Set<string>();
    this.evictExcessProcessedIds();
  }

  // ---------------------------------------------------------------------------
  // Main entry: read team messages, process authority requests, return receipts
  // ---------------------------------------------------------------------------
  async processMessages(): Promise<AuthorityReceipt[]> {
    const messages = await this.mesh.getTeamMessages(20);
    const receipts: AuthorityReceipt[] = [];

    for (const msg of messages) {
      if (this.processed.has(msg.id)) continue;
      this.markProcessed(msg.id);

      const request = this.parseRequest(msg);
      if (!request) continue;

      const receipt = await this.handleRequest(request);
      receipts.push(receipt);

      // Respond on team feed so the requesting agent sees the receipt.
      await this.mesh.sendTeamMessage(formatReceiptForTeamFeed(receipt, msg.fromAgentName), 'dm');
    }

    return receipts;
  }

  // ---------------------------------------------------------------------------
  // Bounded-LRU eviction for the processed-id set (task_1787108819456_41on,
  // review Q-02). See DEFAULT_MAX_PROCESSED_IDS above for why insertion-order
  // eviction is equivalent to true LRU for this set.
  // ---------------------------------------------------------------------------
  private markProcessed(id: string): void {
    this.processed.add(id);
    this.evictExcessProcessedIds();
  }

  private evictExcessProcessedIds(): void {
    while (this.processed.size > this.maxProcessedIds) {
      const oldest = this.processed.values().next().value;
      if (oldest === undefined) break;
      this.processed.delete(oldest);
    }
  }

  // ---------------------------------------------------------------------------
  // Parse a team message into an AuthorityRequest
  //
  // Supports two forms:
  //   1. Structured JSON envelope embedded in the message.
  //   2. Plain-text shorthand: "@brittney <requestType>: <action> [payload]"
  // ---------------------------------------------------------------------------
  parseRequest(msg: TeamMessage): AuthorityRequest | null {
    // msg.content is untrusted — any team member can send it. Reject
    // anything over the cap before it ever reaches a regex (see
    // MAX_PARSE_CONTENT_LENGTH above; task_1787108819456_41on, review Q-02).
    if (msg.content.length > MAX_PARSE_CONTENT_LENGTH) return null;

    const trimmed = msg.content.trim();

    // --- Structured JSON envelope ------------------------------------------------
    const jsonMatch = trimmed.match(/\{[\s\S]*"protocol"\s*:\s*"delegated-authority\/v1"[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const envelope = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
        if (envelope.protocol !== 'delegated-authority/v1') return null;

        const requestType = coerceRequestType(envelope.requestType);
        if (!requestType) return null;

        const action = String(envelope.action ?? '');
        if (!action) return null;

        return {
          messageId: msg.id,
          fromAgentId: msg.fromAgentId,
          fromAgentName: msg.fromAgentName,
          requestType,
          action,
          payload: (envelope.payload as Record<string, unknown>) ?? {},
          rawContent: msg.content,
        };
      } catch {
        return null;
      }
    }

    // --- Plain-text shorthand ----------------------------------------------------
    // Patterns:
    //   @brittney owner-op: set-team-mode {mode: audit}
    //   @brittney founder-gated: should we descope the SNN package?
    const plainMatch = trimmed.match(/^@brittney\s+(owner-op|founder-gated)\s*:\s*(.+)$/im);
    if (plainMatch) {
      const requestType = plainMatch[1] as AuthorityRequestType;
      const rest = plainMatch[2].trim();

      // Try to extract action + JSON payload from the rest
      const actionPayloadMatch = rest.match(/^([\w-]+)\s*(\{.*\})?$/s);
      const action = actionPayloadMatch?.[1] ?? rest;
      let payload: Record<string, unknown> = {};
      if (actionPayloadMatch?.[2]) {
        const raw = actionPayloadMatch[2].trim();
        try {
          payload = JSON.parse(raw);
        } catch {
          // Try to fix bare-object keys (e.g. {mode: "audit"} -> {"mode":"audit"})
          try {
            const fixed = raw.replace(/([{,]\s*)([a-zA-Z_]\w*)\s*:/g, '$1"$2":');
            payload = JSON.parse(fixed);
          } catch {
            // payload is malformed — treat the whole rest as action description
          }
        }
      }

      return {
        messageId: msg.id,
        fromAgentId: msg.fromAgentId,
        fromAgentName: msg.fromAgentName,
        requestType,
        action,
        payload,
        rawContent: msg.content,
      };
    }

    return null;
  }

  // ---------------------------------------------------------------------------
  // Validate and route to execution or ruling
  // ---------------------------------------------------------------------------
  async handleRequest(req: AuthorityRequest): Promise<AuthorityReceipt> {
    // Validation: allow-list
    if (this.allowList && !this.allowList.has(req.fromAgentId)) {
      return rejectReceipt(req, `Agent ${req.fromAgentName} is not on the allow-list.`);
    }

    // Validation: permitted-actions
    if (this.permittedActions && !this.permittedActions.has(req.action)) {
      return rejectReceipt(req, `Action "${req.action}" is not in the permitted-actions set.`);
    }

    const authorityRoute = classifyAuthorityRoute(req);
    if (authorityRoute === 'prohibited-replan') {
      return rejectReceipt(
        req,
        'Force-push and hard-reset are prohibited operations. Replan; they cannot become approvable.',
        authorityRoute
      );
    }
    if (authorityRoute === 'specialist-review') {
      return deferredReceipt(
        req,
        authorityRoute,
        'Route legal, export-control, compliance, IRB, or privacy review to the relevant specialist; this is not Joseph approval.'
      );
    }
    if (authorityRoute === 'platform-control') {
      return deferredReceipt(
        req,
        authorityRoute,
        'A tool, credential, permission, or platform control is missing. Repair it or route through the platform owner; this is not Joseph approval.'
      );
    }

    if (req.requestType === 'owner-op') {
      return this.executeOwnerOp(req);
    }

    if (req.requestType === 'founder-gated') {
      if (authorityRoute !== 'joseph-exact-four') {
        return {
          requestMessageId: req.messageId,
          status: 'ruled',
          action: req.action,
          authorityRoute: 'autonomous',
          ruling: 'Proceed autonomously: decide, execute, verify, and announce.',
          reason: 'The request does not match any exact-four Joseph-review class.',
          timestamp: new Date().toISOString(),
        };
      }
      return this.preVetExactFour(req);
    }

    return rejectReceipt(req, `Unknown requestType: ${req.requestType}`);
  }

  // ---------------------------------------------------------------------------
  // Owner-op execution — direct API calls using Brittney's bearer
  // ---------------------------------------------------------------------------
  private async executeOwnerOp(req: AuthorityRequest): Promise<AuthorityReceipt> {
    try {
      switch (req.action) {
        case 'set-team-mode': {
          const mode = String(req.payload.mode ?? req.payload.targetMode ?? '');
          if (!mode) {
            return rejectReceipt(req, 'Missing payload.mode for set-team-mode.');
          }
          const result = await this.mesh.setTeamMode(mode, String(req.payload.reason ?? ''));
          return executedReceipt(req, {
            modeSet: result.mode,
            unchanged: result.unchanged ?? false,
          });
        }

        case 'set-room-prefs': {
          const style = req.payload.communicationStyle as string | undefined;
          const objective = req.payload.objective as string | undefined;
          if (!style && objective === undefined) {
            return rejectReceipt(
              req,
              'Missing payload.communicationStyle or payload.objective for set-room-prefs.'
            );
          }
          const result = await this.mesh.patchRoomPrefs({ communicationStyle: style, objective });
          return executedReceipt(req, result);
        }

        case 'update-task': {
          const taskId = String(req.payload.taskId ?? '');
          if (!taskId) {
            return rejectReceipt(req, 'Missing payload.taskId for update-task.');
          }
          const result = await this.mesh.updateTask(taskId, {
            title: req.payload.title as string | undefined,
            description: req.payload.description as string | undefined,
            priority: req.payload.priority as number | undefined,
            tags: req.payload.tags as string[] | undefined,
          });
          return executedReceipt(req, result);
        }

        case 'delete-task': {
          const taskId = String(req.payload.taskId ?? '');
          if (!taskId) {
            return rejectReceipt(req, 'Missing payload.taskId for delete-task.');
          }
          const result = await this.mesh.deleteTask(taskId);
          return executedReceipt(req, result);
        }

        case 'delegate-task': {
          const taskId = String(req.payload.taskId ?? '');
          const toAgentId = String(req.payload.toAgentId ?? '');
          if (!taskId || !toAgentId) {
            return rejectReceipt(
              req,
              'Missing payload.taskId or payload.toAgentId for delegate-task.'
            );
          }
          const result = await this.mesh.delegateTask(taskId, toAgentId);
          return executedReceipt(req, result);
        }

        default:
          return rejectReceipt(req, `Unknown owner-op action: ${req.action}`);
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return {
        requestMessageId: req.messageId,
        status: 'rejected',
        action: req.action,
        authorityRoute: 'autonomous',
        reason: `Execution failed: ${reason}`,
        timestamp: new Date().toISOString(),
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Exact-four pre-vetting; the LLM summarizes evidence but never approves
  // ---------------------------------------------------------------------------
  private async preVetExactFour(req: AuthorityRequest): Promise<AuthorityReceipt> {
    if (!this.provider) {
      return {
        requestMessageId: req.messageId,
        status: 'escalated',
        action: req.action,
        authorityRoute: 'joseph-exact-four',
        reason:
          'Exact-four context requires a verifier-bound Joseph decision. No pre-vetting provider is configured.',
        timestamp: new Date().toISOString(),
      };
    }

    const messages: LLMMessage[] = [
      {
        role: 'system',
        content:
          (this.systemPrompt ?? '') +
          '\n\nYou are an exact-four pre-vetting assistant, not the approval authority. ' +
          'A peer agent has a Joseph-review request. ' +
          'Apply the Four Refusals, the authority-order (GOLD > skill > NORTH_STAR > CLAUDE.md > knowledge > memory), ' +
          'and identify the exact protected class. Cite your sources. ' +
          'Never authorize the action; Joseph and the verifier-bound decision path remain required. ' +
          'Format your ruling as:\n' +
          'RULING: <pre-vetting summary>\n' +
          'REASON: <reasoning with citations>\n' +
          'ESCALATE: yes',
      },
      {
        role: 'user',
        content: `Peer agent ${req.fromAgentName} asks:\n${req.rawContent}\n\nPayload: ${JSON.stringify(req.payload)}`,
      },
    ];

    try {
      const resp = await this.provider.complete(
        { messages, maxTokens: 2048, temperature: 0.2 },
        'claude-opus-4-7' // default; real model comes from identity
      );

      const text = resp.content ?? '';
      const rulingMatch = text.match(/RULING:\s*(.+)/i);
      const reasonMatch = text.match(/REASON:\s*([\s\S]+?)(?=\nESCALATE:|$)/i);
      const ruling = rulingMatch?.[1]?.trim() ?? text.slice(0, 500);
      const reason = reasonMatch?.[1]?.trim() ?? 'No explicit reasoning block returned.';

      return {
        requestMessageId: req.messageId,
        status: 'escalated',
        action: req.action,
        authorityRoute: 'joseph-exact-four',
        ruling,
        reason,
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return {
        requestMessageId: req.messageId,
        status: 'rejected',
        action: req.action,
        authorityRoute: 'joseph-exact-four',
        reason: `Ruling failed: ${reason}`,
        timestamp: new Date().toISOString(),
      };
    }
  }
}

// =============================================================================
// Receipt helpers
// =============================================================================

function executedReceipt(req: AuthorityRequest, result: unknown): AuthorityReceipt {
  return {
    requestMessageId: req.messageId,
    status: 'executed',
    action: req.action,
    authorityRoute: 'autonomous',
    result,
    reason: `Owner-op "${req.action}" executed successfully.`,
    timestamp: new Date().toISOString(),
  };
}

function rejectReceipt(
  req: AuthorityRequest,
  reason: string,
  authorityRoute: AuthorityRoute = 'autonomous'
): AuthorityReceipt {
  return {
    requestMessageId: req.messageId,
    status: 'rejected',
    action: req.action,
    authorityRoute,
    reason,
    timestamp: new Date().toISOString(),
  };
}

function deferredReceipt(
  req: AuthorityRequest,
  authorityRoute: 'specialist-review' | 'platform-control',
  reason: string
): AuthorityReceipt {
  return {
    requestMessageId: req.messageId,
    status: 'deferred',
    action: req.action,
    authorityRoute,
    reason,
    timestamp: new Date().toISOString(),
  };
}

function formatReceiptForTeamFeed(receipt: AuthorityReceipt, toAgentName: string): string {
  const lines = [
    `@${toAgentName} [brittney-receipt] ${receipt.status.toUpperCase()} — ${receipt.action}`,
    `reason: ${receipt.reason}`,
  ];
  if (receipt.ruling) lines.push(`ruling: ${receipt.ruling}`);
  if (receipt.result !== undefined) lines.push(`result: ${JSON.stringify(receipt.result)}`);
  lines.push(`time: ${receipt.timestamp}`);
  return lines.join('\n');
}

function coerceRequestType(raw: unknown): AuthorityRequestType | null {
  if (raw === 'owner-op' || raw === 'owner_op' || raw === 'ownerop') return 'owner-op';
  if (raw === 'founder-gated' || raw === 'founder_gated' || raw === 'foundergated')
    return 'founder-gated';
  return null;
}

const PROHIBITED_OPERATION_RE = /\b(force[- ]?push|hard[- ]?reset)\b/i;
const SPECIALIST_RE =
  /\b(legal|export[- ]control|sanctions?|compliance|irb|institutional review board|privacy)\b/i;
const PLATFORM_CONTROL_RE =
  /\b(missing|unavailable|expired|denied|blocked)\b.{0,40}\b(tool|credential|api key|permission|platform|account access)\b|\b(tool|credential|api key|permission|platform|account access)\b.{0,40}\b(missing|unavailable|expired|denied|blocked)\b/i;
const ACTIVE_RAIL_EXCEEDED_RE =
  /\b(exceed(?:s|ed|ing)?|over|beyond)\b.{0,40}\bactive\b.{0,24}\b(cap|rail)\b|\bactive\b.{0,24}\b(cap|rail)\b.{0,40}\b(exceed(?:s|ed|ing)?|over|beyond)\b/i;
const CUSTODY_AUTHORITY_RE =
  /\b(treasury master wallet|trezor (?:seed|recovery)|(?:create|creating|creation of) (?:a )?new wallet|new[- ]wallet creation|custody authority|mint(?:ing)? authority|permanent seat[- ]wallet identity)\b/i;
const JOSEPH_PHYSICAL_RE =
  /\bjoseph(?:'s)?\b.{0,40}\b(body|physical signature|presence|must sign|must attend|must be present)\b|\b(body|physical signature|presence)\b.{0,40}\bjoseph(?:'s)?\b/i;
const JOSEPH_PUBLIC_RE =
  /\b(public|publish|announce|statement|press|post|broadcast)\b.{0,80}\bjoseph(?:'s)?\b.{0,24}\b(name|face|voice)\b|\bunder joseph(?:'s)? (?:name|face|voice)\b/i;
const GOVERNANCE_MUTATION_RE =
  /\b(change|mutate|modify|rewrite|alter|remove|weaken|expand)\b.{0,80}\b(founder authority|escalation criteria|governance[- ]tier|diamond|lotus|vault posture)\b/i;

/**
 * Classification text is the DECLARED action ONLY (`req.action`) — never
 * `rawContent` or a stringified `payload`. Both are peer-agent DATA: a team
 * message can legitimately quote or paraphrase a forbidden-operation
 * reminder ("remember: never force-push, hard-reset, or delete-branch on a
 * shared repo") without the message itself being an attempted force-push or
 * hard-reset. Classifying that free text the same way as an attempted
 * action let a passive, quoted, or listed mention anywhere in the message
 * body block (or exact-four-escalate) a request that had nothing to do with
 * the mentioned operation — e.g. a `set-team-mode` owner-op got rejected as
 * "prohibited-replan" purely because the same message also carried an
 * unrelated do-not-do reminder. Structured `payload` evidence flags below
 * (`touchesTreasuryOrCustody`, etc.) are exempt from this: they are typed,
 * named booleans a caller sets deliberately, not prose scanned for
 * keywords. This mirrors the prompt-injection separation `tool-call-checks.ts`
 * already applies to tool names vs. tool args — data must never steer
 * authority routing. (false-positive fix: task_1785317871554_46k9)
 */
export function classifyAuthorityRoute(req: AuthorityRequest): AuthorityRoute {
  const text = req.action;
  if (PROHIBITED_OPERATION_RE.test(text)) return 'prohibited-replan';

  const projected = numberFromPayload(req.payload, 'projectedSpendUsd', 'projected_spend_usd');
  const cap = numberFromPayload(req.payload, 'activeRailCapUsd', 'active_rail_cap_usd');
  const exceedsStructuredCap = projected !== undefined && cap !== undefined && projected > cap;
  const exactFourEvidence =
    req.payload.exceedsActiveRailCap === true ||
    req.payload.exceeds_active_rail_cap === true ||
    req.payload.touchesTreasuryOrCustody === true ||
    req.payload.touches_treasury_or_custody === true ||
    req.payload.requiresJosephBodySignaturePresence === true ||
    req.payload.requires_joseph_body_signature_presence === true ||
    req.payload.publicCommitmentUnderJosephNameFaceVoice === true ||
    req.payload.public_commitment_under_joseph_name_face_voice === true ||
    req.payload.governanceTierMutation === true ||
    req.payload.governance_tier_mutation === true;
  if (
    exceedsStructuredCap ||
    exactFourEvidence ||
    ACTIVE_RAIL_EXCEEDED_RE.test(text) ||
    CUSTODY_AUTHORITY_RE.test(text) ||
    JOSEPH_PHYSICAL_RE.test(text) ||
    JOSEPH_PUBLIC_RE.test(text) ||
    GOVERNANCE_MUTATION_RE.test(text)
  ) {
    return 'joseph-exact-four';
  }
  if (SPECIALIST_RE.test(text)) return 'specialist-review';
  if (PLATFORM_CONTROL_RE.test(text)) return 'platform-control';
  return 'autonomous';
}

function numberFromPayload(
  payload: Record<string, unknown>,
  camelKey: string,
  snakeKey: string
): number | undefined {
  const value = payload[camelKey] ?? payload[snakeKey];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
