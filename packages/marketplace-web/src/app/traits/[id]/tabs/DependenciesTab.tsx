'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import type { TraitPackage, DependencyTree } from '@/types';
import { marketplaceApi } from '@/lib/api';
import {
  Box,
  ChevronRight,
  ChevronDown,
  AlertTriangle,
  CheckCircle,
  Loader2,
  ExternalLink,
} from 'lucide-react';

interface DependenciesTabProps {
  trait: TraitPackage;
}

export function DependenciesTab({ trait }: DependenciesTabProps) {
  const dependencies = Object.entries(trait.dependencies || {});
  const peerDependencies = Object.entries(trait.peerDependencies || {});
  const hasDependencies = dependencies.length > 0 || peerDependencies.length > 0;

  // Fetch resolved dependency tree
  const { data: depTree, isLoading } = useQuery({
    queryKey: ['dependency-tree', trait.id, trait.version],
    queryFn: () => marketplaceApi.dependencies.resolve([{ id: trait.id, version: trait.version }]),
    enabled: hasDependencies,
  });

  if (!hasDependencies) {
    return (
      <div className="text-center py-16">
        <Box className="h-16 w-16 mx-auto text-zinc-300 dark:text-zinc-600 mb-4" />
        <p className="text-lg text-zinc-600 dark:text-zinc-400">No dependencies</p>
        <p className="text-sm text-zinc-500 dark:text-zinc-500 mt-2">
          This trait has no external dependencies.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-8">
      {/* Dependencies */}
      {dependencies.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4">
            Dependencies ({dependencies.length})
          </h2>
          <div className="bg-white dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden">
            {dependencies.map(([name, version], i) => (
              <DependencyItem
                key={name}
                name={name}
                version={version}
                isLast={i === dependencies.length - 1}
              />
            ))}
          </div>
        </section>
      )}

      {/* Peer Dependencies */}
      {peerDependencies.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4">
            Peer Dependencies ({peerDependencies.length})
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
            These dependencies must be installed separately in your project.
          </p>
          <div className="bg-white dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden">
            {peerDependencies.map(([name, version], i) => (
              <DependencyItem
                key={name}
                name={name}
                version={version}
                isPeer
                isLast={i === peerDependencies.length - 1}
              />
            ))}
          </div>
        </section>
      )}

      {/* Dependency Tree */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-holoscript-500" />
          <span className="ml-2 text-zinc-500">Resolving dependencies...</span>
        </div>
      ) : depTree ? (
        <section>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4">
            Dependency Tree
          </h2>

          {/* Conflicts Warning */}
          {depTree.conflicts.length > 0 && (
            <div className="mb-4 p-4 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-lg">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-medium text-amber-800 dark:text-amber-200">
                    Version Conflicts Detected
                  </h4>
                  <ul className="mt-2 space-y-1 text-sm text-amber-700 dark:text-amber-300">
                    {depTree.conflicts.map((conflict, i) => (
                      <li key={i}>
                        <strong>{conflict.traitId}</strong>: Requested versions{' '}
                        {conflict.requestedVersions
                          .map((v) => `${v.version} (by ${v.by})`)
                          .join(', ')}
                        {' → '}resolved to {conflict.resolvedVersion}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Tree Visualization */}
          <div className="bg-white dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700 p-4">
            <DependencyTreeNode nodes={depTree.nodes} level={0} />
          </div>

          {/* Flat List */}
          <div className="mt-4">
            <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-2">
              All resolved packages ({depTree.flatList.length})
            </h3>
            <div className="flex flex-wrap gap-2">
              {depTree.flatList.map((dep) => (
                <Link
                  key={`${dep.id}@${dep.version}`}
                  href={`/traits/${encodeURIComponent(dep.id)}`}
                  className="px-2 py-1 bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400 
                    hover:bg-holoscript-100 dark:hover:bg-holoscript-900/30 
                    hover:text-holoscript-600 dark:hover:text-holoscript-400 
                    text-xs font-mono rounded transition-colors"
                >
                  {dep.id}@{dep.version}
                </Link>
              ))}
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}

interface DependencyItemProps {
  name: string;
  version: string;
  isPeer?: boolean;
  isLast?: boolean;
}

function DependencyItem({ name, version, isPeer, isLast }: DependencyItemProps) {
  return (
    <div
      className={`flex items-center justify-between px-4 py-3 ${
        !isLast ? 'border-b border-zinc-100 dark:border-zinc-700' : ''
      }`}
    >
      <div className="flex items-center gap-3">
        <Box className="h-4 w-4 text-zinc-400" />
        <Link
          href={`/traits/${encodeURIComponent(name)}`}
          className="font-mono text-holoscript-600 dark:text-holoscript-400 hover:underline"
        >
          {name}
        </Link>
        {isPeer && (
          <span className="px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-700 text-zinc-500 text-xs rounded">
            peer
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span className="font-mono text-sm text-zinc-500 dark:text-zinc-400">{version}</span>
        <Link
          href={`/traits/${encodeURIComponent(name)}`}
          className="text-zinc-400 hover:text-holoscript-500"
        >
          <ExternalLink className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}

interface DependencyTreeNodeProps {
  nodes: DependencyTree['nodes'];
  level: number;
}

function DependencyTreeNode({ nodes, level }: DependencyTreeNodeProps) {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  const toggleNode = (id: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  if (nodes.length === 0) {
    return null;
  }

  return (
    <ul
      className={`space-y-1 ${level > 0 ? 'ml-4 pl-4 border-l border-zinc-200 dark:border-zinc-700' : ''}`}
    >
      {nodes.map((node) => {
        const hasChildren = node.dependencies.length > 0;
        const isExpanded = expandedNodes.has(node.id);

        return (
          <li key={`${node.id}@${node.resolvedVersion}`}>
            <div className="flex items-center gap-2 py-1">
              {hasChildren ? (
                <button
                  onClick={() => toggleNode(node.id)}
                  className="p-0.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </button>
              ) : (
                <span className="w-5" />
              )}
              <Link
                href={`/traits/${encodeURIComponent(node.id)}`}
                className="font-mono text-sm text-holoscript-600 dark:text-holoscript-400 hover:underline"
              >
                {node.id}
              </Link>
              <span className="font-mono text-xs text-zinc-400">@{node.resolvedVersion}</span>
              {node.isOptional && (
                <span className="px-1 py-0.5 bg-zinc-100 dark:bg-zinc-700 text-zinc-500 text-xs rounded">
                  optional
                </span>
              )}
              {node.isPeer && (
                <span className="px-1 py-0.5 bg-zinc-100 dark:bg-zinc-700 text-zinc-500 text-xs rounded">
                  peer
                </span>
              )}
            </div>
            {hasChildren && isExpanded && (
              <DependencyTreeNode nodes={node.dependencies} level={level + 1} />
            )}
          </li>
        );
      })}
    </ul>
  );
}
