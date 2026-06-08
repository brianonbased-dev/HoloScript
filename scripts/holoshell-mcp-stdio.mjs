#!/usr/bin/env node
/**
 * HoloShell Local MCP — stdio server for Claude Desktop.
 *
 * Exposes 5 tools covering the full Phase A observe→plan→consent→execute loop:
 *   holoshell_list_stale_processes   — observe: find stale git processes
 *   holoshell_preflight_process_cleanup — plan: build preflight receipt
 *   holoshell_consent_classify       — consent: what lane is this operation?
 *   holoshell_consent_issue          — consent: issue a consent token
 *   holoshell_execute_receipt        — execute: run receipt behind consent gate
 *
 * Register in claude_desktop_config.json mcpServers:
 *   "holoshell": {
 *     "command": "C:\\Program Files\\nodejs\\node.exe",
 *     "args": ["C:\\Users\\Josep\\Documents\\GitHub\\HoloScript\\scripts\\holoshell-mcp-stdio.mjs"]
 *   }
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import { classifyConsentRequirement, issueConsentToken } from './holoshell-consent-contract.mjs';
import {
  scanStaleProcesses,
  createPreflightReceipt,
  writePreflightReceipt,
  executeReceipt,
  listPendingReceipts,
  lookupProcessesByPid,
} from './holoshell-execute-receipt.mjs';

const server = new Server({ name: 'holoshell', version: '0.1.0' }, { capabilities: { tools: {} } });

const TOOLS = [
  {
    name: 'holoshell_list_stale_processes',
    description:
      'Scan for stale git processes (git status --ignored running longer than minAgeMinutes). ' +
      'These are the primary cause of index.lock congestion in multi-agent workflows. Read-only — no mutation.',
    inputSchema: {
      type: 'object',
      properties: {
        minAgeMinutes: {
          type: 'number',
          description: 'Minimum process age in minutes to qualify as stale (default: 5)',
          default: 5,
        },
      },
    },
  },
  {
    name: 'holoshell_preflight_process_cleanup',
    description:
      'Scan for stale processes and create a preflight receipt (plan) for cleaning them up. ' +
      'Returns a preflightId. Next step: call holoshell_consent_issue then holoshell_execute_receipt.',
    inputSchema: {
      type: 'object',
      properties: {
        minAgeMinutes: {
          type: 'number',
          description: 'Minimum process age in minutes (default: 5)',
          default: 5,
        },
      },
    },
  },
  {
    name: 'holoshell_consent_classify',
    description:
      'Classify an operation into its consent lane: agent_reversible (self-approve), ' +
      'express_reversible (queue), or founder_required (Founder Gate). Use before issuing a token.',
    inputSchema: {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          description: 'Operation name, e.g. stale_process_cleanup, process_terminate, delete_file',
        },
      },
      required: ['operation'],
    },
  },
  {
    name: 'holoshell_consent_issue',
    description:
      'Issue a consent token for a preflight receipt. agent_reversible operations ' +
      'can be self-approved by the agent. founder_required operations are blocked here — ' +
      'they require approval via the operate-room consent queue.',
    inputSchema: {
      type: 'object',
      properties: {
        operation: { type: 'string', description: 'Operation name matching the preflight receipt' },
        preflightId: {
          type: 'string',
          description: 'The preflightId returned by holoshell_preflight_process_cleanup',
        },
        agentId: {
          type: 'string',
          description: 'Agent identifier (default: holoshell)',
          default: 'holoshell',
        },
      },
      required: ['operation', 'preflightId'],
    },
  },
  {
    name: 'holoshell_list_pending',
    description:
      'List pending consent receipts: preflights that have been written to the consent queue ' +
      'but not yet executed. Agents use this to observe queue state and check if a previous ' +
      'holoshell_request_cleanup was approved via the operate-room dashboard.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'holoshell_request_cleanup',
    description:
      'Agent-initiated cleanup request for specific PIDs. Looks up each PID in the live ' +
      'process list, creates a preflight receipt, and writes it to the consent queue. ' +
      'The HoloShell operate-room dashboard surfaces it as a Pending Consent for operator approval. ' +
      'Use when you know a specific PID is blocking your work.',
    inputSchema: {
      type: 'object',
      properties: {
        targets: {
          type: 'array',
          description: 'PIDs to request cleanup for',
          items: {
            type: 'object',
            properties: {
              pid: { type: 'number', description: 'Process ID' },
              reason: { type: 'string', description: 'Why this process should be cleaned up' },
            },
            required: ['pid'],
          },
        },
        agentId: {
          type: 'string',
          description: 'Agent identifier (default: holoshell)',
          default: 'holoshell',
        },
      },
      required: ['targets'],
    },
  },
  {
    name: 'holoshell_execute_receipt',
    description:
      'Execute a preflight receipt behind the consent gate. Requires a valid consent token ' +
      'issued by holoshell_consent_issue. Emits a signed execution receipt with before/after state. ' +
      'Process termination is permanent — use only on confirmed stale processes.',
    inputSchema: {
      type: 'object',
      properties: {
        consentToken: { type: 'string', description: 'Token returned by holoshell_consent_issue' },
        preflightId: { type: 'string', description: 'The preflightId from the preflight receipt' },
      },
      required: ['consentToken', 'preflightId'],
    },
  },
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  try {
    switch (name) {
      case 'holoshell_list_stale_processes': {
        const minAgeMs = Number(args.minAgeMinutes ?? 5) * 60_000;
        const procs = scanStaleProcesses({ minAgeMs });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ count: procs.length, processes: procs }, null, 2),
            },
          ],
        };
      }

      case 'holoshell_preflight_process_cleanup': {
        const minAgeMs = Number(args.minAgeMinutes ?? 5) * 60_000;
        const targets = scanStaleProcesses({ minAgeMs });
        if (targets.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  status: 'no_targets',
                  message: 'No stale processes found.',
                }),
              },
            ],
          };
        }
        const preflight = createPreflightReceipt({ targets });
        writePreflightReceipt(preflight);
        const classification = classifyConsentRequirement(preflight.operation);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  preflightId: preflight.id,
                  operation: preflight.operation,
                  targetCount: targets.length,
                  lane: classification.lane,
                  nextStep: `Call holoshell_consent_issue with operation="${preflight.operation}" preflightId="${preflight.id}"`,
                  preflight,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case 'holoshell_list_pending': {
        const pending = listPendingReceipts();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  count: pending.length,
                  pending: pending.map((pf) => ({
                    id: pf.id,
                    operation: pf.operation,
                    requestedBy: pf.requestedBy,
                    timestamp: pf.timestamp,
                    targetCount: pf.targets?.length ?? 0,
                    targets: pf.targets,
                  })),
                  note:
                    pending.length === 0
                      ? 'No pending consents.'
                      : 'Approve via the HoloShell operate-room dashboard.',
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case 'holoshell_request_cleanup': {
        const rawTargets = Array.isArray(args.targets) ? args.targets : [];
        if (rawTargets.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ status: 'error', reason: 'targets array is empty' }),
              },
            ],
            isError: true,
          };
        }
        const pids = rawTargets.map((t) => Number(t.pid)).filter((p) => p > 0);
        const liveProcs = lookupProcessesByPid(pids);
        const livePidSet = new Set(liveProcs.map((p) => p.pid));
        const reasonMap = Object.fromEntries(
          rawTargets.map((t) => [Number(t.pid), t.reason ?? 'agent_requested'])
        );
        const targets = liveProcs.map((p) => ({
          pid: p.pid,
          command: p.command,
          ageMs: p.ageMs,
          reason: reasonMap[p.pid] ?? 'agent_requested',
        }));
        const notFound = pids.filter((p) => !livePidSet.has(p));
        if (targets.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  status: 'no_live_targets',
                  notFound,
                  message: 'None of the specified PIDs are running.',
                }),
              },
            ],
          };
        }
        const preflight = createPreflightReceipt({
          targets,
          requestedBy: String(args.agentId ?? 'holoshell'),
        });
        writePreflightReceipt(preflight);
        const lane = classifyConsentRequirement(preflight.operation).lane;
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  status: 'queued',
                  preflightId: preflight.id,
                  lane,
                  targetCount: targets.length,
                  notFound,
                  message:
                    lane === 'founder_required'
                      ? 'Queued for operate-room approval. Operator must approve via the HoloShell dashboard.'
                      : `Queued (${lane}). Approve via the HoloShell dashboard or self-approve with holoshell_consent_issue.`,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case 'holoshell_consent_classify': {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(classifyConsentRequirement(String(args.operation)), null, 2),
            },
          ],
        };
      }

      case 'holoshell_consent_issue': {
        const operation = String(args.operation);
        const preflightId = String(args.preflightId);
        const agentId = String(args.agentId ?? 'holoshell');
        const classification = classifyConsentRequirement(operation);
        if (classification.lane === 'founder_required') {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  issued: false,
                  reason:
                    'founder_required — this operation requires explicit founder approval via the operate-room consent queue.',
                  lane: classification.lane,
                }),
              },
            ],
          };
        }
        const result = issueConsentToken({ operation, preflightId, agentId });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ issued: true, ...result }, null, 2),
            },
          ],
        };
      }

      case 'holoshell_execute_receipt': {
        const result = executeReceipt({
          consentToken: String(args.consentToken),
          preflightId: String(args.preflightId),
        });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      default:
        return {
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (err) {
    return {
      content: [{ type: 'text', text: `Error in ${name}: ${err.message}` }],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
