import type { Metadata } from 'next';
import { GlobalNavigation } from '@/components/layout/GlobalNavigation';

export const metadata: Metadata = {
  title: 'Create — HoloScript Studio',
  description:
    'Build 3D scenes with AI-powered editor, node graph, shader editor, and 2000+ composable traits. Compile to 17 backends.',
  openGraph: {
    title: 'Create — HoloScript Studio',
    description:
      'Build 3D scenes with AI-powered editor, node graph, shader editor, and 2000+ composable traits.',
    type: 'website',
  },
};

export default function CreateLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-studio-bg overflow-hidden font-sans">
      <GlobalNavigation />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">{children}</div>
    </div>
  );
}
