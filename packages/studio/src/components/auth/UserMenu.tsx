'use client';

import { useSession, signIn, signOut } from 'next-auth/react';

export function UserMenu() {
  const { data: session, status } = useSession();

  if (status === 'loading') {
    return (
      <div className="h-8 w-8 animate-pulse rounded-full bg-white/10" />
    );
  }

  if (!session?.user) {
    return (
      <button
        onClick={() => signIn()}
        className="rounded-md border border-white/20 px-3 py-1.5 text-sm text-white/80 transition hover:bg-white/10 hover:text-white"
      >
        Sign in
      </button>
    );
  }

  return (
    <div className="group relative">
      <button className="flex items-center gap-2 rounded-md px-2 py-1 transition hover:bg-white/10">
        {session.user.image ? (
          <img
            src={session.user.image}
            alt=""
            className="h-7 w-7 rounded-full"
          />
        ) : (
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-xs font-medium text-white">
            {(session.user.name ?? session.user.email ?? '?')[0]?.toUpperCase()}
          </div>
        )}
        <span className="text-sm text-white/80">
          {session.user.name ?? session.user.email}
        </span>
      </button>

      <div className="invisible absolute right-0 top-full mt-1 w-48 rounded-lg border border-white/10 bg-zinc-900 py-1 opacity-0 shadow-xl transition group-hover:visible group-hover:opacity-100">
        <div className="border-b border-white/10 px-3 py-2 text-xs text-white/50">
          {session.user.email}
        </div>
        <button
          onClick={() => signOut()}
          className="w-full px-3 py-2 text-left text-sm text-white/80 transition hover:bg-white/10"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
