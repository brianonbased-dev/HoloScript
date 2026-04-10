'use client';

/**
 * Deploy Workflow Modal
 *
 * Configure and deploy a workflow to the cloud
 */

import { useState } from 'react';
import { X, Cloud, AlertCircle, CheckCircle } from 'lucide-react';
import { useDeploy } from '@/lib/cloud/hooks';
import { useOrchestrationStore } from '@/lib/orchestrationStore';
import type { CloudProvider, DeploymentConfig } from '@/lib/cloud/types';

interface DeployWorkflowModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export function DeployWorkflowModal({ onClose, onSuccess }: DeployWorkflowModalProps) {
  const { workflows } = useOrchestrationStore();
  const { deploy, deploying, error } = useDeploy();

  const [config, setConfig] = useState<Partial<DeploymentConfig>>({
    name: '',
    workflowId: '',
    target: {
      provider: 'aws-lambda',
      region: 'us-east-1',
      runtime: 'nodejs20.x',
      memory: 512,
      timeout: 30,
    },
    endpoint: '',
    auth: {
      type: 'api-key',
    },
    env: {},
  });

  const [showSuccess, setShowSuccess] = useState(false);

  const workflowsList = Array.from(workflows.values());

  const handleDeploy = async () => {
    if (!config.name || !config.workflowId || !config.target) {
      return;
    }

    try {
      await deploy(config as DeploymentConfig);
      setShowSuccess(true);
      setTimeout(() => {
        onSuccess();
      }, 2000);
    } catch (err) {
      // Error handled by hook
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl rounded-xl border border-studio-border bg-studio-panel shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-studio-border px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-sky-500/20 p-2">
              <Cloud className="h-5 w-5 text-sky-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-studio-text">Deploy Workflow</h2>
              <p className="text-[10px] text-studio-muted">
                Deploy your workflow as a serverless function
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-studio-muted transition hover:bg-studio-surface hover:text-studio-text"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="max-h-[70vh] overflow-y-auto p-6">
          {showSuccess ? (
            <div className="flex flex-col items-center justify-center gap-4 py-12">
              <div className="rounded-full bg-emerald-500/20 p-4">
                <CheckCircle className="h-12 w-12 text-emerald-400" />
              </div>
              <div className="text-center">
                <h3 className="text-lg font-semibold text-studio-text">Deployment Started!</h3>
                <p className="text-sm text-studio-muted mt-1">
                  Your workflow is being deployed to the cloud
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Error */}
              {error && (
                <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 shrink-0" />
                    <p>{error}</p>
                  </div>
                </div>
              )}

              {/* Deployment name */}
              <div>
                <label className="mb-2 block text-sm font-medium text-studio-text">
                  Deployment Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={config.name}
                  onChange={(e) => setConfig({ ...config, name: e.target.value })}
                  placeholder="my-workflow-prod"
                  className="w-full rounded-lg border border-studio-border bg-studio-surface px-3 py-2 text-sm text-studio-text placeholder-studio-muted focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
              </div>

              {/* Workflow selection */}
              <div>
                <label className="mb-2 block text-sm font-medium text-studio-text">
                  Workflow <span className="text-red-400">*</span>
                </label>
                <select
                  value={config.workflowId}
                  onChange={(e) => setConfig({ ...config, workflowId: e.target.value })}
                  className="w-full rounded-lg border border-studio-border bg-studio-surface px-3 py-2 text-sm text-studio-text focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                >
                  <option value="">Select a workflow...</option>
                  {workflowsList.map((wf) => (
                    <option key={wf.id} value={wf.id}>
                      {wf.name || wf.id}
                    </option>
                  ))}
                </select>
                {workflowsList.length === 0 && (
                  <p className="mt-1 text-xs text-yellow-400">
                    No workflows available. Create a workflow first.
                  </p>
                )}
              </div>

              {/* Cloud provider */}
              <div>
                <label className="mb-2 block text-sm font-medium text-studio-text">
                  Cloud Provider <span className="text-red-400">*</span>
                </label>
                <select
                  value={config.target?.provider}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      target: { ...config.target!, provider: e.target.value as CloudProvider },
                    })
                  }
                  className="w-full rounded-lg border border-studio-border bg-studio-surface px-3 py-2 text-sm text-studio-text focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                >
                  <option value="aws-lambda">AWS Lambda</option>
                  <option value="cloudflare-workers">Cloudflare Workers</option>
                  <option value="vercel-edge">Vercel Edge Functions</option>
                  <option value="deno-deploy">Deno Deploy</option>
                </select>
              </div>

              {/* Region (AWS only) */}
              {config.target?.provider === 'aws-lambda' && (
                <div>
                  <label className="mb-2 block text-sm font-medium text-studio-text">Region</label>
                  <select
                    value={config.target.region}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        target: { ...config.target!, region: e.target.value },
                      })
                    }
                    className="w-full rounded-lg border border-studio-border bg-studio-surface px-3 py-2 text-sm text-studio-text focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  >
                    <option value="us-east-1">US East (N. Virginia)</option>
                    <option value="us-west-2">US West (Oregon)</option>
                    <option value="eu-west-1">EU (Ireland)</option>
                    <option value="ap-southeast-1">Asia Pacific (Singapore)</option>
                  </select>
                </div>
              )}

              {/* Memory & Timeout */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-studio-text">
                    Memory (MB)
                  </label>
                  <input
                    type="number"
                    value={config.target?.memory}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        target: { ...config.target!, memory: parseInt(e.target.value) },
                      })
                    }
                    min={128}
                    max={3072}
                    step={128}
                    className="w-full rounded-lg border border-studio-border bg-studio-surface px-3 py-2 text-sm text-studio-text focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-studio-text">
                    Timeout (seconds)
                  </label>
                  <input
                    type="number"
                    value={config.target?.timeout}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        target: { ...config.target!, timeout: parseInt(e.target.value) },
                      })
                    }
                    min={1}
                    max={900}
                    className="w-full rounded-lg border border-studio-border bg-studio-surface px-3 py-2 text-sm text-studio-text focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                </div>
              </div>

              {/* Authentication */}
              <div>
                <label className="mb-2 block text-sm font-medium text-studio-text">
                  Authentication
                </label>
                <select
                  value={config.auth?.type}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      auth: {
                        ...config.auth,
                        type: e.target.value as 'api-key' | 'jwt' | 'oauth' | 'none',
                      },
                    })
                  }
                  className="w-full rounded-lg border border-studio-border bg-studio-surface px-3 py-2 text-sm text-studio-text focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                >
                  <option value="api-key">API Key</option>
                  <option value="jwt">JWT Token</option>
                  <option value="oauth">OAuth 2.0</option>
                  <option value="none">No Authentication</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {!showSuccess && (
          <div className="flex items-center justify-end gap-3 border-t border-studio-border px-6 py-4">
            <button
              onClick={onClose}
              disabled={deploying}
              className="rounded-lg px-4 py-2 text-sm font-medium text-studio-muted transition hover:bg-studio-surface hover:text-studio-text disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleDeploy}
              disabled={deploying || !config.name || !config.workflowId}
              className="flex items-center gap-2 rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {deploying ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Deploying...
                </>
              ) : (
                <>
                  <Cloud className="h-4 w-4" />
                  Deploy
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
