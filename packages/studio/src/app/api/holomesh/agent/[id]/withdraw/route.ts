export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '../../../../../../db/client';
import { holomeshTransactions } from '../../../../../../db/schema';
import { sql, and, eq, inArray } from 'drizzle-orm';
import { rateLimit } from '../../../../../../lib/rate-limiter';

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

/**
 * POST /api/holomesh/agent/[id]/withdraw
 *
 * Initiates a USDC withdrawal for an agent's earned revenue.
 *
 * Body:
 *   agentId     string  — must match URL param
 *   amount      number  — withdrawal amount in cents (USD)
 *   toAddress   string  — destination Ethereum wallet address (0x...)
 *   agentName?  string  — display name for the transaction record
 *   network?    string  — "base" | "base-sepolia" (default: "base-sepolia")
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
    agentName = '',
    network = 'base-sepolia',
  } = body as {
    agentId?: unknown;
    amount?: unknown;
    toAddress?: unknown;
    agentName?: unknown;
    network?: unknown;
  };

  if (bodyAgentId !== undefined && bodyAgentId !== agentId) {
    return NextResponse.json(
      { success: false, error: 'agentId in body does not match URL parameter' },
      { status: 400 }
    );
  }

  const amountNum = typeof amount === 'number' ? amount : parseInt(String(amount ?? ''), 10);
  if (!Number.isInteger(amountNum) || amountNum <= 0) {
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

  // ── Compute available balance ────────────────────────────────────────────
  const db = getDb();
  if (!db) {
    return NextResponse.json({ success: false, error: 'Database unavailable' }, { status: 503 });
  }

  let earnings = 0;
  let withdrawals = 0;
  try {
    const balResult = await db.execute<BalanceRow>(sql`
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
    `);
    const row = balResult.rows[0];
    earnings = Number(row?.earnings ?? 0);
    withdrawals = Number(row?.withdrawals ?? 0);
  } catch (err) {
    console.error('[withdraw] balance query failed:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to compute balance' },
      { status: 500 }
    );
  }

  const availableBalance = earnings - withdrawals;
  if (amountNum > availableBalance) {
    return NextResponse.json(
      {
        success: false,
        error: 'Insufficient balance',
        availableBalance,
        requested: amountNum,
      },
      { status: 402 }
    );
  }

  // ── Build withdrawal ID ──────────────────────────────────────────────────
  const withdrawalId = `wtx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date();

  // ── Attempt on-chain USDC transfer via AgentKit (optional) ───────────────
  let txHash: string | undefined;
  let onChainStatus: 'confirmed' | 'pending' | 'failed' = 'pending';
  const usdcAddress = USDC_ADDRESSES[networkStr];

  const cdpKeyId = process.env.COINBASE_API_KEY_NAME ?? process.env.CDP_API_KEY_ID;
  const cdpKeySecret = process.env.COINBASE_API_KEY_SECRET ?? process.env.CDP_API_KEY_SECRET;
  const cdpWalletSecret = process.env.COINBASE_WALLET_SECRET ?? process.env.CDP_WALLET_SECRET;

  if (cdpKeyId && cdpKeySecret && cdpWalletSecret) {
    try {
      // Lazy import to avoid breaking builds without AgentKit configured
      const { CdpEvmWalletProvider } = await import('@holoscript/marketplace-agentkit');
      const { erc20ActionProvider } = await import('@holoscript/marketplace-agentkit');

      // Amount in USDC atomic units: 1 USDC = 1e6 units; amount is cents → divide by 100
      const usdcAmount = String(Math.floor(amountNum / 100) * 1_000_000);

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
        amount: usdcAmount,
      });

      // result is a string message from AgentKit; extract tx hash if present
      const hashMatch = /0x[0-9a-fA-F]{64}/.exec(result);
      if (hashMatch) {
        txHash = hashMatch[0];
      }
      onChainStatus = 'confirmed';
    } catch (err) {
      console.error('[withdraw] AgentKit transfer failed:', err);
      // Fall through — record as pending so ops can retry manually
      onChainStatus = 'pending';
    }
  }
  // If no CDP credentials, withdrawal is recorded as pending (manual processing)

  // ── Record withdrawal in DB ──────────────────────────────────────────────
  try {
    await db.insert(holomeshTransactions).values({
      id: withdrawalId,
      type: 'withdrawal',
      fromAgentId: agentId,
      fromAgentName: String(agentName ?? ''),
      toAgentId: null,
      toAgentName: null,
      entryId: null,
      amount: amountNum,
      currency: 'USDC',
      txHash: txHash ?? null,
      status: onChainStatus,
      teamId: null,
      metadata: {
        toAddress: addressStr,
        network: networkStr,
        usdcContractAddress: usdcAddress,
      },
      mcpCreatedAt: now,
      syncedAt: now,
    });
  } catch (err) {
    console.error('[withdraw] DB insert failed:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to record withdrawal' },
      { status: 500 }
    );
  }

  const remainingBalance = availableBalance - amountNum;

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
    remainingBalance,
  });
}

/**
 * GET /api/holomesh/agent/[id]/withdraw
 *
 * Returns withdrawal history and current balance for the agent.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: agentId } = await params;

  const limited = rateLimit(
    req,
    { max: 60, label: 'agent-withdraw-read' },
    `withdraw-read:${agentId}`
  );
  if (!limited.ok) return limited.response;

  const db = getDb();
  if (!db) {
    return NextResponse.json({ success: false, error: 'Database unavailable' }, { status: 503 });
  }

  try {
    const balResult2 = await db.execute<BalanceRow>(sql`
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
    `);

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
