'use client';

/**
 * EditorToolbar — Bottom toolbar for the HoloScript editor
 *
 * Contains:
 * - Safety status badge (live analysis)
 * - Platform target selector (compact)
 * - Deploy to HoloLand button
 *
 * Sits below the Monaco editor, above any console output.
 */

import React, { useState } from 'react';
import { SafetyStatusBar } from './SafetyStatusBar';
import { DeployButton } from './DeployButton';

// ═══════════════════════════════════════════════════════════════════

interface EditorToolbarProps {
  /** Current editor code */
  code: string;
  /** Target world for deployment */
  worldId?: string;
  /** Called when user wants to open the safety panel */
  onOpenSafetyPanel?: () => void;
}

export function EditorToolbar({ code, worldId = 'default', onOpenSafetyPanel }: EditorToolbarProps) {
  const [platform, setPlatform] = useState('quest3');

  return (
    <div className="flex items-center justify-between border-t border-studio-border bg-studio-bg/80 backdrop-blur-sm px-3 py-1.5 min-h-[36px]">
      {/* Left: Safety status */}
      <div className="flex items-center gap-3">
        <SafetyStatusBar
          code={code}
          debounceMs={500}
          onOpenPanel={onOpenSafetyPanel}
        />
        {/* Compact platform badge */}
        <select
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
          className="text-[10px] bg-studio-panel border border-studio-border rounded px-1.5 py-0.5 text-studio-muted appearance-none cursor-pointer hover:text-studio-text transition"
          title="Target platform"
        >
          <option value="quest3">🥽 Quest 3</option>
          <option value="pcvr">🖥️ PCVR</option>
          <option value="visionos">🍎 Vision Pro</option>
          <option value="webxr">🌐 WebXR</option>
          <option value="android-xr">🤖 Android XR</option>
          <option value="ios">📱 iOS</option>
          <option value="android">📱 Android</option>
          <option value="web">🖥️ Web</option>
        </select>
      </div>

      {/* Right: Deploy button */}
      <DeployButton
        code={code}
        worldId={worldId}
        packageName="my-scene"
      />
    </div>
  );
}
