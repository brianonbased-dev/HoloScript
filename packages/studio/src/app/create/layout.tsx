import type { Metadata } from 'next';
import type { ReactNode } from 'react';

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

/**
 * Viewer-first create surface (founder directive 2026-06-10: "the
 * architecture doesn't focus on the viewer"). The page IS the viewport —
 * no WorkbenchShell wrapper: its title bar, Files/Search/Scene/Commands
 * sidebar, Output dock, and inspector duplicated chrome the page already
 * provides (chat dock, code drawer, right rail). The page owns its own
 * full-height chassis; everything non-viewport floats or collapses.
 */
export default function CreateLayout({ children }: { children: ReactNode }) {
  return children;
}
