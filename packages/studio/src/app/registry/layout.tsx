import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Asset Registry — HoloScript Studio',
  description: 'Browse and import community asset packs, materials, and prefabs',
  openGraph: {
    title: 'Asset Registry — HoloScript Studio',
    description: 'Browse and import community asset packs, materials, and prefabs',
    type: 'website',
  },
};

export default function RegistryLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
