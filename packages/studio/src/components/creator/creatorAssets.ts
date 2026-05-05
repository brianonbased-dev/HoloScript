export type CreatorAssetFormat =
  | 'glb'
  | 'gltf'
  | 'fbx'
  | 'mp4'
  | 'png'
  | 'jpg'
  | 'jpeg'
  | 'wav'
  | 'usdz'
  | 'unknown';

export type CreatorAssetKind = 'model' | 'video' | 'image' | 'audio' | 'unsupported';

export interface CreatorAssetRecord {
  id: string;
  file: File;
  name: string;
  format: CreatorAssetFormat;
  kind: CreatorAssetKind;
  sizeBytes: number;
  objectUrl: string;
  createdAt: number;
}

export const CREATOR_ACCEPTED_EXTENSIONS = [
  '.glb',
  '.gltf',
  '.fbx',
  '.mp4',
  '.png',
  '.jpg',
  '.jpeg',
  '.wav',
  '.usdz',
] as const;

export function detectCreatorAssetFormat(name: string): CreatorAssetFormat {
  const ext = name.split('.').pop()?.toLowerCase();
  if (!ext) return 'unknown';
  if (ext === 'glb') return 'glb';
  if (ext === 'gltf') return 'gltf';
  if (ext === 'fbx') return 'fbx';
  if (ext === 'mp4') return 'mp4';
  if (ext === 'png') return 'png';
  if (ext === 'jpg') return 'jpg';
  if (ext === 'jpeg') return 'jpeg';
  if (ext === 'wav') return 'wav';
  if (ext === 'usdz') return 'usdz';
  return 'unknown';
}

export function classifyCreatorAsset(format: CreatorAssetFormat): CreatorAssetKind {
  if (format === 'glb' || format === 'gltf' || format === 'fbx' || format === 'usdz') {
    return 'model';
  }
  if (format === 'mp4') return 'video';
  if (format === 'png' || format === 'jpg' || format === 'jpeg') return 'image';
  if (format === 'wav') return 'audio';
  return 'unsupported';
}

export function formatCreatorAssetSize(bytes: number): string {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

export function createCreatorAssetRecord(file: File): CreatorAssetRecord {
  const format = detectCreatorAssetFormat(file.name);
  return {
    id: `creator_asset_${crypto.randomUUID()}`,
    file,
    name: file.name,
    format,
    kind: classifyCreatorAsset(format),
    sizeBytes: file.size,
    objectUrl: URL.createObjectURL(file),
    createdAt: Date.now(),
  };
}
