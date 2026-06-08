'use client';

import { usePathname } from 'next/navigation';
import { GlobalNavigation } from './GlobalNavigation';

// Routes that render full-screen without the app sidebar (marketing / standalone).
const MARKETING_PREFIXES = ['/', '/start', '/playground', '/scan-room', '/vibe'];

function isMarketingRoute(pathname: string): boolean {
  return MARKETING_PREFIXES.some((prefix) =>
    prefix === '/' ? pathname === '/' : pathname.startsWith(prefix)
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (isMarketingRoute(pathname)) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-950">
      <GlobalNavigation />
      <main className="flex-1 overflow-y-auto min-w-0">{children}</main>
    </div>
  );
}
