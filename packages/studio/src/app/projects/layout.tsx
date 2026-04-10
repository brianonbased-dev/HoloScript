import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Projects — HoloScript Studio',
  description: 'Manage your saved HoloScript scenes and projects',
  openGraph: {
    title: 'Projects — HoloScript Studio',
    description: 'Manage your saved HoloScript scenes and projects',
    type: 'website',
  },
};

export default function ProjectsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
