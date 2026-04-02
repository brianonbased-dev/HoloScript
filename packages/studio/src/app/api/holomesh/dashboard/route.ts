import { NextRequest } from 'next/server';
import { proxyHoloMesh } from '../../../../lib/holomesh-proxy';

export async function GET(req: NextRequest) {
  return proxyHoloMesh('/api/holomesh/dashboard', req);
}
