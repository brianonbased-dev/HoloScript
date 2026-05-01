/**
 * vrmImport.ts — VRM Avatar Import
 *
 * Import VRM (Virtual Reality Model) avatars for use in HoloScript scenes.
 * VRM is the open standard for humanoid 3D avatars (VRChat, VTubing, etc.).
 */

export interface VRMMetadata {
  title: string;
  version: string;
  author: string;
  contactInfo?: string;
  reference?: string;
  thumbnailUrl?: string;
  allowedUsers: 'onlyAuthor' | 'explicitlyLicensedPerson' | 'everyone';
  violentUsage: 'disallow' | 'allow';
  sexualUsage: 'disallow' | 'allow';
  commercialUsage: 'disallow' | 'allow';
  license: string;
  otherPermissions?: string;
}

export interface VRMModel {
  id: string;
  metadata: VRMMetadata;
  boneCount: number;
  blendshapeCount: number;
  materialCount: number;
  meshCount: number;
  textureCount: number;
  fileSizeBytes: number;
  vrmVersion: '0.x' | '1.0';
  hasSpringBones: boolean; // Hair/clothing physics
  hasExpressions: boolean; // Facial blendshapes
  hasLookAt: boolean; // Eye tracking
  thumbnail?: string; // Optional thumbnail image
}

export interface VRMValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  version: string;
}

/**
 * Validate a VRM file structure (checks required fields).
 */
export function validateVRM(json: Record<string, unknown>): VRMValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check for VRM extension
  const extensions = json['extensions'] as Record<string, unknown> | undefined;
  let version = 'unknown';

  if (extensions?.['VRM']) {
    version = '0.x';
  } else if (extensions?.['VRMC_vrm']) {
    version = '1.0';
  } else {
    errors.push('Missing VRM extension — not a valid VRM file');
  }

  // Check for required glTF fields
  if (!json['asset']) errors.push('Missing asset field');
  if (!json['meshes']) errors.push('Missing meshes');
  if (!json['nodes']) errors.push('Missing nodes');

  // Check for humanoid bones
  const vrmExt = (extensions?.['VRM'] ?? extensions?.['VRMC_vrm']) as
    | Record<string, unknown>
    | undefined;
  if (vrmExt && !vrmExt['humanoid']) {
    warnings.push('Missing humanoid bone mapping — avatar may not animate correctly');
  }

  // Check for metadata
  if (vrmExt && !vrmExt['meta']) {
    warnings.push('Missing VRM metadata (author, license, usage permissions)');
  }

  return { isValid: errors.length === 0, errors, warnings, version };
}

/**
 * Extract metadata from a VRM file.
 */
export function extractMetadata(vrmExt: Record<string, unknown>): VRMMetadata {
  const meta = (vrmExt['meta'] ?? {}) as Record<string, unknown>;
  const authors = meta['authors'] as Array<{ name?: string }> | undefined;
  const authorName = authors?.[0]?.name ?? (meta['author'] as string) ?? 'Unknown';
  return {
    title: (meta['name'] as string) ?? (meta['title'] as string) ?? 'Untitled Avatar',
    version: (meta['version'] as string) ?? '1.0',
    author: authorName,
    contactInfo: meta['contactInformation'] as string | undefined,
    reference: meta['reference'] as string | undefined,
    allowedUsers: (meta['allowedUserName'] as VRMMetadata['allowedUsers']) ?? 'everyone',
    violentUsage: meta['violentUssageName'] === 'Allow' ? 'allow' : 'disallow',
    sexualUsage: meta['sexualUssageName'] === 'Allow' ? 'allow' : 'disallow',
    commercialUsage: meta['commercialUssageName'] === 'Allow' ? 'allow' : 'disallow',
    license: (meta['licenseName'] as string) ?? 'Other',
    otherPermissions: meta['otherPermissionUrl'] as string | undefined,
  };
}

/**
 * Check if a VRM model can be used commercially.
 */
export function isCommerciallyUsable(metadata: VRMMetadata): boolean {
  return metadata.commercialUsage === 'allow';
}

/**
 * Check if a VRM model allows redistribution to all users.
 */
export function isPubliclyRedistributable(metadata: VRMMetadata): boolean {
  return metadata.allowedUsers === 'everyone';
}

/**
 * Estimate VRAM usage for a VRM model.
 */
export function estimateVRAM(model: VRMModel): {
  meshMB: number;
  textureMB: number;
  totalMB: number;
} {
  // Rough estimates: ~100KB per mesh, ~1MB per texture on average
  const meshMB = (model.meshCount * 100_000) / (1024 * 1024);
  const textureMB = (model.textureCount * 1_000_000) / (1024 * 1024);
  return {
    meshMB: +meshMB.toFixed(2),
    textureMB: +textureMB.toFixed(2),
    totalMB: +(meshMB + textureMB).toFixed(2),
  };
}

/**
 * Get human-readable file size.
 */
export function formatFileSize(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)} KB`;
  return `${bytes} B`;
}

/**
 * Check if the VRM license is compatible with the current project/workspace.
 */
export function isLicenseCompatible(
  metadata: VRMMetadata,
  requireCommercial: boolean = false
): boolean {
  if (requireCommercial && !isCommerciallyUsable(metadata)) {
    return false;
  }
  return true;
}

interface GLBHeader {
  magic: number;
  version: number;
  length: number;
}

interface GLBChunk {
  chunkLength: number;
  chunkType: number;
  data: Uint8Array;
}

function readGLBHeader(view: DataView): GLBHeader {
  return {
    magic: view.getUint32(0, true),
    version: view.getUint32(4, true),
    length: view.getUint32(8, true),
  };
}

function readGLBChunks(view: DataView, length: number): GLBChunk[] {
  const chunks: GLBChunk[] = [];
  let offset = 12; // after header
  while (offset < length) {
    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    const data = new Uint8Array(view.buffer, view.byteOffset + offset + 8, chunkLength);
    chunks.push({ chunkLength, chunkType, data });
    offset += 8 + chunkLength;
  }
  return chunks;
}

function isGLB(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 12) return false;
  const view = new DataView(buffer);
  const magic = view.getUint32(0, true);
  return magic === 0x46546c67; // 'glTF' in little-endian
}

/**
 * Create a VRM Avatar from a File object.
 *
 * Parses the GLB/GLTF JSON chunk to extract VRM metadata, mesh counts,
 * material counts, and feature flags (spring bones, expressions, look-at).
 */
export async function createVRMAvatarFromFile(file: File): Promise<VRMModel> {
  const buffer = await file.arrayBuffer();
  const fileSize = file.size;

  if (!isGLB(buffer)) {
    // Not a GLB — return minimal model with file metadata
    return {
      id: `vrm-${Date.now()}`,
      metadata: {
        title: file.name,
        version: '1.0',
        author: 'Unknown',
        allowedUsers: 'everyone',
        violentUsage: 'disallow',
        sexualUsage: 'disallow',
        commercialUsage: 'allow',
        license: 'Other',
      },
      boneCount: 0,
      blendshapeCount: 0,
      materialCount: 0,
      meshCount: 0,
      textureCount: 0,
      fileSizeBytes: fileSize,
      vrmVersion: '0.x',
      hasSpringBones: false,
      hasExpressions: false,
      hasLookAt: false,
      thumbnail: undefined,
    };
  }

  const view = new DataView(buffer);
  const header = readGLBHeader(view);
  const chunks = readGLBChunks(view, header.length);

  // JSON chunk is type 0x4e4f534a ('JSON')
  const jsonChunk = chunks.find((c) => c.chunkType === 0x4e4f534a);
  if (!jsonChunk) {
    throw new Error('GLB file missing JSON chunk');
  }

  const jsonText = new TextDecoder().decode(jsonChunk.data);
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(jsonText);
  } catch {
    throw new Error('GLB JSON chunk is not valid JSON');
  }

  const validation = validateVRM(json);

  // Extract VRM extension
  const extensions = (json['extensions'] as Record<string, unknown>) ?? {};
  const vrm0 = extensions['VRM'] as Record<string, unknown> | undefined;
  const vrm1 = extensions['VRMC_vrm'] as Record<string, unknown> | undefined;
  const vrmExt = vrm1 ?? vrm0 ?? {};
  const vrmVersion: VRMModel['vrmVersion'] = vrm1 ? '1.0' : vrm0 ? '0.x' : '0.x';

  // Extract metadata
  const metadata = extractMetadata(vrmExt);

  // Count assets from glTF root
  const meshes = (json['meshes'] as unknown[]) ?? [];
  const nodes = (json['nodes'] as unknown[]) ?? [];
  const materials = (json['materials'] as unknown[]) ?? [];
  const textures = (json['textures'] as unknown[]) ?? [];

  // Count blend shapes / morph targets
  let blendshapeCount = 0;
  for (const mesh of meshes) {
    const m = mesh as Record<string, unknown>;
    const primitives = (m['primitives'] as Array<Record<string, unknown>>) ?? [];
    for (const prim of primitives) {
      const targets = prim['targets'] as unknown[] | undefined;
      // Use Math.max across all primitives: morph targets are shared per mesh,
      // so += would double-count when a mesh has multiple primitives.
      if (targets) blendshapeCount = Math.max(blendshapeCount, targets.length);
      const extras = prim['extras'] as Record<string, unknown> | undefined;
      const targetNames = extras?.['targetNames'] as string[] | undefined;
      if (targetNames) blendshapeCount = Math.max(blendshapeCount, targetNames.length);
    }
  }

  // Count bones from humanoid definition
  const humanoid = vrmExt['humanoid'] as Record<string, unknown> | undefined;
  const bones = (humanoid?.['humanBones'] as unknown[]) ?? (humanoid?.['bones'] as unknown[]) ?? [];
  const boneCount = bones.length;

  // Feature flags
  const hasSpringBones =
    vrm1
      ? !!vrm1['springBone']
      : !!vrm0?.['secondaryAnimation'];

  const hasExpressions =
    vrm1
      ? !!vrm1['expressions']
      : !!vrm0?.['blendShapeMaster'];

  const hasLookAt =
    vrm1
      ? !!vrm1['lookAt']
      : !!vrm0?.['firstPerson'];

  return {
    id: `vrm-${Date.now()}`,
    metadata,
    boneCount,
    blendshapeCount,
    materialCount: materials.length,
    meshCount: meshes.length,
    textureCount: textures.length,
    fileSizeBytes: fileSize,
    vrmVersion,
    hasSpringBones,
    hasExpressions,
    hasLookAt,
    thumbnail: metadata.thumbnailUrl,
  };
}
