import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { revokeUserApiKey } from '@/lib/brittney/userApiKeys';

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const revoked = await revokeUserApiKey(id, auth.user.id);
  if (!revoked) {
    return NextResponse.json({ error: 'Key not found or already revoked' }, { status: 404 });
  }
  return NextResponse.json({ revoked: true });
}
