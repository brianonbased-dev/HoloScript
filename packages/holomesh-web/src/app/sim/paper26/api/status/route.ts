import { getState } from '@/lib/simStore';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  return Response.json(getState());
}
