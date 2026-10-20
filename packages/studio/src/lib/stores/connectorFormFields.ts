/**
 * connectorFormFields — single source of truth for the connector form keys.
 *
 * The keys here MUST match what POST /api/connectors/connect destructures from
 * `credentials` for each service (packages/studio/src/app/api/connectors/connect/route.ts).
 * Before this module existed the panel sent `mcpServerUrl`, `appleKey`,
 * `googleKey` and `token` (Upstash) — keys the route never read — so those
 * connectors could not connect from the UI at all.
 *
 * Also owns which keys are secrets, so the connector store can refuse to
 * persist them to localStorage.
 */

import type { ServiceId } from './connectorStore';

export interface ConnectorFormField {
  key: string;
  label: string;
  type: 'text' | 'password' | 'url';
  placeholder: string;
  helpText?: string;
  /** Secret values are never written to localStorage. */
  secret?: boolean;
}

/** Value the connect route returns in place of a secret. Never send it back. */
export const MASKED_SECRET = '********';

const DOTS16 = '\u2022'.repeat(16);
const DOTS8 = '\u2022'.repeat(8);

export const CONNECTOR_FORM_FIELDS: Record<ServiceId, ConnectorFormField[]> = {
  github: [
    {
      key: 'token',
      label: 'Personal Access Token',
      type: 'password',
      placeholder: `ghp_${DOTS16}`,
      helpText: 'Requires repo, read:org, and workflow scopes',
      secret: true,
    },
    {
      key: 'repo',
      label: 'Default Repository',
      type: 'text',
      placeholder: 'username/repository',
    },
  ],
  railway: [
    {
      key: 'token',
      label: 'Railway Project Token',
      type: 'password',
      placeholder: DOTS16,
      helpText: 'Project token from your Railway project settings',
      secret: true,
    },
    {
      key: 'project',
      label: 'Default Project ID',
      type: 'text',
      placeholder: 'project id',
    },
  ],
  vscode: [
    {
      key: 'bridgeUrl',
      label: 'Extension Bridge URL',
      type: 'url',
      placeholder: 'http://localhost:17420',
      helpText:
        'Local HTTP bridge exposed by the HoloScript VS Code extension. Leave blank for the default.',
    },
  ],
  appstore: [
    {
      key: 'appleKeyId',
      label: 'Apple API Key ID',
      type: 'text',
      placeholder: 'ABCD1234EF',
      helpText: 'App Store Connect API key ID',
    },
    {
      key: 'appleIssuerId',
      label: 'Apple Issuer ID',
      type: 'text',
      placeholder: '00000000-0000-0000-0000-000000000000',
    },
    {
      key: 'applePrivateKey',
      label: 'Apple Private Key (.p8 contents)',
      type: 'password',
      placeholder: 'Paste the .p8 file contents',
      secret: true,
    },
    {
      key: 'googleServiceAccount',
      label: 'Google Service Account JSON',
      type: 'password',
      placeholder: '{"type":"service_account"...}',
      helpText: 'Service account with Play Developer API access',
      secret: true,
    },
  ],
  upstash: [
    {
      key: 'redisUrl',
      label: 'Redis REST URL',
      type: 'url',
      placeholder: 'https://\u2022\u2022\u2022.upstash.io',
      helpText: 'REST endpoint from Upstash console',
    },
    {
      key: 'redisToken',
      label: 'Redis REST Token',
      type: 'password',
      placeholder: DOTS8,
      secret: true,
    },
  ],
};

/** Set of secret keys for a service (never persisted). */
export function secretKeysFor(serviceId: ServiceId): Set<string> {
  return new Set(
    (CONNECTOR_FORM_FIELDS[serviceId] ?? []).filter((f) => f.secret).map((f) => f.key)
  );
}

/**
 * Build the exact body POSTed to /api/connectors/connect from the form values.
 * Only known keys for the service are sent; blanks and masked echoes are dropped.
 */
export function buildConnectPayload(
  serviceId: ServiceId,
  values: Record<string, string | undefined>
): { serviceId: ServiceId; credentials: Record<string, string> } {
  const credentials: Record<string, string> = {};
  for (const field of CONNECTOR_FORM_FIELDS[serviceId] ?? []) {
    const v = values[field.key];
    if (typeof v === 'string' && v.trim() !== '' && v !== MASKED_SECRET) {
      credentials[field.key] = v;
    }
  }
  return { serviceId, credentials };
}

/** Strip secrets (and masked echoes) from a config map before persisting. */
export function stripSecretsForPersist(
  serviceId: ServiceId,
  config: Record<string, string> | undefined
): Record<string, string> {
  const secret = secretKeysFor(serviceId);
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(config ?? {})) {
    if (secret.has(k) || v === MASKED_SECRET) continue;
    out[k] = v;
  }
  return out;
}
