'use client';

/**
 * /build — chat-with-Brittney + live preview window.
 *
 * The unified entry: chat on the left, live SceneViewer on the right,
 * feature chips for one-shot prompts, "Open in Studio" for the heavy
 * IDE (2 clicks deep from the homepage). Composes:
 *   - BrittneyBuildSurface (this PR)
 *   - existing streamBrittney + tool execution
 *   - existing SceneViewer (R3F)
 *   - existing scene + scene-graph stores
 *
 * Existing /start (BrittneyFullScreen) is left untouched as the no-preview
 * variant; this is an additive A/B candidate, not a replacement. Promote
 * /build → / once we've used it daily and it earns the swap.
 */

import { BrittneyBuildSurface } from '@/components/ai/BrittneyBuildSurface';

export default function BuildPage() {
  return <BrittneyBuildSurface />;
}
