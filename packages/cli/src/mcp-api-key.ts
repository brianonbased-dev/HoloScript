/**
 * resolveMcpApiKey reads HOLOSCRIPT_MCP_API_KEY only. No fallback name is read,
 * and a whitespace-only value counts as unset (fail closed). Never print the key.
 */
export const MCP_API_KEY_ENV = 'HOLOSCRIPT_MCP_API_KEY';
export const MISSING_MCP_API_KEY_ERROR =
  'HoloScript tools are off because HOLOSCRIPT_MCP_API_KEY is not set. Set it (macOS/Linux: export HOLOSCRIPT_MCP_API_KEY=your-key; PowerShell: $env:HOLOSCRIPT_MCP_API_KEY="your-key") and restart.';

export function resolveMcpApiKey(
  env: Record<string, string | undefined> = process.env,
  explicit?: string
): string {
  const fromArg = (explicit ?? '').trim();
  if (fromArg) return fromArg;
  return (env[MCP_API_KEY_ENV] ?? '').trim();
}

// --- 8.x deprecated alias (published cli only; remove in 9.0) ---------------
// To drop the alias: delete this block and switch setup-mcp back to resolveMcpApiKey.
/** Deprecated name, still accepted by the published cli in 8.x. House scripts stay strict. */
export const DEPRECATED_MCP_API_KEY_ALIAS = 'HOLOSCRIPT_API_KEY';
export const DEPRECATED_MCP_API_KEY_WARNING =
  'Warning: HOLOSCRIPT_API_KEY is deprecated and will stop working in @holoscript/cli 9.0. Rename it to HOLOSCRIPT_MCP_API_KEY.';

/**
 * Key reader for the published cli: explicit arg, then HOLOSCRIPT_MCP_API_KEY (wins when set),
 * then the deprecated HOLOSCRIPT_API_KEY with a stderr warning that names the variable only.
 */
export function resolveCliMcpApiKey(
  env: Record<string, string | undefined> = process.env,
  explicit?: string,
  warn: (message: string) => void = (m) => process.stderr.write(m + '\n')
): string {
  const strict = resolveMcpApiKey(env, explicit);
  if (strict) return strict;
  const legacy = (env[DEPRECATED_MCP_API_KEY_ALIAS] ?? '').trim();
  if (legacy) warn(DEPRECATED_MCP_API_KEY_WARNING);
  return legacy;
}
