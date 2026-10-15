/**
 * /oauth/consent — signed-in approval of an OAuth client (HoloScript #578 pair).
 * Server component: fetches csrf_token from mcp-server's GET /oauth/authorize
 * and renders a same-origin form to /api/oauth/consent. The studio_consent
 * assertion is minted only in that route, so neither it nor the secret ever
 * reaches the browser.
 */
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { fetchAuthorizeRequest, parseAuthorizeParams } from '@/lib/oauth/studioConsent.server';

export const dynamic = 'force-dynamic';

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
    if (s !== undefined && k !== 'studio_consent') qs.set(k, s);
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

  const result = await fetchAuthorizeRequest(params);
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
  const hidden: Record<string, string> = {
    client_id: params.client_id,
    redirect_uri: params.redirect_uri,
    code_challenge: params.code_challenge,
    code_challenge_method: 'S256',
    scope: params.scope,
    csrf_token: info.csrf_token,
    ...(params.state ? { state: params.state } : {}),
  };

  return (
    <main className="mx-auto max-w-lg p-8 space-y-4">
      <h1 className="text-xl font-semibold">
        Allow {info.client_name || params.client_id} to use your HoloScript account?
      </h1>
      <p>It is asking for:</p>
      <ul className="list-disc pl-6">
        {scopes.map((s) => (
          <li key={s}>
            <code>{s}</code>
          </li>
        ))}
      </ul>
      <p className="text-sm opacity-70">
        After you decide you&apos;ll return to {params.redirect_uri}.
      </p>
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
