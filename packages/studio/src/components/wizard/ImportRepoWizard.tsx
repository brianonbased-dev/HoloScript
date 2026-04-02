'use client';

/**
 * ImportRepoWizard — 5-step wizard for importing GitHub repos into Studio.
 *
 * Step 0: "Choose a repo" (GitHub repo list or manual URL)
 * Step 1: "Select branch" (shows branches for chosen repo)
 * Step 2: "Importing..." (clone + absorb progress)
 * Step 3: "Project DNA" (inferred classification + daemon recommendation)
 * Step 4: "Workspace Ready" (summary + launch)
 *
 * Matches StudioSetupWizard's visual language (emerald accent, AnimatedStep, same layout).
 */

import { X, ChevronRight, ChevronLeft, GitBranch, FolderGit2, Loader2, Zap, BarChart2 } from 'lucide-react';
import { useImportRepoWizard } from '@/hooks/useImportRepoWizard';
import { AnimatedStep } from './AnimatedStep';
import { KIND_META } from './importWizardConstants';
import { Step0ChooseRepo } from './Step0ChooseRepo';
import { Step1SelectBranch } from './Step1SelectBranch';
import { Step2ImportProgress } from './Step2ImportProgress';
import { Step3ProjectDNA } from './Step3ProjectDNA';
import { Step4WorkspaceReady } from './Step4WorkspaceReady';

interface ImportRepoWizardProps {
  onClose: () => void;
}

export function ImportRepoWizard({ onClose }: ImportRepoWizardProps) {
  const {
    step, prevStep, direction, TOTAL_STEPS,
    repos, reposLoading, reposError, search, setSearch,
    selectedRepo, setSelectedRepo, manualUrl, setManualUrl,
    useManual, setUseManual, branch, setBranch,
    importStatus, importError, importProgress,
    dna, absorbStats, repoUrl, repoName,
    canNext, stepTitles, isTriggering, config,
    goToStep, handleLaunch, handleAbsorbAndImprove, retryImport, timeAgo,
  } = useImportRepoWizard(onClose);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-xl rounded-2xl border border-studio-border bg-studio-panel shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-studio-border px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-500/20 p-2">
              <FolderGit2 className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-studio-text">{stepTitles[step]}</p>
              <p className="text-xs text-studio-muted">
                Step {step + 1} of {TOTAL_STEPS}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-studio-muted hover:bg-white/10 hover:text-studio-text transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-black/20">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-blue-400 transition-all duration-500 ease-out"
            style={{ width: `${((step + 1) / TOTAL_STEPS) * 100}%` }}
          />
        </div>

        {/* Step content */}
        <div className="relative min-h-[360px] p-6">
          <AnimatedStep visible={step === 0} direction={direction}>
            <Step0ChooseRepo
              repos={repos}
              reposLoading={reposLoading}
              reposError={reposError}
              search={search}
              setSearch={setSearch}
              selectedRepo={selectedRepo}
              setSelectedRepo={setSelectedRepo}
              manualUrl={manualUrl}
              setManualUrl={setManualUrl}
              useManual={useManual}
              setUseManual={setUseManual}
              timeAgo={timeAgo}
            />
          </AnimatedStep>

          <AnimatedStep visible={step === 1} direction={direction}>
            <Step1SelectBranch
              repoName={repoName}
              repoUrl={repoUrl}
              branch={branch}
              setBranch={setBranch}
              selectedRepo={selectedRepo}
            />
          </AnimatedStep>

          <AnimatedStep visible={step === 2} direction={direction}>
            <Step2ImportProgress
              importStatus={importStatus}
              importError={importError}
              importProgress={importProgress}
              repoName={repoName}
              branch={branch}
              retryImport={retryImport}
            />
          </AnimatedStep>

          <AnimatedStep visible={step === 3} direction={direction}>
            <Step3ProjectDNA dna={dna} absorbStats={absorbStats} />
          </AnimatedStep>

          <AnimatedStep visible={step === 4} direction={direction}>
            <Step4WorkspaceReady
              repoName={repoName}
              dna={dna}
              absorbStats={absorbStats}
            />
          </AnimatedStep>
        </div>

        {/* Summary chips */}
        {step > 0 && (
          <div className="px-6 pb-2">
            <div className="flex flex-wrap gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2.5 py-0.5 text-[10px] text-studio-muted">
                <FolderGit2 className="h-3 w-3" /> {repoName}
              </span>
              {step >= 1 && branch && (
                <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2.5 py-0.5 text-[10px] text-studio-muted">
                  <GitBranch className="h-3 w-3" /> {branch}
                </span>
              )}
              {step >= 3 && dna && (
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2.5 py-0.5 text-[10px] text-blue-400">
                  {KIND_META[dna.kind]?.emoji} {KIND_META[dna.kind]?.label}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-studio-border px-6 py-4">
          <button
            onClick={() => (step > 0 && step !== 2 ? goToStep(step - 1) : onClose())}
            disabled={step === 2 && importStatus !== 'error'}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-studio-muted transition hover:text-studio-text disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" />
            {step === 0 ? 'Cancel' : 'Back'}
          </button>

          {step < TOTAL_STEPS - 1 ? (
            <button
              onClick={() => goToStep(step + 1)}
              disabled={!canNext}
              className="flex items-center gap-1.5 rounded-lg bg-blue-500/20 px-4 py-1.5 text-sm font-medium text-blue-400 transition hover:bg-blue-500/30 disabled:opacity-40"
            >
              {step === 1 ? 'Import' : 'Next'}
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={handleAbsorbAndImprove}
                disabled={isTriggering || !config.autoStart}
                className="flex items-center gap-2 rounded-lg bg-purple-500/20 px-4 py-1.5 text-sm font-medium text-purple-400 transition hover:bg-purple-500/30 disabled:opacity-40"
                title={
                  config.autoStart
                    ? 'Trigger recursive pipeline'
                    : 'Enable auto-start in /integrations'
                }
              >
                {isTriggering ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Zap className="h-4 w-4" />
                )}
                Absorb & Improve
              </button>
              <button
                onClick={handleLaunch}
                className="flex items-center gap-2 rounded-lg bg-emerald-500 px-5 py-1.5 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-400 hover:scale-[1.02] active:scale-95"
              >
                <BarChart2 className="h-4 w-4" />
                Open Workspace
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
