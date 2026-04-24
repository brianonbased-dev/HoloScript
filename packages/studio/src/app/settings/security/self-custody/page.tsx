'use client';

/**
 * /settings/security/self-custody — Tier 2 migration wizard entry point.
 *
 * Next.js client route. Reads the session bearer from next-auth and mounts
 * the <MigrationWizard /> state machine.
 */

import React from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { MigrationWizard } from '@/components/self-custody/MigrationWizard';

type SessionUser = {
  id?: string;
  email?: string | null;
  accessToken?: string;
};

export default function SelfCustodyPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  if (status === 'loading') {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>
        Loading...
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>
        Please sign in to continue.
      </div>
    );
  }

  // Pull bearer. Exact shape depends on next-auth config — this surfaces
  // a clear error if the session doesn't carry one.
  const sessionUser = session.user as unknown as SessionUser;
  const bearerToken =
    sessionUser.accessToken ||
    (session as unknown as { accessToken?: string }).accessToken ||
    '';

  if (!bearerToken) {
    return (
      <div
        style={{
          maxWidth: 560,
          margin: '20px auto',
          padding: 20,
          borderRadius: 8,
          background: '#531',
          color: '#fdd',
          fontSize: 13,
        }}
        role="alert"
      >
        <strong>Session missing MCP bearer token.</strong> Your next-auth
        session does not expose an access token we can pass to the identity
        server. Sign out and back in, or contact support if this persists.
      </div>
    );
  }

  // Dev banner when REQUIRE_2FA is unset at build time. Production deploys
  // should set this to mask the banner.
  const devSkipBanner =
    process.env.NEXT_PUBLIC_REQUIRE_2FA !== 'true' &&
    process.env.NODE_ENV !== 'production';

  return (
    <div
      style={{
        minHeight: '100vh',
        padding: '40px 20px',
        background: '#060610',
      }}
    >
      <div
        style={{
          maxWidth: 640,
          margin: '0 auto 20px auto',
          fontSize: 12,
          color: '#888',
        }}
      >
        <button
          type="button"
          onClick={() => router.push('/settings')}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#4af',
            cursor: 'pointer',
            padding: 0,
            fontSize: 12,
          }}
        >
          &larr; Back to Settings
        </button>
      </div>

      <h1
        style={{
          maxWidth: 640,
          margin: '0 auto 12px auto',
          fontSize: 22,
          color: '#eee',
        }}
      >
        Move to self-custody
      </h1>
      <p
        style={{
          maxWidth: 640,
          margin: '0 auto 24px auto',
          color: '#aaa',
          fontSize: 13,
        }}
      >
        Retire the custodial signer and take sole control of your account via
        your own wallet. This is permanent — we cannot restore custodial
        signing once retired.
      </p>

      <MigrationWizard
        bearerToken={bearerToken}
        devSkipBanner={devSkipBanner}
        onExit={() => router.push('/settings')}
      />
    </div>
  );
}
