'use client';

/**
 * AvatarAuthoringPage — Proof-of-Concept Avatar Composer
 *
 * Features:
 * - Part-based avatar assembly (body, head, clothing, accessories)
 * - Real-time 3D preview (placeholder mesh)
 * - Trait assignment from HoloScript trait registry
 * - Export to GLB / VRM (stub)
 * - Save to character library
 *
 * NOTE: This is a POC. Full 3D part compositing requires a runtime
 * that can merge GLB sub-meshes and re-target skeletons.
 */

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, Sparkles, Download, Save, RotateCcw, User } from 'lucide-react';
import { AvatarComposer } from '@/industry/avatar/AvatarComposer';
import { AvatarPreview } from '@/industry/avatar/AvatarPreview';
import { AvatarExportPanel } from '@/industry/avatar/AvatarExportPanel';
import { useAvatarStore } from '@/lib/stores/avatarStore';
import { logger } from '@/lib/logger';

export default function AvatarAuthoringPage() {
  const [activePanel, setActivePanel] = useState<'compose' | 'preview' | 'export'>('compose');
  const reset = useAvatarStore((s) => s.reset);

  const handleReset = useCallback(() => {
    if (confirm('Reset avatar to default? All unsaved changes will be lost.')) {
      reset();
      logger.debug('[AvatarAuthoring] Reset avatar');
    }
  }, [reset]);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header data-testid="avatar-header" className="flex h-12 shrink-0 items-center justify-between border-b border-studio-border bg-studio-panel px-4">
        <div className="flex items-center gap-4">
          <Link
            href="/create"
            className="flex items-center gap-2 text-studio-muted transition hover:text-studio-text"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="text-sm font-medium">Back to Editor</span>
          </Link>
          <div className="flex items-center gap-2 border-l border-studio-border pl-4">
            <User className="h-4 w-4 text-purple-400" />
            <span className="text-sm font-semibold text-purple-400">Avatar Authoring</span>
            <span className="rounded bg-purple-500/20 px-1.5 py-0.5 text-[10px] font-bold text-purple-300">
              POC
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            data-testid="avatar-reset"
            onClick={handleReset}
            className="flex items-center gap-1.5 rounded-lg border border-studio-border px-3 py-1.5 text-xs text-studio-muted transition hover:text-studio-text"
            title="Reset to default"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </button>

          <div data-testid="avatar-tabs" className="flex rounded-lg border border-studio-border overflow-hidden">
            {([
              { id: 'compose', label: 'Compose', icon: Sparkles },
              { id: 'preview', label: 'Preview', icon: User },
              { id: 'export', label: 'Export', icon: Download },
            ] as const).map((tab) => {
              const Icon = tab.icon;
              const isActive = activePanel === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActivePanel(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition ${
                    isActive
                      ? 'bg-purple-500/20 text-purple-300'
                      : 'text-studio-muted hover:text-studio-text'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          <button
            data-testid="avatar-save"
            onClick={() => {
              logger.debug('[AvatarAuthoring] Save triggered');
              alert('Avatar saved to library (POC stub)');
            }}
            className="flex items-center gap-1.5 rounded-lg bg-purple-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-purple-600"
          >
            <Save className="h-3.5 w-3.5" />
            Save
          </button>
        </div>
      </header>

      {/* Main workspace */}
      <div className="flex-1 overflow-hidden">
        {activePanel === 'compose' && <AvatarComposer />}
        {activePanel === 'preview' && <AvatarPreview />}
        {activePanel === 'export' && <AvatarExportPanel />}
      </div>
    </div>
  );
}
