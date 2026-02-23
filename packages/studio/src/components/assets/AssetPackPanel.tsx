'use client';

/**
 * AssetPackPanel — drag-and-drop multi-asset pack importer.
 *
 * Supports dragging an entire folder's worth of assets (GLTF/GLB files)
 * or selecting multiple files at once. Shows per-file import progress
 * and generates a HoloScript trait snippet for each imported mesh.
 *
 * Uses the existing /api/assets/process endpoint and
 * useAssetDropProcessor hook.
 */

import { useState, useCallback, useRef } from 'react';
import { Package, X, Upload, CheckCircle, XCircle, Loader2, Copy, File } from 'lucide-react';
import { useAssetDropProcessor } from '@/components/assets/AssetDropProcessor';

interface ImportedAsset {
  id: string;
  fileName: string;
  meshCount: number;
  trait: string; // generated HoloScript trait snippet
}

interface FileEntry {
  file: File;
  state: 'queued' | 'processing' | 'done' | 'error';
  error?: string;
  result?: ImportedAsset;
}

function makeTraitSnippet(assetId: string, fileName: string): string {
  const name = fileName.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_]/g, '_');
  return `object "${name}" {\n  @mesh(src: "/assets/${assetId}", geometry: "imported")\n  @material(color: "#ffffff", type: "standard")\n  @transform(position: [0, 0, 0])\n}`;
}

interface AssetPackPanelProps {
  onClose: () => void;
}

export function AssetPackPanel({ onClose }: AssetPackPanelProps) {
  const { processFile } = useAssetDropProcessor();
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const enqueue = useCallback((incoming: File[]) => {
    const entries: FileEntry[] = incoming
      .filter((f) => /\.(glb|gltf|png|jpg|jpeg|webp|hdr|mp3|wav|ogg)$/i.test(f.name))
      .map((f) => ({ file: f, state: 'queued' as const }));
    setFiles((prev) => [...prev, ...entries]);
  }, []);

  // Process all queued files sequentially
  const processAll = useCallback(async () => {
    setFiles((prev) =>
      prev.map((e) => (e.state === 'queued' ? { ...e, state: 'processing' } : e))
    );

    for (const entry of files.filter((e) => e.state === 'queued')) {
      setFiles((prev) =>
        prev.map((e) => (e.file === entry.file ? { ...e, state: 'processing' } : e))
      );
      try {
        await processFile(entry.file);
        const assetId = `asset_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
        const meshCount = entry.file.name.match(/\.(glb|gltf)$/i) ? 1 : 0;
        const result: ImportedAsset = {
          id: assetId,
          fileName: entry.file.name,
          meshCount,
          trait: makeTraitSnippet(assetId, entry.file.name),
        };
        setFiles((prev) =>
          prev.map((e) =>
            e.file === entry.file ? { ...e, state: 'done', result } : e
          )
        );
      } catch (err) {
        setFiles((prev) =>
          prev.map((e) =>
            e.file === entry.file
              ? { ...e, state: 'error', error: String(err) }
              : e
          )
        );
      }
    }
  }, [files, processFile]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const dropped = Array.from(e.dataTransfer.files);
      enqueue(dropped);
    },
    [enqueue]
  );

  const copyTrait = (trait: string, id: string) => {
    navigator.clipboard.writeText(trait).then(() => {
      setCopied(id);
      setTimeout(() => setCopied(null), 1500);
    });
  };

  const queued = files.filter((e) => e.state === 'queued').length;
  const processing = files.filter((e) => e.state === 'processing').length;

  return (
    <div className="flex h-full flex-col bg-studio-panel text-studio-text">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-studio-border px-3 py-2.5">
        <Package className="h-4 w-4 text-studio-accent" />
        <span className="text-[12px] font-semibold">Asset Pack Importer</span>
        <button onClick={onClose} className="ml-auto rounded p-1 text-studio-muted hover:text-studio-text">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`mx-3 mt-3 flex flex-col items-center gap-2 rounded-xl border-2 border-dashed py-6 transition ${
          isDragging
            ? 'border-studio-accent bg-studio-accent/10'
            : 'border-studio-border bg-studio-surface/50'
        }`}
      >
        <Upload className={`h-8 w-8 transition ${isDragging ? 'text-studio-accent' : 'text-studio-muted/40'}`} />
        <p className="text-[11px] text-studio-muted">
          {isDragging ? 'Drop files here' : 'Drag GLB/GLTF/images here'}
        </p>
        <button
          onClick={() => inputRef.current?.click()}
          className="rounded-lg border border-studio-border bg-studio-panel px-3 py-1 text-[11px] text-studio-muted hover:text-studio-text transition"
        >
          Browse files
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".glb,.gltf,.png,.jpg,.jpeg,.webp,.hdr,.mp3,.wav,.ogg"
          className="hidden"
          onChange={(e) => enqueue(Array.from(e.target.files ?? []))}
        />
      </div>

      {/* File list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {files.length === 0 && (
          <p className="py-4 text-center text-[11px] text-studio-muted">No files added yet.</p>
        )}

        {files.map((entry, i) => (
          <div key={i} className="rounded-xl border border-studio-border bg-studio-surface p-2.5">
            <div className="flex items-center gap-2">
              <File className="h-4 w-4 shrink-0 text-studio-muted" />
              <span className="flex-1 truncate text-[11px] font-medium">{entry.file.name}</span>
              <span className="text-[10px] text-studio-muted">
                {(entry.file.size / 1024).toFixed(0)} KB
              </span>
              {entry.state === 'queued' && <span className="text-[9px] text-studio-muted">Queued</span>}
              {entry.state === 'processing' && <Loader2 className="h-3.5 w-3.5 animate-spin text-studio-accent" />}
              {entry.state === 'done' && <CheckCircle className="h-3.5 w-3.5 text-green-400" />}
              {entry.state === 'error' && <XCircle className="h-3.5 w-3.5 text-red-400" />}
            </div>

            {entry.state === 'error' && (
              <p className="mt-1 text-[10px] text-red-400">{entry.error}</p>
            )}

            {entry.state === 'done' && entry.result && /\.(glb|gltf)$/i.test(entry.file.name) && (
              <div className="mt-2 rounded-lg bg-[#070710] p-2 font-mono text-[10px] text-studio-muted relative">
                <pre className="overflow-x-auto">{entry.result.trait}</pre>
                <button
                  onClick={() => copyTrait(entry.result!.trait, entry.result!.id)}
                  className="absolute right-2 top-2 rounded p-0.5 text-studio-muted hover:text-studio-accent"
                  title="Copy trait"
                >
                  {copied === entry.result.id ? (
                    <CheckCircle className="h-3.5 w-3.5 text-green-400" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Footer action */}
      {queued > 0 && (
        <div className="shrink-0 border-t border-studio-border p-3">
          <button
            onClick={processAll}
            disabled={processing > 0}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-studio-accent py-2 text-[12px] font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
          >
            {processing > 0 ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Processing…</>
            ) : (
              <><Upload className="h-4 w-4" /> Import {queued} file{queued !== 1 ? 's' : ''}</>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
