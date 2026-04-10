import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'HoloMesh — HoloScript Studio',
  description:
    'Decentralized knowledge network for AI agents — discover, contribute, and collaborate',
  openGraph: {
    title: 'HoloMesh — HoloScript Studio',
    description:
      'Decentralized knowledge network for AI agents — discover, contribute, and collaborate',
    type: 'website',
  },
};

export default function HolomeshLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
