/**
 * HOLOSCRIPT_MCP_API_KEY is the only name read for the HoloScript MCP key (no fallback,
 * no alias). The value is trimmed and whitespace-only counts as unset (fail closed).
 * Never log or echo the key, and never put a response body in an error.
 */
export const MCP_API_KEY_ENV = 'HOLOSCRIPT_MCP_API_KEY';
export const MISSING_MCP_API_KEY_ERROR =
  'HoloScript tools are off because HOLOSCRIPT_MCP_API_KEY is not set. Set it (macOS/Linux: export HOLOSCRIPT_MCP_API_KEY=your-key; PowerShell: $env:HOLOSCRIPT_MCP_API_KEY="your-key") and restart.';

/** Explicit key (trimmed) wins; else HOLOSCRIPT_MCP_API_KEY (trimmed); else ''. */
export function readMcpApiKey(
  env: Record<string, string | undefined> = process.env,
  explicit?: string
): string {
  const fromArg = (explicit ?? '').trim();
  if (fromArg) return fromArg;
  return (env[MCP_API_KEY_ENV] ?? '').trim();
}

/** Parse JSON; a non-JSON body throws a fixed '<label>: response was not JSON' (no body text). */
export async function readJsonBody<T = unknown>(
  response: { json(): Promise<unknown> },
  label: string
): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    throw new Error(`${label}: response was not JSON`);
  }
}
