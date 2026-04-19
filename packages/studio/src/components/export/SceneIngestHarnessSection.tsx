'use client';

/**
 * Copy-paste commands for Paper #2 / #4 scene-ingest benchmarks (non-developer friendly).
 * Profile ids match packages/holomap/profiles/*.json (kept inline to avoid heavy client bundle).
 */

import { useCallback, useMemo, useState } from 'react';
import { ClipboardCopy, CheckCircle } from 'lucide-react';

const PROFILES = [
  {
    id: 'compatibility-marble',
    plainName: 'Compatibility scene (Marble)',
    description: 'Default for paper deadlines; legacy manifest semantics.',
  },
  {
    id: 'native-holomap-v1',
    plainName: 'Native scene (HoloMap)',
    description: 'WebGPU reconstruction path with SimulationContract binding on manifest.',
  },
  {
    id: 'compare-both',
    plainName: 'Compare compatibility and native',
    description: 'Runs both probes and emits a comparison table.',
  },
] as const;

type ProfileId = (typeof PROFILES)[number]['id'];

function commandForPaper2(profileEnv: string): string {
  return (
    `$env:HOLOSCRIPT_RECONSTRUCTION_PROFILE="${profileEnv}"; ` +
    `pnpm --filter @holoscript/engine exec vitest run src/simulation/__tests__/paper-snn-navigation.test.ts`
  );
}

function commandForPaper4(profileEnv: string): string {
  return (
    `$env:HOLOSCRIPT_RECONSTRUCTION_PROFILE="${profileEnv}"; ` +
    `pnpm --filter @holoscript/security-sandbox test`
  );
}

export function SceneIngestHarnessSection() {
  const [profileId, setProfileId] = useState<ProfileId>('compatibility-marble');
  const [copied, setCopied] = useState<string | null>(null);

  const meta = PROFILES.find((p) => p.id === profileId)!;

  const paper2Cmd = useMemo(() => commandForPaper2(meta.id), [meta.id]);
  const paper4Cmd = useMemo(() => commandForPaper4(meta.id), [meta.id]);

  const copy = useCallback(async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied('error');
    }
  }, []);

  return (
    <div className="rounded-xl border border-studio-border bg-studio-surface/80 p-2.5">
      <p className="mb-1 text-[10px] font-semibold text-studio-text">Paper harness — scene source</p>
      <p className="mb-2 text-[9px] leading-snug text-studio-muted">
        Pick a reconstruction profile, then copy a PowerShell command to run Paper #2 or Paper #4 with
        the same ingest mode as CI. Full runbook: repo{' '}
        <code className="rounded bg-black/30 px-1">docs/holomap/RUNBOOK_PAPER_HARNESSES.md</code>
      </p>

      <label className="mb-1.5 block text-[9px] text-studio-muted">Profile</label>
      <select
        value={profileId}
        onChange={(e) => setProfileId(e.target.value as ProfileId)}
        className="mb-2 w-full rounded-lg border border-studio-border bg-studio-panel px-2 py-1.5 text-[11px] text-studio-text outline-none focus:border-studio-accent"
      >
        {PROFILES.map((p) => (
          <option key={p.id} value={p.id}>
            {p.plainName}
          </option>
        ))}
      </select>
      <p className="mb-2 text-[9px] text-studio-muted">{meta.description}</p>

      <div className="space-y-2">
        {[
          { id: 'p2', label: 'Paper #2 (SNN navigation)', cmd: paper2Cmd },
          { id: 'p4', label: 'Paper #4 (adversarial)', cmd: paper4Cmd },
        ].map((row) => (
          <div key={row.id} className="rounded-lg border border-studio-border/60 p-2">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="text-[10px] font-medium text-studio-text">{row.label}</span>
              <button
                type="button"
                onClick={() => copy(row.id, row.cmd)}
                className="flex items-center gap-1 rounded-md border border-studio-border px-2 py-0.5 text-[9px] text-studio-muted hover:border-studio-accent hover:text-studio-accent"
              >
                {copied === row.id ? (
                  <CheckCircle className="h-3 w-3 text-green-400" />
                ) : (
                  <ClipboardCopy className="h-3 w-3" />
                )}
                Copy
              </button>
            </div>
            <pre className="max-h-24 overflow-auto whitespace-pre-wrap break-all text-[8px] leading-tight text-studio-muted">
              {row.cmd}
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
}
