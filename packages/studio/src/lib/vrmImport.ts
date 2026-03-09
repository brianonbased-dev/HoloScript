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
  const meta = (vrmExt['meta'] ?? {}) as Record<string, string>;
  return {
    title: meta['title'] ?? 'Untitled Avatar',
    version: meta['version'] ?? '1.0',
    author: meta['author'] ?? 'Unknown',
    contactInfo: meta['contactInformation'],
    reference: meta['reference'],
    allowedUsers: (meta['allowedUserName'] as VRMMetadata['allowedUsers']) ?? 'everyone',
    violentUsage: meta['violentUssageName'] === 'Allow' ? 'allow' : 'disallow',
    sexualUsage: meta['sexualUssageName'] === 'Allow' ? 'allow' : 'disallow',
    commercialUsage: meta['commercialUssageName'] === 'Allow' ? 'allow' : 'disallow',
    license: meta['licenseName'] ?? 'Other',
    otherPermissions: meta['otherPermissionUrl'],
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
