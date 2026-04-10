'use client';

/**
 * BuildPanel — Export/build panel for the Studio.
 *
 * Lets users compile their .holo scene to multiple targets:
 *  - Web App (standalone HTML+Three.js)
 *  - Embed Snippet (iframe)
 *  - PWA (offline-capable web app)
 *  - Robot (URDF)
 *  - 3D Export (glTF)
 *  - Data (JSON scene graph)
 *
 * Shows build status, output size, build time, and download button.
 */

import { useState, useCallback } from 'react';
import {
  Globe,
  Code,
  Smartphone,
  Bot,
  Box,
  FileJson,
  Download,
  Loader2,
  CheckCircle,
  AlertTriangle,
  Hammer,
  Settings,
  ChevronDown,
} from 'lucide-react';
import {
  build,
  downloadBuildResult,
  getAllTargets,
  getTargetMeta,
  type BuildTarget,
  type BuildResult,
  type BuildConfig,
} from '@/lib/buildService';
import { useSceneStore } from '@/lib/stores';
import { formatBytes } from '@holoscript/std';

const TARGET_ICONS: Record<BuildTarget, typeof Globe> = {
  web: Globe,
  embed: Code,
  pwa: Smartphone,
  urdf: Bot,
  gltf: Box,
  json: FileJson,
};

export function BuildPanel() {
  const code = useSceneStore((s) => s.code);
  const [target, setTarget] = useState<BuildTarget>('web');
  const [result, setResult] = useState<BuildResult | null>(null);
  const [building, setBuilding] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [config, setConfig] = useState<Partial<BuildConfig>>({
    minify: true,
    includePhysics: true,
    includeAudio: true,
    includeAI: false,
    embedAssets: true,
  });

  const targets = getAllTargets();

  const handleBuild = useCallback(() => {
    setBuilding(true);
    setResult(null);
    // Small delay to show loading state
    setTimeout(() => {
      const res = build(code, { ...config, target });
      setResult(res);
      setBuilding(false);
    }, 200);
  }, [code, target, config]);

  const handleDownload = useCallback(() => {
    if (result?.success) downloadBuildResult(result);
  }, [result]);

  const meta = getTargetMeta(target);

  return (
    <div className="flex flex-col gap-3 p-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Hammer className="h-4 w-4 text-studio-accent" />
        <h3 className="text-sm font-semibold text-studio-text">Build & Export</h3>
      </div>

      {/* Target Grid */}
      <div className="grid grid-cols-3 gap-1.5">
        {targets.map(({ id, label }) => {
          const Icon = TARGET_ICONS[id];
          const active = target === id;
          return (
            <button
              key={id}
              onClick={() => {
                setTarget(id);
                setResult(null);
              }}
              className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-2 text-[10px] transition ${
                active
                  ? 'border-studio-accent bg-studio-accent/10 text-studio-accent'
                  : 'border-studio-border bg-studio-panel text-studio-muted hover:border-studio-accent/40 hover:text-studio-text'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span className="leading-tight">{label.split('(')[0].trim()}</span>
            </button>
          );
        })}
      </div>

      {/* Settings Toggle */}
      <button
        onClick={() => setShowSettings(!showSettings)}
        className="flex items-center gap-1 text-[11px] text-studio-muted hover:text-studio-text transition"
      >
        <Settings className="h-3 w-3" />
        Build Settings
        <ChevronDown className={`h-3 w-3 transition ${showSettings ? 'rotate-180' : ''}`} />
      </button>

      {/* Settings Panel */}
      {showSettings && (
        <div className="flex flex-col gap-1.5 rounded-lg border border-studio-border bg-studio-panel/50 p-2 text-[11px]">
          {[
            { key: 'minify', label: 'Minify output' },
            { key: 'includePhysics', label: 'Include physics engine' },
            { key: 'includeAudio', label: 'Include audio system' },
            { key: 'includeAI', label: 'Include AI/NPC system' },
            { key: 'embedAssets', label: 'Embed assets inline' },
          ].map(({ key, label }) => (
            <label
              key={key}
              className="flex items-center gap-2 text-studio-muted cursor-pointer hover:text-studio-text"
            >
              <input
                type="checkbox"
                checked={config[key as keyof BuildConfig] as boolean ?? false}
                onChange={(e) => setConfig({ ...config, [key]: e.target.checked })}
                className="rounded border-studio-border"
              />
              {label}
            </label>
          ))}
        </div>
      )}

      {/* Build Button */}
      <button
        onClick={handleBuild}
        disabled={building || !code.trim()}
        className="flex items-center justify-center gap-2 rounded-lg bg-studio-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-studio-accent/80 disabled:opacity-40"
      >
        {building ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Building…
          </>
        ) : (
          <>
            <Hammer className="h-4 w-4" />
            Build {meta.label}
          </>
        )}
      </button>

      {/* Result */}
      {result && (
        <div
          className={`rounded-lg border p-3 ${
            result.success
              ? 'border-emerald-500/30 bg-emerald-950/20'
              : 'border-red-500/30 bg-red-950/20'
          }`}
        >
          {/* Status */}
          <div className="flex items-center gap-2 text-sm">
            {result.success ? (
              <CheckCircle className="h-4 w-4 text-emerald-400" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-red-400" />
            )}
            <span className={result.success ? 'text-emerald-400' : 'text-red-400'}>
              {result.success ? 'Build succeeded' : 'Build failed'}
            </span>
          </div>

          {/* Stats */}
          {result.success && (
            <div className="mt-2 flex items-center gap-3 text-[11px] text-studio-muted">
              <span>{formatBytes(result.size)}</span>
              <span>{result.buildTime}ms</span>
              <span>.{getTargetMeta(result.target).ext}</span>
            </div>
          )}

          {/* Warnings */}
          {result.warnings.length > 0 && (
            <div className="mt-2 text-[11px] text-amber-400">
              {result.warnings.map((w, i) => (
                <div key={i}>⚠ {w}</div>
              ))}
            </div>
          )}

          {/* Errors */}
          {result.errors.length > 0 && (
            <div className="mt-2 text-[11px] text-red-400">
              {result.errors.map((e, i) => (
                <div key={i}>
                  ✗ {e.message}
                  {e.line ? ` (line ${e.line})` : ''}
                </div>
              ))}
            </div>
          )}

          {/* Download */}
          {result.success && (
            <button
              onClick={handleDownload}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-400 transition hover:bg-emerald-500/20"
            >
              <Download className="h-3.5 w-3.5" />
              Download {result.filename}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
