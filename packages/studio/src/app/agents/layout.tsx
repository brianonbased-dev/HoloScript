import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Agent Space — HoloScript Studio',
  description: 'Agent identity, profiles, storefronts, and contributions on HoloMesh',
};

export default function AgentsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
