/**
 * Display rows for the Connected apps fragment (src/lib/studio/fragments/connectedApps.holo).
 * Plain function, no hooks, so the generated component can derive rows with @computed after
 * its state is declared. App names are self-chosen and unverified, so every row carries the
 * app id and, when the name mimics a protected app, a lookalike warning.
 */
import { lookalikeOf } from './lookalikeName';

export const SCOPE_TEXT: Record<string, string> = {
  'tools:read': 'Use read-only HoloScript tools',
  'tools:write': 'Use HoloScript tools that change things',
  social: 'Post and read on HoloMesh as you',
  'user:private': 'See your private data (earnings, credits)',
};

export interface ConnectedAppRow {
  id: string;
  name: string;
  unverifiedText: string | null;
  lookalikeText: string | null;
  appIdText: string;
  scopes: string[];
  datesText: string;
  /** Leading space on purpose: read after "Revoke" so the button's name is "Revoke <app>". */
  revokeName: string;
}

const fmt = (iso: unknown) => {
  const d = new Date(String(iso ?? ''));
  return Number.isNaN(d.getTime())
    ? 'unknown'
    : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};

export function connectedAppRows(apps: unknown): ConnectedAppRow[] {
  if (!Array.isArray(apps)) return [];
  return apps.map((raw) => {
    const a = (raw ?? {}) as Record<string, unknown>;
    const clientName = typeof a.client_name === 'string' && a.client_name ? a.client_name : null;
    const clientId = String(a.client_id ?? '');
    const look = lookalikeOf(clientName);
    const scopes = Array.isArray(a.scopes) ? a.scopes.map(String) : [];
    return {
      id: String(a.id ?? ''),
      name: clientName ?? 'Unnamed app',
      unverifiedText: a.client_name_verified === true ? null : 'Unverified name',
      lookalikeText: look ? `Looks like ${look}, but not verified as that app.` : null,
      appIdText: `App id: ${clientId}`,
      scopes: scopes.map((s) => SCOPE_TEXT[s] ?? `Permission: ${s}`),
      datesText: `Approved ${fmt(a.created_at)} \u00b7 Last used ${fmt(a.last_used_at)}`,
      revokeName: `Revoke ${clientName ?? clientId}`,
    };
  });
}
