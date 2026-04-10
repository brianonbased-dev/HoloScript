import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Absorb Intelligence — HoloScript Studio',
  description: 'Codebase intelligence with semantic GraphRAG search and knowledge graphs',
  openGraph: {
    title: 'Absorb Intelligence — HoloScript Studio',
    description: 'Codebase intelligence with semantic GraphRAG search and knowledge graphs',
    type: 'website',
  },
};

export default function AbsorbLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
