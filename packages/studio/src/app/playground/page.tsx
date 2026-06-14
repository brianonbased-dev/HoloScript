'use client';

import { Suspense, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Sparkles } from 'lucide-react';
import { useSceneStore } from '@/lib/stores/sceneStore';
import { BrittneyPresenceHUD } from '@/components/playground/BrittneyPresenceHUD';
import { readState } from '@/features/playground/sharing/url-encoder';

/**
 * Which agents embody the loaded build. `?agents=a,b` (or legacy `?agent=a`)
 * lists BYOK agent ids; default is the flagship Brittney (D.094: entity-generic,
 * Brittney is the default — never the hardcode). Read from window.location to
 * avoid the useSearchParams CSR-bailout in this client-only viewer page.
 */
function readAgentIds(): string[] {
  if (typeof window === 'undefined') return ['brittney'];
  const q = new URLSearchParams(window.location.search);
  const raw = q.get('agents') ?? q.get('agent') ?? '';
  const ids = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return ids.length > 0 ? ids : ['brittney'];
}

const titleCase = (id: string): string => id.charAt(0).toUpperCase() + id.slice(1);

const DesktopViewer = dynamic(
  () => import('@/embed/DesktopViewer').then((m) => ({ default: m.DesktopViewer })),
  { ssr: false }
);

function EmptyState() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-center">
      <Sparkles className="h-8 w-8 text-purple-500/50" />
      <p className="text-sm font-medium text-white/50">No scene loaded</p>
      <p className="text-xs text-white/30 max-w-[220px]">
        Build something in Vibe mode — Brittney will meet you here.
      </p>
    </div>
  );
}

export default function PlaygroundPage() {
  const code = useSceneStore((s) => s.code);
  const setErrors = useSceneStore((s) => s.setErrors);
  const setCode = useSceneStore((s) => s.setCode);

  // Agents that embody this build (default Brittney). Resolved on the client so
  // ?agents= reflects the actual URL without an SSR/CSR mismatch.
  const [agents, setAgents] = useState<string[]>(['brittney']);

  // "Send to playground": a share link (#v1/…) carries a world to display. Load it
  // into the scene store on mount so DesktopViewer renders it — the same store the
  // vibe→playground path feeds. No hash → no-op (an in-session/vibe scene is kept).
  useEffect(() => {
    setAgents(readAgentIds());
    let cancelled = false;
    readState().then((shared) => {
      if (!cancelled && shared?.source) setCode(shared.source);
    });
    return () => {
      cancelled = true;
    };
  }, [setCode]);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#07070f]">
      <Suspense fallback={<div className="h-full w-full bg-[#07070f]" />}>
        {code.trim() ? (
          <DesktopViewer
            code={code}
            agents={agents}
            onErrors={setErrors}
            showPlatformReceipt={false}
            showGrid
            showStars
            className="absolute inset-0 h-full w-full"
          />
        ) : (
          <EmptyState />
        )}
      </Suspense>

      <BrittneyPresenceHUD agentName={titleCase(agents[0] ?? 'brittney')} />
    </div>
  );
}
