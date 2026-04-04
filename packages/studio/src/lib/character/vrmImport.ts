// @ts-nocheck
import { logger } from '@/lib/logger';
/**
 * vrmImport.ts — VRM Avatar Import & Parsing
 *
 * MEME-018: VRoid/VRM avatar support
 *
 * Features:
 * - VRM file validation and parsing
 * - VRM metadata extraction (name, author, license)
 * - VRM → GLB conversion (for Three.js compatibility)
 * - VRM expression/blend shape support
 * - VRoid Hub search integration (future)
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface VRMMetadata {
  name?: string;
  author?: string;
  version?: string;
  license?: string;
  contactInformation?: string;
  reference?: string;
  thumbnail?: string;
  allowedUserName?: string;
  violentUsage?: string;
  sexualUsage?: string;
  commercialUsage?: string;
  otherPermissionUrl?: string;
}

export interface VRMAvatar {
  file: File;
  url: string;
  metadata?: VRMMetadata;
  thumbnail?: string;
}

// ─── VRM Validation ──────────────────────────────────────────────────────────

/**
 * Check if file is a valid VRM file
 * VRM files are GLTF files with VRM extensions
 */
export function isValidVRM(file: File): boolean {
  // Check file extension
  if (!file.name.match(/\.vrm$/i)) {
    return false;
  }

  // Check file size (VRM files should be reasonable size)
  const maxSize = 100 * 1024 * 1024; // 100MB
  if (file.size > maxSize) {
    logger.warn('[VRMImport] File too large:', file.size);
    return false;
  }

  return true;
}

/**
 * Extract VRM metadata from file
 * Reads GLTF structure and extracts VRM extension data
 */
export async function extractVRMMetadata(file: File): Promise<VRMMetadata | null> {
  try {
    // Read file as ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();

    // Parse GLTF header (first 12 bytes)
    const header = new DataView(arrayBuffer, 0, 12);
    const magic = header.getUint32(0, true);

    // Check GLTF magic number (0x46546C67 = "glTF")
    if (magic !== 0x46546c67) {
      logger.error('[VRMImport] Not a valid GLTF file');
      return null;
    }

    // Parse JSON chunk (contains VRM metadata)
    const jsonChunkLength = header.getUint32(12, true);
    const jsonChunkType = header.getUint32(16, true);

    if (jsonChunkType !== 0x4e4f534a) {
      // "JSON"
      logger.error('[VRMImport] Missing JSON chunk');
      return null;
    }

    // Extract JSON data
    const jsonBytes = new Uint8Array(arrayBuffer, 20, jsonChunkLength);
    const jsonString = new TextDecoder().decode(jsonBytes);
    const gltf = JSON.parse(jsonString);

    // Extract VRM extension metadata
    const vrmExtension = gltf.extensions?.VRM;
    if (!vrmExtension) {
      logger.warn('[VRMImport] No VRM extension found');
      return null;
    }

    const meta = vrmExtension.meta || {};

    return {
      name: meta.title || meta.name,
      author: meta.author,
      version: meta.version,
      license: meta.licenseName,
      contactInformation: meta.contactInformation,
      reference: meta.reference,
      thumbnail: meta.texture ? extractThumbnailFromGLTF(gltf, meta.texture) : undefined,
      allowedUserName: meta.allowedUserName,
      violentUsage: meta.violentUssageName, // Note: VRM spec has typo "Ussage"
      sexualUsage: meta.sexualUssageName,
      commercialUsage: meta.commercialUssageName,
      otherPermissionUrl: meta.otherPermissionUrl,
    };
  } catch (error) {
    logger.error('[VRMImport] Failed to extract metadata:', error);
    return null;
  }
}

/**
 * Extract thumbnail from GLTF texture reference
 */
function extractThumbnailFromGLTF(gltf: { textures?: Array<{ source: number }>; images?: Array<{ uri?: string; mimeType?: string; bufferView?: number }> }, textureIndex: number): string | undefined {
  try {
    const texture = gltf.textures?.[textureIndex];
    if (!texture) return undefined;

    const imageIndex = texture.source;
    const image = gltf.images?.[imageIndex];
    if (!image) return undefined;

    // Return data URI if available
    if (image.uri && image.uri.startsWith('data:')) {
      return image.uri;
    }

    // DEFERRED(VRM-001): GLB binary chunk thumbnail extraction requires ArrayBuffer parsing
    return undefined;
  } catch (error) {
    return undefined;
  }
}

// ─── VRM Import ──────────────────────────────────────────────────────────────

/**
 * Import VRM avatar from file
 * Returns avatar data with metadata
 */
export async function importVRM(file: File): Promise<VRMAvatar> {
  logger.debug('[VRMImport] Importing VRM:', file.name);

  // Validate file
  if (!isValidVRM(file)) {
    throw new Error('Invalid VRM file. Please upload a .vrm file.');
  }

  // Extract metadata
  const metadata = await extractVRMMetadata(file);

  // Create object URL for Three.js
  const url = URL.createObjectURL(file);

  // Generate thumbnail from metadata or use placeholder
  const thumbnail =
    metadata?.thumbnail ||
    `data:image/svg+xml,${encodeURIComponent(`
    <svg width="400" height="400" xmlns="http://www.w3.org/2000/svg">
      <rect width="400" height="400" fill="#1a1a2e"/>
      <text x="50%" y="50%" font-size="100" text-anchor="middle" dy=".3em">
        🧑
      </text>
      <text x="50%" y="85%" font-size="20" text-anchor="middle" fill="#888">
        ${metadata?.name || file.name}
      </text>
    </svg>
  `)}`;

  return {
    file,
    url,
    metadata,
    thumbnail,
  };
}

/**
 * Convert VRM to GLB (if needed for compatibility)
 * NOTE: Most modern loaders support VRM directly
 */
export async function convertVRMtoGLB(vrmFile: File): Promise<Blob> {
  // For now, VRM files ARE GLB files with VRM extensions
  // So we can just return the file as-is
  return vrmFile;
}

// ─── VRoid Hub Integration (Future) ──────────────────────────────────────────

/**
 * Search VRoid Hub for avatars
 * NOTE: Requires VRoid Hub API access (not publicly documented)
 * This is a placeholder for future implementation
 */
export async function searchVRoidHub(query: string): Promise<any[]> {
  logger.warn('[VRMImport] VRoid Hub search not yet implemented');

  // Mock results for development
  return [
    {
      id: 'mock-1',
      name: 'Sample VRoid Avatar',
      author: 'VRoid Studio',
      thumbnail: 'https://via.placeholder.com/400x400?text=VRoid+Avatar',
      downloadUrl: null, // Would require authentication
    },
  ];
}

/**
 * Download avatar from VRoid Hub
 * NOTE: Requires user authentication with VRoid Hub
 */
export async function downloadFromVRoidHub(avatarId: string): Promise<VRMAvatar> {
  throw new Error('VRoid Hub download not yet implemented. Please upload VRM files directly.');
}

// ─── Validation & Utilities ──────────────────────────────────────────────────

/**
 * Validate VRM license compatibility
 * Returns true if avatar can be used in the application
 */
export function isLicenseCompatible(metadata: VRMMetadata): {
  compatible: boolean;
  warnings: string[];
} {
  const warnings: string[] = [];

  // Check commercial usage
  if (metadata.commercialUsage === 'Disallow') {
    warnings.push('Commercial usage not allowed');
  }

  // Check violent usage
  if (metadata.violentUsage === 'Disallow') {
    warnings.push('Violent usage not allowed');
  }

  // Check sexual usage
  if (metadata.sexualUsage === 'Disallow') {
    warnings.push('Sexual usage not allowed');
  }

  // Check redistribution
  if (metadata.allowedUserName === 'OnlyAuthor') {
    warnings.push('Only author can use this avatar');
  }

  return {
    compatible: warnings.length === 0,
    warnings,
  };
}

/**
 * Get license info summary
 */
export function getLicenseSummary(metadata: VRMMetadata): string {
  if (!metadata.license) {
    return 'No license information';
  }

  const parts: string[] = [metadata.license];

  if (metadata.commercialUsage) {
    parts.push(`Commercial: ${metadata.commercialUsage}`);
  }

  if (metadata.allowedUserName) {
    parts.push(`Usage: ${metadata.allowedUserName}`);
  }

  return parts.join(' • ');
}

/**
 * Create VRM avatar data from uploaded file
 */
export async function createVRMAvatarFromFile(file: File): Promise<{
  url: string;
  metadata: VRMMetadata | null;
  thumbnail: string;
}> {
  const avatar = await importVRM(file);

  return {
    url: avatar.url,
    metadata: avatar.metadata || null,
    thumbnail: avatar.thumbnail || '',
  };
}
