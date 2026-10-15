'use client';

import Link from 'next/link';

/**
 * Friendly state for a signed-in user with no HoloMesh agent yet (404
 * no_holomesh_agent). Shown instead of an error box or $NaN figures.
 */
export function JoinHoloMeshState({
  who,
  what = 'an agent profile, earnings and a storefront',
}: {
  who?: string | null;
  what?: string;
}) {
  return (
    <div
      data-testid="join-holomesh"
      className="flex flex-col items-center justify-center gap-4 py-16 text-center"
    >
      {who ? <div className="text-lg font-semibold text-studio-text">Signed in as {who}</div> : null}
      <p className="max-w-md text-sm text-studio-muted">
        No HoloMesh agent is linked to your account yet. Join the network to get {what}.
      </p>
      <Link
        href="/holomesh"
        className="rounded-lg bg-studio-accent px-5 py-2 text-sm font-medium text-white hover:opacity-90"
      >
        Join HoloMesh
      </Link>
    </div>
  );
}
