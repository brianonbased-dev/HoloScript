'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import { Center, Grid as ThreeGrid, OrbitControls } from '@react-three/drei';
import {
  Box,
  Check,
  Clapperboard,
  Cuboid,
  Eye,
  Film,
  FolderOpen,
  Grid3X3,
  Image as ImageIcon,
  Maximize2,
  Monitor,
  Music2,
  Upload,
  View,
  X,
} from 'lucide-react';
import { Group, TextureLoader, VideoTexture } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  CREATOR_ACCEPTED_EXTENSIONS,
  CreatorAssetRecord,
  createCreatorAssetRecord,
  formatCreatorAssetSize,
} from './creatorAssets';

type PreviewMode = 'spatial' | 'flat';
type QuestState = 'idle' | 'ready' | 'unsupported' | 'error';

type NavigatorWithXR = Navigator & {
  xr?: {
    isSessionSupported?: (mode: string) => Promise<boolean>;
  };
};

function EmptyScene() {
  const ref = useRef<Group>(null);
  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.y += delta * 0.18;
  });

  return (
    <group ref={ref}>
      <mesh position={[-0.75, 0.1, 0]}>
        <boxGeometry args={[0.55, 0.55, 0.55]} />
        <meshStandardMaterial color="#3b82f6" roughness={0.46} metalness={0.18} />
      </mesh>
      <mesh position={[0.25, -0.04, 0.2]}>
        <sphereGeometry args={[0.34, 32, 32]} />
        <meshStandardMaterial color="#22c55e" roughness={0.5} metalness={0.1} />
      </mesh>
      <mesh position={[0.95, 0.12, -0.12]} rotation={[0.45, 0, 0]}>
        <torusGeometry args={[0.28, 0.08, 16, 42]} />
        <meshStandardMaterial color="#f59e0b" roughness={0.38} metalness={0.24} />
      </mesh>
    </group>
  );
}

function ModelAsset({ asset }: { asset: CreatorAssetRecord }) {
  const [scene, setScene] = useState<Group | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setScene(null);
    setFailed(false);

    const loader = new GLTFLoader();
    asset.file
      .arrayBuffer()
      .then((buffer) => {
        loader.parse(
          buffer,
          '',
          (gltf) => {
            if (!cancelled) setScene(gltf.scene);
          },
          () => {
            if (!cancelled) setFailed(true);
          }
        );
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [asset.file]);

  if (!scene || failed) return <ProxyAsset asset={asset} />;

  return (
    <Center>
      <primitive object={scene} scale={1.2} />
    </Center>
  );
}

function ImageAsset({ asset }: { asset: CreatorAssetRecord }) {
  const texture = useLoader(TextureLoader, asset.objectUrl);
  return (
    <mesh>
      <planeGeometry args={[2.6, 1.6]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  );
}

function VideoAsset({ asset }: { asset: CreatorAssetRecord }) {
  const texture = useMemo(() => {
    const video = document.createElement('video');
    video.src = asset.objectUrl;
    video.crossOrigin = 'anonymous';
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    void video.play().catch(() => undefined);
    return new VideoTexture(video);
  }, [asset.objectUrl]);

  useEffect(() => {
    return () => {
      const video = texture.image as HTMLVideoElement;
      video.pause();
      texture.dispose();
    };
  }, [texture]);

  return (
    <mesh>
      <planeGeometry args={[2.8, 1.58]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  );
}

function ProxyAsset({ asset }: { asset: CreatorAssetRecord }) {
  const ref = useRef<Group>(null);
  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.y += delta * 0.3;
  });

  const color = asset.kind === 'audio' ? '#06b6d4' : '#a855f7';

  return (
    <group ref={ref}>
      <mesh>
        <icosahedronGeometry args={[0.72, 1]} />
        <meshStandardMaterial color={color} roughness={0.38} metalness={0.18} />
      </mesh>
      <mesh scale={1.22}>
        <ringGeometry args={[0.68, 0.72, 56]} />
        <meshBasicMaterial color={color} transparent opacity={0.3} />
      </mesh>
    </group>
  );
}

function AssetScene({ asset }: { asset: CreatorAssetRecord | null }) {
  if (!asset) return <EmptyScene />;
  if (asset.format === 'glb' || asset.format === 'gltf') return <ModelAsset asset={asset} />;
  if (asset.kind === 'image') return <ImageAsset asset={asset} />;
  if (asset.kind === 'video') return <VideoAsset asset={asset} />;
  return <ProxyAsset asset={asset} />;
}

function CreatorCanvas({ asset, mode }: { asset: CreatorAssetRecord | null; mode: PreviewMode }) {
  return (
    <section className="relative min-h-[360px] flex-1 overflow-hidden bg-[#090b10]">
      <Canvas
        camera={{ position: mode === 'spatial' ? [3.1, 2.2, 4.3] : [0, 0, 4.8], fov: 42 }}
        dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: false }}
      >
        <color attach="background" args={['#090b10']} />
        <ambientLight intensity={0.48} />
        <directionalLight position={[4, 5, 6]} intensity={1.45} />
        <directionalLight position={[-5, 2, -3]} intensity={0.32} color="#38bdf8" />
        {mode === 'spatial' && (
          <ThreeGrid
            args={[8, 8]}
            cellColor="#334155"
            sectionColor="#0ea5e9"
            fadeDistance={18}
            fadeStrength={1.6}
            position={[0, -0.86, 0]}
          />
        )}
        <Suspense fallback={<EmptyScene />}>
          <AssetScene asset={asset} />
        </Suspense>
        <OrbitControls
          enablePan={mode === 'spatial'}
          enableZoom
          minDistance={1.8}
          maxDistance={10}
        />
      </Canvas>
      <div className="pointer-events-none absolute left-4 top-4 rounded-md border border-white/10 bg-black/45 px-3 py-2 text-xs text-studio-text backdrop-blur">
        {asset ? asset.name : 'Untitled piece'}
      </div>
    </section>
  );
}

function assetIcon(asset: CreatorAssetRecord) {
  if (asset.kind === 'model') return Cuboid;
  if (asset.kind === 'video') return Film;
  if (asset.kind === 'image') return ImageIcon;
  if (asset.kind === 'audio') return Music2;
  return Box;
}

export function CreatorMode() {
  const [assets, setAssets] = useState<CreatorAssetRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [previewMode, setPreviewMode] = useState<PreviewMode>('spatial');
  const [questState, setQuestState] = useState<QuestState>('idle');
  const [questDetail, setQuestDetail] = useState('Local draft not sent yet.');
  const inputRef = useRef<HTMLInputElement>(null);
  const assetsRef = useRef<CreatorAssetRecord[]>([]);

  const selectedAsset = useMemo(
    () => assets.find((asset) => asset.id === selectedId) ?? assets[0] ?? null,
    [assets, selectedId]
  );

  useEffect(() => {
    assetsRef.current = assets;
  }, [assets]);

  useEffect(() => {
    return () => {
      for (const asset of assetsRef.current) URL.revokeObjectURL(asset.objectUrl);
    };
  }, []);

  const addFiles = useCallback((fileList: FileList | File[]) => {
    const records = Array.from(fileList).map(createCreatorAssetRecord);
    setAssets((current) => {
      if (records.length > 0 && current.length === 0) setSelectedId(records[0].id);
      return [...current, ...records];
    });
    setQuestState('idle');
  }, []);

  const removeAsset = useCallback((asset: CreatorAssetRecord) => {
    URL.revokeObjectURL(asset.objectUrl);
    setAssets((current) => current.filter((item) => item.id !== asset.id));
    setSelectedId((current) => (current === asset.id ? null : current));
  }, []);

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragging(false);
      if (event.dataTransfer.files.length > 0) addFiles(event.dataTransfer.files);
    },
    [addFiles]
  );

  const handleQuestPreview = useCallback(async () => {
    const draft = {
      piece: 'Untitled piece',
      selectedAsset: selectedAsset?.name ?? null,
      assets: assets.map((asset) => ({
        name: asset.name,
        format: asset.format,
        kind: asset.kind,
        sizeBytes: asset.sizeBytes,
      })),
      previewMode,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem('holoscript.creator.localDraft', JSON.stringify(draft));

    const xr = (navigator as NavigatorWithXR).xr;
    if (!xr?.isSessionSupported) {
      setQuestState('unsupported');
      setQuestDetail('Draft saved locally. Open /creator in Quest Browser for headset preview.');
      return;
    }

    try {
      const supported = await xr.isSessionSupported('immersive-vr');
      setQuestState(supported ? 'ready' : 'unsupported');
      setQuestDetail(
        supported
          ? 'Quest 3 target is available from this browser session.'
          : 'Draft saved locally. Open /creator in Quest Browser for headset preview.'
      );
    } catch (error) {
      setQuestState('error');
      setQuestDetail(error instanceof Error ? error.message : 'WebXR availability check failed.');
    }
  }, [assets, previewMode, selectedAsset]);

  const questTone =
    questState === 'ready'
      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
      : questState === 'error'
        ? 'border-red-500/40 bg-red-500/10 text-red-200'
        : questState === 'unsupported'
          ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
          : 'border-studio-border bg-studio-panel/40 text-studio-muted';

  return (
    <main className="flex h-full min-h-[calc(100vh-40px)] flex-col overflow-hidden bg-studio-bg text-studio-text">
      <header className="flex min-h-[56px] items-center justify-between border-b border-studio-border px-4">
        <div className="min-w-0">
          <h1 className="text-base font-semibold tracking-normal text-studio-text">Creator Mode</h1>
          <p className="text-xs text-studio-muted">Untitled piece</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-studio-border bg-studio-panel/70 p-1">
            <button
              type="button"
              onClick={() => setPreviewMode('spatial')}
              className={`flex h-8 items-center gap-1.5 rounded px-2 text-xs transition ${
                previewMode === 'spatial'
                  ? 'bg-studio-accent text-white'
                  : 'text-studio-muted hover:text-studio-text'
              }`}
            >
              <View className="h-3.5 w-3.5" />
              Spatial
            </button>
            <button
              type="button"
              onClick={() => setPreviewMode('flat')}
              className={`flex h-8 items-center gap-1.5 rounded px-2 text-xs transition ${
                previewMode === 'flat'
                  ? 'bg-studio-accent text-white'
                  : 'text-studio-muted hover:text-studio-text'
              }`}
            >
              <Grid3X3 className="h-3.5 w-3.5" />
              Flat
            </button>
          </div>
          <button
            type="button"
            onClick={handleQuestPreview}
            className="flex h-9 items-center gap-2 rounded-md bg-emerald-600 px-3 text-sm font-medium text-white transition hover:bg-emerald-500"
          >
            <Eye className="h-4 w-4" />
            View on Quest 3
          </button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)_260px]">
        <aside
          className={`min-h-[220px] border-b border-studio-border bg-studio-bg-elevated/40 lg:border-b-0 lg:border-r ${
            isDragging ? 'outline outline-2 outline-studio-accent' : ''
          }`}
          onDragEnter={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
        >
          <div className="flex h-full flex-col p-3">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <FolderOpen className="h-4 w-4 text-cyan-300" />
                Asset Bin
              </div>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="flex h-8 items-center gap-1.5 rounded-md border border-studio-border px-2 text-xs text-studio-text transition hover:bg-studio-panel"
              >
                <Upload className="h-3.5 w-3.5" />
                Import
              </button>
              <input
                ref={inputRef}
                className="hidden"
                type="file"
                multiple
                accept={CREATOR_ACCEPTED_EXTENSIONS.join(',')}
                onChange={(event) => {
                  if (event.target.files) addFiles(event.target.files);
                  event.currentTarget.value = '';
                }}
              />
            </div>

            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className={`mb-3 flex min-h-[112px] flex-col items-center justify-center rounded-md border border-dashed px-3 text-center transition ${
                isDragging
                  ? 'border-studio-accent bg-studio-accent/10 text-studio-text'
                  : 'border-studio-border bg-studio-panel/30 text-studio-muted hover:border-studio-accent/50 hover:text-studio-text'
              }`}
            >
              <Upload className="mb-2 h-5 w-5" />
              <span className="text-xs font-medium">Drop assets</span>
              <span className="mt-1 text-[11px]">GLB, MP4, PNG, WAV, USDZ</span>
            </button>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
              {assets.map((asset) => {
                const Icon = assetIcon(asset);
                const active = selectedAsset?.id === asset.id;
                return (
                  <div
                    key={asset.id}
                    className={`group flex items-center gap-2 rounded-md border p-2 transition ${
                      active
                        ? 'border-studio-accent bg-studio-accent/10'
                        : 'border-studio-border bg-studio-panel/30 hover:bg-studio-panel/60'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedId(asset.id)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-black/30">
                        <Icon className="h-4 w-4 text-cyan-200" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium text-studio-text">
                          {asset.name}
                        </span>
                        <span className="text-[11px] uppercase text-studio-muted">
                          {asset.format} - {formatCreatorAssetSize(asset.sizeBytes)}
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove ${asset.name}`}
                      title="Remove"
                      onClick={() => removeAsset(asset)}
                      className="flex h-7 w-7 items-center justify-center rounded text-studio-muted opacity-70 transition hover:bg-red-500/10 hover:text-red-300 group-hover:opacity-100"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
              {assets.length === 0 && (
                <div className="rounded-md border border-studio-border bg-studio-panel/20 p-3 text-xs text-studio-muted">
                  Asset bin empty.
                </div>
              )}
            </div>
          </div>
        </aside>

        <CreatorCanvas asset={selectedAsset} mode={previewMode} />

        <aside className="border-t border-studio-border bg-studio-bg-elevated/40 lg:border-l lg:border-t-0">
          <div className="flex h-full flex-col gap-3 p-3">
            <section className="rounded-md border border-studio-border bg-studio-panel/35 p-3">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <Monitor className="h-4 w-4 text-emerald-300" />
                Target
              </div>
              <button
                type="button"
                onClick={handleQuestPreview}
                className="flex w-full items-center justify-between rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100 transition hover:bg-emerald-500/15"
              >
                <span className="flex items-center gap-2">
                  <Eye className="h-4 w-4" />
                  Quest 3
                </span>
                {questState === 'ready' ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Maximize2 className="h-4 w-4" />
                )}
              </button>
              <div className={`mt-3 rounded-md border px-3 py-2 text-xs ${questTone}`}>
                {questDetail}
              </div>
            </section>

            <section className="rounded-md border border-studio-border bg-studio-panel/35 p-3">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <Clapperboard className="h-4 w-4 text-amber-300" />
                Piece
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-studio-muted">Assets</span>
                  <span className="text-studio-text">{assets.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-studio-muted">Preview</span>
                  <span className="capitalize text-studio-text">{previewMode}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-studio-muted">Selected</span>
                  <span className="max-w-[130px] truncate text-studio-text">
                    {selectedAsset?.name ?? 'None'}
                  </span>
                </div>
              </div>
            </section>

            <section className="rounded-md border border-studio-border bg-studio-panel/35 p-3">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <Box className="h-4 w-4 text-cyan-300" />
                Holo Draft
              </div>
              <pre className="max-h-44 overflow-auto rounded bg-black/35 p-2 text-[11px] leading-relaxed text-studio-muted">
                {`composition "UntitledPiece" {
  target: "quest3"
  preview: "${previewMode}"
  assets: ${assets.length}
}`}
              </pre>
            </section>
          </div>
        </aside>
      </div>
    </main>
  );
}

export default CreatorMode;
