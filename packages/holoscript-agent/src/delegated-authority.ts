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
  result?: unknown;
  ruling?: string;
  reason: string;
  timestamp: string;
}

export interface DelegatedAuthorityOptions {
  mesh: HolomeshClient;
  /** Required for founder-gated rulings. Optional if handler only does owner-ops. */
  provider?: ILLMProvider;
  /** System prompt / founder-engine corpus. Injected into the LLM for rulings. */
  systemPrompt?: string;
  /** Agents whose requests are accepted. Empty = accept all team members. */
  allowList?: Set<string>;
  /** Actions this handler is permitted to execute. Empty = all owner-ops. */
  permittedActions?: Set<string>;
  /** Message IDs already processed (persisted across ticks). */
  processedMessageIds?: Set<string>;
}

// =============================================================================
// Delegated Authority Handler
//
// Implements the E4 protocol: agents send messages to Brittney; on her next
// tick she validates, executes owner-ops or rules via founder-engine, emits
// a receipt, and responds on the team feed.
// =============================================================================

export class DelegatedAuthorityHandler {
  private readonly mesh: HolomeshClient;
  private readonly provider?: ILLMProvider;
  private readonly systemPrompt?: string;
  private readonly allowList?: Set<string>;
  private readonly permittedActions?: Set<string>;
  private readonly processed: Set<string>;

  constructor(opts: DelegatedAuthorityOptions) {
    this.mesh = opts.mesh;
    this.provider = opts.provider;
    this.systemPrompt = opts.systemPrompt;
    this.allowList = opts.allowList;
    this.permittedActions = opts.permittedActions;
    this.processed = opts.processedMessageIds ?? new Set<string>();
  }

  // ---------------------------------------------------------------------------
  // Main entry: read team messages, process authority requests, return receipts
  // ---------------------------------------------------------------------------
  async processMessages(): Promise<AuthorityReceipt[]> {
    const messages = await this.mesh.getTeamMessages(20);
    const receipts: AuthorityReceipt[] = [];

    for (const msg of messages) {
      if (this.processed.has(msg.id)) continue;
      this.processed.add(msg.id);

      const request = this.parseRequest(msg);
      if (!request) continue;

      const receipt = await this.handleRequest(request);
      receipts.push(receipt);

      // Respond on team feed so the requesting agent sees the receipt.
      await this.mesh.sendTeamMessage(
        formatReceiptForTeamFeed(receipt, msg.fromAgentName),
        'dm'
      );
    }

    return receipts;
  }

  // ---------------------------------------------------------------------------
  // Parse a team message into an AuthorityRequest
  //
  // Supports two forms:
  //   1. Structured JSON envelope embedded in the message.
  //   2. Plain-text shorthand: "@brittney <requestType>: <action> [payload]"
  // ---------------------------------------------------------------------------
  parseRequest(msg: TeamMessage): AuthorityRequest | null {
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

    if (req.requestType === 'owner-op') {
      return this.executeOwnerOp(req);
    }

    if (req.requestType === 'founder-gated') {
      return this.ruleFounderGated(req);
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
          return executedReceipt(req, { modeSet: result.mode, unchanged: result.unchanged ?? false });
        }

        case 'set-room-prefs': {
          const style = req.payload.communicationStyle as string | undefined;
          const objective = req.payload.objective as string | undefined;
          if (!style && objective === undefined) {
            return rejectReceipt(req, 'Missing payload.communicationStyle or payload.objective for set-room-prefs.');
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
            return rejectReceipt(req, 'Missing payload.taskId or payload.toAgentId for delegate-task.');
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
        reason: `Execution failed: ${reason}`,
        timestamp: new Date().toISOString(),
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Founder-gated ruling — invoke the LLM with the founder-engine + corpus
  // ---------------------------------------------------------------------------
  private async ruleFounderGated(req: AuthorityRequest): Promise<AuthorityReceipt> {
    if (!this.provider) {
      return {
        requestMessageId: req.messageId,
        status: 'deferred',
        action: req.action,
        reason:
          'Founder-gated ruling requires an LLM provider (founder-engine not yet wired). ' +
          'E5 (engine+corpus refactor) will provide the provider.',
        timestamp: new Date().toISOString(),
      };
    }

    const messages: LLMMessage[] = [
      {
        role: 'system',
        content:
          (this.systemPrompt ?? '') +
          '\n\nYou are the founder-engine authority locus. ' +
          'A peer agent has a founder-gated question. ' +
          'Apply the Four Refusals, the authority-order (GOLD > skill > NORTH_STAR > CLAUDE.md > knowledge > memory), ' +
          'and the escape-hatch rules. ' +
          'Decide clearly. Cite your sources. ' +
          'Format your ruling as:\n' +
          'RULING: <decision>\n' +
          'REASON: <reasoning with citations>\n' +
          'ESCALATE: <yes/no> — only yes if irreversible + >$5 + custody-crossing.',
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
      const escalateMatch = text.match(/ESCALATE:\s*(yes|no)/i);

      const ruling = rulingMatch?.[1]?.trim() ?? text.slice(0, 500);
      const reason = reasonMatch?.[1]?.trim() ?? 'No explicit reasoning block returned.';
      const escalate = escalateMatch?.[1]?.toLowerCase() === 'yes';

      return {
        requestMessageId: req.messageId,
        status: escalate ? 'escalated' : 'ruled',
        action: req.action,
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
    result,
    reason: `Owner-op "${req.action}" executed successfully.`,
    timestamp: new Date().toISOString(),
  };
}

function rejectReceipt(req: AuthorityRequest, reason: string): AuthorityReceipt {
  return {
    requestMessageId: req.messageId,
    status: 'rejected',
    action: req.action,
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
  if (raw === 'founder-gated' || raw === 'founder_gated' || raw === 'foundergated') return 'founder-gated';
  return null;
}
