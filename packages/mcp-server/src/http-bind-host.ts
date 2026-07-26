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

export function isLoopbackAddress(value: string | undefined): boolean {
  const address = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^::ffff:/, '');
  return address === '::1' || address === 'localhost' || /^127(?:\.\d{1,3}){3}$/u.test(address);
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
