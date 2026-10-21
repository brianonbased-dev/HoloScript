'use client';

/**
 * AccountMenu - signed-in account control for the global navigation
 * (Creator Advocate audit 2026-10-14, item 3: there was no account menu).
 * Shows the GitHub avatar/name from the session; opens a small menu with
 * Profile, Credits and Sign out. Click/keyboard driven, not hover-only.
 */

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { signOut, useSession } from 'next-auth/react';

export function AccountMenu() {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const user = session?.user;
  if (!user) return null;
  const label = user.name || user.email || 'Account';

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={`Account menu: ${label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-center lg:justify-start gap-3 rounded-xl px-3 py-2 text-slate-300 transition hover:bg-slate-800/50"
      >
        {user.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.image} alt="" className="h-6 w-6 rounded-full" />
        ) : (
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-xs font-medium text-white">
            {label[0]?.toUpperCase()}
          </span>
        )}
        <span className="hidden lg:block truncate text-sm">{label}</span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute bottom-full left-0 mb-2 w-56 rounded-lg border border-slate-700 bg-slate-900 py-1 shadow-xl z-50"
        >
          {user.email && (
            <div className="border-b border-slate-800 px-3 py-2 text-xs text-slate-500 truncate">
              {user.email}
            </div>
          )}
          <Link
            role="menuitem"
            href="/settings?tab=profile"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
          >
            Profile
          </Link>
          <Link
            role="menuitem"
            href="/settings?tab=credits"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
          >
            Credits
          </Link>
          <button
            role="menuitem"
            type="button"
            onClick={() => void signOut({ callbackUrl: '/' })}
            className="block w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-slate-800"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}