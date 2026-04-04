/**
 * BYOK (Bring Your Own Key) — User-provided API key extraction and resolution.
 *
 * Priority: user header keys > server .env keys.
 * User keys are NEVER logged or stored server-side.
 */

export interface UserKeys {
  openrouter: string;
  anthropic: string;
  openai: string;
}

/** Extract user-provided API keys from request headers. */
export function extractUserKeys(req: Request): UserKeys {
  return {
    openrouter: req.headers.get('x-openrouter-key') || '',
    anthropic: req.headers.get('x-anthropic-key') || '',
    openai: req.headers.get('x-openai-key') || '',
  };
}

/** Resolve the API key to use — user key takes priority over server env. */
export function getApiKey(
  userKeys: UserKeys,
  provider: 'openrouter' | 'anthropic' | 'openai'
): string {
  // User keys take priority
  if (provider === 'openrouter' && userKeys.openrouter) return userKeys.openrouter;
  if (provider === 'anthropic' && userKeys.anthropic) return userKeys.anthropic;
  if (provider === 'openai' && userKeys.openai) return userKeys.openai;
  // Fall back to server env
  if (provider === 'openrouter') return process.env.OPENROUTER_API_KEY || '';
  if (provider === 'anthropic') return process.env.ANTHROPIC_API_KEY || '';
  if (provider === 'openai') return process.env.OPENAI_API_KEY || '';
  return '';
}

/** Determine which provider label to use for the x-llm-provider response header. */
export function resolveProviderLabel(userKeys: UserKeys): string {
  if (userKeys.openrouter) return 'openrouter';
  if (userKeys.anthropic) return 'anthropic';
  if (userKeys.openai) return 'openai';
  return 'server';
}

/** Check if the user supplied any BYOK key. */
export function hasByokKey(userKeys: UserKeys): boolean {
  return !!(userKeys.openrouter || userKeys.anthropic || userKeys.openai);
}
