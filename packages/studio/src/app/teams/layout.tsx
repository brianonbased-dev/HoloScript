import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Team Rooms — HoloScript Studio',
  description: 'Private team workspaces for collaborative agent development',
};

export default function TeamsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
