'use client';

import { Suspense } from 'react';
import { useSceneStore } from '@/lib/stores/sceneStore';
import { DesktopViewer } from '@/embed/DesktopViewer';

export function ScenePreviewPanel() {
  const code = useSceneStore((s) => s.code);
  const setErrors = useSceneStore((s) => s.setErrors);

  if (!code.trim()) {
    return (
      <div className="flex h-full w-full items-center justify-center text-sm text-gray-500">
        No scene code — write HoloScript or ask Brittney to build something.
      </div>
    );
  }

  return (
    <Suspense
      fallback={
        <div className="flex h-full w-full items-center justify-center text-sm text-gray-500">
          Compiling…
        </div>
      }
    >
      <DesktopViewer
        code={code}
        onErrors={setErrors}
        showPlatformReceipt={false}
        showStars={false}
        showGrid={true}
      />
    </Suspense>
  );
}
