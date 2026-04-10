'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { marketplaceApi } from '@/lib/api';
import { useInstallStore } from '@/lib/store';
import { CATEGORY_LABELS, PLATFORM_LABELS } from '@/types';
import type { TraitPackage, VersionInfo, DownloadStats } from '@/types';
import {
  ArrowLeft,
  Download,
  Star,
  CheckCircle,
  ExternalLink,
  Copy,
  Check,
  Github,
  Globe,
  Calendar,
  Package,
  AlertTriangle,
  Loader2,
  ArrowDownToLine,
  FileCode,
  GitBranch,
  Box,
  BookOpen,
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { ReadmeTab } from './tabs/ReadmeTab';
import { VersionsTab } from './tabs/VersionsTab';
import { DependenciesTab } from './tabs/DependenciesTab';
import { ExamplesTab } from './tabs/ExamplesTab';

type TabId = 'readme' | 'versions' | 'dependencies' | 'examples';

export default function TraitDetailPage() {
  const params = useParams();
  const traitId = decodeURIComponent(params.id as string);

  const [activeTab, setActiveTab] = useState<TabId>('readme');
  const [copied, setCopied] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);

  const { install, isInstalling, isInstalled } = useInstallStore();
  const installing = isInstalling(traitId);
  const installed = isInstalled(traitId);

  // Fetch trait data
  const {
    data: trait,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['trait', traitId, selectedVersion],
    queryFn: () => marketplaceApi.traits.getTrait(traitId, selectedVersion || undefined),
  });

  // Fetch versions
  const { data: versions } = useQuery({
    queryKey: ['trait-versions', traitId],
    queryFn: () => marketplaceApi.traits.getVersions(traitId),
  });

  // Fetch stats
  const { data: stats } = useQuery({
    queryKey: ['trait-stats', traitId],
    queryFn: () => marketplaceApi.traits.getStats(traitId),
  });

  // Set default version
  useEffect(() => {
    if (trait && !selectedVersion) {
      setSelectedVersion(trait.version);
    }
  }, [trait, selectedVersion]);

  const handleInstall = async () => {
    if (trait) {
      await install(traitId, selectedVersion || trait.version);
    }
  };

  const handleCopyInstall = () => {
    if (trait) {
      navigator.clipboard.writeText(`holo add ${trait.name}@${selectedVersion || trait.version}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const formatDownloads = (count: number): string => {
    if (count >= 1_000_000) {
      return `${(count / 1_000_000).toFixed(1)}M`;
    }
    if (count >= 1_000) {
      return `${(count / 1_000).toFixed(1)}K`;
    }
    return count.toString();
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="animate-pulse">
          <div className="h-8 bg-zinc-200 dark:bg-zinc-700 rounded w-1/4 mb-4" />
          <div className="h-6 bg-zinc-200 dark:bg-zinc-700 rounded w-1/2 mb-8" />
          <div className="h-64 bg-zinc-200 dark:bg-zinc-700 rounded" />
        </div>
      </div>
    );
  }

  // Error state
  if (error || !trait) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center py-16">
          <Package className="h-16 w-16 mx-auto text-zinc-300 dark:text-zinc-600 mb-4" />
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white mb-2">Trait Not Found</h1>
          <p className="text-zinc-600 dark:text-zinc-400 mb-6">
            The trait &quot;{traitId}&quot; does not exist or has been removed.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2 bg-holoscript-500 hover:bg-holoscript-600 text-white rounded-lg"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Marketplace
          </Link>
        </div>
      </div>
    );
  }

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'readme', label: 'Readme', icon: <BookOpen className="h-4 w-4" /> },
    { id: 'versions', label: 'Versions', icon: <GitBranch className="h-4 w-4" /> },
    { id: 'dependencies', label: 'Dependencies', icon: <Box className="h-4 w-4" /> },
    { id: 'examples', label: 'Examples', icon: <FileCode className="h-4 w-4" /> },
  ];

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900">
      {/* Header */}
      <div className="bg-white dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Breadcrumb */}
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 mb-6"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Marketplace
          </Link>

          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
            {/* Left: Title & Meta */}
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-3xl font-bold text-zinc-900 dark:text-white">{trait.name}</h1>
                {trait.verified && (
                  <span className="flex items-center gap-1 px-2 py-1 bg-holoscript-100 dark:bg-holoscript-900/30 text-holoscript-600 dark:text-holoscript-400 text-xs font-medium rounded-full">
                    <CheckCircle className="h-3 w-3" />
                    Verified
                  </span>
                )}
                {trait.deprecated && (
                  <span className="flex items-center gap-1 px-2 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 text-xs font-medium rounded-full">
                    <AlertTriangle className="h-3 w-3" />
                    Deprecated
                  </span>
                )}
              </div>

              <p className="text-lg text-zinc-600 dark:text-zinc-400 mb-4">{trait.description}</p>

              {/* Author & Links */}
              <div className="flex flex-wrap items-center gap-4 text-sm text-zinc-500 dark:text-zinc-400">
                <Link
                  href={`/publishers/${trait.author.id}`}
                  className="flex items-center gap-2 hover:text-holoscript-500"
                >
                  {trait.author.avatar ? (
                    <img
                      src={trait.author.avatar}
                      alt={trait.author.name}
                      className="w-5 h-5 rounded-full"
                    />
                  ) : (
                    <div className="w-5 h-5 bg-holoscript-100 dark:bg-holoscript-900 rounded-full flex items-center justify-center text-xs text-holoscript-600">
                      {trait.author.name.charAt(0)}
                    </div>
                  )}
                  {trait.author.name}
                  {trait.author.verified && <CheckCircle className="h-3 w-3 text-holoscript-500" />}
                </Link>

                {trait.repository && (
                  <a
                    href={trait.repository}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 hover:text-holoscript-500"
                  >
                    <Github className="h-4 w-4" />
                    Repository
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}

                {trait.homepage && (
                  <a
                    href={trait.homepage}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 hover:text-holoscript-500"
                  >
                    <Globe className="h-4 w-4" />
                    Homepage
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}

                <span className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  Updated {formatDistanceToNow(new Date(trait.updatedAt), { addSuffix: true })}
                </span>
              </div>

              {/* Tags */}
              <div className="flex flex-wrap gap-2 mt-4">
                <span className={`category-${trait.category} text-xs px-2 py-1 rounded-full`}>
                  {CATEGORY_LABELS[trait.category]}
                </span>
                {trait.platforms.map((platform) => (
                  <span
                    key={platform}
                    className="text-xs px-2 py-1 bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400 rounded-full"
                  >
                    {PLATFORM_LABELS[platform]}
                  </span>
                ))}
                <span className="text-xs px-2 py-1 bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400 rounded-full">
                  {trait.license}
                </span>
              </div>
            </div>

            {/* Right: Install Panel */}
            <div className="lg:w-80 flex-shrink-0">
              <div className="bg-zinc-50 dark:bg-zinc-900 rounded-xl p-6 border border-zinc-200 dark:border-zinc-700">
                {/* Version Selector */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                    Version
                  </label>
                  <select
                    value={selectedVersion || trait.version}
                    onChange={(e) => setSelectedVersion(e.target.value)}
                    className="w-full py-2 px-3 bg-white dark:bg-zinc-800 
                      border border-zinc-200 dark:border-zinc-700 
                      rounded-lg text-sm text-zinc-900 dark:text-white"
                  >
                    {versions?.map((v) => (
                      <option key={v.version} value={v.version}>
                        {v.version} {v.deprecated && '(deprecated)'}
                      </option>
                    )) || <option value={trait.version}>{trait.version}</option>}
                  </select>
                </div>

                {/* Install Command */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                    Install
                  </label>
                  <div className="flex items-center bg-zinc-900 dark:bg-zinc-950 rounded-lg overflow-hidden">
                    <code className="flex-1 px-3 py-2 text-sm text-green-400 font-mono truncate">
                      holo add {trait.name}@{selectedVersion || trait.version}
                    </code>
                    <button
                      onClick={handleCopyInstall}
                      className="p-2 text-zinc-400 hover:text-white transition-colors"
                      aria-label="Copy install command"
                    >
                      {copied ? (
                        <Check className="h-4 w-4 text-green-400" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Install Button */}
                <button
                  onClick={handleInstall}
                  disabled={installing || installed}
                  className={`
                    w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-medium transition-colors
                    ${
                      installed
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                        : installing
                          ? 'bg-holoscript-100 dark:bg-holoscript-900/30 text-holoscript-600 dark:text-holoscript-400'
                          : 'bg-holoscript-500 hover:bg-holoscript-600 text-white'
                    }
                  `}
                >
                  {installed ? (
                    <>
                      <CheckCircle className="h-5 w-5" />
                      Installed
                    </>
                  ) : installing ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Installing...
                    </>
                  ) : (
                    <>
                      <ArrowDownToLine className="h-5 w-5" />
                      Install in VS Code
                    </>
                  )}
                </button>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-4 mt-6 pt-6 border-t border-zinc-200 dark:border-zinc-700">
                  <div>
                    <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400 text-xs mb-1">
                      <Download className="h-3 w-3" />
                      Downloads
                    </div>
                    <div className="text-lg font-bold text-zinc-900 dark:text-white">
                      {formatDownloads(stats?.total || trait.downloads)}
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400 text-xs mb-1">
                      <Star className="h-3 w-3" />
                      Rating
                    </div>
                    <div className="text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-1">
                      {trait.rating.toFixed(1)}
                      <span className="text-sm text-zinc-500 font-normal">
                        ({trait.ratingCount})
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex gap-6 overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  flex items-center gap-2 py-4 border-b-2 text-sm font-medium transition-colors whitespace-nowrap
                  ${
                    activeTab === tab.id
                      ? 'border-holoscript-500 text-holoscript-600 dark:text-holoscript-400'
                      : 'border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
                  }
                `}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Tab Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'readme' && <ReadmeTab trait={trait} />}
        {activeTab === 'versions' && <VersionsTab traitId={traitId} versions={versions || []} />}
        {activeTab === 'dependencies' && <DependenciesTab trait={trait} />}
        {activeTab === 'examples' && <ExamplesTab trait={trait} />}
      </div>
    </div>
  );
}
