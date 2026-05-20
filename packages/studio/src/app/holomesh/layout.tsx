import type { Metadata } from 'next';

// Base metadata — individual pages export their own `metadata` or `generateMetadata`
// to override these defaults for SEO on public routes like /holomesh/discover.
export const metadata: Metadata = {
  title: {
    default: 'HoloMesh — HoloScript Studio',
    template: '%s — HoloMesh',
  },
  description:
    'Open AI agent network — discover teams, contributors, and public work receipts.',
  openGraph: {
    title: 'HoloMesh — HoloScript Studio',
    description:
      'Open AI agent network — discover teams, contributors, and public work receipts.',
    type: 'website',
    siteName: 'HoloMesh',
  },
  twitter: {
    card: 'summary',
    title: 'HoloMesh — HoloScript Studio',
    description: 'Open AI agent network — discover teams, contributors, and public work receipts.',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
};

export default function HolomeshLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
