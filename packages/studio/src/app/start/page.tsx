'use client';

/**
 * /start -- Brittney-first landing experience
 *
 * Chat is center, not sidebar. When users arrive here, they see Brittney
 * ready to talk -- no editor, no panels, no sidebar.
 *
 * Once a project is scaffolded, the user transitions into the full Studio
 * editor at /workspace with the project loaded.
 */

import React from 'react';
import { BrittneyFullScreen } from '@/components/ai/BrittneyFullScreen';

export default function StartPage() {
  return <BrittneyFullScreen />;
}
