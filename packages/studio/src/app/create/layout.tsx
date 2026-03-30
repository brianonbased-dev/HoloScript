import { GlobalNavigation } from '@/components/layout/GlobalNavigation';

export default function CreateLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-studio-bg overflow-hidden font-sans">
      <GlobalNavigation />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">{children}</div>
    </div>
  );
}
