'use client';

import { Check, ArrowRight } from 'lucide-react';
import type { ProjectDNA } from '@/lib/stores/workspaceStore';
import { KIND_META } from './importWizardConstants';
import { generateWorkspaceSeed } from '@/lib/workspaceSeeder';

interface AbsorbStats {
  totalFiles: number;
  totalSymbols: number;
  totalLoc: number;
  durationMs: number;
}

interface Step4WorkspaceReadyProps {
  repoName: string;
  dna: ProjectDNA | null;
  absorbStats: AbsorbStats | null;
}

export function Step4WorkspaceReady({ repoName, dna, absorbStats }: Step4WorkspaceReadyProps) {
  return (
    <div className="flex flex-col items-center gap-6 py-4">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/20 shadow-2xl shadow-emerald-500/20">
        <Check className="h-10 w-10 text-emerald-400" />
      </div>
      <div className="text-center">
        <p className="text-lg font-semibold text-studio-text">Workspace Ready</p>
        <p className="text-sm text-studio-muted mt-1">{repoName} has been imported and indexed.</p>
      </div>

      {dna && (
        <div className="w-full flex flex-col gap-2">
          <div className="flex items-center gap-3 rounded-xl border border-studio-border bg-black/20 p-3">
            <span className="text-2xl">{KIND_META[dna.kind]?.emoji ?? '❓'}</span>
            <div className="flex-1">
              <p className="text-sm font-medium text-studio-text">{KIND_META[dna.kind]?.label}</p>
              <p className="text-[10px] text-studio-muted">
                {dna.languages.slice(0, 3).join(', ')} · {dna.repoShape}
              </p>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">
              {Math.round(dna.confidence * 100)}%
            </span>
          </div>

          <div className="flex items-center gap-3 text-[10px] text-studio-muted justify-center">
            {absorbStats && (
              <>
                <span>{absorbStats.totalFiles.toLocaleString()} files</span>
                <span className="text-studio-border">·</span>
                <span>{absorbStats.totalLoc.toLocaleString()} LOC</span>
                <span className="text-studio-border">·</span>
                <span>Indexed in {(absorbStats.durationMs / 1000).toFixed(1)}s</span>
              </>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1.5 text-[11px] text-studio-muted w-full">
        <p className="text-xs font-medium text-studio-text">
          {dna?.kind === 'storefront'
            ? 'Your storefront is ready:'
            : dna?.kind === 'service'
              ? 'Your service is ready:'
              : dna?.kind === 'spatial'
                ? 'Your spatial project is ready:'
                : dna?.kind === 'data'
                  ? 'Your data pipeline is ready:'
                  : 'Next steps:'}
        </p>

        {dna?.kind === 'storefront' && (
          <>
            <div className="flex items-center gap-2">
              <ArrowRight className="h-3 w-3 text-lime-400" />
              <span>Generate spatial storefront from your product data</span>
            </div>
            <div className="flex items-center gap-2">
              <ArrowRight className="h-3 w-3 text-lime-400" />
              <span>Deploy to phone, web, Quest, and AR simultaneously</span>
            </div>
            <div className="flex items-center gap-2">
              <ArrowRight className="h-3 w-3 text-lime-400" />
              <span>Set up IoT monitoring if you have a physical operation</span>
            </div>
          </>
        )}

        {dna?.kind === 'service' && (
          <>
            <div className="flex items-center gap-2">
              <ArrowRight className="h-3 w-3 text-blue-400" />
              <span>Convert routes and models to .holo service compositions</span>
            </div>
            <div className="flex items-center gap-2">
              <ArrowRight className="h-3 w-3 text-blue-400" />
              <span>Extract knowledge (W/P/G) from your architecture</span>
            </div>
            <div className="flex items-center gap-2">
              <ArrowRight className="h-3 w-3 text-blue-400" />
              <span>Run the {dna.recommendedProfile} daemon for safe improvements</span>
            </div>
          </>
        )}

        {dna?.kind === 'spatial' && (
          <>
            <div className="flex items-center gap-2">
              <ArrowRight className="h-3 w-3 text-emerald-400" />
              <span>Open in the Editor — your scene is ready to compile</span>
            </div>
            <div className="flex items-center gap-2">
              <ArrowRight className="h-3 w-3 text-emerald-400" />
              <span>Compile to any of 37 targets from the same source</span>
            </div>
          </>
        )}

        {dna?.kind === 'frontend' && (
          <>
            <div className="flex items-center gap-2">
              <ArrowRight className="h-3 w-3 text-purple-400" />
              <span>Scan components for spatial conversion candidates</span>
            </div>
            <div className="flex items-center gap-2">
              <ArrowRight className="h-3 w-3 text-purple-400" />
              <span>Extract UI patterns into .holo compositions</span>
            </div>
          </>
        )}

        {dna?.kind === 'data' && (
          <>
            <div className="flex items-center gap-2">
              <ArrowRight className="h-3 w-3 text-amber-400" />
              <span>Map your data schema to spatial traits automatically</span>
            </div>
            <div className="flex items-center gap-2">
              <ArrowRight className="h-3 w-3 text-amber-400" />
              <span>Generate monitoring dashboards as .holo compositions</span>
            </div>
          </>
        )}

        {(!dna?.kind ||
          !['storefront', 'service', 'spatial', 'frontend', 'data'].includes(dna.kind)) && (
          <>
            <div className="flex items-center gap-2">
              <ArrowRight className="h-3 w-3 text-blue-400" />
              <span>View the architecture graph in the Codebase panel</span>
            </div>
            <div className="flex items-center gap-2">
              <ArrowRight className="h-3 w-3 text-blue-400" />
              <span>Run the {dna?.recommendedProfile ?? 'recommended'} daemon for improvements</span>
            </div>
            <div className="flex items-center gap-2">
              <ArrowRight className="h-3 w-3 text-blue-400" />
              <span>Extract knowledge and publish to HoloMesh</span>
            </div>
          </>
        )}
      </div>

      {/* Agent Ecosystem Injection Panel */}
      {dna && (
        <div className="w-full rounded-lg border border-indigo-500/30 bg-indigo-500/5 p-4 mt-2">
          <p className="text-xs font-bold text-indigo-400 mb-2 border-b border-indigo-500/30 pb-1">
            🤖 uAA2++ Agentic Ecosystem Seeded
          </p>
          <div className="grid grid-cols-2 gap-2 text-[10px] text-studio-muted">
            {generateWorkspaceSeed(repoName, dna).map((file, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <Check className="h-3 w-3 text-indigo-400" />
                <span className="font-mono truncate" title={file.path}>{file.path}</span>
              </div>
            ))}
          </div>
          <p className="text-[9px] text-studio-muted mt-3 italic">
            Your local agents (Claude/Cursor) are now securely constrained by HoloScript domain alignments.
          </p>
        </div>
      )}

    </div>
  );
}
