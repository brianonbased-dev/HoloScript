'use client';

import type { VersionInfo } from '@/types';
import { useInstallStore } from '@/lib/store';
import { format, formatDistanceToNow } from 'date-fns';
import {
  Download,
  Calendar,
  AlertTriangle,
  CheckCircle,
  ArrowDownToLine,
  Loader2,
  Tag,
} from 'lucide-react';

interface VersionsTabProps {
  traitId: string;
  versions: VersionInfo[];
}

export function VersionsTab({ traitId, versions }: VersionsTabProps) {
  const { install, isInstalling, isInstalled } = useInstallStore();

  const formatDownloads = (count: number): string => {
    if (count >= 1_000_000) {
      return `${(count / 1_000_000).toFixed(1)}M`;
    }
    if (count >= 1_000) {
      return `${(count / 1_000).toFixed(1)}K`;
    }
    return count.toString();
  };

  const handleInstall = async (version: string) => {
    await install(traitId, version);
  };

  if (versions.length === 0) {
    return (
      <div className="text-center py-16">
        <Tag className="h-16 w-16 mx-auto text-zinc-300 dark:text-zinc-600 mb-4" />
        <p className="text-lg text-zinc-600 dark:text-zinc-400">No versions available</p>
      </div>
    );
  }

  // Group versions by major version
  const groupedVersions = versions.reduce(
    (acc, version) => {
      const major = version.version.split('.')[0];
      if (!acc[major]) {
        acc[major] = [];
      }
      acc[major].push(version);
      return acc;
    },
    {} as Record<string, VersionInfo[]>
  );

  const latestVersion = versions[0]?.version;

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-white mb-2">
          Version History
        </h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {versions.length} version{versions.length === 1 ? '' : 's'} published
        </p>
      </div>

      <div className="space-y-6">
        {Object.entries(groupedVersions)
          .sort(([a], [b]) => parseInt(b) - parseInt(a))
          .map(([major, versionList]) => (
            <div key={major}>
              <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-3">
                {major}.x
              </h3>
              <div className="space-y-2">
                {versionList.map((version) => {
                  const installing = isInstalling(traitId);
                  const installed = isInstalled(traitId);
                  const isLatest = version.version === latestVersion;

                  return (
                    <div
                      key={version.version}
                      className={`
                        flex items-center justify-between p-4 rounded-lg border transition-colors
                        ${
                          version.deprecated
                            ? 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800'
                            : 'bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700'
                        }
                      `}
                    >
                      <div className="flex items-center gap-4">
                        {/* Version */}
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-medium text-zinc-900 dark:text-white">
                            v{version.version}
                          </span>
                          {isLatest && (
                            <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-medium rounded-full">
                              Latest
                            </span>
                          )}
                          {version.deprecated && (
                            <span className="flex items-center gap-1 px-2 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-xs font-medium rounded-full">
                              <AlertTriangle className="h-3 w-3" />
                              Deprecated
                            </span>
                          )}
                        </div>

                        {/* Date */}
                        <div className="flex items-center gap-1.5 text-sm text-zinc-500 dark:text-zinc-400">
                          <Calendar className="h-4 w-4" />
                          <span title={format(new Date(version.publishedAt), 'PPpp')}>
                            {formatDistanceToNow(new Date(version.publishedAt), {
                              addSuffix: true,
                            })}
                          </span>
                        </div>

                        {/* Downloads */}
                        <div className="flex items-center gap-1.5 text-sm text-zinc-500 dark:text-zinc-400">
                          <Download className="h-4 w-4" />
                          <span>{formatDownloads(version.downloads)}</span>
                        </div>
                      </div>

                      {/* Install Button */}
                      <button
                        onClick={() => handleInstall(version.version)}
                        disabled={installing || installed || version.deprecated}
                        className={`
                          flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
                          ${
                            installed
                              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                              : version.deprecated
                                ? 'bg-zinc-100 dark:bg-zinc-700 text-zinc-400 cursor-not-allowed'
                                : installing
                                  ? 'bg-holoscript-100 dark:bg-holoscript-900/30 text-holoscript-600 dark:text-holoscript-400'
                                  : 'bg-holoscript-500 hover:bg-holoscript-600 text-white'
                          }
                        `}
                      >
                        {installed ? (
                          <>
                            <CheckCircle className="h-4 w-4" />
                            Installed
                          </>
                        ) : installing ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Installing
                          </>
                        ) : (
                          <>
                            <ArrowDownToLine className="h-4 w-4" />
                            Install
                          </>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
      </div>

      {/* Deprecation Notice */}
      {versions.some((v) => v.deprecated) && (
        <div className="mt-8 p-4 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-lg">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-medium text-amber-800 dark:text-amber-200">
                Some versions are deprecated
              </h4>
              <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                Deprecated versions may have known issues or security vulnerabilities. Consider
                upgrading to the latest version.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
