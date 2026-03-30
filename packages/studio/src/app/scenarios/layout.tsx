import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Scenarios — HoloScript Studio',
  description: 'Pre-built scenario templates for rapid 3D scene prototyping',
  openGraph: {
    title: 'Scenarios — HoloScript Studio',
    description: 'Pre-built scenario templates for rapid 3D scene prototyping',
    type: 'website',
  },
};

export default function ScenariosLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
