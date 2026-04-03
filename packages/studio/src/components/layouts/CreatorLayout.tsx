'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSceneStore, useCharacterStore } from '@/lib/stores';
import { SCENE_TEMPLATES, TEMPLATE_CATEGORIES } from '@/data/sceneTemplates';
import { QuickStartWizard } from '@/components/wizard/QuickStartWizard';
import {
  CharacterCreationModal,
  type CharacterMetadata,
} from '@/industry/character/creation/CharacterCreationModal';
import { ContextMenu, SimplePropertyInspector } from '@holoscript/ui';
import { logger } from '@/lib/logger';
import {
  Box,
  Lamp,
  User2,
  LayoutTemplate,
  Sticker,
  Search,
  Sparkles,
  Mic,
  MicOff,
  Plus,
  UndoIcon,
  RedoIcon,
  Wand2,
  Store,
  HelpCircle,
} from 'lucide-react';

// ── Asset Library ─────────────────────────────────────────────────────────────

type AssetCategory = 'Objects' | 'Rooms' | 'NPCs' | 'Lights' | 'Templates' | 'Store';

const CATEGORY_ICONS: Record<AssetCategory, React.ReactNode> = {
  Objects: <Box className="h-3.5 w-3.5" />,
  Rooms: <LayoutTemplate className="h-3.5 w-3.5" />,
  NPCs: <User2 className="h-3.5 w-3.5" />,
  Lights: <Lamp className="h-3.5 w-3.5" />,
  Templates: <Sticker className="h-3.5 w-3.5" />,
  Store: <Store className="h-3.5 w-3.5" />,
};

const SAMPLE_ASSETS: Record<string, { label: string; emoji: string }[]> = {
  Objects: [
    { label: 'Cube', emoji: '🟫' },
    { label: 'Sphere', emoji: '🔵' },
    { label: 'Tree', emoji: '🌲' },
    { label: 'Rock', emoji: '🪨' },
    { label: 'Chest', emoji: '📦' },
    { label: 'Table', emoji: '🪵' },
    { label: 'Chair', emoji: '🪑' },
    { label: 'Door', emoji: '🚪' },
    { label: 'Lamp', emoji: '💡' },
    { label: 'Sign', emoji: '🪧' },
    { label: 'Barrel', emoji: '🛢️' },
    { label: 'Fountain', emoji: '⛲' },
  ],
  Rooms: [
    { label: 'Dungeon Cell', emoji: '🏚️' },
    { label: 'Tavern', emoji: '🍺' },
    { label: 'Tower Top', emoji: '🗼' },
    { label: 'Forest Clearing', emoji: '🌿' },
    { label: 'Courtyard', emoji: '🏰' },
    { label: 'Cave', emoji: '🕳️' },
    { label: 'Hangar', emoji: '🛸' },
    { label: 'Bridge', emoji: '🌉' },
  ],
  NPCs: [
    { label: 'Merchant', emoji: '🧙' },
    { label: 'Guard', emoji: '⚔️' },
    { label: 'Companion', emoji: '🐾' },
    { label: 'Quest Giver', emoji: '📜' },
    { label: 'Villager', emoji: '👨‍🌾' },
    { label: 'Enemy', emoji: '👹' },
    { label: 'Boss', emoji: '💀' },
    { label: 'Ally', emoji: '🦸' },
  ],
  Lights: [
    { label: 'Sunlight', emoji: '☀️' },
    { label: 'Torch', emoji: '🔦' },
    { label: 'Candle', emoji: '🕯️' },
    { label: 'Moonlight', emoji: '🌙' },
    { label: 'Spotlight', emoji: '🔆' },
    { label: 'Neon', emoji: '💜' },
  ],
};

const ASSET_PACKS = [
  { name: 'Medieval Pack', emoji: '🏰', items: 120, free: true },
  { name: 'Sci-Fi Bundle', emoji: '🚀', items: 85, free: false },
  { name: 'Fantasy Creatures', emoji: '🐉', items: 42, free: false },
  { name: 'Modern City', emoji: '🏙️', items: 97, free: false },
  { name: 'Nature Essentials', emoji: '🌲', items: 63, free: true },
];

interface SimpleAssetLibraryProps {
  onLoadTemplate: (code: string) => void;
  onShowWizard: () => void;
}

function SimpleAssetLibrary({ onLoadTemplate, onShowWizard }: SimpleAssetLibraryProps) {
  const [activeCategory, setActiveCategory] = useState<AssetCategory>('Objects');
  const [search, setSearch] = useState('');
  const [templateCategory, setTemplateCategory] = useState<string>('all');

  const filteredTemplates = SCENE_TEMPLATES.filter(
    (t) =>
      (templateCategory === 'all' || t.category === templateCategory) &&
      (t.name.toLowerCase().includes(search.toLowerCase()) ||
        t.tags.some((tag) => tag.toLowerCase().includes(search.toLowerCase())))
  );

  const assets = (SAMPLE_ASSETS[activeCategory] ?? []).filter((a) =>
    a.label.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex h-full w-64 shrink-0 flex-col border-r border-studio-border bg-studio-panel">
      {/* Wizard CTA */}
      <button
        onClick={onShowWizard}
        className="flex items-center gap-2 border-b border-studio-border bg-emerald-500/10 px-3 py-2 text-left transition hover:bg-emerald-500/15"
      >
        <Wand2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
        <div>
          <p className="text-xs font-semibold text-emerald-400">Quick Start Wizard</p>
          <p className="text-[10px] text-emerald-400/60">Build a world in 3 steps</p>
        </div>
      </button>

      {/* Search */}
      <div className="border-b border-studio-border p-2">
        <div className="flex items-center gap-2 rounded-lg bg-black/20 px-2.5 py-1.5">
          <Search className="h-3.5 w-3.5 text-studio-muted" />
          <input
            className="flex-1 bg-transparent text-xs text-studio-text placeholder:text-studio-muted outline-none"
            placeholder="Search assets…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex flex-wrap gap-1 border-b border-studio-border p-2">
        {(Object.keys(CATEGORY_ICONS) as AssetCategory[]).map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-all ${
              activeCategory === cat
                ? 'bg-studio-accent/20 text-studio-accent'
                : 'text-studio-muted hover:text-studio-text hover:bg-white/5'
            }`}
          >
            {CATEGORY_ICONS[cat]}
            {cat}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-2">
        {activeCategory === 'Templates' ? (
          <div className="flex flex-col gap-2">
            {/* Template filter */}
            <div className="flex flex-wrap gap-1">
              <button
                onClick={() => setTemplateCategory('all')}
                className={`rounded-full px-2 py-0.5 text-[10px] transition ${templateCategory === 'all' ? 'bg-studio-accent/20 text-studio-accent' : 'text-studio-muted hover:text-studio-text'}`}
              >
                All
              </button>
              {TEMPLATE_CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setTemplateCategory(c.id)}
                  className={`rounded-full px-2 py-0.5 text-[10px] transition ${templateCategory === c.id ? 'bg-studio-accent/20 text-studio-accent' : 'text-studio-muted hover:text-studio-text'}`}
                >
                  {c.emoji} {c.label}
                </button>
              ))}
            </div>
            {filteredTemplates.map((t) => (
              <button
                key={t.id}
                onClick={() => onLoadTemplate(t.code)}
                className="group flex items-start gap-2.5 rounded-xl border border-studio-border bg-black/20 p-2.5 text-left transition hover:border-studio-accent/40 hover:bg-studio-accent/5"
              >
                <span className="text-xl shrink-0">{t.emoji}</span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-studio-text group-hover:text-studio-accent">
                    {t.name}
                  </p>
                  <p className="text-[10px] text-studio-muted leading-snug">{t.desc}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {t.tags.slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-white/5 px-1.5 py-0.5 text-[9px] text-studio-muted"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : activeCategory === 'Store' ? (
          <div className="flex flex-col gap-2">
            <p className="text-[10px] text-studio-muted px-1">Asset Packs</p>
            {ASSET_PACKS.map((pack) => (
              <button
                key={pack.name}
                className="flex items-center gap-2.5 rounded-xl border border-studio-border bg-black/20 p-2.5 text-left transition hover:border-studio-accent/40 hover:bg-studio-accent/5"
              >
                <span className="text-xl shrink-0">{pack.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-studio-text">{pack.name}</p>
                  <p className="text-[10px] text-studio-muted">{pack.items} items</p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${pack.free ? 'bg-emerald-500/20 text-emerald-400' : 'bg-studio-accent/20 text-studio-accent'}`}
                >
                  {pack.free ? 'Free' : 'Pro'}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-1.5">
            {assets.map((asset) => (
              <button
                key={asset.label}
                title={`Add ${asset.label}`}
                draggable
                className="group flex flex-col items-center gap-1 rounded-lg border border-transparent bg-black/20 px-1 py-2 text-center transition-all hover:border-studio-accent/40 hover:bg-studio-accent/10 active:scale-95"
              >
                <span className="text-2xl">{asset.emoji}</span>
                <span className="text-[10px] leading-tight text-studio-muted group-hover:text-studio-text">
                  {asset.label}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Brittney Prompt Bar with VOICE ───────────────────────────────────────────

function BrittneyPromptBar() {
  const [value, setValue] = useState('');
  const [listening, setListening] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  const startListening = useCallback(() => {
    if (typeof window === 'undefined') return;
    // Web Speech API — available in Chrome/Edge; undefined in some environments
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const win = window as unknown as Record<string, unknown>;
    const SR = (win.SpeechRecognition || win.webkitSpeechRecognition) as (new () => SpeechRecognition) | undefined;
    if (!SR) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recog: any = new SR();
    recog.continuous = false;
    recog.interimResults = true;
    recog.lang = 'en-US';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recog.onresult = (e: any) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const transcript = Array.from(e.results as Iterable<SpeechRecognitionResult>)
        .map((r: SpeechRecognitionResult) => r[0].transcript)
        .join('');
      setValue(transcript);
    };
    recog.onend = () => setListening(false);
    recog.start();
    recognitionRef.current = recog;
    setListening(true);
  }, []);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  const suggestions = [
    'Add a treasure chest',
    'Create a boss fight room',
    'Add 3 skeleton guards',
    'Make it foggy',
    'Add ambient torch lighting',
  ];

  return (
    <div className="shrink-0 border-t border-studio-border bg-studio-panel px-4 py-3">
      <div className="mx-auto max-w-4xl">
        {/* Suggestion chips */}
        <div className="mb-2 flex flex-wrap gap-1.5">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => setValue(s)}
              className="rounded-full border border-studio-border bg-black/20 px-2.5 py-0.5 text-[11px] text-studio-muted transition hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-400"
            >
              {s}
            </button>
          ))}
        </div>

        {/* Input row */}
        <div
          className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 transition-all ${listening ? 'border-red-500/60 bg-red-500/5' : 'border-studio-border bg-black/20'}`}
        >
          <Sparkles className="h-4 w-4 shrink-0 text-emerald-400" />
          <input
            className="flex-1 bg-transparent text-sm text-studio-text placeholder:text-studio-muted outline-none"
            placeholder={listening ? 'Listening…' : 'Tell Brittney what to build…'}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && value.trim()) setValue('');
            }}
          />

          {/* BIG voice button */}
          <button
            onClick={listening ? stopListening : startListening}
            title={listening ? 'Stop recording' : 'Click to talk'}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
              listening
                ? 'animate-pulse bg-red-500/20 text-red-400 hover:bg-red-500/30'
                : 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
            }`}
          >
            {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            {listening ? 'Stop' : 'Talk'}
          </button>

          {value.trim() && (
            <button
              onClick={() => setValue('')}
              className="rounded-lg bg-emerald-500/20 px-3 py-1 text-xs font-medium text-emerald-400 transition hover:bg-emerald-500/30"
            >
              Build →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Layout ────────────────────────────────────────────────────────────────────

interface CreatorLayoutProps {
  viewportSlot: React.ReactNode;
}

export function CreatorLayout({ viewportSlot }: CreatorLayoutProps) {
  const setCode = useSceneStore((s) => s.setCode);
  const setGlbUrl = useCharacterStore((s) => s.setGlbUrl);

  // Wizard: show on first visit
  const [wizardOpen, setWizardOpen] = useState(() => {
    if (typeof window === 'undefined') return false;
    return !window.localStorage.getItem('studio-wizard-seen');
  });

  const [characterModalOpen, setCharacterModalOpen] = useState(false);

  // Context menu
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; target: string } | null>(
    null
  );

  // Property inspector
  const [selectedObject, setSelectedObject] = useState<string | null>(null);

  // Undo/redo (keyboard fallback)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') e.preventDefault(); // handled by store
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleLoadTemplate = (code: string) => {
    setCode(code);
    if (typeof window !== 'undefined') window.localStorage.setItem('studio-wizard-seen', '1');
    setWizardOpen(false);
  };

  const handleViewportContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, target: selectedObject ?? 'Object' });
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Top toolbar: undo/redo + hints */}
      <div className="flex shrink-0 items-center gap-2 border-b border-studio-border bg-studio-panel px-3 py-1.5">
        <button
          title="Undo (Ctrl+Z)"
          className="rounded-md p-1 text-studio-muted transition hover:bg-white/10 hover:text-studio-text"
        >
          <UndoIcon className="h-3.5 w-3.5" />
        </button>
        <button
          title="Redo (Ctrl+Y)"
          className="rounded-md p-1 text-studio-muted transition hover:bg-white/10 hover:text-studio-text"
        >
          <RedoIcon className="h-3.5 w-3.5" />
        </button>
        <div className="h-4 w-px bg-studio-border" />
        <span className="text-[11px] text-studio-muted">
          Click objects to edit · Right-click for options · Drag from library to add
        </span>
        <button
          onClick={() => setWizardOpen(true)}
          className="ml-auto flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-emerald-400 transition hover:bg-emerald-500/10"
        >
          <Plus className="h-3 w-3" />
          New World…
        </button>
        <button className="rounded-md p-1 text-studio-muted transition hover:bg-white/10">
          <HelpCircle className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Main row */}
      <div className="flex flex-1 overflow-hidden">
        <SimpleAssetLibrary
          onLoadTemplate={handleLoadTemplate}
          onShowWizard={() => setWizardOpen(true)}
        />

        {/* Viewport */}
        <div
          className="relative flex-1 overflow-hidden"
          onContextMenu={handleViewportContextMenu}
          onClick={() => {
            setSelectedObject(null);
            setContextMenu(null);
          }}
        >
          {viewportSlot}

          {/* Context menu */}
          {contextMenu && (
            <ContextMenu
              x={contextMenu.x}
              y={contextMenu.y}
              targetName={contextMenu.target}
              onEdit={() => setSelectedObject(contextMenu.target)}
              onDuplicate={() => {}}
              onDelete={() => setSelectedObject(null)}
              onClose={() => setContextMenu(null)}
            />
          )}
        </div>

        {/* Right: property inspector when object selected, else quick-add */}
        {selectedObject ? (
          <SimplePropertyInspector
            objectName={selectedObject}
            onClose={() => setSelectedObject(null)}
          />
        ) : (
          <div className="flex w-56 shrink-0 flex-col border-l border-studio-border bg-studio-panel">
            <div className="border-b border-studio-border px-3 py-2.5">
              <p className="text-xs font-semibold text-studio-text">Quick Add</p>
            </div>
            <div className="flex flex-col gap-2 p-3">
              {[
                {
                  label: 'Add Room',
                  emoji: '🏠',
                  hint: 'Drop a pre-built room into the scene',
                  onClick: () => {},
                },
                {
                  label: 'Add NPC',
                  emoji: '🧙',
                  hint: 'Place a character with AI behavior',
                  onClick: () => setCharacterModalOpen(true),
                },
                {
                  label: 'Add Object',
                  emoji: '📦',
                  hint: 'Drag a prop into the world',
                  onClick: () => {},
                },
                {
                  label: 'Add Light',
                  emoji: '💡',
                  hint: 'Illuminate your scene',
                  onClick: () => {},
                },
                {
                  label: 'Add Effect',
                  emoji: '✨',
                  hint: 'Fire, smoke, magic particles',
                  onClick: () => {},
                },
              ].map((item) => (
                <button
                  key={item.label}
                  onClick={item.onClick}
                  title={item.hint}
                  className="flex items-center gap-2.5 rounded-lg border border-studio-border bg-black/20 px-3 py-2 text-left transition-all hover:border-studio-accent/40 hover:bg-studio-accent/10 active:scale-[0.98]"
                >
                  <span className="text-lg">{item.emoji}</span>
                  <div>
                    <p className="text-xs font-medium text-studio-text">{item.label}</p>
                    <p className="text-[10px] text-studio-muted">{item.hint}</p>
                  </div>
                </button>
              ))}
            </div>
            <div className="border-t border-studio-border p-3">
              <p className="text-[10px] leading-relaxed text-studio-muted">
                Drag assets from the left, or ask Brittney below.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Brittney prompt bar */}
      <BrittneyPromptBar />

      {/* Quick-start wizard */}
      {wizardOpen && (
        <QuickStartWizard
          onClose={() => {
            setWizardOpen(false);
            if (typeof window !== 'undefined')
              window.localStorage.setItem('studio-wizard-seen', '1');
          }}
        />
      )}

      {/* Character Creation Modal */}
      <CharacterCreationModal
        isOpen={characterModalOpen}
        onClose={() => setCharacterModalOpen(false)}
        onCharacterCreated={(glbUrl, metadata) => {
          logger.debug('[CreatorLayout] Character created globally:', metadata);
          setGlbUrl(glbUrl);
        }}
      />
    </div>
  );
}
