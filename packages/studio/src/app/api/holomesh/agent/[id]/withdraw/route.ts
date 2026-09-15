export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '../../../../../../db/client';
import { holomeshTransactions } from '../../../../../../db/schema';
import { sql, and, eq, inArray } from 'drizzle-orm';
import { rateLimit } from '../../../../../../lib/rate-limiter';
import { resolveHoloMeshCaller } from '../../../../../../lib/holomesh-proxy';
import { centsToUsdcAtomicUnits } from '../../../../_lib/usdc';

import { corsHeaders } from '../../../../_lib/cors';
// USDC contract addresses by network
const USDC_ADDRESSES: Record<string, `0x${string}`> = {
  base: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  'base-sepolia': '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
};

interface BalanceRow extends Record<string, unknown> {
  earnings: unknown;
  withdrawals: unknown;
}

/** Earnings in, withdrawals out (failed withdrawals release their amount). */
function balanceQuery(agentId: string) {
  return sql`
    SELECT
      COALESCE(SUM(amount) FILTER (
        WHERE to_agent_id = ${agentId}
          AND type = ANY(ARRAY['purchase','reward'])
      ), 0) AS earnings,
      COALESCE(SUM(amount) FILTER (
        WHERE from_agent_id = ${agentId}
          AND type = 'withdrawal'
          AND status != 'failed'
      ), 0) AS withdrawals
    FROM holomesh_transactions
  `;
}

/**
 * Only the agent itself may read or move its earnings.
 *
 * SECURITY: until 2026-09-15 this route had no auth at all (src/proxy.ts skips
 * /api), so anyone could file a withdrawal of ANY agent's earnings to ANY
 * address. The caller now proves who it is with its own HoloMesh API key,
 * checked by mcp-server's GET /api/holomesh/me (the same introspection
 * /api/holomesh/agent/self uses), and must BE the agent in the URL.
 * mcp-server has no separate per-agent owner: the key holder is the owner.
 */
async function requireSameAgent(
  req: NextRequest,
  agentId: string
): Promise<{ agentId: string; name: string } | NextResponse> {
  const caller = await resolveHoloMeshCaller(req);
  if (!caller.ok) {
    return NextResponse.json({ success: false, error: caller.error }, { status: caller.status });
  }
  if (caller.agentId !== agentId) {
    return NextResponse.json(
      { success: false, error: "You can only see or withdraw your own agent's earnings." },
      { status: 403 }
    );
  }
  return { agentId: caller.agentId, name: caller.name };
}

/**
 * POST /api/holomesh/agent/[id]/withdraw
 *
 * Initiates a USDC withdrawal for an agent's earned revenue.
 * Auth: `Authorization: Bearer <HoloMesh API key>` of the agent `[id]` itself.
 *
 * Body:
 *   agentId     string  — must match URL param
 *   amount      number  — withdrawal amount in cents (USD)
 *   toAddress   string  — destination Ethereum wallet address (0x...)
 *   network?    string  — "base" | "base-sepolia" (default: "base-sepolia")
 *
 * The balance check and the withdrawal row are one transaction under a
 * per-agent advisory lock, so two requests cannot both spend the same balance.
 * The row is written (reserving the amount) BEFORE any on-chain transfer.
 *
 * Response:
 *   { success, withdrawalId, agentId, amount, currency, network,
 *     status, txHash?, remainingBalance }
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: agentId } = await params;

  // Rate limit: 5 withdrawals/min per agent
  const limited = rateLimit(req, { max: 5, label: 'agent-withdraw' }, `withdraw:${agentId}`);
  if (!limited.ok) return limited.response;

  const caller = await requireSameAgent(req, agentId);
  if (caller instanceof NextResponse) return caller;

  // ── Parse & validate body ────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const {
    agentId: bodyAgentId,
    amount,
    toAddress,
    network = 'base-sepolia',
  } = body as {
    agentId?: unknown;
    amount?: unknown;
    toAddress?: unknown;
    network?: unknown;
  };

  if (bodyAgentId !== undefined && bodyAgentId !== agentId) {
    return NextResponse.json(
      { success: false, error: 'agentId in body does not match URL parameter' },
      { status: 400 }
    );
  }

  const amountNum = typeof amount === 'number' ? amount : parseInt(String(amount ?? ''), 10);
  if (!Number.isSafeInteger(amountNum) || amountNum <= 0) {
    return NextResponse.json(
      { success: false, error: 'amount must be a positive integer (cents)' },
      { status: 400 }
    );
  }
  if (amountNum < 100) {
    return NextResponse.json(
      { success: false, error: 'Minimum withdrawal is 100 cents ($1.00)' },
      { status: 400 }
    );
  }

  const addressStr = String(toAddress ?? '').trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(addressStr)) {
    return NextResponse.json(
      { success: false, error: 'toAddress must be a valid Ethereum address (0x + 40 hex chars)' },
      { status: 400 }
    );
  }

  const networkStr = String(network ?? 'base-sepolia');
  if (!['base', 'base-sepolia'].includes(networkStr)) {
    return NextResponse.json(
      { success: false, error: 'network must be "base" or "base-sepolia"' },
      { status: 400 }
    );
  }

  const db = getDb();
  if (!db) {
    return NextResponse.json({ success: false, error: 'Database unavailable' }, { status: 503 });
  }

  const withdrawalId = `wtx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date();
  const usdcAddress = USDC_ADDRESSES[networkStr];

  // ── Check balance and reserve it, atomically ─────────────────────────────
  // pg_advisory_xact_lock serialises every withdrawal for this agent until the
  // transaction ends, so the balance read and the insert cannot interleave with
  // another request's. (A row lock would not help: the balance is a SUM, and
  // the competing request INSERTS a new row rather than updating one.)
  let reservation: { reserved: true; available: number } | { reserved: false; available: number };
  try {
    reservation = await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${`holomesh-withdraw:${agentId}`}))`
      );
      const balResult = await tx.execute<BalanceRow>(balanceQuery(agentId));
      const row = balResult.rows[0];
      const available = Number(row?.earnings ?? 0) - Number(row?.withdrawals ?? 0);
      if (amountNum > available) return { reserved: false as const, available };

      await tx.insert(holomeshTransactions).values({
        id: withdrawalId,
        type: 'withdrawal',
        fromAgentId: agentId,
        fromAgentName: caller.name,
        toAgentId: null,
        toAgentName: null,
        entryId: null,
        amount: amountNum,
        currency: 'USDC',
        txHash: null,
        status: 'pending',
        teamId: null,
        metadata: {
          toAddress: addressStr,
          network: networkStr,
          usdcContractAddress: usdcAddress,
        },
        mcpCreatedAt: now,
        syncedAt: now,
      });
      return { reserved: true as const, available };
    });
  } catch (err) {
    console.error('[withdraw] balance check / reservation failed:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to record withdrawal' },
      { status: 500 }
    );
  }

  if (!reservation.reserved) {
    return NextResponse.json(
      {
        success: false,
        error: 'Insufficient balance',
        availableBalance: reservation.available,
        requested: amountNum,
      },
      { status: 402 }
    );
  }

  // ── Attempt on-chain USDC transfer via AgentKit (optional) ───────────────
  // The amount is already reserved by the pending row above. Without CDP
  // credentials, or if the transfer fails, the row stays 'pending' for manual
  // processing and keeps the amount reserved.
  let txHash: string | undefined;
  let onChainStatus: 'confirmed' | 'pending' = 'pending';

  const cdpKeyId = process.env.COINBASE_API_KEY_NAME ?? process.env.CDP_API_KEY_ID;
  const cdpKeySecret = process.env.COINBASE_API_KEY_SECRET ?? process.env.CDP_API_KEY_SECRET;
  const cdpWalletSecret = process.env.COINBASE_WALLET_SECRET ?? process.env.CDP_WALLET_SECRET;

  if (cdpKeyId && cdpKeySecret && cdpWalletSecret) {
    try {
      // Lazy import to avoid breaking builds without AgentKit configured
      const { CdpEvmWalletProvider } = await import('@holoscript/marketplace-agentkit');
      const { erc20ActionProvider } = await import('@holoscript/marketplace-agentkit');

      const walletProvider = await CdpEvmWalletProvider.configureWithWallet({
        apiKeyId: cdpKeyId,
        apiKeySecret: cdpKeySecret,
        walletSecret: cdpWalletSecret,
        networkId: networkStr,
      });

      const erc20 = erc20ActionProvider();
      const result = await erc20.transfer(walletProvider, {
        tokenAddress: usdcAddress,
        destinationAddress: addressStr,
        amount: centsToUsdcAtomicUnits(amountNum),
      });

      // result is a string message from AgentKit; extract tx hash if present
      const hashMatch = /0x[0-9a-fA-F]{64}/.exec(result);
      if (hashMatch) {
        txHash = hashMatch[0];
      }
      onChainStatus = 'confirmed';
    } catch (err) {
      console.error('[withdraw] AgentKit transfer failed:', err);
      onChainStatus = 'pending';
    }

    if (onChainStatus === 'confirmed') {
      try {
        await db
          .update(holomeshTransactions)
          .set({ status: 'confirmed', txHash: txHash ?? null, syncedAt: new Date() })
          .where(eq(holomeshTransactions.id, withdrawalId));
      } catch (err) {
        // The money moved; the row still reserves the amount, so nothing can be
        // paid twice. Ops must mark it confirmed by hand.
        console.error(
          `[withdraw] transfer confirmed but status update failed for ${withdrawalId}:`,
          err
        );
      }
    }
  }

  return NextResponse.json({
    success: true,
    withdrawalId,
    agentId,
    amount: amountNum,
    currency: 'USDC',
    network: networkStr,
    toAddress: addressStr,
    status: onChainStatus,
    ...(txHash ? { txHash } : {}),
    remainingBalance: reservation.available - amountNum,
  });
}

/**
 * GET /api/holomesh/agent/[id]/withdraw
 *
 * Returns withdrawal history (including destination addresses) and current
 * balance. Auth: the agent's own HoloMesh API key, as for POST.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: agentId } = await params;

  const limited = rateLimit(
    req,
    { max: 60, label: 'agent-withdraw-read' },
    `withdraw-read:${agentId}`
  );
  if (!limited.ok) return limited.response;

  const caller = await requireSameAgent(req, agentId);
  if (caller instanceof NextResponse) return caller;

  const db = getDb();
  if (!db) {
    return NextResponse.json({ success: false, error: 'Database unavailable' }, { status: 503 });
  }

  try {
    const balResult2 = await db.execute<BalanceRow>(balanceQuery(agentId));

    const balanceRow = balResult2.rows[0];
    const earnings = Number(balanceRow?.earnings ?? 0);
    const withdrawals = Number(balanceRow?.withdrawals ?? 0);

    const history = await db
      .select()
      .from(holomeshTransactions)
      .where(
        and(
          eq(holomeshTransactions.fromAgentId, agentId),
          inArray(holomeshTransactions.type, ['withdrawal'])
        )
      )
      .orderBy(sql`coalesce(mcp_created_at, synced_at) desc`)
      .limit(50);

    return NextResponse.json({
      success: true,
      agentId,
      balance: {
        earnings,
        withdrawals,
        available: earnings - withdrawals,
        currency: 'USDC',
      },
      withdrawalHistory: history,
    });
  } catch (err) {
    console.error('[withdraw] GET failed:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to retrieve withdrawal data' },
      { status: 500 }
    );
  }
}

export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' }),
  });
}
