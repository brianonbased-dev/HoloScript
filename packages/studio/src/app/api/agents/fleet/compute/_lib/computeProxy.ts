import { ENDPOINTS } from '@holoscript/config';
import { resolveUserSecret } from '@/lib/secrets/userSecretStore';

const HOLOMESH_BASE = ENDPOINTS.HOLOSCRIPT_MCP.replace(/\/+$/, '');
const CONTENT_DIGEST = /^sha256:[0-9a-f]{64}$/;
const TEAM_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SAFE_UPSTREAM_STATUSES = new Set([200, 201, 202, 400, 401, 403, 404, 409, 422, 503]);
const MAX_JSON_BODY_BYTES = 1_100_000;
const MAX_SOURCE_TEXT_BYTES = 256 * 1024;
const MAX_IDEMPOTENCY_KEY_LENGTH = 512;
const MAX_UPSTREAM_RESPONSE_BYTES = 1_000_000;
const UPSTREAM_TIMEOUT_MS = 12_000;

export const USER_HOLOMESH_SECRET_NAME = 'HOLOMESH_API_KEY' as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  );
}

function containsSecret(value: unknown, secret: string): boolean {
  if (typeof value === 'string') return value.includes(secret);
  if (Array.isArray(value)) return value.some((entry) => containsSecret(entry, secret));
  if (!isRecord(value)) return false;
  return Object.entries(value).some(
    ([key, entry]) => key.includes(secret) || containsSecret(entry, secret)
  );
}

export function jsonError(status: 400 | 502 | 503, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export function hasNoQuery(url: string): boolean {
  return Array.from(new URL(url).searchParams.keys()).length === 0;
}

export function parseTeamId(value: unknown): string | null {
  return typeof value === 'string' && TEAM_ID.test(value) ? value : null;
}

export function parseJobId(value: unknown): string | null {
  return typeof value === 'string' && CONTENT_DIGEST.test(value) ? value : null;
}

export function parseAttempt(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 ? value : null;
}

export function parseIdempotencyKey(value: unknown): string | null {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > MAX_IDEMPOTENCY_KEY_LENGTH ||
    value !== value.trim() ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    return null;
  }
  return value;
}

export function parseSourceText(value: unknown): string | null {
  if (
    typeof value !== 'string' ||
    Buffer.byteLength(value, 'utf8') > MAX_SOURCE_TEXT_BYTES ||
    value.trim().length === 0
  ) {
    return null;
  }
  return value;
}

export async function readExactJsonObject(
  request: Request,
  expectedKeys: readonly string[]
): Promise<Record<string, unknown> | null> {
  const mediaType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
  if (mediaType !== 'application/json') return null;

  let bytes: string;
  try {
    bytes = await request.text();
  } catch {
    return null;
  }
  if (!bytes || Buffer.byteLength(bytes, 'utf8') > MAX_JSON_BODY_BYTES) return null;

  try {
    const parsed: unknown = JSON.parse(bytes);
    return isRecord(parsed) && hasExactKeys(parsed, expectedKeys) ? parsed : null;
  } catch {
    return null;
  }
}

export function parseStatusQuery(url: string): { teamId: string; attempt: number } | null {
  const search = new URL(url).searchParams;
  const keys = Array.from(search.keys()).sort();
  if (keys.length !== 2 || keys[0] !== 'attempt' || keys[1] !== 'teamId') return null;

  const teamValues = search.getAll('teamId');
  const attemptValues = search.getAll('attempt');
  if (teamValues.length !== 1 || attemptValues.length !== 1) return null;
  const teamId = parseTeamId(teamValues[0]);
  if (!teamId || !/^[1-9][0-9]*$/.test(attemptValues[0]!)) return null;
  const attempt = Number(attemptValues[0]);
  return Number.isSafeInteger(attempt) ? { teamId, attempt } : null;
}

export async function proxyUserComputeRequest(input: {
  readonly ownerId: string;
  readonly upstreamPath: string;
  readonly method: 'GET' | 'POST';
  readonly body?: Record<string, unknown>;
}): Promise<Response> {
  let apiKey: string | null;
  try {
    apiKey = await resolveUserSecret({
      ownerId: input.ownerId,
      name: USER_HOLOMESH_SECRET_NAME,
      purpose: 'studio-holomesh-compute-proxy',
    });
  } catch {
    apiKey = null;
  }
  // This route intentionally has no process.env or shared Studio-key fallback.
  if (
    !apiKey ||
    apiKey !== apiKey.trim() ||
    apiKey.length > 4096 ||
    /[\u0000-\u001f\u007f]/.test(apiKey)
  ) {
    return jsonError(503, 'compute_proxy_unavailable');
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${HOLOMESH_BASE}${input.upstreamPath}`, {
      method: input.method,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${apiKey}`,
        ...(input.method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(input.body ? { body: JSON.stringify(input.body) } : {}),
      cache: 'no-store',
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch {
    return jsonError(503, 'compute_proxy_unavailable');
  }

  if (!SAFE_UPSTREAM_STATUSES.has(upstream.status)) {
    return jsonError(502, 'compute_upstream_invalid_response');
  }
  const declaredLength = upstream.headers.get('content-length');
  if (
    declaredLength &&
    (!/^\d+$/.test(declaredLength) || Number(declaredLength) > MAX_UPSTREAM_RESPONSE_BYTES)
  ) {
    return jsonError(502, 'compute_upstream_invalid_response');
  }

  let publicJson: string;
  let parsed: unknown;
  try {
    publicJson = await upstream.text();
    if (Buffer.byteLength(publicJson, 'utf8') > MAX_UPSTREAM_RESPONSE_BYTES) {
      return jsonError(502, 'compute_upstream_invalid_response');
    }
    parsed = JSON.parse(publicJson) as unknown;
  } catch {
    return jsonError(502, 'compute_upstream_invalid_response');
  }
  if (!isRecord(parsed) || containsSecret(parsed, apiKey)) {
    return jsonError(502, 'compute_upstream_invalid_response');
  }

  return new Response(publicJson, {
    status: upstream.status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
