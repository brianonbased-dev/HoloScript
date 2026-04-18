import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Globe, ExternalLink, Clock, User, Code2, Eye } from 'lucide-react';
import { ImmersiveViewer } from './ImmersiveViewer.client';

interface SharedScene {
  id: string;
  name: string;
  author: string;
  createdAt: string;
  views: number;
  code?: string;
}

async function fetchScene(id: string): Promise<SharedScene | null> {
  try {
    // During static/SSR generation we can't use relative URLs — use env var in production
    const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3100';
    const res = await fetch(`${base}/api/share/${id}`, {
      next: { revalidate: 60 }, // ISR — revalidate every 60 s
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scene = await fetchScene(id);
  if (!scene) return { title: 'Scene not found — HoloScript Studio' };
  return {
    title: `${scene.name} by ${scene.author} — HoloScript Studio`,
    description: `View this HoloScript scene shared by ${scene.author}`,
    openGraph: {
      title: scene.name,
      description: `HoloScript scene by ${scene.author}`,
      type: 'website',
    },
  };
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default async function SharedScenePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scene = await fetchScene(id);

  if (!scene) notFound();

  return (
    <div className="flex min-h-screen flex-col bg-[#0a0a12] text-studio-text">
      {/* Header */}
      <header className="border-b border-studio-border bg-studio-panel/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-6 py-4">
          <Link
            href="/"
            className="flex items-center gap-2 text-studio-muted transition hover:text-studio-text"
          >
            <Globe className="h-5 w-5 text-studio-accent" />
            <span className="font-bold tracking-tight">HoloScript Studio</span>
          </Link>
          <span className="text-studio-border">/</span>
          <span className="text-studio-muted">Community</span>
          <span className="text-studio-border">/</span>
          <span className="truncate text-studio-text font-medium">{scene.name}</span>

          <div className="ml-auto flex items-center gap-3">
            <Link
              href={`/create?scene=${encodeURIComponent(scene.id)}`}
              className="flex items-center gap-1.5 rounded-lg bg-studio-accent px-3 py-1.5 text-[12px] font-semibold text-white transition hover:brightness-110"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Open in Studio
            </Link>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
        {/* Scene info card */}
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4 rounded-xl border border-studio-border bg-studio-panel p-5">
          <div>
            <h1 className="text-2xl font-bold">{scene.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-4 text-[12px] text-studio-muted">
              <span className="flex items-center gap-1">
                <User className="h-3.5 w-3.5" /> {scene.author}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" /> {timeAgo(scene.createdAt)}
              </span>
              <span className="flex items-center gap-1">
                <Eye className="h-3.5 w-3.5" /> {scene.views} views
              </span>
            </div>
          </div>

          {/* Share token badge */}
          <div className="rounded-lg border border-studio-border bg-studio-surface px-3 py-2 text-[11px]">
            <p className="text-studio-muted">Scene ID</p>
            <code className="font-mono text-studio-accent">{scene.id}</code>
          </div>
        </div>

        {/* 3D preview + Enter VR + in-VR Publish QR (G2 + G6) */}
        {scene.code && (
          <div className="mb-6">
            <ImmersiveViewer code={scene.code} name={scene.name} />
          </div>
        )}

        {/* Code viewer */}
        {scene.code && (
          <div className="flex flex-col rounded-xl border border-studio-border overflow-hidden">
            <div className="flex items-center gap-2 border-b border-studio-border bg-studio-panel px-4 py-2.5">
              <Code2 className="h-4 w-4 text-studio-accent" />
              <span className="text-[12px] font-medium text-studio-text">HoloScript Source</span>
              <span className="ml-auto text-[10px] text-studio-muted">
                {scene.code.split('\n').length} lines
              </span>
            </div>
            <pre className="overflow-auto bg-[#070710] p-5 text-[12px] leading-relaxed text-studio-text font-mono max-h-[60vh]">
              <code>{scene.code}</code>
            </pre>
          </div>
        )}

        {/* CTA footer */}
        <div className="mt-10 rounded-xl border border-studio-accent/20 bg-studio-accent/5 p-6 text-center">
          <p className="mb-3 text-studio-muted text-sm">
            Want to remix this scene or create your own?
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              href={`/create?scene=${encodeURIComponent(scene.id)}`}
              className="rounded-lg bg-studio-accent px-4 py-2 text-[13px] font-semibold text-white transition hover:brightness-110"
            >
              Open in Studio →
            </Link>
            <Link
              href="/create"
              className="rounded-lg border border-studio-border bg-studio-panel px-4 py-2 text-[13px] text-studio-muted transition hover:text-studio-text"
            >
              Create from scratch
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
