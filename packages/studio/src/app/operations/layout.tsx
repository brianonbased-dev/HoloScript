import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Operations — HoloScript Studio',
  description: 'Platform operations dashboard for monitoring and management',
  openGraph: {
    title: 'Operations — HoloScript Studio',
    description: 'Platform operations dashboard for monitoring and management',
    type: 'website',
  },
};

export default function OperationsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
