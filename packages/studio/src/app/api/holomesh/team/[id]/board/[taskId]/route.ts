import { NextRequest } from 'next/server';
import { proxyHoloMesh } from '../../../../../../../lib/holomesh-proxy';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  const { id, taskId } = await params;
  return proxyHoloMesh(`/api/holomesh/team/${id}/board/${taskId}`, req);
}
