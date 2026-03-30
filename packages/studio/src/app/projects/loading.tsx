export default function ProjectsLoading() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <div className="relative h-12 w-12">
        <div className="absolute inset-0 rounded-full border-2 border-studio-border" />
        <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-studio-accent" />
      </div>
      <p className="text-sm text-studio-muted animate-pulse">Loading Projects...</p>
    </div>
  );
}
