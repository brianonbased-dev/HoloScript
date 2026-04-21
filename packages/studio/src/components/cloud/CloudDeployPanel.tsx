'use client';

/**
 * Cloud Deployment Panel
 *
 * Deploy workflows to serverless platforms (AWS Lambda, Cloudflare Workers, etc.)
 */

import { useState } from 'react';
import {
  X,
  Cloud,
  Plus,
  RefreshCw,
  Trash2,
  ExternalLink,
  Activity,
  DollarSign,
  AlertCircle,
} from 'lucide-react';
import { useDeployments, useDeploy, useDeployment, useCloudHealth } from '@/lib/cloud/hooks';
import type { Deployment, CloudProvider } from '@/lib/cloud/types';
import { DeploymentCard } from './DeploymentCard';
import { DeployWorkflowModal } from './DeployWorkflowModal';
import { DeploymentDetailsModal } from './DeploymentDetailsModal';

interface CloudDeployPanelProps {
  onClose: () => void;
}

export function CloudDeployPanel({ onClose }: CloudDeployPanelProps) {
  const { deployments, loading, error, refresh } = useDeployments();
  const { status: cloudStatus } = useCloudHealth();
  const [showDeployModal, setShowDeployModal] = useState(false);
  const [selectedDeployment, setSelectedDeployment] = useState<Deployment | null>(null);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-studio-panel">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-studio-border px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-sky-500/20 p-2">
            <Cloud className="h-5 w-5 text-sky-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-studio-text">Cloud Deployments</h2>
            <div className="flex items-center gap-2">
              <p className="text-[10px] text-studio-muted">{deployments.length} deployments</p>
              <span
                className={`h-2 w-2 rounded-full ${
                  cloudStatus === 'healthy'
                    ? 'bg-emerald-500'
                    : cloudStatus === 'degraded'
                      ? 'bg-yellow-500'
                      : cloudStatus === 'down'
                        ? 'bg-red-500'
                        : 'bg-gray-500'
                }`}
                title={`Cloud status: ${cloudStatus}`}
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Refresh */}
          <button
            onClick={refresh}
            disabled={loading}
            className="rounded-lg p-2 text-studio-muted transition hover:bg-studio-surface hover:text-studio-text disabled:opacity-50"
            title="Refresh deployments"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          {/* Deploy new */}
          <button
            onClick={() => setShowDeployModal(true)}
            className="flex items-center gap-2 rounded-lg bg-sky-500/20 px-3 py-2 text-xs font-semibold text-sky-400 transition hover:bg-sky-500/30"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Deploy Workflow</span>
          </button>

          {/* Close */}
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-studio-muted transition hover:bg-studio-surface hover:text-studio-text"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Cloud service offline */}
        {cloudStatus === 'down' && (
          <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <div>
                <p className="font-semibold">Cloud Service Offline</p>
                <p className="text-xs text-red-400/80 mt-1">
                  Unable to connect to HoloScript Cloud. Deployments may not be accessible.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && deployments.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-sky-500 border-t-transparent" />
          </div>
        )}

        {/* Empty state */}
        {!loading && deployments.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <div className="rounded-full bg-studio-surface p-6">
              <Cloud className="h-12 w-12 text-studio-muted" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-studio-text">No deployments yet</h3>
              <p className="text-sm text-studio-muted mt-1">
                Deploy your workflows to the cloud as serverless functions
              </p>
            </div>
            <button
              onClick={() => setShowDeployModal(true)}
              className="mt-2 flex items-center gap-2 rounded-lg bg-sky-500/20 px-4 py-2 text-sm font-semibold text-sky-400 transition hover:bg-sky-500/30"
            >
              <Plus className="h-4 w-4" />
              Deploy Your First Workflow
            </button>
          </div>
        )}

        {/* Deployments grid */}
        {deployments.length > 0 && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {deployments.map((deployment) => (
              <DeploymentCard
                key={deployment.id}
                deployment={deployment}
                onClick={() => setSelectedDeployment(deployment)}
                onRefresh={refresh}
              />
            ))}
          </div>
        )}
      </div>

      {/* Deploy workflow modal */}
      {showDeployModal && (
        <DeployWorkflowModal
          onClose={() => setShowDeployModal(false)}
          onSuccess={() => {
            setShowDeployModal(false);
            refresh();
          }}
        />
      )}

      {/* Deployment details modal */}
      {selectedDeployment && (
        <DeploymentDetailsModal
          deployment={selectedDeployment}
          onClose={() => setSelectedDeployment(null)}
          onUpdate={() => {
            refresh();
            setSelectedDeployment(null);
          }}
        />
      )}
    </div>
  );
}
