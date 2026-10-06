import Link from 'next/link';

export const metadata = {
  title: 'Invite-only | HoloScript Studio',
  robots: { index: false },
};

/**
 * Where a refused sign-in, or a refused existing session, lands
 * (lib/inviteAllowlist.ts INVITE_ONLY_PATH). It needs no session, and the edge
 * proxy never redirects this path, so it cannot loop.
 */
export default function InviteOnlyPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-10 p-8">
      <p className="text-center text-lg text-studio-text">Studio is invite-only right now.</p>
      <Link href="/" className="text-sm text-studio-muted underline-offset-4 hover:underline">
        Back to home
      </Link>
    </main>
  );
}
