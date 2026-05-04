import { networkInterfaces, type NetworkInterfaceInfo } from 'node:os';

interface OriginRequest {
  headers: Headers;
  url: string;
  nextUrl?: {
    origin: string;
  };
}

interface ResolveReachableOriginOptions {
  env?: NodeJS.ProcessEnv;
  interfaces?: NodeJS.Dict<NetworkInterfaceInfo[]>;
}

const LOOPBACK_HOSTS = new Set(['0.0.0.0', '127.0.0.1', '::1', 'localhost']);

function parseOrigin(value: string | undefined): URL | null {
  if (!value?.trim()) return null;
  try {
    return new URL(value.trim());
  } catch {
    return null;
  }
}

function originFromRequest(request: OriginRequest): URL {
  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  if (forwardedHost) {
    const forwardedProto =
      request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() || 'https';
    return new URL(`${forwardedProto}://${forwardedHost}`);
  }

  return new URL(request.nextUrl?.origin ?? new URL(request.url).origin);
}

function isLoopbackHost(hostname: string): boolean {
  return LOOPBACK_HOSTS.has(hostname.toLowerCase());
}

function isPrivateIpv4(address: string): boolean {
  const [a, b] = address.split('.').map((part) => Number(part));
  return (
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

function scoreInterface(name: string, address: string): number {
  const lowerName = name.toLowerCase();
  let score = 0;

  if (address.startsWith('192.168.')) score += 50;
  else if (address.startsWith('10.')) score += 35;
  else if (isPrivateIpv4(address)) score += 25;

  if (/\b(wi-?fi|wlan|ethernet)\b/.test(lowerName)) score += 30;
  if (/vpn|virtual|vethernet|wsl|hyper-v|docker|vmware|virtualbox|loopback/.test(lowerName)) {
    score -= 60;
  }

  return score;
}

function findLanIpv4(interfaces: NodeJS.Dict<NetworkInterfaceInfo[]>): string | null {
  const candidates: Array<{ address: string; score: number }> = [];

  for (const [name, infos] of Object.entries(interfaces)) {
    for (const info of infos ?? []) {
      if (info.family !== 'IPv4' || info.internal) continue;
      if (info.address.startsWith('127.') || info.address.startsWith('169.254.')) continue;
      candidates.push({ address: info.address, score: scoreInterface(name, info.address) });
    }
  }

  candidates.sort((a, b) => b.score - a.score || a.address.localeCompare(b.address));
  return candidates[0]?.address ?? null;
}

export function resolveReachableStudioOrigin(
  request: OriginRequest,
  options: ResolveReachableOriginOptions = {},
): string {
  const env = options.env ?? process.env;
  const explicitMobileOrigin = parseOrigin(
    env.STUDIO_MOBILE_ORIGIN ?? env.NEXT_PUBLIC_STUDIO_MOBILE_ORIGIN,
  );
  if (explicitMobileOrigin) return explicitMobileOrigin.origin;

  const configuredOrigin = parseOrigin(env.NEXT_PUBLIC_STUDIO_URL ?? env.NEXT_PUBLIC_URL);
  const requestOrigin = originFromRequest(request);
  const origin = configuredOrigin ?? requestOrigin;

  if (!isLoopbackHost(origin.hostname)) {
    return origin.origin;
  }

  const lanHost =
    env.STUDIO_LAN_HOST?.trim() ||
    findLanIpv4(options.interfaces ?? networkInterfaces());
  if (!lanHost) return origin.origin;

  const port = origin.port ? `:${origin.port}` : '';
  return `${origin.protocol}//${lanHost}${port}`;
}
