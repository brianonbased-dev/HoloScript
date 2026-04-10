'use client';

/**
 * ConsentStep.tsx — Permission step in the Brittney wizard.
 *
 * Shows clear descriptions of what each permission grants Brittney,
 * with toggle switches for each. Users must approve at least scaffold
 * OR absorb to proceed. Designed to feel transparent, not intrusive.
 */

import React, { useCallback } from 'react';
import {
  FolderTree,
  Scan,
  Globe,
  Bot,
  ShieldCheck,
  ChevronRight,
} from 'lucide-react';
import type { ConsentGates } from '@/lib/brittney/WizardFlow';
import { isConsentSufficient } from '@/lib/brittney/WizardFlow';

// ─── Permission definition ──────────────────────────────────────────────────

interface PermissionDef {
  key: keyof Omit<ConsentGates, 'repos'>;
  icon: React.ElementType;
  title: string;
  description: string;
  detail: string;
}

const PERMISSIONS: PermissionDef[] = [
  {
    key: 'scaffold',
    icon: FolderTree,
    title: 'Project Structure',
    description: 'Push .claude/ config files to your repo',
    detail:
      'Creates CLAUDE.md, NORTH_STAR.md, memory files, skills, and hooks ' +
      'in your repository so Claude Code can work effectively on your project.',
  },
  {
    key: 'absorb',
    icon: Scan,
    title: 'Codebase Scan',
    description: 'Analyze your code to understand patterns',
    detail:
      'Scans your repository into a knowledge graph so Brittney understands ' +
      'your architecture, dependencies, and conventions. The scan stays private to your workspace.',
  },
  {
    key: 'publishKnowledge',
    icon: Globe,
    title: 'Share Patterns',
    description: 'Publish extracted patterns to HoloMesh',
    detail:
      'Anonymized architectural patterns (not your source code) are shared ' +
      'with the HoloMesh network. Other agents learn from your patterns, and you earn attribution.',
  },
  {
    key: 'daemon',
    icon: Bot,
    title: 'Background Improvement',
    description: 'Run a self-improvement daemon on your code',
    detail:
      'A background agent monitors your codebase for type errors, missing tests, ' +
      'and cleanup opportunities. It opens PRs for your review — never pushes directly.',
  },
];

// ─── Toggle switch ──────────────────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (val: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0d0d14] ${
        disabled ? 'opacity-40 cursor-not-allowed' : ''
      } ${checked ? 'bg-purple-600' : 'bg-gray-600'}`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform duration-200 ease-in-out ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

// ─── Permission card ────────────────────────────────────────────────────────

function PermissionCard({
  permission,
  checked,
  onChange,
}: {
  permission: PermissionDef;
  checked: boolean;
  onChange: (val: boolean) => void;
}) {
  const Icon = permission.icon as React.ComponentType<{ className?: string }>;
  const [expanded, setExpanded] = React.useState(false);

  return (
    <div
      className={`rounded-xl border p-4 transition-all duration-200 ${
        checked
          ? 'border-purple-500/40 bg-purple-500/5'
          : 'border-studio-border bg-[#111827]'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors ${
              checked ? 'bg-purple-500/20 text-purple-400' : 'bg-gray-700/50 text-gray-400'
            }`}
          >
            <Icon className="h-4.5 w-4.5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-white">
                {permission.title}
              </span>
              {permission.key === 'publishKnowledge' && (
                <span className="text-[10px] font-medium text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded">
                  public
                </span>
              )}
            </div>
            <p className="text-xs text-studio-muted mt-0.5">
              {permission.description}
            </p>
          </div>
        </div>
        <Toggle checked={checked} onChange={onChange} />
      </div>

      {/* Expandable detail */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="mt-2 text-[11px] text-purple-400/70 hover:text-purple-400 transition-colors"
      >
        {expanded ? 'Less detail' : 'What does this mean?'}
      </button>
      {expanded && (
        <p className="mt-1.5 text-xs text-studio-muted/80 leading-relaxed pl-12">
          {permission.detail}
        </p>
      )}
    </div>
  );
}

// ─── Props ──────────────────────────────────────────────────────────────────

interface ConsentStepProps {
  consent: ConsentGates;
  onConsentChange: (update: Partial<ConsentGates>) => void;
  onContinue: () => void;
}

// ─── Main component ─────────────────────────────────────────────────────────

export function ConsentStep({ consent, onConsentChange, onContinue }: ConsentStepProps) {
  const canProceed = isConsentSufficient(consent);

  const handleToggle = useCallback(
    (key: keyof Omit<ConsentGates, 'repos'>, value: boolean) => {
      onConsentChange({ [key]: value });
    },
    [onConsentChange]
  );

  return (
    <div className="px-4 py-6 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/20 ring-1 ring-purple-500/30">
          <ShieldCheck className="h-5 w-5 text-purple-400" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-white">
            Your permissions
          </h3>
          <p className="text-xs text-studio-muted">
            Choose what Brittney can do with your project
          </p>
        </div>
      </div>

      {/* Brittney comment */}
      <div className="mt-4 mb-5 rounded-xl bg-[#1a1a2e] border border-studio-border px-4 py-3">
        <p className="text-sm text-gray-300 leading-relaxed">
          I&apos;ll only do what you approve. You can change these anytime in Settings.
        </p>
      </div>

      {/* Permission cards */}
      <div className="space-y-3">
        {PERMISSIONS.map((perm) => (
          <PermissionCard
            key={perm.key}
            permission={perm}
            checked={consent[perm.key]}
            onChange={(val) => handleToggle(perm.key, val)}
          />
        ))}
      </div>

      {/* Minimum consent hint */}
      {!canProceed && (
        <p className="mt-4 text-xs text-amber-400/80 text-center">
          Enable at least Project Structure or Codebase Scan to continue
        </p>
      )}

      {/* Continue button */}
      <button
        onClick={onContinue}
        disabled={!canProceed}
        className={`mt-5 w-full flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium transition-all ${
          canProceed
            ? 'bg-purple-600 text-white hover:bg-purple-500 shadow-lg shadow-purple-600/20'
            : 'bg-gray-700/50 text-gray-500 cursor-not-allowed'
        }`}
      >
        Continue
        <ChevronRight className="h-4 w-4" />
      </button>

      {/* Settings reminder */}
      <p className="mt-3 text-center text-[11px] text-studio-muted/60">
        These permissions can be changed later in Settings
      </p>
    </div>
  );
}
