'use client';

import { use, useState } from 'react';
import { Camera, UploadCloud, CheckCircle2 } from 'lucide-react';

interface MobileScanProps {
  params: Promise<{ token: string }>;
}

export default function MobileScanPage({ params }: MobileScanProps) {
  const { token } = use(params);
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pushState = async (body: Record<string, unknown>) => {
    await fetch(`/api/reconstruction/session?t=${encodeURIComponent(token)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  };

  const sha256Hex = async (file: File): Promise<string> => {
    const buf = await file.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  };

  const onVideoSelected = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    setError(null);
    await pushState({ status: 'capturing' });

    try {
      const videoHash = await sha256Hex(file);
      // MVP transport: report metadata first (actual chunk streaming can follow in next sprint)
      await pushState({
        status: 'uploaded',
        frameCount: Math.max(1, Math.floor(file.size / 100000)),
        videoBytes: file.size,
        videoHash,
      });
      setDone(true);
      await pushState({ status: 'processing' });
      // Simulate server-side enqueue into reconstruction worker
      setTimeout(() => {
        void pushState({ status: 'done' });
      }, 1200);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Upload failed';
      setError(message);
      await pushState({ status: 'error', error: message });
    } finally {
      setUploading(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[#0a0a12] px-4 text-white">
      <div className="text-center">
        <h1 className="text-xl font-semibold">Phone Capture</h1>
        <p className="mt-1 text-xs text-white/50">Token: {token.slice(0, 8)}…</p>
      </div>

      <label className="flex w-full max-w-xs cursor-pointer flex-col items-center gap-2 rounded-2xl border border-white/20 bg-white/5 px-4 py-5 text-center">
        <Camera className="h-6 w-6 text-indigo-300" />
        <span className="text-sm">Capture room video</span>
        <span className="text-xs text-white/50">Use rear camera for best tracking.</span>
        <input
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => void onVideoSelected(e.target.files?.[0] ?? null)}
        />
      </label>

      {uploading && (
        <div className="inline-flex items-center gap-2 text-sm text-indigo-300">
          <UploadCloud className="h-4 w-4 animate-pulse" /> Uploading capture metadata…
        </div>
      )}

      {done && !uploading && (
        <div className="inline-flex items-center gap-2 rounded-lg bg-green-500/10 px-3 py-2 text-sm text-green-300">
          <CheckCircle2 className="h-4 w-4" /> Capture sent. Return to desktop Studio.
        </div>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}
    </main>
  );
}
