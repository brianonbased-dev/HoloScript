/**
 * Connector form keys must match what POST /api/connectors/connect reads.
 * Regression: the panel sent mcpServerUrl / appleKey / googleKey / token
 * (Upstash), which the route never read, so those connectors could not
 * connect from the UI.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  CONNECTOR_FORM_FIELDS,
  MASKED_SECRET,
  buildConnectPayload,
  stripSecretsForPersist,
} from '../connectorFormFields';
import type { ServiceId } from '../connectorStore';

const ROUTE = path.resolve(__dirname, '../../../app/api/connectors/connect/route.ts');

/** Keys each `case '<id>':` block destructures from `credentials`. */
function routeCredentialKeys(): Record<string, string[]> {
  const src = fs.readFileSync(ROUTE, 'utf8');
  const out: Record<string, string[]> = {};
  const caseRe = /case '(\w+)':\s*\{([\s\S]*?)(?=\n\s*case '|\n\s*default:)/g;
  let m: RegExpExecArray | null;
  while ((m = caseRe.exec(src))) {
    const d = /const \{([^}]*)\} = credentials;/.exec(m[2]);
    if (d) out[m[1]] = d[1].split(',').map((k) => k.trim()).filter(Boolean);
  }
  return out;
}

describe('connector form keys match the connect route', () => {
  const routeKeys = routeCredentialKeys();
  const services = Object.keys(CONNECTOR_FORM_FIELDS) as ServiceId[];

  it('parses every service case from the route', () => {
    expect(Object.keys(routeKeys).sort()).toEqual([...services].sort());
  });

  it.each(services)('%s: every form key is read by the route', (id) => {
    for (const field of CONNECTOR_FORM_FIELDS[id]) {
      // GitHub's `repo` is a UI-only default; everything else must be consumed.
      if (id === 'github' && field.key === 'repo') continue;
      expect(routeKeys[id]).toContain(field.key);
    }
  });

  it('builds the exact payload shapes the route expects', () => {
    expect(buildConnectPayload('vscode', { bridgeUrl: 'http://localhost:17420' })).toEqual({
      serviceId: 'vscode',
      credentials: { bridgeUrl: 'http://localhost:17420' },
    });
    expect(
      buildConnectPayload('appstore', {
        appleKeyId: 'K',
        appleIssuerId: 'I',
        applePrivateKey: 'P',
        googleServiceAccount: '{}',
      }).credentials
    ).toEqual({ appleKeyId: 'K', appleIssuerId: 'I', applePrivateKey: 'P', googleServiceAccount: '{}' });
    expect(
      buildConnectPayload('upstash', { redisUrl: 'https://x.upstash.io', redisToken: 't' })
        .credentials
    ).toEqual({ redisUrl: 'https://x.upstash.io', redisToken: 't' });
  });

  it('drops legacy keys, blanks, and masked echoes', () => {
    const p = buildConnectPayload('upstash', {
      token: 'legacy',
      redisUrl: '',
      redisToken: MASKED_SECRET,
    } as Record<string, string>);
    expect(p.credentials).toEqual({});
    expect(
      buildConnectPayload('vscode', { mcpServerUrl: 'https://mcp.holoscript.net' }).credentials
    ).toEqual({});
  });
});

describe('stripSecretsForPersist', () => {
  it('removes secrets and masked values but keeps non-secret config', () => {
    expect(
      stripSecretsForPersist('appstore', {
        appleKeyId: 'K',
        appleIssuerId: 'I',
        applePrivateKey: 'P',
        googleServiceAccount: '{}',
      })
    ).toEqual({ appleKeyId: 'K', appleIssuerId: 'I' });
    expect(stripSecretsForPersist('github', { token: 'ghp_x', repo: 'a/b' })).toEqual({
      repo: 'a/b',
    });
    expect(stripSecretsForPersist('railway', { token: MASKED_SECRET, project: 'p' })).toEqual({
      project: 'p',
    });
  });
});
