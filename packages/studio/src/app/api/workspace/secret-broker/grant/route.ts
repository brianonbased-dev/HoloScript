export const maxDuration = 60;

/**
 * POST /api/workspace/secret-broker/grant
 *
 * Issues a brokered grant receipt for an agent to use a secret handle.
 * The response never contains the underlying secret value.
 */

import { getServerSession } from 'next-auth';
import { NextRequest, NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import {
  SecretGrantPolicyError,
  createPolicyGatedSecretGrant,
} from '@/lib/workspace/secretBroker';

import { corsHeaders } from '../../../_lib/cors';

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function optionalRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const record = body as Record<string, unknown>;
  try {
    const { policyDecision, grant } = createPolicyGatedSecretGrant(
      {
        workspaceId: optionalString(record['workspaceId']) ?? '',
        agentId: optionalString(record['agentId']) ?? '',
        secretRef: optionalString(record['secretRef']) ?? '',
        capabilityRef: optionalString(record['capabilityRef']) ?? '',
        purpose: optionalString(record['purpose']) ?? '',
        ttlSeconds: optionalNumber(record['ttlSeconds']),
      },
      optionalRecord(record['holodoorPolicy'])
    );
    return NextResponse.json({ policyDecision, grant }, { status: 201 });
  } catch (err) {
    if (err instanceof SecretGrantPolicyError) {
      return NextResponse.json(
        { error: err.message, policyDecision: err.decision },
        { status: 403 }
      );
    }
    const message = err instanceof Error ? err.message : 'Invalid secret grant request';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' }),
  });
}
