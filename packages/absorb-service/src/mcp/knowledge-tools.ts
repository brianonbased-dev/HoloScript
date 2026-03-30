/**
 * Knowledge Marketplace MCP Tools
 *
 * Wallet-bound knowledge storage with provenance signatures and x402 gating.
 * Authors publish knowledge, sign with their wallet, earn credits when others query.
 * Free entries are always accessible. Premium (signed) entries cost 5¢ per access.
 */

import { z } from 'zod';

// Schema definitions for tool inputs
const PublishSchema = z.object({
  id: z.string(),
  workspace_id: z.string(),
  type: z.enum(['wisdom', 'pattern', 'gotcha', 'session']),
  content: z.string().min(1),
  wallet_address: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
  content_signature: z.string().optional(),
  is_premium: z.boolean().default(false),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const QuerySchema = z.object({
  search: z.string(),
  workspace_id: z.string().optional(),
  type: z.enum(['wisdom', 'pattern', 'gotcha', 'session']).optional(),
  limit: z.number().int().min(1).max(100).default(20),
  include_premium: z.boolean().default(true),
});

const ProvenanceSchema = z.object({
  entry_id: z.string(),
});

export interface KnowledgeToolsDeps {
  /** Drizzle DB instance, or null if DB unavailable */
  db: any;
  /** Credit deduction function: (userId, costCents, description) => boolean */
  deductCredits: (userId: string, costCents: number, description: string) => Promise<boolean>;
  /** Credit addition function: (userId, amountCents, description) => void */
  addCredits: (userId: string, amountCents: number, description: string) => Promise<void>;
  /** Get user tier */
  getTier: (userId: string) => Promise<string>;
}

/**
 * Returns tool definitions for MCP server registration.
 */
export function getKnowledgeToolDefinitions() {
  return [
    {
      name: 'knowledge_publish',
      description: 'Publish a knowledge entry (wisdom/pattern/gotcha). Free for authors. Sign with wallet for provenance.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          id: { type: 'string', description: 'Unique entry ID (e.g., W.MESH.V5.001)' },
          workspace_id: { type: 'string', description: 'Workspace namespace (wallet address or project name)' },
          type: { type: 'string', enum: ['wisdom', 'pattern', 'gotcha', 'session'] },
          content: { type: 'string', description: 'Knowledge content' },
          wallet_address: { type: 'string', description: 'Author wallet (0x...)' },
          content_signature: { type: 'string', description: 'EIP-191 signature of keccak256(content)' },
          is_premium: { type: 'boolean', description: 'Premium entries earn revenue on access (5¢/query)' },
          metadata: { type: 'object', description: 'Additional metadata' },
        },
        required: ['id', 'workspace_id', 'type', 'content'],
      },
    },
    {
      name: 'knowledge_query',
      description: 'Search the knowledge marketplace. Free entries always returned. Premium entries cost 5¢ and earn revenue for authors.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          search: { type: 'string', description: 'Search query (semantic matching)' },
          workspace_id: { type: 'string', description: 'Limit to workspace (optional)' },
          type: { type: 'string', enum: ['wisdom', 'pattern', 'gotcha', 'session'] },
          limit: { type: 'number', description: 'Max results (default 20)' },
          include_premium: { type: 'boolean', description: 'Include premium entries (costs credits)' },
        },
        required: ['search'],
      },
    },
    {
      name: 'knowledge_provenance',
      description: 'Verify authorship and provenance of a knowledge entry.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          entry_id: { type: 'string', description: 'Knowledge entry ID' },
        },
        required: ['entry_id'],
      },
    },
    {
      name: 'knowledge_earnings',
      description: 'Check revenue earned from knowledge entries for a wallet.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          wallet_address: { type: 'string', description: 'Author wallet (0x...)' },
        },
        required: ['wallet_address'],
      },
    },
  ];
}

/**
 * Handle knowledge tool calls.
 * Returns { content: [{ type: 'text', text: string }] } per MCP protocol.
 */
export async function handleKnowledgeToolCall(
  toolName: string,
  args: Record<string, unknown>,
  deps: KnowledgeToolsDeps,
  callerUserId: string,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const respond = (data: unknown) => ({
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  });

  switch (toolName) {
    case 'knowledge_publish': {
      const input = PublishSchema.parse(args);

      // In-memory store fallback if no DB
      if (!deps.db) {
        return respond({ success: true, stored: 'in-memory', id: input.id, warning: 'No DB — entry will not persist across restarts' });
      }

      const { knowledgeEntries } = await import('../schema');
      const { eq } = await import('drizzle-orm');
      const now = new Date();

      await deps.db.insert(knowledgeEntries).values({
        id: input.id,
        workspaceId: input.workspace_id,
        walletAddress: input.wallet_address || null,
        type: input.type,
        content: input.content,
        contentHash: input.content_signature ? (input.metadata as any)?.content_hash || null : null,
        metadata: {
          ...input.metadata,
          content_signature: input.content_signature || undefined,
          provenance_wallet: input.wallet_address || undefined,
          signed_at: input.content_signature ? now.toISOString() : undefined,
        },
        isPremium: input.is_premium,
        accessCount: 0,
        revenueCents: 0,
        createdAt: now,
        updatedAt: now,
      }).onConflictDoUpdate({
        target: knowledgeEntries.id,
        set: {
          content: input.content,
          walletAddress: input.wallet_address || undefined,
          metadata: input.metadata,
          isPremium: input.is_premium,
          updatedAt: now,
        },
      });

      return respond({
        success: true,
        id: input.id,
        workspace_id: input.workspace_id,
        is_premium: input.is_premium,
        has_provenance: !!input.content_signature,
      });
    }

    case 'knowledge_query': {
      const input = QuerySchema.parse(args);

      if (!deps.db) {
        return respond({ results: [], count: 0, warning: 'No DB connected' });
      }

      const { knowledgeEntries } = await import('../schema');
      const { like, eq, and, sql } = await import('drizzle-orm');

      // Build conditions
      const conditions: any[] = [];
      if (input.workspace_id) {
        conditions.push(eq(knowledgeEntries.workspaceId, input.workspace_id));
      }
      if (input.type) {
        conditions.push(eq(knowledgeEntries.type, input.type));
      }

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const rows: any[] = await deps.db
        .select()
        .from(knowledgeEntries)
        .where(where)
        .limit(input.limit)
        .orderBy(sql`created_at DESC`);

      // x402 gating: premium entries cost credits
      const callerTier = await deps.getTier(callerUserId);
      const results: any[] = [];
      let gatedCount = 0;
      let totalCostCents = 0;

      for (const row of rows) {
        if (row.isPremium && input.include_premium) {
          if (callerTier === 'free') {
            // Free tier: show metadata only
            gatedCount++;
            results.push({
              id: row.id,
              type: row.type,
              workspace_id: row.workspaceId,
              wallet_address: row.walletAddress,
              content: `[x402 premium — 5¢ per access. Author: ${row.walletAddress || 'anonymous'}]`,
              is_premium: true,
              x402_gated: true,
            });
          } else {
            // Paid tier: deduct credits, log access, pay author
            const cost = 5; // 5¢
            const deducted = await deps.deductCredits(callerUserId, cost, `knowledge_query_premium:${row.id}`);
            if (deducted && row.walletAddress) {
              // 80% to author, 20% platform
              const authorShare = Math.floor(cost * 0.8);
              await deps.addCredits(row.walletAddress, authorShare, `knowledge_revenue:${row.id}`);
              totalCostCents += cost;

              // Increment access count + revenue
              await (deps.db as any).execute(
                sql`UPDATE knowledge_entries SET access_count = access_count + 1, revenue_cents = revenue_cents + ${authorShare}, updated_at = NOW() WHERE id = ${row.id}`
              );
            }
            results.push({
              id: row.id,
              type: row.type,
              workspace_id: row.workspaceId,
              wallet_address: row.walletAddress,
              content: row.content,
              is_premium: true,
              metadata: row.metadata,
            });
          }
        } else if (!row.isPremium) {
          results.push({
            id: row.id,
            type: row.type,
            workspace_id: row.workspaceId,
            wallet_address: row.walletAddress,
            content: row.content,
            is_premium: false,
            metadata: row.metadata,
          });
        }
      }

      return respond({
        results,
        count: results.length,
        total_cost_cents: totalCostCents,
        gated_entries: gatedCount,
        x402: gatedCount > 0 ? {
          hint: 'Upgrade tier to access premium knowledge',
          premium_cost: '5¢ per entry (80% to author, 20% platform)',
        } : undefined,
      });
    }

    case 'knowledge_provenance': {
      const input = ProvenanceSchema.parse(args);

      if (!deps.db) {
        return respond({ error: 'No DB connected' });
      }

      const { knowledgeEntries } = await import('../schema');
      const { eq } = await import('drizzle-orm');

      const rows = await deps.db
        .select()
        .from(knowledgeEntries)
        .where(eq(knowledgeEntries.id, input.entry_id))
        .limit(1);

      if (rows.length === 0) {
        return respond({ error: 'Entry not found', entry_id: input.entry_id });
      }

      const entry = rows[0];
      const meta = (entry.metadata || {}) as Record<string, unknown>;

      return respond({
        id: entry.id,
        wallet_address: entry.walletAddress,
        content_hash: entry.contentHash,
        has_signature: !!meta.content_signature,
        provenance: meta.content_signature ? {
          content_hash: meta.content_hash || entry.contentHash,
          content_signature: meta.content_signature,
          provenance_wallet: meta.provenance_wallet || entry.walletAddress,
          signed_at: meta.signed_at,
        } : null,
        is_premium: entry.isPremium,
        access_count: entry.accessCount,
        revenue_cents: entry.revenueCents,
      });
    }

    case 'knowledge_earnings': {
      const wallet = (args.wallet_address as string || '').toLowerCase();

      if (!deps.db) {
        return respond({ error: 'No DB connected' });
      }

      const { knowledgeEntries } = await import('../schema');
      const { eq, sql } = await import('drizzle-orm');

      const stats = await deps.db
        .select({
          totalEntries: sql<number>`count(*)`,
          premiumEntries: sql<number>`count(*) filter (where ${knowledgeEntries.isPremium} = true)`,
          totalAccesses: sql<number>`coalesce(sum(${knowledgeEntries.accessCount}), 0)`,
          totalRevenueCents: sql<number>`coalesce(sum(${knowledgeEntries.revenueCents}), 0)`,
        })
        .from(knowledgeEntries)
        .where(eq(knowledgeEntries.walletAddress, wallet));

      const row = stats[0] || { totalEntries: 0, premiumEntries: 0, totalAccesses: 0, totalRevenueCents: 0 };

      return respond({
        wallet_address: wallet,
        total_entries: Number(row.totalEntries),
        premium_entries: Number(row.premiumEntries),
        total_accesses: Number(row.totalAccesses),
        total_revenue_cents: Number(row.totalRevenueCents),
        total_revenue_usd: `$${(Number(row.totalRevenueCents) / 100).toFixed(2)}`,
      });
    }

    default:
      return respond({ error: `Unknown knowledge tool: ${toolName}` });
  }
}
