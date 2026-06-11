'use client';

/**
 * /workspace — redirected to /projects?tab=repos
 *
 * The agent workbench formerly at this route is now a tab inside /projects.
 * Deep-links (/workspace/agents/new, /workspace/knowledge,
 * /workspace/templates/new) are preserved as direct URLs — see handoff note
 * for later disposition.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function WorkspacePage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/projects?tab=repos');
  }, [router]);

  return null;
}
