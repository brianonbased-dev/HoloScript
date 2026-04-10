import { NextRequest } from 'next/server';
import { proxyHoloMesh } from '../../../../../../lib/holomesh-proxy';

/**
 * POST /api/holomesh/team/[id]/join
 * Proxies join request to MCP.
 * Body: { agentId, agentName, role? }
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyHoloMesh(`/api/holomesh/team/${id}/join`, req);
}
