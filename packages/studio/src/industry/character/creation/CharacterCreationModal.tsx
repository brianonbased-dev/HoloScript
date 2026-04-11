'use client';

/**
 * CharacterCreationModal — Multi-Path Character & Avatar Creation System
 *
 * MEME-018: In-house character creation system (CRITICAL)
 * Priority: Critical | Estimate: 20 hours
 *
 * Creation Paths:
 * 1. AI Generation (Meshy, Rodin) - Text/image → 3D
 * 2. VRoid Import - VRM file support
 * 3. Mixamo - Auto-rigging + character library
 * 4. Preset Models - Hosted GLB files (Pepe, Wojak, etc.)
 * 5. Sketchfab - Search 3M+ models
 * 6. Upload - Drag & drop GLB/GLTF/VRM
 *
 * NO DEPENDENCIES on defunct services (ReadyPlayerMe is gone)
 */

import { useState } from 'react';
import { X, Sparkles, Upload, Library, Search, Cpu, User, _Zap, Settings, Key } from 'lucide-react';
import APIKeysPanel, { hasAPIKey } from '@/components/settings/APIKeysPanel';
import { logger } from '@/lib/logger';

interface CharacterCreationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCharacterCreated: (glbUrl: string, metadata?: CharacterMetadata) => void;
}

export interface CharacterMetadata {
  name?: string;
  source: 'ai' | 'vroid' | 'mixamo' | 'preset' | 'sketchfab' | 'upload';
  templateId?: string;
  thumbnailUrl?: string;
  credits?: string;
}

type CreationTab = 'presets' | 'ai' | 'vroid' | 'mixamo' | 'sketchfab' | 'upload';

const TABS: Array<{
  id: CreationTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  badge?: string;
  badgeType?: 'free' | 'key' | 'guide';
}> = [
  {
    id: 'presets',
    label: 'Meme Templates',
    icon: Library,
    description: 'Instant meme characters (Pepe, Wojak, Doge)',
    badge: 'FREE',
    badgeType: 'free',
  },
  {
    id: 'ai',
    label: 'AI Generate',
    icon: Sparkles,
    description: 'Text/image → 3D character (bring your own API key)',
    badge: '🔑 KEY',
    badgeType: 'key',
  },
  {
    id: 'mixamo',
    label: 'Mixamo',
    icon: User,
    description: 'Auto-rig models + character library (manual guide)',
    badge: '📖 GUIDE',
    badgeType: 'guide',
  },
  {
    id: 'vroid',
    label: 'VRoid Import',
    icon: Cpu,
    description: 'Import VRM avatars from VRoid Hub',
    badge: 'FREE',
    badgeType: 'free',
  },
  {
    id: 'sketchfab',
    label: 'Sketchfab',
    icon: Search,
    description: 'Search 3M+ characters (bring your own API key)',
    badge: '🔑 KEY',
    badgeType: 'key',
  },
  {
    id: 'upload',
    label: 'Upload File',
    icon: Upload,
    description: 'Drag & drop GLB/GLTF/VRM',
    badge: 'FREE',
    badgeType: 'free',
  },
];

export function CharacterCreationModal({
  isOpen,
  onClose,
  onCharacterCreated,
}: CharacterCreationModalProps) {
  const [activeTab, setActiveTab] = useState<CreationTab>('presets');
  const [isLoading, setIsLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  if (!isOpen) return null;

  const handleCharacterCreated = (glbUrl: string, metadata?: CharacterMetadata) => {
    onCharacterCreated(glbUrl, metadata);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="relative flex h-[85vh] w-[90vw] max-w-6xl flex-col overflow-hidden rounded-2xl border border-purple-500/30 bg-studio-panel shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-studio-border bg-black/40 p-6">
          <div>
            <h2 className="text-2xl font-bold text-white">Create Character</h2>
            <p className="mt-1 text-sm text-studio-muted">
              <span className="text-purple-400">HoloScript Studio</span> — Build with Brittney
              (free) or upgrade for AI vision model (Pro)
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                showSettings
                  ? 'border-purple-500 bg-purple-500/20 text-purple-300'
                  : 'border-studio-border bg-black/20 text-studio-muted hover:border-purple-500/40 hover:text-white'
              }`}
            >
              <Settings className="h-4 w-4" />
              <span>API Keys</span>
            </button>
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-studio-muted transition-colors hover:bg-white/5 hover:text-white"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="border-b border-studio-border bg-black/20 px-6">
          <div className="flex gap-2 overflow-x-auto py-3">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;

              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`group relative flex items-center gap-2 whitespace-nowrap rounded-lg border px-4 py-2.5 text-sm font-medium transition-all ${
                    isActive
                      ? 'border-purple-500 bg-purple-500/20 text-purple-300'
                      : 'border-studio-border bg-black/20 text-studio-muted hover:border-purple-500/40 hover:text-white'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{tab.label}</span>
                  {tab.badge && (
                    <span
                      className={`ml-1 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                        tab.badgeType === 'free'
                          ? isActive
                            ? 'bg-green-500 text-white'
                            : 'bg-green-500/20 text-green-400 group-hover:bg-green-500/30'
                          : tab.badgeType === 'key'
                            ? isActive
                              ? 'bg-blue-500 text-white'
                              : 'bg-blue-500/20 text-blue-400 group-hover:bg-blue-500/30'
                            : tab.badgeType === 'guide'
                              ? isActive
                                ? 'bg-orange-500 text-white'
                                : 'bg-orange-500/20 text-orange-400 group-hover:bg-orange-500/30'
                              : isActive
                                ? 'bg-purple-500 text-white'
                                : 'bg-studio-border text-studio-muted group-hover:bg-purple-500/30'
                      }`}
                    >
                      {tab.badge}
                    </span>
                  )}

                  {/* Tooltip */}
                  <div className="pointer-events-none absolute -bottom-12 left-1/2 z-10 hidden -translate-x-1/2 rounded-lg border border-studio-border bg-studio-panel px-3 py-2 text-xs text-white opacity-0 shadow-xl transition-opacity group-hover:block group-hover:opacity-100">
                    {tab.description}
                    <div className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 border-l border-t border-studio-border bg-studio-panel" />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {showSettings ? (
            <APIKeysPanel onClose={() => setShowSettings(false)} />
          ) : (
            <>
              {activeTab === 'presets' && (
                <PresetModelsTab
                  onCharacterCreated={handleCharacterCreated}
                  isLoading={isLoading}
                  setIsLoading={setIsLoading}
                />
              )}
              {activeTab === 'ai' && (
                <AIGenerationTab
                  onCharacterCreated={handleCharacterCreated}
                  isLoading={isLoading}
                  setIsLoading={setIsLoading}
                  onOpenSettings={() => setShowSettings(true)}
                />
              )}
              {activeTab === 'mixamo' && (
                <MixamoTab
                  onCharacterCreated={handleCharacterCreated}
                  isLoading={isLoading}
                  setIsLoading={setIsLoading}
                />
              )}
              {activeTab === 'vroid' && (
                <VRoidTab
                  onCharacterCreated={handleCharacterCreated}
                  isLoading={isLoading}
                  setIsLoading={setIsLoading}
                />
              )}
              {activeTab === 'sketchfab' && (
                <SketchfabTab
                  onCharacterCreated={handleCharacterCreated}
                  isLoading={isLoading}
                  setIsLoading={setIsLoading}
                  onOpenSettings={() => setShowSettings(true)}
                />
              )}
              {activeTab === 'upload' && (
                <UploadTab
                  onCharacterCreated={handleCharacterCreated}
                  isLoading={isLoading}
                  setIsLoading={setIsLoading}
                />
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-studio-border bg-black/40 p-4">
          <div className="flex items-center justify-between text-xs">
            <p className="text-studio-muted">
              💡 <span className="font-semibold text-studio-text">Free:</span>{' '}
              <span className="text-green-400">Meme Templates</span>,{' '}
              <span className="text-green-400">Upload</span>,{' '}
              <span className="text-green-400">VRoid</span>
            </p>
            <p className="text-studio-muted">
              🔑 <span className="font-semibold text-studio-text">Bring Your Keys:</span>{' '}
              <span className="text-blue-400">AI Generate</span>,{' '}
              <span className="text-blue-400">Sketchfab</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Tab Components ──────────────────────────────────────────────────────────

interface TabProps {
  onCharacterCreated: (glbUrl: string, metadata?: CharacterMetadata) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  onOpenSettings?: () => void;
}

/**
 * Preset Models Tab - Hosted GLB files for meme templates
 */
function PresetModelsTab({ onCharacterCreated, isLoading, setIsLoading }: TabProps) {
  const [presetModels, setPresetModels] = useState<any[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<'all' | string>('all');

  useState(() => {
    // Load preset models
    import('@/lib/presetModels').then(({ getAllPresetModels }) => {
      const models = getAllPresetModels();
      setPresetModels(models);
    });
  });

  const filteredModels =
    categoryFilter === 'all'
      ? presetModels
      : presetModels.filter((m) => m.category === categoryFilter);

  const handleSelectModel = async (model: any) => {
    setIsLoading(true);

    try {
      logger.debug('[CharacterCreation] Loading preset model:', model.name);

      onCharacterCreated(model.glbUrl, {
        name: model.name,
        source: 'preset',
        templateId: model.id,
        thumbnailUrl: model.thumbnailUrl,
        credits: model.credits,
      });
    } catch (error) {
      logger.error('[CharacterCreation] Failed to load preset model:', error);
      alert('Failed to load character. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h3 className="text-lg font-bold text-white">Instant Meme Characters</h3>
        <p className="mt-1 text-sm text-studio-muted">
          Pre-rigged, ready to animate. Click to load instantly.
        </p>
      </div>

      {/* Category Filter */}
      <div className="mb-6 flex flex-wrap gap-2">
        {(['all', 'classic', 'viral', 'trending', 'custom'] as const).map((cat) => (
          <button
            key={cat}
            onClick={() => setCategoryFilter(cat)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
              categoryFilter === cat
                ? 'border-purple-500 bg-purple-500/20 text-purple-300'
                : 'border-studio-border bg-black/20 text-studio-muted hover:border-purple-500/40'
            }`}
          >
            {cat === 'all' ? 'All' : cat.charAt(0).toUpperCase() + cat.slice(1)}
          </button>
        ))}
      </div>

      {/* Preset Models Grid */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {filteredModels.map((model) => (
          <button
            key={model.id}
            onClick={() => handleSelectModel(model)}
            disabled={isLoading}
            className="group relative flex aspect-square flex-col overflow-hidden rounded-xl border border-studio-border bg-black/20 transition-all hover:border-purple-500 hover:shadow-lg hover:shadow-purple-500/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {/* Thumbnail */}
            <div className="relative flex-1 overflow-hidden bg-gradient-to-br from-purple-500/10 to-blue-500/10">
              <div className="flex h-full items-center justify-center text-6xl">{model.emoji}</div>

              {/* Popularity Badge */}
              <div className="absolute right-2 top-2 flex gap-0.5">
                {Array.from({ length: model.popularity }).map((_, i) => (
                  <div key={i} className="h-1.5 w-1.5 rounded-full bg-yellow-400" />
                ))}
              </div>
            </div>

            {/* Info */}
            <div className="border-t border-studio-border bg-black/40 p-3">
              <p className="font-semibold text-white group-hover:text-purple-300">{model.name}</p>
              <p className="mt-0.5 text-xs text-studio-muted">{model.description}</p>

              {/* Stats */}
              <div className="mt-2 flex items-center justify-between text-[10px] text-studio-muted">
                <span>{model.fileSize}</span>
                <span>{model.polyCount}</span>
              </div>
            </div>

            {/* Hover Overlay */}
            <div className="absolute inset-0 flex items-center justify-center bg-purple-500/10 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">
              <div className="rounded-lg bg-purple-500 px-4 py-2 text-sm font-semibold text-white">
                Load Character
              </div>
            </div>
          </button>
        ))}

        {filteredModels.length === 0 && (
          <div className="col-span-full flex aspect-square items-center justify-center rounded-xl border-2 border-dashed border-studio-border bg-black/20">
            <p className="text-sm text-studio-muted">No characters found in this category</p>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * AI Generation Tab - Meshy/Rodin integration
 */
function AIGenerationTab({
  onCharacterCreated,
  isLoading,
  setIsLoading,
  onOpenSettings,
}: TabProps) {
  const [prompt, setPrompt] = useState('');
  const [provider, setProvider] = useState<'meshy' | 'rodin'>('meshy');
  const [style, setStyle] = useState<'realistic' | 'stylized' | 'anime' | 'cartoon'>('stylized');
  const [quality, setQuality] = useState<'draft' | 'standard' | 'high'>('standard');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [generationStatus, setGenerationStatus] = useState<any>(null);
  const [taskId, setTaskId] = useState<string | null>(null);

  // Check for API keys
  const hasMeshyKey = hasAPIKey('meshy');
  const hasRodinKey = hasAPIKey('rodin');
  const hasAnyKey = hasMeshyKey || hasRodinKey;

  // Poll generation status
  useState(() => {
    if (
      !taskId ||
      !generationStatus ||
      generationStatus.status === 'completed' ||
      generationStatus.status === 'failed'
    ) {
      return;
    }

    const pollInterval = setInterval(async () => {
      try {
        const { pollGenerationStatus } = await import('@/lib/aiCharacterGeneration');
        const status = await pollGenerationStatus(provider, taskId);
        setGenerationStatus(status);

        if (status.status === 'completed' || status.status === 'failed') {
          clearInterval(pollInterval);
          setIsLoading(false);
        }
      } catch (error) {
        logger.error('[AIGeneration] Polling error:', error);
        clearInterval(pollInterval);
        setIsLoading(false);
      }
    }, 3000); // Poll every 3 seconds

    return () => clearInterval(pollInterval);
  });

  const handleGenerate = async () => {
    if (!prompt) return;

    setIsLoading(true);
    setGenerationStatus({ status: 'pending', progress: 0 });

    try {
      const { startGeneration, imageToDataUrl, validatePrompt } =
        await import('@/lib/aiCharacterGeneration');

      // Validate prompt
      const validation = validatePrompt(prompt);
      if (!validation.valid) {
        alert(validation.error);
        setIsLoading(false);
        return;
      }

      // Convert image to data URL if provided
      let imageUrl: string | undefined;
      if (imageFile) {
        imageUrl = await imageToDataUrl(imageFile);
      }

      // Start generation
      const id = await startGeneration({
        provider,
        prompt,
        imageUrl,
        style,
        quality,
      });

      setTaskId(id);
      logger.debug('[AIGeneration] Started generation:', id);
    } catch (error) {
      logger.error('[AIGeneration] Failed to start:', error);
      alert('Failed to start generation. Please check your API configuration.');
      setIsLoading(false);
      setGenerationStatus(null);
    }
  };

  const handleUseGenerated = () => {
    if (!generationStatus?.glbUrl) return;

    onCharacterCreated(generationStatus.glbUrl, {
      name: prompt.slice(0, 50),
      source: 'ai',
      thumbnailUrl: generationStatus.thumbnailUrl,
      credits: `Generated with ${provider}`,
    });
  };

  const handleCancel = () => {
    setGenerationStatus(null);
    setTaskId(null);
    setIsLoading(false);
  };

  // Show result preview if completed
  if (generationStatus?.status === 'completed' && generationStatus.glbUrl) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 text-center">
          <h3 className="text-lg font-bold text-white">✨ Generation Complete!</h3>
          <p className="mt-1 text-sm text-studio-muted">
            Your character is ready. Click below to load it into the scene.
          </p>
        </div>

        <div className="overflow-hidden rounded-xl border border-purple-500/30 bg-black/20">
          {/* Preview Image */}
          {generationStatus.thumbnailUrl && (
            <img
              src={generationStatus.thumbnailUrl}
              alt="Generated character"
              className="h-64 w-full object-cover"
            />
          )}

          {/* Info */}
          <div className="border-t border-studio-border bg-black/40 p-4">
            <p className="text-sm text-studio-muted">
              <span className="font-semibold text-white">Prompt:</span> {prompt}
            </p>
            <p className="mt-1 text-xs text-studio-muted">
              Style: {style} • Quality: {quality} • Provider: {provider}
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-3 border-t border-studio-border bg-black/40 p-4">
            <button
              onClick={handleUseGenerated}
              className="flex-1 rounded-lg bg-purple-500 py-2.5 font-semibold text-white transition-all hover:bg-purple-600"
            >
              Use This Character
            </button>
            <button
              onClick={handleCancel}
              className="rounded-lg border border-studio-border bg-black/20 px-4 py-2.5 text-sm text-studio-muted transition-all hover:text-white"
            >
              Generate Another
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Show progress if generating
  if (isLoading && generationStatus) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 text-center">
          <h3 className="text-lg font-bold text-white">🎨 Generating Character...</h3>
          <p className="mt-1 text-sm text-studio-muted">
            This usually takes ~2 minutes. Don't close this window.
          </p>
        </div>

        <div className="space-y-4 rounded-xl border border-purple-500/30 bg-black/20 p-6">
          {/* Progress Bar */}
          <div>
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="text-studio-muted">Progress</span>
              <span className="font-semibold text-purple-300">
                {generationStatus.progress || 0}%
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-studio-border">
              <div
                className="h-full bg-gradient-to-r from-purple-500 to-blue-500 transition-all duration-500"
                style={{ width: `${generationStatus.progress || 0}%` }}
              />
            </div>
          </div>

          {/* Status */}
          <div className="rounded-lg border border-studio-border bg-black/40 p-4">
            <p className="text-sm text-white">
              <span className="mr-2">⏱️</span>
              {generationStatus.status === 'pending' && 'Waiting in queue...'}
              {generationStatus.status === 'processing' && 'AI is creating your character...'}
              {generationStatus.estimatedTimeRemaining && (
                <span className="ml-2 text-studio-muted">
                  (~{Math.ceil(generationStatus.estimatedTimeRemaining)}s remaining)
                </span>
              )}
            </p>
          </div>

          {/* Prompt Reminder */}
          <div className="rounded-lg border border-studio-border bg-black/40 p-4">
            <p className="text-xs text-studio-muted">
              <span className="font-semibold text-white">Your Prompt:</span> {prompt}
            </p>
          </div>

          {/* Cancel Button */}
          <button
            onClick={handleCancel}
            className="w-full rounded-lg border border-studio-border bg-black/20 py-2 text-sm text-studio-muted transition-all hover:text-white"
          >
            Cancel Generation
          </button>
        </div>
      </div>
    );
  }

  // Show generation form
  return (
    <div>
      {/* API Key Configuration Prompt */}
      {!hasAnyKey && onOpenSettings && (
        <div className="mb-6 rounded-xl border border-blue-500/30 bg-blue-500/10 p-6">
          <div className="flex items-start gap-4">
            <Key className="mt-1 h-8 w-8 flex-shrink-0 text-blue-400" />
            <div className="flex-1">
              <h4 className="text-lg font-bold text-white">🔑 API Key Required</h4>
              <p className="mt-2 text-sm text-studio-muted leading-relaxed">
                <span className="text-purple-400 font-semibold">HoloScript Cloud</span> — AI
                generation requires a Pro subscription. Pro unlocks the vision model for characters,
                creatures, scenes, and more.
              </p>
              <p className="mt-3 text-sm text-white">
                <strong>Supported providers:</strong>
              </p>
              <ul className="mt-2 space-y-1 text-sm text-studio-muted">
                <li>
                  •{' '}
                  <a
                    href="https://www.meshy.ai"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:underline"
                  >
                    Meshy AI
                  </a>{' '}
                  — Text/image to 3D generation
                </li>
                <li>
                  •{' '}
                  <a
                    href="https://hyperhuman.deemos.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:underline"
                  >
                    Rodin AI
                  </a>{' '}
                  — Alternative AI generation provider
                </li>
              </ul>
              <button
                onClick={onOpenSettings}
                className="mt-4 flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-blue-600"
              >
                <Settings className="h-4 w-4" />
                Configure API Keys
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mb-6">
        <h3 className="text-lg font-bold text-white">AI Character Generation</h3>
        <p className="mt-1 text-sm text-studio-muted">
          Generate 3D characters from text or image prompts in ~2 minutes
          {!hasAnyKey && <span className="text-blue-400"> • API key required</span>}
        </p>
      </div>

      <div className="mx-auto max-w-2xl space-y-6">
        {/* Provider Selection */}
        <div>
          <label className="mb-2 block text-sm font-semibold text-white">AI Provider</label>
          <div className="flex gap-3">
            {(['meshy', 'rodin'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setProvider(p)}
                className={`flex-1 rounded-lg border px-4 py-3 text-sm font-medium transition-all ${
                  provider === p
                    ? 'border-purple-500 bg-purple-500/20 text-purple-300'
                    : 'border-studio-border bg-black/20 text-studio-muted hover:border-purple-500/40'
                }`}
              >
                {p === 'meshy' ? '🎨 Meshy' : '🤖 Rodin'}
              </button>
            ))}
          </div>
        </div>

        {/* Prompt Input */}
        <div>
          <label className="mb-2 block text-sm font-semibold text-white">
            Character Description <span className="text-red-500">*</span>
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe your character... (e.g., 'A muscular frog wearing sunglasses and a gold chain, standing confidently')"
            className="h-32 w-full rounded-lg border border-studio-border bg-black/20 p-4 text-white placeholder:text-studio-muted focus:border-purple-500 focus:outline-none"
            maxLength={500}
          />
          <p className="mt-1 text-xs text-studio-muted">{prompt.length}/500 characters</p>
        </div>

        {/* Image Upload (Optional) */}
        <div>
          <label className="mb-2 block text-sm font-semibold text-white">
            Reference Image{' '}
            <span className="text-xs font-normal text-studio-muted">(optional)</span>
          </label>
          <div className="rounded-lg border-2 border-dashed border-studio-border bg-black/20 p-4 text-center">
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setImageFile(e.target.files?.[0] || null)}
              className="hidden"
              id="ai-image-upload"
            />
            <label htmlFor="ai-image-upload" className="cursor-pointer">
              {imageFile ? (
                <div className="flex items-center justify-center gap-2 text-sm text-purple-300">
                  <Upload className="h-4 w-4" />
                  {imageFile.name}
                </div>
              ) : (
                <div>
                  <Upload className="mx-auto h-8 w-8 text-studio-muted" />
                  <p className="mt-2 text-sm text-studio-muted">Click to upload reference image</p>
                </div>
              )}
            </label>
          </div>
        </div>

        {/* Style Selection */}
        <div>
          <label className="mb-2 block text-sm font-semibold text-white">Style</label>
          <div className="grid grid-cols-4 gap-2">
            {(['realistic', 'stylized', 'anime', 'cartoon'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStyle(s)}
                className={`rounded-lg border px-3 py-2 text-xs font-medium transition-all ${
                  style === s
                    ? 'border-purple-500 bg-purple-500/20 text-purple-300'
                    : 'border-studio-border bg-black/20 text-studio-muted hover:border-purple-500/40'
                }`}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Quality Selection */}
        <div>
          <label className="mb-2 block text-sm font-semibold text-white">Quality</label>
          <div className="grid grid-cols-3 gap-2">
            {(['draft', 'standard', 'high'] as const).map((q) => (
              <button
                key={q}
                onClick={() => setQuality(q)}
                className={`rounded-lg border px-3 py-2.5 text-xs font-medium transition-all ${
                  quality === q
                    ? 'border-purple-500 bg-purple-500/20 text-purple-300'
                    : 'border-studio-border bg-black/20 text-studio-muted hover:border-purple-500/40'
                }`}
              >
                <div>{q.charAt(0).toUpperCase() + q.slice(1)}</div>
                <div className="mt-1 text-[10px] opacity-60">
                  {q === 'draft' && '~5 credits'}
                  {q === 'standard' && '~10 credits'}
                  {q === 'high' && '~20 credits'}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Generate Button */}
        <button
          onClick={handleGenerate}
          disabled={!prompt || prompt.length < 10 || isLoading}
          className="w-full rounded-lg bg-purple-500 py-3.5 font-semibold text-white transition-all hover:bg-purple-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Sparkles className="mr-2 inline h-5 w-5" />
          Generate Character (~2 min)
        </button>

        {/* Info */}
        <div className="rounded-lg border border-studio-border bg-black/20 p-4 text-xs text-studio-muted">
          <p className="font-semibold text-white">💡 Tips for better results:</p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li>Be specific about appearance, pose, and style</li>
            <li>Mention materials (e.g., "metallic armor", "fluffy fur")</li>
            <li>Reference image improves accuracy (optional)</li>
            <li>Generation takes ~2 minutes, quality affects detail level</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

/**
 * Mixamo Tab - Auto-rigging + character library
 */
function MixamoTab({ _onCharacterCreated, _isLoading, _setIsLoading }: TabProps) {
  const [characters, setCharacters] = useState<any[]>([]);
  const [typeFilter, setTypeFilter] = useState<'all' | 'human' | 'creature' | 'robot'>('all');
  const [selectedCharacter, setSelectedCharacter] = useState<any>(null);
  const [showInstructions, setShowInstructions] = useState(false);

  useState(() => {
    // Load Mixamo characters
    import('@/lib/mixamoIntegration').then(({ getMixamoCharacters }) => {
      const chars = getMixamoCharacters();
      setCharacters(chars);
    });
  });

  const filteredCharacters =
    typeFilter === 'all' ? characters : characters.filter((c) => c.type === typeFilter);

  const handleSelectCharacter = (character: any) => {
    setSelectedCharacter(character);
    setShowInstructions(true);
  };

  const _handleManualUpload = () => {
    // User will manually download from Mixamo and upload via Upload tab
    alert(
      'After downloading from Mixamo:\n\n1. Switch to the "Upload File" tab\n2. Upload your downloaded .glb file'
    );
  };

  // Show instructions for selected character
  if (selectedCharacter && showInstructions) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="mb-6">
          <button
            onClick={() => {
              setSelectedCharacter(null);
              setShowInstructions(false);
            }}
            className="text-sm text-purple-400 hover:underline"
          >
            ← Back to character library
          </button>
        </div>

        <div className="overflow-hidden rounded-xl border border-purple-500/30 bg-black/20">
          {/* Character Preview */}
          <div className="flex items-center gap-4 border-b border-studio-border bg-black/40 p-6">
            <img
              src={selectedCharacter.thumbnail}
              alt={selectedCharacter.name}
              className="h-32 w-32 rounded-lg object-cover"
            />
            <div>
              <h3 className="text-xl font-bold text-white">{selectedCharacter.name}</h3>
              <p className="mt-1 text-sm text-studio-muted">
                Type: {selectedCharacter.type} • {selectedCharacter.polyCount} • Rigged
              </p>
            </div>
          </div>

          {/* Instructions */}
          <div className="space-y-4 p-6">
            <div>
              <h4 className="text-sm font-semibold text-white">📥 How to Download from Mixamo</h4>
              <ol className="mt-2 space-y-2 text-sm text-studio-muted">
                <li className="flex gap-2">
                  <span className="font-semibold text-white">1.</span>
                  <span>
                    Visit{' '}
                    <a
                      href="https://www.mixamo.com/#/?page=1&type=Character"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-purple-400 hover:underline"
                    >
                      mixamo.com
                    </a>
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="font-semibold text-white">2.</span>
                  <span>Sign in with Adobe account (free)</span>
                </li>
                <li className="flex gap-2">
                  <span className="font-semibold text-white">3.</span>
                  <span>Search for "{selectedCharacter.name}"</span>
                </li>
                <li className="flex gap-2">
                  <span className="font-semibold text-white">4.</span>
                  <span>
                    Click "Download" and select:
                    <ul className="ml-4 mt-1 list-disc space-y-1">
                      <li>Format: glTF Binary (.glb)</li>
                      <li>Pose: T-pose</li>
                      <li>With Skin: Yes</li>
                    </ul>
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="font-semibold text-white">5.</span>
                  <span>Upload the downloaded .glb file using the "Upload" tab above</span>
                </li>
              </ol>
            </div>

            <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-4">
              <p className="text-sm text-blue-200">
                <span className="font-semibold">💡 Pro Tip:</span> Mixamo characters come fully
                rigged and animation-ready. You can also download animations separately from Mixamo.
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="border-t border-studio-border bg-black/40 p-4">
            <button
              onClick={() => window.open('https://www.mixamo.com', '_blank')}
              className="w-full rounded-lg bg-purple-500 py-2.5 font-semibold text-white transition-all hover:bg-purple-600"
            >
              Open Mixamo Website →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Show character library
  return (
    <div>
      <div className="mb-6">
        <h3 className="text-lg font-bold text-white">Mixamo Character Library</h3>
        <p className="mt-1 text-sm text-studio-muted">
          Browse 60+ free rigged characters from Mixamo (requires Adobe account to download)
        </p>
      </div>

      {/* Type Filter */}
      <div className="mb-6 flex flex-wrap gap-2">
        {(['all', 'human', 'creature', 'robot'] as const).map((type) => (
          <button
            key={type}
            onClick={() => setTypeFilter(type)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
              typeFilter === type
                ? 'border-purple-500 bg-purple-500/20 text-purple-300'
                : 'border-studio-border bg-black/20 text-studio-muted hover:border-purple-500/40'
            }`}
          >
            {type === 'all' ? 'All Characters' : type.charAt(0).toUpperCase() + type.slice(1)}
          </button>
        ))}
      </div>

      {/* Character Grid */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {filteredCharacters.map((character) => (
          <button
            key={character.id}
            onClick={() => handleSelectCharacter(character)}
            className="group relative flex aspect-square flex-col overflow-hidden rounded-xl border border-studio-border bg-black/20 transition-all hover:border-purple-500 hover:shadow-lg hover:shadow-purple-500/20"
          >
            {/* Thumbnail */}
            <div className="relative flex-1 overflow-hidden bg-gradient-to-br from-purple-500/10 to-blue-500/10">
              <img
                src={character.thumbnail}
                alt={character.name}
                className="h-full w-full object-cover transition-transform group-hover:scale-110"
              />

              {/* Type Badge */}
              <div className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-1 text-[10px] font-semibold text-white">
                {character.type}
              </div>
            </div>

            {/* Info */}
            <div className="border-t border-studio-border bg-black/40 p-3">
              <p className="font-semibold text-white group-hover:text-purple-300">
                {character.name}
              </p>
              <p className="mt-0.5 text-xs text-studio-muted">{character.polyCount}</p>
            </div>

            {/* Hover Overlay */}
            <div className="absolute inset-0 flex items-center justify-center bg-purple-500/10 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">
              <div className="rounded-lg bg-purple-500 px-4 py-2 text-sm font-semibold text-white">
                View Instructions
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Auto-Rigging Info */}
      <div className="mt-8 rounded-xl border border-studio-border bg-black/20 p-6">
        <h4 className="text-sm font-semibold text-white">🤖 Auto-Rigging</h4>
        <p className="mt-2 text-sm text-studio-muted">
          Mixamo also offers free auto-rigging for custom models. Upload your FBX or OBJ file to
          Mixamo, mark key points, and download the rigged model.
        </p>
        <button
          onClick={() =>
            window.open('https://www.mixamo.com/#/?page=1&type=Character&query=upload', '_blank')
          }
          className="mt-4 rounded-lg border border-purple-500/40 bg-purple-500/10 px-4 py-2 text-sm font-semibold text-purple-300 transition-all hover:bg-purple-500/20"
        >
          Open Mixamo Auto-Rigger →
        </button>
      </div>
    </div>
  );
}

/**
 * VRoid Tab - VRM file import
 */
function VRoidTab({ onCharacterCreated, isLoading, setIsLoading }: TabProps) {
  const [dragging, setDragging] = useState(false);
  const [vrmFile, setVrmFile] = useState<File | null>(null);
  const [vrmMetadata, setVrmMetadata] = useState<any>(null);
  const [vrmThumbnail, setVrmThumbnail] = useState<string | undefined>(undefined);

  const handleVRMFile = async (file: File) => {
    if (!file.name.match(/\.vrm$/i)) {
      alert('Please upload a .vrm file');
      return;
    }

    setIsLoading(true);

    try {
      const { createVRMAvatarFromFile, isLicenseCompatible } = await import('@/lib/vrmImport');

      logger.debug('[VRoidImport] Processing VRM file:', file.name);
      const avatar = await createVRMAvatarFromFile(file);

      setVrmFile(file);
      setVrmMetadata(avatar.metadata);
      setVrmThumbnail(avatar.thumbnail || undefined);

      // Check license compatibility
      if (avatar.metadata) {
        const isCompatible = isLicenseCompatible(avatar.metadata);
        if (!isCompatible) {
          logger.warn('[VRoidImport] License is not compatible for commercial use.');
          const proceed = confirm(
            `This VRM avatar license is not compatible with commercial use. Proceed anyway?`
          );
          if (!proceed) {
            setIsLoading(false);
            return;
          }
        }
      }

      // Ready to use
      setIsLoading(false);
    } catch (error) {
      logger.error('[VRoidImport] Failed to process VRM:', error);
      alert('Failed to process VRM file. Please ensure it is a valid .vrm file.');
      setIsLoading(false);
    }
  };

  const handleUseVRM = () => {
    if (!vrmFile) return;

    const url = URL.createObjectURL(vrmFile);
    onCharacterCreated(url, {
      name: vrmMetadata?.name || vrmFile.name,
      source: 'vroid',
      thumbnailUrl: vrmThumbnail,
      credits: vrmMetadata?.author ? `Created by ${vrmMetadata.author}` : undefined,
    });
  };

  const handleClear = () => {
    setVrmFile(null);
    setVrmMetadata(null);
    setVrmThumbnail('');
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleVRMFile(file);
  };

  // Show VRM preview if loaded
  if (vrmFile && vrmMetadata) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 text-center">
          <h3 className="text-lg font-bold text-white">✅ VRM Avatar Ready</h3>
          <p className="mt-1 text-sm text-studio-muted">
            VRM metadata loaded successfully. Click below to use this avatar.
          </p>
        </div>

        <div className="overflow-hidden rounded-xl border border-purple-500/30 bg-black/20">
          {/* Thumbnail */}
          {vrmThumbnail && (
            <img src={vrmThumbnail} alt={vrmMetadata.name} className="h-64 w-full object-cover" />
          )}

          {/* Metadata */}
          <div className="border-t border-studio-border bg-black/40 p-4 space-y-2">
            <div>
              <p className="text-sm font-semibold text-white">{vrmMetadata.name || vrmFile.name}</p>
              {vrmMetadata.author && (
                <p className="text-xs text-studio-muted">by {vrmMetadata.author}</p>
              )}
            </div>

            {vrmMetadata.version && (
              <p className="text-xs text-studio-muted">Version: {vrmMetadata.version}</p>
            )}

            {vrmMetadata.license && (
              <div className="rounded-lg border border-studio-border bg-black/40 p-2">
                <p className="text-xs text-white">
                  <span className="font-semibold">License:</span> {vrmMetadata.license}
                </p>
                {vrmMetadata.commercialUsage && (
                  <p className="text-xs text-studio-muted">
                    Commercial: {vrmMetadata.commercialUsage}
                  </p>
                )}
                {vrmMetadata.otherPermissionUrl && (
                  <a
                    href={vrmMetadata.otherPermissionUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-purple-400 hover:underline"
                  >
                    View full license →
                  </a>
                )}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3 border-t border-studio-border bg-black/40 p-4">
            <button
              onClick={handleUseVRM}
              className="flex-1 rounded-lg bg-purple-500 py-2.5 font-semibold text-white transition-all hover:bg-purple-600"
            >
              Use This Avatar
            </button>
            <button
              onClick={handleClear}
              className="rounded-lg border border-studio-border bg-black/20 px-4 py-2.5 text-sm text-studio-muted transition-all hover:text-white"
            >
              Choose Another
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Show upload interface
  return (
    <div>
      <div className="mb-6">
        <h3 className="text-lg font-bold text-white">VRoid Import</h3>
        <p className="mt-1 text-sm text-studio-muted">
          Import VRM avatars from VRoid Studio or VRoid Hub
        </p>
      </div>

      <div className="mx-auto max-w-2xl space-y-6">
        {/* VRM Upload Zone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`flex h-64 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed transition-all ${
            dragging
              ? 'border-purple-400 bg-purple-500/10'
              : 'border-studio-border bg-black/20 hover:border-purple-400/60'
          }`}
        >
          <input
            type="file"
            accept=".vrm"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleVRMFile(file);
            }}
            className="hidden"
            id="vrm-file-input"
            disabled={isLoading}
          />
          <label htmlFor="vrm-file-input" className="flex cursor-pointer flex-col items-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-purple-500/15 text-5xl">
              🧑
            </div>
            <p className="mt-4 text-sm font-semibold text-studio-text">
              {dragging ? 'Drop your .vrm file here!' : 'Upload VRM Avatar'}
            </p>
            <p className="mt-1 text-xs text-studio-muted">Drag & drop or click to browse</p>
          </label>
        </div>

        {/* Info Section */}
        <div className="space-y-4">
          <div className="rounded-lg border border-studio-border bg-black/20 p-4">
            <h4 className="text-sm font-semibold text-white">📦 What is VRM?</h4>
            <p className="mt-2 text-xs text-studio-muted">
              VRM is a 3D avatar file format designed for VR/AR applications. It includes avatar
              data, blend shapes, and license metadata.
            </p>
          </div>

          <div className="rounded-lg border border-studio-border bg-black/20 p-4">
            <h4 className="text-sm font-semibold text-white">🎨 How to get VRM avatars:</h4>
            <ul className="mt-2 space-y-1 text-xs text-studio-muted">
              <li>
                <span className="text-white">1.</span> Create in{' '}
                <a
                  href="https://vroid.com/studio"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-purple-400 hover:underline"
                >
                  VRoid Studio
                </a>{' '}
                (free)
              </li>
              <li>
                <span className="text-white">2.</span> Download from{' '}
                <a
                  href="https://hub.vroid.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-purple-400 hover:underline"
                >
                  VRoid Hub
                </a>
              </li>
              <li>
                <span className="text-white">3.</span> Purchase from Booth.pm or other marketplaces
              </li>
              <li>
                <span className="text-white">4.</span> Commission custom avatars from creators
              </li>
            </ul>
          </div>

          <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-4">
            <h4 className="text-sm font-semibold text-yellow-300">⚖️ License Notice</h4>
            <p className="mt-2 text-xs text-yellow-200/60">
              VRM files contain license metadata. Please respect the creator's usage terms
              (commercial use, redistribution, modifications, etc.).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Sketchfab Tab - Search and import
 */
function SketchfabTab({ onCharacterCreated, isLoading, setIsLoading, onOpenSettings }: TabProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedModel, setSelectedModel] = useState<any>(null);
  const [category, setCategory] = useState('');
  const [sortBy, setSortBy] = useState<'relevance' | 'likes' | 'views' | 'recent'>('relevance');

  // Check for API key
  const hasSketchfabKey = hasAPIKey('sketchfab');

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    setSearching(true);
    setSearchResults([]);

    try {
      const { searchSketchfab } = await import('@/lib/sketchfabIntegration');

      const results = await searchSketchfab({
        query: searchQuery,
        categories: category || undefined,
        sort: sortBy,
        maxFaceCount: 100000, // Limit to 100K tris for performance
      });

      setSearchResults(results.results);
      logger.debug('[Sketchfab] Found', results.totalCount, 'models');
    } catch (error) {
      logger.error('[Sketchfab] Search failed:', error);
      alert('Failed to search Sketchfab. Please try again.');
    } finally {
      setSearching(false);
    }
  };

  const handleSelectModel = (model: any) => {
    setSelectedModel(model);
  };

  const handleDownload = async () => {
    if (!selectedModel) return;

    setIsLoading(true);

    try {
      const { downloadModel, isSketchfabAvailable } = await import('@/lib/sketchfabIntegration');

      // Check if API key is configured
      if (!isSketchfabAvailable()) {
        alert(
          'Sketchfab API key required for downloads.\n\nPlease:\n1. Visit the model page to download manually\n2. Upload via the "Upload" tab'
        );
        window.open(selectedModel.viewerUrl, '_blank');
        setIsLoading(false);
        return;
      }

      // Check if model is downloadable
      if (!selectedModel.isDownloadable) {
        alert('This model is not available for download.');
        setIsLoading(false);
        return;
      }

      logger.debug('[Sketchfab] Downloading model:', selectedModel.name);
      const url = await downloadModel(selectedModel.uid);

      onCharacterCreated(url, {
        name: selectedModel.name,
        source: 'sketchfab',
        thumbnailUrl: selectedModel.thumbnail,
        credits: `Created by ${selectedModel.author.displayName} on Sketchfab`,
      });
    } catch (error) {
      logger.error('[Sketchfab] Download failed:', error);
      alert(
        'Failed to download model.\n\nPlease:\n1. Visit the model page\n2. Download manually\n3. Upload via the "Upload" tab'
      );
      window.open(selectedModel.viewerUrl, '_blank');
    } finally {
      setIsLoading(false);
    }
  };

  // Show model details if selected
  if (selectedModel) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="mb-6">
          <button
            onClick={() => setSelectedModel(null)}
            className="text-sm text-purple-400 hover:underline"
          >
            ← Back to search results
          </button>
        </div>

        <div className="overflow-hidden rounded-xl border border-purple-500/30 bg-black/20">
          {/* Thumbnail */}
          <img
            src={selectedModel.thumbnail}
            alt={selectedModel.name}
            className="h-64 w-full object-cover"
          />

          {/* Info */}
          <div className="space-y-3 border-t border-studio-border bg-black/40 p-6">
            <div>
              <h3 className="text-xl font-bold text-white">{selectedModel.name}</h3>
              <p className="mt-1 text-sm text-studio-muted">
                by{' '}
                <a
                  href={selectedModel.author.profileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-purple-400 hover:underline"
                >
                  {selectedModel.author.displayName}
                </a>
              </p>
            </div>

            {selectedModel.description && (
              <p className="text-sm text-studio-muted line-clamp-3">{selectedModel.description}</p>
            )}

            {/* Stats */}
            <div className="flex flex-wrap gap-4 text-xs text-studio-muted">
              <span>
                {(() => {
                  const { formatPolyCount } = require('@/lib/sketchfabIntegration');
                  return formatPolyCount(selectedModel.faceCount);
                })()}
              </span>
              <span>❤️ {selectedModel.likeCount.toLocaleString()}</span>
              <span>👁️ {selectedModel.viewCount.toLocaleString()}</span>
              {selectedModel.animationCount > 0 && (
                <span>🎬 {selectedModel.animationCount} anims</span>
              )}
            </div>

            {/* License */}
            <div className="rounded-lg border border-studio-border bg-black/40 p-3">
              <p className="text-xs font-semibold text-white">License</p>
              <p className="mt-1 text-xs text-studio-muted">
                {(() => {
                  const { getLicenseSummary } = require('@/lib/sketchfabIntegration');
                  return getLicenseSummary(selectedModel.license).summary;
                })()}
              </p>
              <a
                href={selectedModel.license.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 text-xs text-purple-400 hover:underline"
              >
                View full license →
              </a>
            </div>

            {/* Tags */}
            {selectedModel.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {selectedModel.tags.slice(0, 5).map((tag: string) => (
                  <span
                    key={tag}
                    className="rounded bg-studio-border px-2 py-0.5 text-xs text-studio-muted"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="space-y-2 border-t border-studio-border bg-black/40 p-4">
            {selectedModel.isDownloadable ? (
              <button
                onClick={handleDownload}
                disabled={isLoading}
                className="w-full rounded-lg bg-purple-500 py-2.5 font-semibold text-white transition-all hover:bg-purple-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isLoading ? 'Downloading...' : 'Download & Use'}
              </button>
            ) : (
              <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3 text-center">
                <p className="text-sm text-yellow-200">
                  This model is not available for download. View on Sketchfab for details.
                </p>
              </div>
            )}

            <button
              onClick={() => window.open(selectedModel.viewerUrl, '_blank')}
              className="w-full rounded-lg border border-studio-border bg-black/20 py-2 text-sm text-studio-muted transition-all hover:text-white"
            >
              View on Sketchfab →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Show search interface
  return (
    <div>
      {/* API Key Info Banner */}
      {!hasSketchfabKey && onOpenSettings && (
        <div className="mb-6 rounded-xl border border-blue-500/30 bg-blue-500/10 p-6">
          <div className="flex items-start gap-4">
            <Key className="mt-1 h-8 w-8 flex-shrink-0 text-blue-400" />
            <div className="flex-1">
              <h4 className="text-lg font-bold text-white">🔑 Optional: Configure API Key</h4>
              <p className="mt-2 text-sm text-studio-muted leading-relaxed">
                <span className="text-purple-400 font-semibold">Sketchfab Integration</span> — You
                can search Sketchfab without an API key, but downloads require authentication.
                Configure your Sketchfab API key for automatic downloads.
              </p>
              <p className="mt-3 text-sm text-white">
                <strong>Without API key:</strong> Search works, manual download instructions
                provided
              </p>
              <p className="mt-1 text-sm text-white">
                <strong>With API key:</strong> Search + automatic downloads
              </p>
              <div className="mt-4 flex gap-3">
                <button
                  onClick={onOpenSettings}
                  className="flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-blue-600"
                >
                  <Settings className="h-4 w-4" />
                  Configure API Key
                </button>
                <a
                  href="https://sketchfab.com/settings/password"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-lg border border-blue-500 bg-blue-500/10 px-4 py-2 text-sm font-semibold text-blue-400 transition-all hover:bg-blue-500/20"
                >
                  Get API Key →
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="mb-6">
        <h3 className="text-lg font-bold text-white">Sketchfab Search</h3>
        <p className="mt-1 text-sm text-studio-muted">
          Search and import from 3M+ models on Sketchfab
          {!hasSketchfabKey && (
            <span className="text-blue-400"> • Searches work, downloads require API key</span>
          )}
        </p>
      </div>

      {/* Search Form */}
      <div className="mb-6 space-y-4">
        {/* Search Input */}
        <div className="flex gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Search for characters... (e.g., 'anime character', 'robot', 'monster')"
            className="flex-1 rounded-lg border border-studio-border bg-black/20 px-4 py-2.5 text-white placeholder:text-studio-muted focus:border-purple-500 focus:outline-none"
          />
          <button
            onClick={handleSearch}
            disabled={!searchQuery.trim() || searching}
            className="rounded-lg bg-purple-500 px-6 py-2.5 font-semibold text-white transition-all hover:bg-purple-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {searching ? 'Searching...' : 'Search'}
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-lg border border-studio-border bg-black/20 px-3 py-1.5 text-sm text-white focus:border-purple-500 focus:outline-none"
          >
            <option value="">All Categories</option>
            <option value="characters-creatures">Characters & Creatures</option>
            <option value="people">People</option>
            <option value="animals-pets">Animals & Pets</option>
            <option value="fantasy">Fantasy</option>
            <option value="sci-fi">Sci-Fi</option>
            <option value="cartoon">Cartoon</option>
            <option value="anime">Anime</option>
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="rounded-lg border border-studio-border bg-black/20 px-3 py-1.5 text-sm text-white focus:border-purple-500 focus:outline-none"
          >
            <option value="relevance">Most Relevant</option>
            <option value="likes">Most Liked</option>
            <option value="views">Most Viewed</option>
            <option value="recent">Most Recent</option>
          </select>
        </div>
      </div>

      {/* Search Results */}
      {searchResults.length > 0 ? (
        <div>
          <p className="mb-4 text-sm text-studio-muted">
            Found {searchResults.length} models for "{searchQuery}"
          </p>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {searchResults.map((model) => (
              <button
                key={model.uid}
                onClick={() => handleSelectModel(model)}
                className="group relative flex aspect-square flex-col overflow-hidden rounded-xl border border-studio-border bg-black/20 transition-all hover:border-purple-500 hover:shadow-lg hover:shadow-purple-500/20"
              >
                {/* Thumbnail */}
                <div className="relative flex-1 overflow-hidden">
                  <img
                    src={model.thumbnail}
                    alt={model.name}
                    className="h-full w-full object-cover transition-transform group-hover:scale-110"
                  />

                  {/* Stats Overlay */}
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                    <div className="flex justify-between text-xs text-white">
                      <span>
                        ❤️{' '}
                        {model.likeCount > 1000
                          ? `${(model.likeCount / 1000).toFixed(1)}K`
                          : model.likeCount}
                      </span>
                      <span>
                        {(() => {
                          const { formatPolyCount } = require('@/lib/sketchfabIntegration');
                          return formatPolyCount(model.faceCount);
                        })()}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Info */}
                <div className="border-t border-studio-border bg-black/40 p-3">
                  <p className="truncate text-sm font-semibold text-white group-hover:text-purple-300">
                    {model.name}
                  </p>
                  <p className="truncate text-xs text-studio-muted">{model.author.displayName}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-4 text-center">
          <div className="flex h-48 items-center justify-center rounded-xl border-2 border-dashed border-studio-border bg-black/20">
            <div>
              <Search className="mx-auto h-12 w-12 text-studio-muted" />
              <p className="mt-4 text-sm text-studio-muted">
                {searching ? 'Searching Sketchfab...' : 'Search for 3D characters above'}
              </p>
            </div>
          </div>

          {/* Popular searches */}
          <div>
            <p className="mb-2 text-xs font-semibold text-white">Popular searches:</p>
            <div className="flex flex-wrap justify-center gap-2">
              {['anime character', 'robot', 'monster', 'fantasy warrior', 'cute animal'].map(
                (term) => (
                  <button
                    key={term}
                    onClick={() => {
                      setSearchQuery(term);
                      setTimeout(() => handleSearch(), 100);
                    }}
                    className="rounded-lg border border-studio-border bg-black/20 px-3 py-1.5 text-xs text-studio-muted transition-all hover:border-purple-500/40 hover:text-white"
                  >
                    {term}
                  </button>
                )
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Upload Tab - File drag & drop
 */
function UploadTab({ onCharacterCreated, _isLoading, _setIsLoading }: TabProps) {
  const [dragging, setDragging] = useState(false);

  const handleFile = (file: File) => {
    if (!file.name.match(/\.(glb|gltf|vrm)$/i)) return;

    const url = URL.createObjectURL(file);
    onCharacterCreated(url, {
      name: file.name,
      source: 'upload',
    });
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  return (
    <div>
      <div className="mb-6">
        <h3 className="text-lg font-bold text-white">Upload Character File</h3>
        <p className="mt-1 text-sm text-studio-muted">Drag & drop your GLB, GLTF, or VRM file</p>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex h-64 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed transition-all ${
          dragging
            ? 'border-purple-400 bg-purple-500/10'
            : 'border-studio-border bg-black/20 hover:border-purple-400/60'
        }`}
      >
        <Upload className="mb-4 h-12 w-12 text-studio-muted" />
        <p className="text-sm font-semibold text-studio-text">
          {dragging ? 'Drop your file here!' : 'Drag & drop or click to upload'}
        </p>
        <p className="mt-1 text-xs text-studio-muted">Supports GLB, GLTF, VRM</p>
      </div>
    </div>
  );
}
