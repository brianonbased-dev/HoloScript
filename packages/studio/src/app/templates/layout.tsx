import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Templates — HoloScript Studio',
  description: 'Start from curated scene templates — forest, space station, zen garden, and more',
  openGraph: {
    title: 'Templates — HoloScript Studio',
    description: 'Start from curated scene templates — forest, space station, zen garden, and more',
    type: 'website',
  },
};

export default function TemplatesLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
