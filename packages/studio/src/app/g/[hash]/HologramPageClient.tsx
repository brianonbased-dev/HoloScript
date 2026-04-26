'use client';

/**
 * HologramPageClient — thin client wrapper around HologramViewer.
 *
 * The /g/[hash] route is a server component that fetches the bundle from
 * the FileSystemHologramStore. The viewer itself touches client-only APIs
 * (navigator, dynamic import, document) so it must run on the client.
 * This file is the boundary.
 */

import HologramViewer from '@/components/hologram/HologramViewer';
import type { HologramBundle } from '@holoscript/engine/hologram';

export default function HologramPageClient({ bundle }: { bundle: HologramBundle }) {
  return <HologramViewer bundle={bundle} />;
}
