import { NextRequest } from 'next/server';
import { proxyHoloMesh } from '../../../../lib/holomesh-proxy';

export async function POST(req: NextRequest) {
  return proxyHoloMesh('/api/holomesh/contribute', req);
}
