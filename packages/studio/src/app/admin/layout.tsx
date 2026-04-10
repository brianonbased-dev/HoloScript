import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Admin — HoloScript Studio',
  description: 'System administration, user management, and platform health monitoring',
  openGraph: {
    title: 'Admin — HoloScript Studio',
    description: 'System administration, user management, and platform health monitoring',
    type: 'website',
  },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
