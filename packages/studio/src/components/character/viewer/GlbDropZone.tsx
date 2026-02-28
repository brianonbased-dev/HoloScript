'use client';

import { useRef, useState } from 'react';
import { Upload, FolderOpen, Sparkles } from 'lucide-react';
import { useCharacterStore } from '@/lib/store';
import { CharacterCreationModal, type CharacterMetadata } from '../creation/CharacterCreationModal';

export function GlbDropZone() {
  const setGlbUrl = useCharacterStore((s) => s.setGlbUrl);
  const glbUrl = useCharacterStore((s) => s.glbUrl);
  const [dragging, setDragging] = useState(false);
  const [creationModalOpen, setCreationModalOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    if (!file.name.match(/\.(glb|gltf|vrm)$/i)) return;
    const url = URL.createObjectURL(file);
    setGlbUrl(url);
  };

  const handleCharacterCreated = (glbUrl: string, metadata?: CharacterMetadata) => {
    console.log('[CharacterCreation] Character created:', metadata);
    setGlbUrl(glbUrl);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  if (glbUrl) return null; // hide once loaded — model is in viewport

  return (
    <>
      <div className="flex h-full flex-col items-center justify-center gap-6 p-8">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`flex w-full max-w-sm cursor-pointer flex-col items-center gap-4 rounded-2xl border-2 border-dashed p-10 text-center transition-all ${
          dragging
            ? 'border-purple-400 bg-purple-500/10'
            : 'border-studio-border bg-black/20 hover:border-purple-400/60 hover:bg-purple-500/5'
        }`}
      >
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-purple-500/15 text-4xl">
          🦴
        </div>
        <div>
          <p className="text-sm font-semibold text-studio-text">
            {dragging ? 'Drop your .glb here!' : 'Load a Character'}
          </p>
          <p className="mt-1 text-xs text-studio-muted">
            Drag & drop a .glb or .gltf file, or click to browse
          </p>
        </div>

        <div className="flex gap-2">
          <div className="flex items-center gap-1.5 rounded-lg border border-studio-border bg-black/20 px-3 py-1.5 text-xs text-studio-muted">
            <Upload className="h-3.5 w-3.5" />
            Drag & Drop
          </div>
          <div className="flex items-center gap-1.5 rounded-lg border border-purple-500/40 bg-purple-500/10 px-3 py-1.5 text-xs text-purple-400">
            <FolderOpen className="h-3.5 w-3.5" />
            Browse Files
          </div>
        </div>

        <p className="text-[10px] text-studio-muted/60">
          Works with Mixamo, VRoid, Blender exports
        </p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".glb,.gltf,.vrm"
        className="hidden"
        onChange={(e) => { const file = e.target.files?.[0]; if (file) handleFile(file); }}
      />

      {/* Divider */}
      <div className="flex w-full max-w-sm items-center gap-3">
        <div className="h-px flex-1 bg-studio-border" />
        <span className="text-xs font-semibold uppercase tracking-wide text-studio-muted">or</span>
        <div className="h-px flex-1 bg-studio-border" />
      </div>

      {/* Create Character Button */}
      <button
        onClick={() => setCreationModalOpen(true)}
        className="flex w-full max-w-sm items-center justify-center gap-2 rounded-xl border border-purple-500/40 bg-purple-500/10 px-6 py-4 font-semibold text-purple-300 transition-all hover:border-purple-500 hover:bg-purple-500/20 active:scale-95"
      >
        <Sparkles className="h-5 w-5" />
        Create Character
      </button>
    </div>

    {/* Character Creation Modal */}
    <CharacterCreationModal
      isOpen={creationModalOpen}
      onClose={() => setCreationModalOpen(false)}
      onCharacterCreated={handleCharacterCreated}
    />
    </>
  );
}
