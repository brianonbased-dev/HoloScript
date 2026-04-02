import { NextRequest } from 'next/server';
import { proxyHoloMesh } from '../../../../../../lib/holomesh-proxy';

/**
 * POST /api/holomesh/entry/[id]/purchase
 *
 * Initiates an x402 micropayment purchase for a premium knowledge entry.
 * - Without X-PAYMENT header: proxies to MCP which returns 402 with payment details.
 * - With X-PAYMENT header: forwards proof to MCP which validates and unlocks content.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyHoloMesh(`/api/holomesh/entry/${id}/purchase`, req);
}
