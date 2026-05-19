/**
 * Receipt Capability Query Tools for HoloScript MCP Server
 *
 * Provides AI agents and IDE integrations with queryable access to the
 * receipt capability registry — the routing backbone that maps capability
 * keywords to receipt types, validators, and exports.
 *
 * Tools:
 * - holo_query_receipts:  Query receipt capabilities by keyword or subject
 * - holo_list_receipt_capabilities: List all registered receipt capabilities
 *
 * Unblocks: Papers-as-Service receipt verification (D.032),
 * HoloShell cockpit composition queries, ProviderExportCustodyReceipt flows.
 *
 * Created: task_1779157196014_yx3r ([idea-run-13] Add receipt capability router MCP tool)
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  RECEIPT_CAPABILITY_REGISTRY,
  queryReceiptCapabilities,
  listReceiptCapabilities,
  listReceiptSubjects,
  receiptCapabilityCount,
  getReceiptCapability,
  type ReceiptCapabilityEntry,
} from '@holoscript/framework';

// =============================================================================
// TOOL DEFINITIONS
// =============================================================================

export const receiptQueryTools: Tool[] = [
  {
    name: 'holo_query_receipts',
    description:
      'Query HoloScript receipt capabilities by keyword or subject. ' +
      'Returns matching receipt types with their module, validator, and clone exports. ' +
      'Use this to discover which receipt types cover a capability like "hardware", ' +
      '"browser", "account-export", "device-safety", or "readiness".',
    inputSchema: {
      type: 'object' as const,
      properties: {
        capability: {
          type: 'string',
          description:
            'Capability keyword to search for (e.g. "hardware", "browser", "device-safety"). ' +
            'Matches against capability name, tags, and description.',
        },
        subject: {
          type: 'string',
          description:
            'Subject to narrow results (e.g. "nir" under "hardware", "consent" under "device-safety").',
        },
      },
    },
  },
  {
    name: 'holo_list_receipt_capabilities',
    description:
      'List all registered receipt capability keywords and subjects in the HoloScript receipt registry. ' +
      'Returns the full capability taxonomy for discovery.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        includeSubjects: {
          type: 'boolean',
          description: 'Whether to include the subject taxonomy for each capability. Default: true.',
          default: true,
        },
      },
    },
  },
];

// =============================================================================
// HANDLERS
// =============================================================================

export async function handleReceiptQueryTool(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown | null> {
  switch (name) {
    case 'holo_query_receipts':
      return handleQueryReceipts(args);
    case 'holo_list_receipt_capabilities':
      return handleListReceiptCapabilities(args);
    default:
      return null;
  }
}

function handleQueryReceipts(args: Record<string, unknown>): {
  count: number;
  capabilities: ReceiptSummary[];
  capability?: string;
  subject?: string;
} {
  const capability = args.capability as string | undefined;
  const subject = args.subject as string | undefined;

  const entries = queryReceiptCapabilities(capability, subject);

  return {
    count: entries.length,
    capabilities: entries.map(entryToSummary),
    capability,
    subject,
  };
}

function handleListReceiptCapabilities(args: Record<string, unknown>): {
  totalCapabilities: number;
  capabilities: Array<{ capability: string; description: string; subjects?: string[] }>;
  allSubjects: string[];
} {
  const includeSubjects = (args.includeSubjects as boolean) ?? true;

  return {
    totalCapabilities: receiptCapabilityCount(),
    capabilities: RECEIPT_CAPABILITY_REGISTRY.map((entry) => ({
      capability: entry.capability,
      description: entry.description,
      ...(includeSubjects ? { subjects: entry.subjects } : {}),
    })),
    allSubjects: includeSubjects ? listReceiptSubjects() : [],
  };
}

// ── Helpers ──

interface ReceiptSummary {
  capability: string;
  receiptType: string;
  module: string;
  description: string;
  subjects: string[];
  tags: string[];
}

function entryToSummary(entry: ReceiptCapabilityEntry): ReceiptSummary {
  return {
    capability: entry.capability,
    receiptType: entry.receiptType,
    module: entry.module,
    description: entry.description,
    subjects: entry.subjects ?? [],
    tags: entry.tags ?? [],
  };
}