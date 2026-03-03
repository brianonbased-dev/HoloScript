import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Creator Workspace — HoloScript Studio',
  description: 'Build, experiment, and ship to the HoloScript marketplace',
};

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
