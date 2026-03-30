import type { Metadata } from 'next';
import { GlobalNavigation } from '@/components/layout/GlobalNavigation';

export const metadata: Metadata = {
  title: 'Creator Workspace — HoloScript Studio',
  description: 'Build, experiment, and ship to the HoloScript marketplace',
};

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-slate-950 overflow-hidden font-sans">
      <GlobalNavigation />
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">{children}</div>
    </div>
  );
}
