import type http from 'http';

export const PARTNER_REGISTRY_VALIDATE_PATHS = new Set([
  '/api/v1/partner/validate',
  '/api/registry/v1/partner/validate',
]);

export interface PartnerRegistryCredentialStatus {
  valid: boolean;
  partnerId: string;
  tier: string;
}

export interface PartnerRegistryEnvelope<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
  rateLimit?: {
    remaining: number;
    limit: number;
    resetAt: string;
  };
}

interface PartnerRegistryValidationResult {
  status: number;
  body: PartnerRegistryEnvelope<PartnerRegistryCredentialStatus>;
  headers: Record<string, string>;
}

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' };
const DEFAULT_RATE_LIMIT = {
  remaining: 999,
  limit: 1000,
};

function firstHeader(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function bearerValue(value: string | undefined): string | undefined {
  return value?.replace(/^Bearer\s+/i, '').trim() || undefined;
}

function rateLimitReset(): string {
  return new Date(Date.now() + 60 * 60 * 1000).toISOString();
}

export function isPartnerRegistryValidatePath(path: string | undefined): boolean {
  return PARTNER_REGISTRY_VALIDATE_PATHS.has(path ?? '');
}

export function readPartnerRegistryHoloKey(headers: http.IncomingHttpHeaders): string | undefined {
  return (
    firstHeader(headers['x-api-key']) ??
    firstHeader(headers['x-mcp-api-key']) ??
    bearerValue(firstHeader(headers.authorization))
  );
}

export function validatePartnerRegistryCredentials(
  headers: http.IncomingHttpHeaders,
  expectedHoloKey: string | undefined
): PartnerRegistryValidationResult {
  const resetAt = rateLimitReset();
  const rateLimit = { ...DEFAULT_RATE_LIMIT, resetAt };
  const responseHeaders = {
    ...JSON_HEADERS,
    'X-RateLimit-Remaining': String(rateLimit.remaining),
    'X-RateLimit-Limit': String(rateLimit.limit),
    'X-RateLimit-Reset': String(Math.floor(new Date(resetAt).getTime() / 1000)),
  };

  if (!expectedHoloKey) {
    return {
      status: 503,
      headers: responseHeaders,
      body: {
        success: false,
        error: {
          code: 'holokey_unavailable',
          message: 'Registry credential validation is not provisioned on this server',
        },
        rateLimit,
      },
    };
  }

  const providedHoloKey = readPartnerRegistryHoloKey(headers);
  if (!providedHoloKey || providedHoloKey !== expectedHoloKey) {
    return {
      status: 401,
      headers: responseHeaders,
      body: {
        success: false,
        error: {
          code: 'invalid_holokey',
          message: 'Invalid HoloKey credential',
        },
        rateLimit,
      },
    };
  }

  const partnerId = firstHeader(headers['x-partner-id']) ?? 'holokey-x402';
  return {
    status: 200,
    headers: responseHeaders,
    body: {
      success: true,
      data: {
        valid: true,
        partnerId,
        tier: 'x402',
      },
      rateLimit,
    },
  };
}

export function handlePartnerRegistryValidateRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  expectedHoloKey: string | undefined
): boolean {
  const path = req.url?.split('?')[0];
  if (!isPartnerRegistryValidatePath(path)) return false;

  if (req.method !== 'GET') {
    res.writeHead(405, JSON_HEADERS);
    res.end(
      JSON.stringify({
        success: false,
        error: {
          code: 'method_not_allowed',
          message: 'Use GET for partner credential validation',
        },
      })
    );
    return true;
  }

  const result = validatePartnerRegistryCredentials(req.headers, expectedHoloKey);
  res.writeHead(result.status, result.headers);
  res.end(JSON.stringify(result.body));
  return true;
}
