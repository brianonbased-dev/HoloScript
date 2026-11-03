/**
 * Resolve the network interface used by the MCP HTTP transport.
 *
 * Public deployments keep the historical all-interface default. Sovereign
 * desktop services opt into loopback explicitly with MCP_BIND_HOST so a local
 * graph server is not accidentally exposed to the LAN.
 */
export function resolveMcpBindHost(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.MCP_BIND_HOST?.trim();
  return configured || '0.0.0.0';
}

function isIpv4Loopback(address: string): boolean {
  // Dotted decimal, including inet_aton short forms (127.1, 127.0.1).
  if (!/^\d{1,10}(?:\.\d{1,10}){0,3}$/u.test(address)) return false;
  const parts = address.split('.').map(Number);
  if (parts.length < 2 || parts[0] !== 127) return false;
  const last = parts[parts.length - 1];
  const middle = parts.slice(1, -1);
  if (middle.some((part) => part > 255)) return false;
  const lastMax = [0, 0xffffff, 0xffff, 0xff][parts.length - 1];
  return last <= lastMax;
}

export function isLoopbackAddress(value: string | undefined): boolean {
  let address = String(value || '')
    .trim()
    .toLowerCase();
  if (address.startsWith('[') && address.endsWith(']')) address = address.slice(1, -1);
  if (address === '::1' || address === 'localhost') return true;
  return isIpv4Loopback(address.replace(/^::ffff:/, ''));
}

export function isTrustedLoopbackMcpPeer(options: {
  enabled: boolean;
  bindHost: string;
  remoteAddress: string | undefined;
}): boolean {
  return (
    options.enabled &&
    isLoopbackAddress(options.bindHost) &&
    isLoopbackAddress(options.remoteAddress)
  );
}
