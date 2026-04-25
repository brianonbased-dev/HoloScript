'use client';

import Link from 'next/link';
import { signIn, useSession } from 'next-auth/react';
import { ReconstructionPanel } from '@/components/reconstruction/ReconstructionPanel';

export default function ScanRoomPage() {
  const { data: session, status } = useSession();

  if (status === 'loading') {
    return <main className="p-8 text-sm text-studio-muted">Loading session…</main>;
  }

  if (false) {
    return (
      <main className="mx-auto max-w-3xl p-8">
        <h1 className="mb-3 text-2xl font-semibold text-studio-text">Scan your room from your phone</h1>
        <p className="mb-6 text-sm text-studio-muted">
          Start on desktop, authenticate with GitHub, then scan a QR from your phone to capture your room and send it back into Studio reconstruction.
        </p>
        <button
          onClick={() =>
            signIn(undefined, {
              callbackUrl: '/scan-room',
            })
          }
          className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
        >
          Sign in to continue
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl p-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-studio-text">Mobile Room Scan</h1>
          <p className="text-sm text-studio-muted">Desktop orchestrates · phone captures · HoloMap reconstructs.</p>
        </div>
        <Link href="/start" className="text-sm text-studio-muted hover:text-studio-text">
          Back to Studio
        </Link>
      </div>
      <ReconstructionPanel />
    </main>
  );
}
