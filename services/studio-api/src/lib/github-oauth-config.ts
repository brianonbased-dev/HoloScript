export const GITHUB_OAUTH_SCOPES = 'repo read:user user:email read:org';

const GITHUB_CLIENT_ID_ENV_KEYS = [
  'GITHUB_CLIENT_ID',
  'GITHUB_OAUTH_CLIENT_ID',
  'AUTH_GITHUB_ID',
  'AUTH_GITHUB_CLIENT_ID',
] as const;

const GITHUB_CLIENT_SECRET_ENV_KEYS = [
  'GITHUB_CLIENT_SECRET',
  'GITHUB_OAUTH_CLIENT_SECRET',
  'AUTH_GITHUB_SECRET',
  'AUTH_GITHUB_CLIENT_SECRET',
] as const;

function firstConfiguredEnv(keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }

  return undefined;
}

export function resolveGitHubOAuthConfig(): { clientId?: string; clientSecret?: string } {
  return {
    clientId: firstConfiguredEnv(GITHUB_CLIENT_ID_ENV_KEYS),
    clientSecret: firstConfiguredEnv(GITHUB_CLIENT_SECRET_ENV_KEYS),
  };
}

export function resolveGitHubDeviceClientId(): string | undefined {
  return firstConfiguredEnv(GITHUB_CLIENT_ID_ENV_KEYS);
}

export function getGitHubClientIdEnvHint(): string {
  return GITHUB_CLIENT_ID_ENV_KEYS.join(' or ');
}
