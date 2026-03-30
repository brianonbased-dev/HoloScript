import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'HoloClaw Skills — HoloScript Studio',
  description: 'Browse, create, and manage HoloScript skills and automation recipes',
  openGraph: {
    title: 'HoloClaw Skills — HoloScript Studio',
    description: 'Browse, create, and manage HoloScript skills and automation recipes',
    type: 'website',
  },
};

export default function HoloclawLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
