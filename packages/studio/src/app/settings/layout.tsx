import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Settings — HoloScript Studio',
  description: 'Configure your HoloScript Studio preferences and account settings',
  openGraph: {
    title: 'Settings — HoloScript Studio',
    description: 'Configure your HoloScript Studio preferences and account settings',
    type: 'website',
  },
};

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
