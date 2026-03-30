import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Pipeline — HoloScript Studio',
  description: 'Build, export, and deploy 3D scene pipelines across 17 compilation targets',
  openGraph: {
    title: 'Pipeline — HoloScript Studio',
    description: 'Build, export, and deploy 3D scene pipelines across 17 compilation targets',
    type: 'website',
  },
};

export default function PipelineLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
