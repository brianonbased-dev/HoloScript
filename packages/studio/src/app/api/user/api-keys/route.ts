import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { createUserApiKey, listUserApiKeys } from '@/lib/brittney/userApiKeys';

export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const keys = await listUserApiKeys(auth.user.id);
  return NextResponse.json({ keys });
}

export async function POST(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  let label = '';
  try {
    const body = await request.json();
    label = typeof body.label === 'string' ? body.label.slice(0, 64) : '';
  } catch {
    // body is optional
  }

  const result = await createUserApiKey(auth.user.id, label);
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json(result, { status: 201 });
}
