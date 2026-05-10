import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { WorkbenchShell } from '@/components/workbench/WorkbenchShell';

export const metadata: Metadata = {
  title: 'Create — HoloScript Studio',
  description:
    'Build 3D scenes with AI-powered editor, node graph, shader editor, and 2000+ composable traits. Compile to 17 backends.',
  openGraph: {
    title: 'Create — HoloScript Studio',
    description:
      'Build 3D scenes with AI-powered editor, node graph, shader editor, and 2000+ composable traits.',
    type: 'website',
  },
};

export default function CreateLayout({ children }: { children: ReactNode }) {
  return (
    <WorkbenchShell
      perspectiveId="create"
      title="Create"
      subtitle="Scene editor"
      primarySidebarTitle="Create"
      bottomPanelTitle="Output"
      inspectorTitle="Inspector"
      statusItems={
        <>
          <span>Create</span>
          <span>HoloScript</span>
        </>
      }
    >
      {children}
    </WorkbenchShell>
  );
}
