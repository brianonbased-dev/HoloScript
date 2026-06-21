'use client';

import {
  Check,
  ArrowRight,
  Box,
  ExternalLink,
  Loader2,
  PackageCheck,
  Rocket,
  Sparkles,
  Wand2,
} from 'lucide-react';
import type {
  ConversionAction,
  ConversionCandidate,
  ProjectDNA,
  ProjectKind,
} from '@/lib/stores/workspaceStore';
import { KIND_META } from './importWizardConstants';
import { generateWorkspaceSeed } from '@/lib/workspaceSeeder';
import { ConversionRecommendations } from './ConversionRecommendations';
import { READINESS_DEPTH_LABELS, type ReadinessDepth } from '@/lib/plugins/types';

interface AbsorbStats {
  totalFiles: number;
  totalSymbols: number;
  totalLoc: number;
  durationMs: number;
}

export type WizardHubActionId = 'build-scene' | 'improve-repo' | 'compile-target' | 'ship-share';

export interface WizardHubAction {
  id: WizardHubActionId;
  title: string;
  description: string;
  cta: string;
  depth: ReadinessDepth;
  icon: typeof Sparkles;
  colorClass: string;
  mode?: 'world' | 'app' | 'sim' | 'game' | 'avatar' | 'part';
  view?: 'exportV2' | 'publish' | 'share';
  handler?: 'improve';
}

export const WIZARD_HUB_ACTIONS: WizardHubAction[] = [
  {
    id: 'build-scene',
    title: 'Build a scene',
    description: 'Open the creation workbench with the right mode for this workspace.',
    cta: 'Open Create',
    depth: 'real',
    icon: Sparkles,
    colorClass: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  },
  {
    id: 'improve-repo',
    title: 'Improve this repo',
    description: 'Run the absorb pipeline and daemon improvement pass for this import.',
    cta: 'Run improve',
    depth: 'real',
    icon: Wand2,
    colorClass: 'border-purple-500/30 bg-purple-500/10 text-purple-300',
    handler: 'improve',
  },
  {
    id: 'compile-target',
    title: 'Compile to a target',
    description: 'Open the workbench with the export pipeline ready for target selection.',
    cta: 'Open targets',
    depth: 'real',
    icon: PackageCheck,
    colorClass: 'border-blue-500/30 bg-blue-500/10 text-blue-300',
    view: 'exportV2',
  },
  {
    id: 'ship-share',
    title: 'Publish, deploy, share',
    description: 'Open the publish surface for release checks, sharing, and account-gated deploys.',
    cta: 'Open publish',
    depth: 'sketch',
    icon: Rocket,
    colorClass: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
    view: 'publish',
  },
];

export function createModeForProjectKind(kind: ProjectKind | undefined) {
  if (kind === 'spatial' || kind === 'storefront') return 'world';
  if (kind === 'data') return 'app';
  if (kind === 'service' || kind === 'frontend' || kind === 'automation') return 'app';
  if (kind === 'agent-backend' || kind === 'library') return 'app';
  return 'world';
}

export function getWizardHubActions(kind: ProjectKind | undefined): WizardHubAction[] {
  const mode = createModeForProjectKind(kind);
  return WIZARD_HUB_ACTIONS.map((action) => ({ ...action, mode }));
}

export function wizardHubHref(action: WizardHubAction): string {
  const params = new URLSearchParams();
  params.set('mode', action.mode ?? 'world');
  if (action.view) params.set('view', action.view);
  return `/create?${params.toString()}`;
}

function ReadinessBadge({ depth }: { depth: ReadinessDepth }) {
  const isReal = depth === 'real';
  return (
    <span
      className={`rounded-md border px-1.5 py-0.5 text-[9px] font-semibold ${
        isReal
          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
          : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
      }`}
    >
      {READINESS_DEPTH_LABELS[depth]}
    </span>
  );
}

interface WizardHubProps {
  repoName: string;
  dna: ProjectDNA | null;
  absorbStats: AbsorbStats | null;
  canImprove: boolean;
  improving: boolean;
  onOpenWorkspace: () => void;
  onImproveWorkspace: () => void | Promise<void>;
}

function WizardHub({
  repoName,
  dna,
  absorbStats,
  canImprove,
  improving,
  onOpenWorkspace,
  onImproveWorkspace,
}: WizardHubProps) {
  const actions = getWizardHubActions(dna?.kind);

  return (
    <section className="w-full rounded-lg border border-studio-border bg-black/20 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Box className="h-4 w-4 text-studio-accent" />
            <p className="text-sm font-semibold text-studio-text">Workspace Hub</p>
          </div>
          <p className="mt-1 text-[11px] text-studio-muted">
            {repoName || 'Imported workspace'}
            {dna?.kind ? ` - ${dna.kind}` : ''}
            {absorbStats ? ` - ${absorbStats.totalFiles.toLocaleString()} files indexed` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenWorkspace}
          className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-studio-border bg-studio-surface px-3 text-xs font-semibold text-studio-text transition hover:border-studio-accent/50"
        >
          Open project
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {actions.map((action) => {
          const Icon = action.icon;
          const disabled = action.handler === 'improve' && (!canImprove || improving);
          const content = (
            <>
              <div className="flex items-start justify-between gap-3">
                <div className={`rounded-lg border p-2 ${action.colorClass}`}>
                  {action.handler === 'improve' && improving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Icon className="h-4 w-4" />
                  )}
                </div>
                <ReadinessBadge depth={action.depth} />
              </div>
              <div className="mt-3 min-h-[72px]">
                <p className="text-sm font-semibold text-studio-text">{action.title}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-studio-muted">
                  {action.description}
                </p>
                {action.handler === 'improve' && !canImprove && (
                  <p className="mt-1 text-[10px] text-amber-300">
                    Enable auto-start in Integrations.
                  </p>
                )}
              </div>
              <div className="mt-3 flex items-center gap-1.5 text-[11px] font-semibold text-studio-accent">
                {improving && action.handler === 'improve' ? 'Running...' : action.cta}
                {action.handler === 'improve' ? (
                  <ArrowRight className="h-3.5 w-3.5" />
                ) : (
                  <ExternalLink className="h-3.5 w-3.5" />
                )}
              </div>
            </>
          );

          if (action.handler === 'improve') {
            return (
              <button
                key={action.id}
                type="button"
                onClick={onImproveWorkspace}
                disabled={disabled}
                className="rounded-lg border border-studio-border bg-studio-panel/60 p-3 text-left transition hover:border-studio-accent/50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {content}
              </button>
            );
          }

          return (
            <a
              key={action.id}
              href={wizardHubHref(action)}
              className="rounded-lg border border-studio-border bg-studio-panel/60 p-3 text-left transition hover:border-studio-accent/50"
            >
              {content}
            </a>
          );
        })}
      </div>
    </section>
  );
}

interface Step4WorkspaceReadyProps {
  repoName: string;
  dna: ProjectDNA | null;
  absorbStats: AbsorbStats | null;
  conversionCandidates: ConversionCandidate[];
  conversionActions: Record<string, ConversionAction>;
  repoUrl: string;
  branch: string;
  onAcceptConversion: (candidateId: string) => void;
  onDismissConversion: (candidateId: string) => void;
  onExportConversions: () => void;
  onOpenWorkspace: () => void;
  onImproveWorkspace: () => void | Promise<void>;
  canImprove: boolean;
  isImproving: boolean;
}

export function Step4WorkspaceReady({
  repoName,
  dna,
  absorbStats,
  conversionCandidates,
  conversionActions,
  repoUrl,
  branch,
  onAcceptConversion,
  onDismissConversion,
  onExportConversions,
  onOpenWorkspace,
  onImproveWorkspace,
  canImprove,
  isImproving,
}: Step4WorkspaceReadyProps) {
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

      <WizardHub
        repoName={repoName}
        dna={dna}
        absorbStats={absorbStats}
        canImprove={canImprove}
        improving={isImproving}
        onOpenWorkspace={onOpenWorkspace}
        onImproveWorkspace={onImproveWorkspace}
      />

      <div className="hidden">
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
              <span>Compile to any registered target from the same source</span>
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
              <span>
                Run the {dna?.recommendedProfile ?? 'recommended'} daemon for improvements
              </span>
            </div>
            <div className="flex items-center gap-2">
              <ArrowRight className="h-3 w-3 text-blue-400" />
              <span>Extract knowledge and publish to HoloMesh</span>
            </div>
          </>
        )}
      </div>

      <ConversionRecommendations
        candidates={conversionCandidates}
        actions={conversionActions}
        repoUrl={repoUrl}
        branch={branch}
        onAccept={onAcceptConversion}
        onDismiss={onDismissConversion}
        onExport={onExportConversions}
        compact
      />

      {/* Agent Ecosystem Injection Panel */}
      {dna && (
        <div className="w-full rounded-lg border border-indigo-500/30 bg-indigo-500/5 p-4 mt-2">
          <p className="text-xs font-bold text-indigo-400 mb-2 border-b border-indigo-500/30 pb-1">
            🤖 Agent Workspace Files
          </p>
          <div className="grid grid-cols-2 gap-2 text-[10px] text-studio-muted">
            {generateWorkspaceSeed(repoName, dna).map((file, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <ArrowRight className="h-3 w-3 text-indigo-400" />
                <span className="font-mono truncate" title={file.path}>
                  {file.path}
                </span>
              </div>
            ))}
          </div>
          <p className="text-[9px] text-studio-muted mt-3 italic">
            These files will be created when your local agent (Claude Code / Cursor) first runs in
            this repo.
          </p>
        </div>
      )}
    </div>
  );
}
