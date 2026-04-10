import { NextRequest } from 'next/server';
import { proxyHoloMesh } from '../../../../../lib/holomesh-proxy';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyHoloMesh(`/api/holomesh/team/${id}`, req);
}
