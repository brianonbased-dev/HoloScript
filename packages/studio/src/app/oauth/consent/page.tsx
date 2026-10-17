/**
 * /oauth/consent — signed-in approval of an OAuth client (HoloScript #578 pair).
 * Server component. mcp-server 302s browsers here with its authorize query
 * (response_type, client_id, redirect_uri, scope, state, code_challenge,
 * code_challenge_method; studio_consent is stripped and ignored here too).
 * It mints the studio_consent assertion for the signed-in user, sends it as
 * the X-Studio-Consent header on a server-side GET /oauth/authorize to get a
 * csrf_token bound to that user (#578 F2), and renders a same-origin form to
 * /api/oauth/consent, which re-mints for the same user. Neither the assertion
 * nor the secret ever reaches the browser.
 */
import { lookalikeOf } from '@/lib/oauth/lookalikeName';
import { consentErrorText } from '@/lib/oauth/consentError';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import {
  fetchAuthorizeRequest,
  mintStudioConsentFor,
  parseAuthorizeParams,
} from '@/lib/oauth/studioConsent.server';

export const dynamic = 'force-dynamic';

/** Plain-language scope text (Trust non-blocking ask). Unknown scopes show their raw name. */
const SCOPE_TEXT: Record<string, string> = {
  'tools:read': 'Use read-only HoloScript tools (look things up, no changes).',
  'tools:write': 'Use HoloScript tools that create or change things.',
  social: 'Post and read on HoloMesh as you.',
  'user:private':
    'See your private account data (credits, earnings). Only approve apps you trust.',
};

type SearchParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function OAuthConsentPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams> | SearchParams;
}) {
  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    const s = first(v);
    if (s !== undefined && k !== 'studio_consent' && k !== 'error') qs.set(k, s);
  }

  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    redirect(`/auth/signin?callbackUrl=${encodeURIComponent(`/oauth/consent?${qs.toString()}`)}`);
  }

  const params = parseAuthorizeParams((n) => qs.get(n));
  if (!params) {
    return (
      <main className="mx-auto max-w-lg p-8">
        <h1 className="text-xl font-semibold">Invalid authorization request</h1>
        <p>client_id, redirect_uri and an S256 code_challenge are required.</p>
      </main>
    );
  }

  const studioConsent = mintStudioConsentFor(userId as string, params);
  if (!studioConsent) {
    return (
      <main className="mx-auto max-w-lg p-8">
        <h1 className="text-xl font-semibold">Approval is unavailable</h1>
        <p>Studio consent signing is not configured.</p>
      </main>
    );
  }
  const result = await fetchAuthorizeRequest(params, studioConsent);
  if (!result.ok) {
    return (
      <main className="mx-auto max-w-lg p-8">
        <h1 className="text-xl font-semibold">This app can&apos;t be approved</h1>
        <p>{result.error}</p>
      </main>
    );
  }
  const { info } = result;
  const scopes = params.scope.split(' ').filter(Boolean);
  let redirectHost = params.redirect_uri;
  try {
    redirectHost = new URL(params.redirect_uri).host;
  } catch {
    /* mcp-server already validated it; show it raw */
  }
  const hidden: Record<string, string> = {
    client_id: params.client_id,
    redirect_uri: params.redirect_uri,
    code_challenge: params.code_challenge,
    code_challenge_method: 'S256',
    scope: params.scope,
    csrf_token: info.csrf_token,
    ...(params.state ? { state: params.state } : {}),
  };

  const lookalike = lookalikeOf(info.client_name);
  const errorText = consentErrorText(first(sp.error));

  return (
    <main className="mx-auto max-w-lg p-8 space-y-4">
      <h1 className="text-xl font-semibold">
        Allow {info.client_name || params.client_id} to use your HoloScript account?
      </h1>
      <p className="text-sm">
        The name &quot;{info.client_name || params.client_id}&quot; is chosen by the app itself and
        is not verified by HoloScript. App id <code>{params.client_id}</code>, sends you back to{' '}
        <strong>{redirectHost}</strong>.
      </p>
      {errorText && (
        <p role="alert" className="rounded border border-red-500 p-3 text-red-700" data-testid="consent-error">
          {errorText}
        </p>
      )}
      {lookalike && (
        <p role="alert" className="text-sm font-semibold text-red-600" data-testid="lookalike-warning">
          Careful: this name looks like {lookalike}, but HoloScript has not verified that this app
          comes from {lookalike}. Check the app id and where it sends you before approving.
        </p>
      )}
      <p>If you approve, it can:</p>
      <ul className="list-disc pl-6">
        {scopes.map((s) => (
          <li key={s}>
            {SCOPE_TEXT[s] || 'An additional HoloScript permission.'} <code>({s})</code>
          </li>
        ))}
      </ul>
      {scopes.includes('user:private') && (
        <p role="alert" className="rounded border border-red-500 p-3 text-red-700">
          Warning: this app is asking to read your private account data. Deny unless you know and
          trust it.
        </p>
      )}
      <form method="POST" action="/api/oauth/consent" className="flex gap-3">
        {Object.entries(hidden).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        <button
          type="submit"
          name="decision"
          value="approve"
          className="rounded bg-blue-600 px-4 py-2 text-white"
        >
          Approve
        </button>
        <button type="submit" name="decision" value="deny" className="rounded border px-4 py-2">
          Deny
        </button>
      </form>
    </main>
  );
}
