import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Character Creator — HoloScript Studio',
  description: 'Design and customize 3D characters, avatars, and VRM models',
  openGraph: {
    title: 'Character Creator — HoloScript Studio',
    description: 'Design and customize 3D characters, avatars, and VRM models',
    type: 'website',
  },
};

export default function CharacterLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
