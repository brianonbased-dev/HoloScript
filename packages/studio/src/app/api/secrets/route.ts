export const runtime = 'nodejs';

/**
 * /api/secrets — the authenticated user's HoloKey vault (names + values they own).
 *
 * Per-user secret storage (e.g. a BYOK LLM key) so server-side consumers — Brittney's
 * provider resolution, a Fleet job runner — can resolve them owner-bound and fail-closed
 * via `@/lib/secrets/userSecretStore`, instead of a shared `process.env` or a key inlined
 * into the browser. Every handler is gated on the authenticated session and bound to
 * `auth.user.id`; a user can only ever touch their OWN secrets. Values are NEVER returned
 * (GET lists names only). When the vault isn't provisioned (no DB/KEK) the write paths
 * return 501 and the list reports `configured: false`.
 *
 *   POST   { name, value }   → store/replace a secret
 *   GET                      → list the caller's secret names (no values)
 *   DELETE ?name=NAME        → delete one of the caller's secrets
 *
 * @module api/secrets
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import {
  putUserSecret,
  listUserSecretNames,
  deleteUserSecret,
  isUserVaultConfigured,
  VaultUnconfiguredError,
} from '@/lib/secrets/userSecretStore';
import { corsHeaders } from '../_lib/cors';

/** Env-var-style names only — keeps refs predictable and matches the secrets manifest. */
const NAME_RE = /^[A-Za-z][A-Za-z0-9_]*$/;

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  let body: { name?: unknown; value?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const value = typeof body.value === 'string' ? body.value : '';
  if (!name || !value) {
    return NextResponse.json({ error: 'Both name and value are required' }, { status: 400 });
  }
  if (!NAME_RE.test(name)) {
    return NextResponse.json(
      { error: 'name must start with a letter and contain only letters, digits, and underscores' },
      { status: 400 }
    );
  }

  try {
    await putUserSecret({ ownerId: auth.user.id, name, value });
    return NextResponse.json({ success: true, name, ref: `vault:${name}` });
  } catch (err) {
    if (err instanceof VaultUnconfiguredError) {
      return NextResponse.json(
        { error: 'Secret vault is not configured on this deployment' },
        { status: 501 }
      );
    }
    return NextResponse.json({ error: 'Failed to store secret' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const names = await listUserSecretNames(auth.user.id);
  return NextResponse.json({
    configured: isUserVaultConfigured(),
    secrets: names.map((name) => ({ name, ref: `vault:${name}` })),
  });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const name = new URL(request.url).searchParams.get('name')?.trim() ?? '';
  if (!name) {
    return NextResponse.json({ error: 'name query param required' }, { status: 400 });
  }

  try {
    const { deleted } = await deleteUserSecret({ ownerId: auth.user.id, name });
    return NextResponse.json({ success: true, deleted });
  } catch (err) {
    if (err instanceof VaultUnconfiguredError) {
      return NextResponse.json(
        { error: 'Secret vault is not configured on this deployment' },
        { status: 501 }
      );
    }
    return NextResponse.json({ error: 'Failed to delete secret' }, { status: 500 });
  }
}

export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, POST, DELETE, OPTIONS' }),
  });
}
