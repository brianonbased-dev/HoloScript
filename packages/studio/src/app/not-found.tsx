import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-studio-accent/10">
        <span className="text-4xl font-bold text-studio-accent">404</span>
      </div>
      <div className="text-center">
        <h1 className="mb-2 text-2xl font-bold">Page not found</h1>
        <p className="text-studio-muted">
          The scene you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
      </div>
      <Link
        href="/"
        className="rounded-lg bg-studio-accent px-6 py-2.5 text-sm font-medium text-white transition hover:bg-studio-accent/80"
      >
        Back to Studio
      </Link>
    </div>
  );
}
