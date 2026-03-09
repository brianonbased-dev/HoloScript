'use client';

/**
 * Deployment Card Component
 *
 * Displays deployment summary with status, metrics, and quick actions
 */

import { ExternalLink, Activity, AlertCircle, CheckCircle, Clock, Zap } from 'lucide-react';
import type { Deployment } from '@/lib/cloud/types';

interface DeploymentCardProps {
  deployment: Deployment;
  onClick: () => void;
  onRefresh: () => void;
}

export function DeploymentCard({ deployment, onClick }: DeploymentCardProps) {
  const getStatusColor = (status: Deployment['status']) => {
    switch (status) {
      case 'active':
        return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40';
      case 'pending':
      case 'building':
      case 'deploying':
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40';
      case 'failed':
        return 'bg-red-500/20 text-red-400 border-red-500/40';
      case 'archived':
        return 'bg-gray-500/20 text-gray-400 border-gray-500/40';
      default:
        return 'bg-studio-border text-studio-muted border-studio-border';
    }
  };

  const getStatusIcon = (status: Deployment['status']) => {
    switch (status) {
      case 'active':
        return <CheckCircle className="h-4 w-4" />;
      case 'pending':
      case 'building':
      case 'deploying':
        return <Clock className="h-4 w-4 animate-spin" />;
      case 'failed':
        return <AlertCircle className="h-4 w-4" />;
      default:
        return <Activity className="h-4 w-4" />;
    }
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = Date.now();
    const diff = now - timestamp;

    // Less than 1 hour ago
    if (diff < 3600000) {
      const minutes = Math.floor(diff / 60000);
      return `${minutes}m ago`;
    }

    // Less than 24 hours ago
    if (diff < 86400000) {
      const hours = Math.floor(diff / 3600000);
      return `${hours}h ago`;
    }

    // Less than 7 days ago
    if (diff < 604800000) {
      const days = Math.floor(diff / 86400000);
      return `${days}d ago`;
    }

    // Otherwise, show date
    return date.toLocaleDateString();
  };

  const getProviderLabel = (provider: string) => {
    switch (provider) {
      case 'aws-lambda':
        return 'AWS Lambda';
      case 'cloudflare-workers':
        return 'Cloudflare';
      case 'vercel-edge':
        return 'Vercel Edge';
      case 'deno-deploy':
        return 'Deno Deploy';
      default:
        return provider;
    }
  };

  return (
    <div
      onClick={onClick}
      className="group cursor-pointer rounded-lg border border-studio-border bg-studio-surface p-4 transition-all hover:border-sky-500/40 hover:shadow-lg"
    >
      {/* Header */}
      <div className="mb-3 flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-studio-text truncate group-hover:text-sky-400 transition-colors">
            {deployment.name}
          </h3>
          <p className="text-[10px] text-studio-muted mt-0.5">
            {getProviderLabel(deployment.target.provider)}
            {deployment.target.region && ` • ${deployment.target.region}`}
          </p>
        </div>

        {/* Status badge */}
        <div
          className={`flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-medium ${getStatusColor(
            deployment.status
          )}`}
        >
          {getStatusIcon(deployment.status)}
          <span className="capitalize">{deployment.status}</span>
        </div>
      </div>

      {/* Endpoint */}
      {deployment.endpoint && deployment.status === 'active' && (
        <div className="mb-3 rounded bg-studio-panel px-2 py-1.5">
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate text-[10px] text-sky-400">{deployment.endpoint}</code>
            <a
              href={deployment.endpoint}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="shrink-0 text-studio-muted hover:text-sky-400 transition-colors"
              title="Open endpoint"
            >
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      )}

      {/* Error message */}
      {deployment.status === 'failed' && deployment.error && (
        <div className="mb-3 rounded bg-red-500/10 px-2 py-1.5">
          <p className="text-[10px] text-red-400 line-clamp-2">{deployment.error}</p>
        </div>
      )}

      {/* Metadata */}
      <div className="flex items-center justify-between text-[10px] text-studio-muted">
        <div className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          <span>
            {deployment.deployedAt
              ? `Deployed ${formatDate(deployment.deployedAt)}`
              : `Created ${formatDate(deployment.createdAt)}`}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Zap className="h-3 w-3" />
          <span>v{deployment.version}</span>
        </div>
      </div>
    </div>
  );
}
