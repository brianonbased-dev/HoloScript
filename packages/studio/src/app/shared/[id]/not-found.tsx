import Link from 'next/link';
import { Globe } from 'lucide-react';

export default function SharedNotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[#0a0a12] text-studio-text">
      <Globe className="h-12 w-12 text-studio-muted/40" />
      <div className="text-center">
        <h1 className="mb-2 text-2xl font-bold">Scene not found</h1>
        <p className="text-sm text-studio-muted">
          This scene may have been removed or the link is incorrect.
        </p>
      </div>
      <div className="flex gap-3">
        <Link
          href="/create"
          className="rounded-lg bg-studio-accent px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
        >
          Create your own
        </Link>
        <Link
          href="/"
          className="rounded-lg border border-studio-border px-4 py-2 text-sm text-studio-muted hover:text-studio-text"
        >
          Home
        </Link>
      </div>
    </div>
  );
}
