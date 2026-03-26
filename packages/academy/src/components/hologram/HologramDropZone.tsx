'use client';

/**
 * HologramDropZone — Drag-and-drop image/GIF/video to hologram converter.
 *
 * Accepts media files via drag-and-drop and generates HoloScript composition
 * code with depth estimation traits. Follows the AssetDropProcessor pattern
 * for consistent Studio UX.
 *
 * Supported formats:
 * - Images: PNG, JPG, JPEG, WebP, AVIF, TIFF
 * - Animated: GIF, APNG, WebP (animated)
 * - Video: MP4, WebM, MOV, MKV
 *
 * @see W.148: Browser-native depth estimation is production-ready
 * @see W.149: Five-tier progressive quality pipeline
 */

import { useState, useCallback, useRef } from 'react';
import { Layers, Upload, Image, Film, Sparkles } from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

interface HologramDropZoneProps {
  /** Called with generated HoloScript code when user drops media */
  onCompositionGenerated: (code: string) => void;
  /** Optional class name for styling */
  className?: string;
}

type MediaType = 'image' | 'gif' | 'video';

interface MediaFile {
  file: File;
  type: MediaType;
  name: string;
  previewUrl: string;
}

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'avif', 'tiff', 'bmp']);
const GIF_EXTENSIONS = new Set(['gif', 'apng']);
const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov', 'mkv', 'avi', 'ogv']);

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

// ── Component ────────────────────────────────────────────────────────────────

export function HologramDropZone({ onCompositionGenerated, className = '' }: HologramDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [generating, setGenerating] = useState(false);
  const dragCounterRef = useRef(0);

  const detectMediaType = useCallback((file: File): MediaType | null => {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (IMAGE_EXTENSIONS.has(ext)) return 'image';
    if (GIF_EXTENSIONS.has(ext)) return 'gif';
    if (VIDEO_EXTENSIONS.has(ext)) return 'video';
    // Check MIME type fallback
    if (file.type.startsWith('image/gif')) return 'gif';
    if (file.type.startsWith('image/')) return 'image';
    if (file.type.startsWith('video/')) return 'video';
    return null;
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounterRef.current = 0;

    const droppedFiles = Array.from(e.dataTransfer.files);
    const mediaFiles: MediaFile[] = [];

    for (const file of droppedFiles) {
      if (file.size > MAX_FILE_SIZE) continue;
      const type = detectMediaType(file);
      if (!type) continue;

      mediaFiles.push({
        file,
        type,
        name: file.name.replace(/\.[^.]+$/, ''),
        previewUrl: URL.createObjectURL(file),
      });
    }

    setFiles(prev => [...prev, ...mediaFiles]);
  }, [detectMediaType]);

  const removeFile = useCallback((index: number) => {
    setFiles(prev => {
      const file = prev[index];
      if (file) URL.revokeObjectURL(file.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const generateComposition = useCallback(() => {
    if (files.length === 0) return;
    setGenerating(true);

    const objects = files.map((media, i) => {
      const yPos = 1.5 + (i * 0.1);
      const xPos = files.length > 1 ? (i - (files.length - 1) / 2) * 2.5 : 0;

      switch (media.type) {
        case 'image':
          return `  object "${media.name}" {
    @image src:"${media.file.name}"
    @depth_estimation { model: "depth-anything-v2-small", backend: "webgpu" }
    @displacement { scale: 0.3, segments: 128 }
    @depth_to_normal
    geometry: "plane"
    position: [${xPos}, ${yPos}, -3]
    scale: [2, 1.5, 1]
  }`;

        case 'gif':
          return `  object "${media.name}" {
    @animated_texture { src: "${media.file.name}", fps: 24, max_frames: 500 }
    @segment { model: "rembg", remove_background: true }
    @depth_estimation { model: "depth-anything-v2-small", backend: "webgpu", temporal_smoothing: 0.8 }
    @holographic_sprite { depth_scale: 0.5, render_mode: "displacement" }
    @billboard { mode: "camera-facing" }
    position: [${xPos}, ${yPos}, -2]
    scale: [2, 2, 1]
  }`;

        case 'video':
          return `  object "${media.name}" {
    @video { src: "${media.file.name}", autoplay: true, loop: true, muted: true }
    @depth_estimation { model: "depth-anything-v2-small", backend: "webgpu", temporal_smoothing: 0.8 }
    @displacement { scale: 0.25, segments: 64 }
    position: [${xPos}, ${yPos}, -3]
    scale: [3, 1.7, 1]
  }`;
      }
    });

    const compositionName = files.length === 1
      ? `Hologram - ${files[0].name}`
      : `Hologram Gallery (${files.length} items)`;

    const code = `composition "${compositionName}" {
  environment {
    skybox: "night"
    ambient_light: 0.2
    fog: { color: "#050510", density: 0.02 }
  }

  object "Floor" {
    @static
    geometry: "plane"
    position: [0, 0, 0]
    rotation: [-90, 0, 0]
    scale: [20, 20, 1]
    color: "#0a0a12"
    material: { roughness: 0.1, metalness: 0.6 }
  }

${objects.join('\n\n')}
}
`;

    onCompositionGenerated(code);
    setGenerating(false);

    // Cleanup preview URLs
    files.forEach(f => URL.revokeObjectURL(f.previewUrl));
    setFiles([]);
  }, [files, onCompositionGenerated]);

  return (
    <div className={`flex flex-col gap-4 ${className}`}>
      {/* Drop Zone */}
      <div
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 transition-all duration-200 ${
          isDragging
            ? 'border-purple-500/80 bg-purple-500/10 scale-[1.01]'
            : 'border-studio-border bg-black/20 hover:border-studio-border/60'
        }`}
      >
        <div className={`mb-3 rounded-full p-3 ${isDragging ? 'bg-purple-500/20' : 'bg-white/5'}`}>
          {isDragging ? (
            <Layers className="h-8 w-8 text-purple-400 animate-pulse" />
          ) : (
            <Upload className="h-8 w-8 text-studio-muted" />
          )}
        </div>
        <p className="text-sm font-medium text-studio-text">
          {isDragging ? 'Drop to create hologram' : 'Drop images, GIFs, or videos'}
        </p>
        <p className="text-[11px] text-studio-muted mt-1">
          PNG, JPG, GIF, MP4, WebM (max 100 MB)
        </p>
      </div>

      {/* File Preview List */}
      {files.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-studio-text">
            {files.length} file{files.length !== 1 ? 's' : ''} ready
          </p>
          <div className="flex flex-wrap gap-2">
            {files.map((media, i) => (
              <div
                key={i}
                className="relative group flex items-center gap-2 rounded-lg border border-studio-border bg-black/30 px-3 py-2"
              >
                {media.type === 'video' ? (
                  <Film className="h-4 w-4 text-purple-400" />
                ) : (
                  <Image className="h-4 w-4 text-purple-400" />
                )}
                <span className="text-[11px] text-studio-muted max-w-[120px] truncate">
                  {media.file.name}
                </span>
                <span className="text-[9px] text-purple-400/60 uppercase">{media.type}</span>
                <button
                  onClick={() => removeFile(i)}
                  className="ml-1 text-studio-muted hover:text-red-400 transition text-xs"
                >
                  x
                </button>
              </div>
            ))}
          </div>

          {/* Generate Button */}
          <button
            onClick={generateComposition}
            disabled={generating}
            className="mt-2 flex items-center justify-center gap-2 rounded-lg bg-purple-500/20 px-4 py-2 text-sm font-medium text-purple-400 transition hover:bg-purple-500/30 disabled:opacity-40"
          >
            <Sparkles className="h-4 w-4" />
            {generating ? 'Generating...' : 'Create Hologram Composition'}
          </button>
        </div>
      )}
    </div>
  );
}
