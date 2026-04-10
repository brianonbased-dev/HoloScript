import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'HoloDaemon — HoloScript Studio',
  description: 'Monitor AI agent daemon status, metrics, and behavior tree progress',
  openGraph: {
    title: 'HoloDaemon — HoloScript Studio',
    description: 'Monitor AI agent daemon status, metrics, and behavior tree progress',
    type: 'website',
  },
};

export default function HolodaemonLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
