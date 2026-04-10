import type { Metadata } from 'next';
import { GlobalNavigation } from '@/components/layout/GlobalNavigation';

export const metadata: Metadata = {
  title: 'Integration Hub — HoloScript Studio',
  description: 'Manage MCP Connectors, Git authentication, and orchestration hooks',
  openGraph: {
    title: 'Integration Hub — HoloScript Studio',
    description: 'Manage MCP Connectors, Git authentication, and orchestration hooks',
    type: 'website',
  },
};

export default function IntegrationsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-slate-950 overflow-hidden font-sans">
      <GlobalNavigation />
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">{children}</div>
    </div>
  );
}
