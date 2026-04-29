export const metadata = {
  title: 'Avatar Authoring — HoloScript Studio',
  description: 'Proof-of-concept avatar composer: assemble characters from parts, preview in 3D, and export to GLB/VRM.',
};

export default function AvatarLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-screen w-screen overflow-hidden bg-studio-bg text-studio-text">
      {children}
    </div>
  );
}
