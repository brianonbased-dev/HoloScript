export default function CreateLoading() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <div className="relative h-16 w-16">
        <div className="absolute inset-0 rounded-full border-2 border-studio-border" />
        <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-studio-accent" />
      </div>
      <div className="text-center">
        <p className="text-sm font-medium">Loading Scene Editor</p>
        <p className="text-xs text-studio-muted animate-pulse mt-1">Initializing 3D viewport, node graph, and editor panels...</p>
      </div>
    </div>
  );
}
