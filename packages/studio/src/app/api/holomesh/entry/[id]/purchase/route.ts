import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '../../../../../../db/client';
import { holomeshReferrals, holomeshTransactions } from '../../../../../../db/schema';
import * as crypto from 'crypto';

const BASE =
  process.env.HOLOMESH_API_URL ?? process.env.MCP_SERVER_URL ?? 'https://mcp.holoscript.net';
const KEY = process.env.HOLOMESH_API_KEY ?? process.env.HOLOMESH_KEY ?? '';
const DEFAULT_REFERRAL_BPS = parseInt(process.env.REFERRAL_BPS ?? '500', 10); // 5%

function buildHeaders(req: NextRequest): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (KEY) headers['Authorization'] = `Bearer ${KEY}`;
  const xPayment = req.headers.get('x-payment');
  if (xPayment) headers['X-Payment'] = xPayment;
  const clientAuth = req.headers.get('authorization');
  if (clientAuth) headers['Authorization'] = clientAuth;
  return headers;
}

/**
 * POST /api/holomesh/entry/[id]/purchase
 *
 * Initiates an x402 micropayment purchase for a premium knowledge entry.
 * - Without X-PAYMENT header: proxies to MCP which returns 402 with payment details.
 * - With X-PAYMENT header: forwards proof to MCP which validates and unlocks content.
 *
 * Optional body fields:
 *   referrerAgentId?   string  — agent who referred this purchase (earns BPS commission)
 *   referrerAgentName? string  — display name of referrer
 *   buyerAgentId?      string  — who is buying
 *   buyerAgentName?    string  — buyer display name
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: entryId } = await params;

  let body: Record<string, unknown> = {};
  const bodyText = await req.text();
  try {
    body = bodyText ? (JSON.parse(bodyText) as Record<string, unknown>) : {};
  } catch {
    // ignore parse errors
  }

  const referrerAgentId =
    typeof body.referrerAgentId === 'string' ? body.referrerAgentId.trim() : '';
  const referrerAgentName =
    typeof body.referrerAgentName === 'string' ? body.referrerAgentName.trim() : '';
  const buyerAgentId = typeof body.buyerAgentId === 'string' ? body.buyerAgentId.trim() : '';
  const buyerAgentName = typeof body.buyerAgentName === 'string' ? body.buyerAgentName.trim() : '';

  // Proxy to MCP
  const upstream = await fetch(
    `${BASE}/api/holomesh/entry/${entryId}/purchase${req.nextUrl.search}`,
    {
      method: 'POST',
      headers: buildHeaders(req),
      body: bodyText,
    }
  );

  // Only track referral on successful (2xx) response with a referrer provided
  if (upstream.ok && referrerAgentId) {
    const respText = await upstream.text();
    let saleAmountCents = 0;

    try {
      const respJson = JSON.parse(respText) as Record<string, unknown>;
      // Try to extract sale amount from response
      const amount = respJson.amount ?? respJson.price ?? respJson.amountCents;
      if (typeof amount === 'number') saleAmountCents = Math.round(amount);
    } catch {
      // ignore
    }

    if (saleAmountCents > 0) {
      const bps = DEFAULT_REFERRAL_BPS;
      const commissionCents = Math.max(1, Math.round((saleAmountCents * bps) / 10000));

      const db = getDb();
      if (db) {
        try {
          const txId = `ref_${crypto.randomUUID().replace(/-/g, '')}`;
          const now = new Date();

          // Insert referral record
          await db.insert(holomeshReferrals).values({
            entryId,
            buyerAgentId: buyerAgentId || 'unknown',
            buyerAgentName: buyerAgentName || null,
            referrerAgentId,
            referrerAgentName: referrerAgentName || null,
            saleAmountCents,
            referralBps: bps,
            commissionCents,
            currency: 'USD',
            status: 'paid',
            transactionId: txId,
            metadata: { source: 'purchase' },
          });

          // Record commission as a transaction in the ledger
          await db.insert(holomeshTransactions).values({
            id: txId,
            type: 'referral_reward',
            fromAgentId: buyerAgentId || null,
            fromAgentName: buyerAgentName || null,
            toAgentId: referrerAgentId,
            toAgentName: referrerAgentName || null,
            entryId,
            amount: commissionCents,
            currency: 'USD',
            status: 'confirmed',
            metadata: { bps, saleAmountCents, referral: true },
            mcpCreatedAt: now,
          });
        } catch {
          // Non-fatal — referral tracking failure shouldn't fail the purchase response
        }
      }

      return new Response(respText, {
        status: upstream.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(respText, {
      status: upstream.status,
      headers: { 'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json' },
    });
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: { 'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json' },
  });
}
