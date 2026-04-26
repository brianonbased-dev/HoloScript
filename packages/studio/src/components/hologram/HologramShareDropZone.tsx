'use client';

/**
 * HologramShareDropZone — drop a 2D media file, get a shareable /g/<hash> URL.
 *
 * Pipeline:
 *   1. User drops an image / GIF / video.
 *   2. Component runs `createHologram(media, kind, createBrowserProviders())`
 *      in the browser (WebGPU depth + Three.js quilt render).
 *   3. Resulting bundle (meta + depth.bin + normal.bin + quilt.png) is
 *      POSTed as multipart to /api/hologram/upload.
 *   4. On success, surfaces the canonical share URL `/g/<hash>` with a
 *      one-click copy button.
 *
 * Distinct from the existing `HologramDropZone`, which generates HoloScript
 * composition CODE for the editor canvas. This component instead PUBLISHES
 * a hologram and yields a public URL.
 *
 * SECURITY:
 *   - Files are validated by extension + MIME + size before processing.
 *   - The server recomputes the bundle hash (it ignores any client-supplied
 *     value), so the URL we surface is the canonical hash from the response.
 *   - We never echo the user's filename into a URL; only the server-returned
 *     hash is interpolated.
 *
 * @see Sprint 2 (A): board task task_1776678231432_a08m
 */

import { useCallback, useRef, useState } from 'react';

import {
  buildShareUploadFormData,
  detectMediaSourceKind,
  isValidUploadResponse,
  shareUrlForHash,
  type UploadResponse,
} from './hologramShareLogic';

// ── Types ────────────────────────────────────────────────────────────────────

export interface HologramShareDropZoneProps {
  /** Optional className passed to the outer wrapper. */
  className?: string;
  /** Override fetch (tests). */
  fetchImpl?: typeof fetch;
  /**
   * Override the bundle builder. In production this calls
   * `createHologram(media, kind, createBrowserProviders())`. Override is used
   * by tests + for future server-side rendering paths.
   */
  buildBundle?: (
    media: Uint8Array,
    kind: 'image' | 'gif' | 'video'
  ) => Promise<{
    meta: unknown;
    depthBin: Uint8Array;
    normalBin: Uint8Array;
    quiltPng?: Uint8Array;
    mvhevcMp4?: Uint8Array;
    parallaxWebm?: Uint8Array;
  }>;
}

type Status =
  | { kind: 'idle' }
  | { kind: 'processing'; filename: string }
  | { kind: 'uploading'; filename: string }
  | { kind: 'done'; hash: string; url: string }
  | { kind: 'error'; message: string };

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

// ── Component ────────────────────────────────────────────────────────────────

export function HologramShareDropZone({
  className = '',
  fetchImpl,
  buildBundle: buildBundleOverride,
}: HologramShareDropZoneProps) {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [isDragging, setIsDragging] = useState(false);
  const [copied, setCopied] = useState(false);
  const dragCounterRef = useRef(0);

  const handleFile = useCallback(
    async (file: File) => {
      if (file.size > MAX_FILE_SIZE) {
        setStatus({ kind: 'error', message: 'File exceeds 100 MB limit' });
        return;
      }
      const kind = detectMediaSourceKind(file.name, file.type);
      if (!kind) {
        setStatus({ kind: 'error', message: 'Unsupported media type' });
        return;
      }

      setStatus({ kind: 'processing', filename: file.name });

      let bundle: Awaited<ReturnType<NonNullable<typeof buildBundleOverride>>>;
      try {
        const ab = await file.arrayBuffer();
        const media = new Uint8Array(ab);
        const builder = buildBundleOverride ?? defaultBuildBundle;
        bundle = await builder(media, kind);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'unknown error';
        setStatus({ kind: 'error', message: `Bundle build failed: ${msg}` });
        return;
      }

      setStatus({ kind: 'uploading', filename: file.name });

      const fd = buildShareUploadFormData(bundle);

      let response: Response;
      try {
        const fetcher = fetchImpl ?? fetch;
        response = await fetcher('/api/hologram/upload', {
          method: 'POST',
          body: fd,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'network error';
        setStatus({ kind: 'error', message: `Upload failed: ${msg}` });
        return;
      }

      if (!response.ok) {
        let body: unknown = null;
        try {
          body = await response.json();
        } catch {
          // ignore; status code is the only signal
        }
        const code =
          body && typeof body === 'object' && 'code' in body
            ? String((body as { code: unknown }).code)
            : `http_${response.status}`;
        setStatus({ kind: 'error', message: `Upload rejected: ${code}` });
        return;
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        setStatus({ kind: 'error', message: 'Invalid server response' });
        return;
      }

      if (!isValidUploadResponse(payload)) {
        setStatus({ kind: 'error', message: 'Server returned no hash' });
        return;
      }

      const url = shareUrlForHash(payload.hash);
      setStatus({ kind: 'done', hash: payload.hash, url });
      setCopied(false);
    },
    [fetchImpl, buildBundleOverride]
  );

  const onDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDragging(false);
    }
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      dragCounterRef.current = 0;
      const file = e.dataTransfer.files[0];
      if (file) {
        void handleFile(file);
      }
    },
    [handleFile]
  );

  const onCopy = useCallback(async () => {
    if (status.kind !== 'done') return;
    const target = `${
      typeof window !== 'undefined' ? window.location.origin : ''
    }${status.url}`;
    try {
      if (
        typeof navigator !== 'undefined' &&
        navigator.clipboard &&
        typeof navigator.clipboard.writeText === 'function'
      ) {
        await navigator.clipboard.writeText(target);
        setCopied(true);
      }
    } catch {
      setCopied(false);
    }
  }, [status]);

  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      <div
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
        role="region"
        aria-label="HoloGram share drop zone"
        className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 transition ${
          isDragging
            ? 'border-purple-500/80 bg-purple-500/10'
            : 'border-studio-border bg-black/20'
        }`}
      >
        <p className="text-sm font-medium text-studio-text">
          {isDragging ? 'Drop to publish hologram' : 'Drop image, GIF, or video to share'}
        </p>
        <p className="mt-1 text-[11px] text-studio-muted">
          Generates a /g/&lt;hash&gt; URL anyone can open
        </p>
      </div>

      {status.kind === 'processing' && (
        <p className="text-xs text-studio-muted">
          Building hologram from <span className="text-studio-text">{status.filename}</span>...
        </p>
      )}
      {status.kind === 'uploading' && (
        <p className="text-xs text-studio-muted">
          Uploading <span className="text-studio-text">{status.filename}</span>...
        </p>
      )}
      {status.kind === 'error' && (
        <p className="text-xs text-red-400" role="alert">
          {status.message}
        </p>
      )}
      {status.kind === 'done' && (
        <div className="flex flex-col gap-2 rounded-lg border border-studio-border bg-black/30 p-3">
          <p className="text-xs text-studio-muted">Published at:</p>
          <code className="block break-all rounded bg-black/40 px-2 py-1 text-xs text-purple-300">
            {status.url}
          </code>
          <button
            type="button"
            onClick={onCopy}
            className="self-start rounded-md bg-purple-500/20 px-3 py-1.5 text-xs font-medium text-purple-300 transition hover:bg-purple-500/30"
          >
            {copied ? 'Copied!' : 'Copy URL'}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Default bundle builder (browser-only) ───────────────────────────────────

async function defaultBuildBundle(
  media: Uint8Array,
  kind: 'image' | 'gif' | 'video'
): Promise<{
  meta: unknown;
  depthBin: Uint8Array;
  normalBin: Uint8Array;
  quiltPng?: Uint8Array;
  mvhevcMp4?: Uint8Array;
  parallaxWebm?: Uint8Array;
}> {
  // Dynamic import keeps the heavy WebGPU/Three.js stack out of the
  // SSR / API bundles. Only mounted dropzone instances pay the cost.
  const { createHologram } = await import('@holoscript/engine/hologram');
  const { createBrowserProviders } = await import(
    '@holoscript/engine/hologram/browser'
  );
  const bundle = await createHologram(media, kind, createBrowserProviders());
  return {
    meta: bundle.meta,
    depthBin: bundle.depthBin,
    normalBin: bundle.normalBin,
    quiltPng: bundle.quiltPng,
    mvhevcMp4: bundle.mvhevcMp4,
    parallaxWebm: bundle.parallaxWebm,
  };
}

export default HologramShareDropZone;

// Re-export pure helpers so consumers (tests, other components) can use them
// without importing the React shell.
export {
  buildShareUploadFormData,
  detectMediaSourceKind,
  isValidUploadResponse,
  shareUrlForHash,
  type UploadResponse,
};
