'use client';

/**
 * DeployButton — Compile → Safety Gate → Install into HoloLand
 *
 * One-click deploy flow:
 * 1. Parse current code to extract traits and objects
 * 2. Run safety pass to get SafetyReport
 * 3. Run gateCheck against default world policy
 * 4. If allowed, create marketplace submission and install
 * 5. Show status feedback (Deploying... → Deployed ✓ / Blocked ✗)
 */

import React, { useState, useCallback } from 'react';
import * as CoreModule from '@holoscript/core';
import { STATUS_RESET_DURATION, SAVE_FEEDBACK_DURATION } from '@/lib/ui-timings';
import { extractTraits } from '@holoscript/std';

const CoreModuleRecord = CoreModule as unknown as Record<string, (...args: unknown[]) => unknown>;
const runSafetyPass = CoreModuleRecord.runSafetyPass as (nodes: unknown[], opts: Record<string, unknown>) => { report: { verdict: string; dangerScore: number } };
const createSubmission = CoreModuleRecord.createSubmission as (pkg: unknown) => { status: string };
const verifySubmission = CoreModuleRecord.verifySubmission as (sub: { status: string }) => void;
const publishSubmission = CoreModuleRecord.publishSubmission as (sub: { status: string }) => void;
const gateCheck = CoreModuleRecord.gateCheck as (manifest: unknown, report: unknown, level: number) => { allowed: boolean; warnings?: string[] };

interface MarketplacePackage {
  metadata: Record<string, unknown>;
  nodes: unknown[];
  assets: unknown[];
  bundleSizeBytes: number;
}

// ═══════════════════════════════════════════════════════════════════

interface DeployButtonProps {
  /** Current HoloScript code */
  code: string;
  /** Target world ID */
  worldId?: string;
  /** Package name for deployment */
  packageName?: string;
  /** MarketplaceRegistry instance to install into (optional) */
  registry?: { publish: (sub: unknown) => void; install: (id: string, worldId: string) => void };
}

type DeployStatus = 'idle' | 'deploying' | 'success' | 'blocked' | 'error';

const STATUS_STYLES: Record<DeployStatus, { bg: string; text: string; label: string }> = {
  idle: {
    bg: 'bg-studio-accent/20 hover:bg-studio-accent/30',
    text: 'text-studio-accent',
    label: '🚀 Deploy to HoloLand',
  },
  deploying: { bg: 'bg-amber-500/20', text: 'text-amber-400', label: '⟳ Deploying...' },
  success: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', label: '✓ Deployed!' },
  blocked: { bg: 'bg-red-500/20', text: 'text-red-400', label: '✗ Blocked by Safety Gate' },
  error: { bg: 'bg-red-500/20', text: 'text-red-400', label: '✗ Deploy Failed' },
};

export function DeployButton({
  code,
  worldId = 'default',
  packageName = 'my-scene',
  registry,
}: DeployButtonProps) {
  const [status, setStatus] = useState<DeployStatus>('idle');
  const [message, setMessage] = useState('');

  const deploy = useCallback(() => {
    if (status === 'deploying') return;
    setStatus('deploying');
    setMessage('');

    try {
      // 1. Extract traits and build nodes
      const traits = extractTraits(code);
      const nodes = [
        {
          type: 'object' as const,
          name: packageName,
          traits,
          calls: [],
          declaredEffects: traits.map(() => 'render:spawn'),
        },
      ];

      // 2. Run safety pass
      const safetyResult = runSafetyPass(nodes, {
        moduleId: `deploy-${packageName}`,
        targetPlatforms: ['quest3', 'webxr'],
        trustLevel: 'basic',
        generateCertificate: true,
      });

      // 3. Gate check
      const manifest = {
        packageId: `@user/${packageName}`,
        version: { major: 1, minor: 0, patch: 0 },
        safetyVerdict: safetyResult.report.verdict,
        dangerScore: safetyResult.report.dangerScore,
        targetPlatforms: ['quest3', 'webxr'],
        installedAt: new Date().toISOString(),
      };

      const gate = gateCheck(manifest, safetyResult.report, 0);

      if (!gate.allowed) {
        setStatus('blocked');
        setMessage(gate.warnings?.join('; ') || 'Safety gate blocked deployment');
        setTimeout(() => setStatus('idle'), SAVE_FEEDBACK_DURATION);
        return;
      }

      // 4. Package and install
      const pkg: MarketplacePackage = {
        metadata: {
          id: `@user/${packageName}`,
          name: packageName,
          description: `User-deployed scene: ${packageName}`,
          category: 'world',
          version: { major: 1, minor: 0, patch: 0 },
          publisher: {
            id: 'user',
            name: 'Local User',
            did: 'did:key:local',
            verified: false,
            trustLevel: 'untrusted',
          },
          tags: ['user', 'deploy'],
          platforms: ['quest3', 'webxr'],
          license: 'private',
          dependencies: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        nodes,
        assets: [],
        bundleSizeBytes: new TextEncoder().encode(code).length,
      };

      const sub = createSubmission(pkg);
      verifySubmission(sub);

      if (sub.status === 'verified') {
        publishSubmission(sub);
        if ((sub.status as string) === 'published' && registry) {
          registry.publish(sub);
          registry.install(`@user/${packageName}`, worldId);
        }
      }

      setStatus('success');
      setMessage(`Deployed to world "${worldId}"`);
      setTimeout(() => setStatus('idle'), STATUS_RESET_DURATION);
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Unknown error');
      setTimeout(() => setStatus('idle'), SAVE_FEEDBACK_DURATION);
    }
  }, [code, packageName, worldId, registry, status]);

  const style = STATUS_STYLES[status];

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={deploy}
        disabled={status === 'deploying' || !code.trim()}
        className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md transition font-medium ${style.bg} ${style.text} disabled:opacity-40 disabled:cursor-not-allowed`}
        title={message || style.label}
      >
        {style.label}
      </button>
      {message && status !== 'idle' && (
        <span className={`text-[10px] ${style.text} opacity-80 max-w-[200px] truncate`}>
          {message}
        </span>
      )}
    </div>
  );
}
