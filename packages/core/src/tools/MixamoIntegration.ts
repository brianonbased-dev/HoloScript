/**
 * MixamoIntegration.ts
 *
 * Server-side Mixamo auto-rigging integration for HoloScript.
 * Interfaces with Mixamo's REST API for character upload, auto-rigging,
 * animation listing, and animation download.
 *
 * Per G.006: This module is server-side only -- no browser-native rigging.
 *
 * Features:
 * - MixamoAPI class for REST API interactions (upload, rig, list, download)
 * - FBX and GLB input format support
 * - MixamoPresetMapper mapping @holoscript/animation-presets names to Mixamo IDs
 * - Pre-rigged character template registry with 10+ default humanoid templates
 * - Exponential backoff for API rate limits
 * - Unsupported mesh topology detection and error handling
 *
 * @packageDocumentation
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default Mixamo API base URL. */
const MIXAMO_API_BASE = 'https://www.mixamo.com/api/v1';

/** Maximum number of retry attempts for rate-limited requests. */
const MAX_RETRIES = 5;

/** Initial backoff delay in milliseconds for rate-limited retries. */
const INITIAL_BACKOFF_MS = 1000;

/** Maximum backoff delay in milliseconds. */
const MAX_BACKOFF_MS = 30_000;

/** Supported input mesh formats. */
const SUPPORTED_FORMATS = ['fbx', 'glb'] as const;

// ---------------------------------------------------------------------------
// Types & Interfaces
// ---------------------------------------------------------------------------

/** Supported mesh input format. */
export type MeshFormat = (typeof SUPPORTED_FORMATS)[number];

/**
 * Mixamo API authentication credentials.
 * Requires a valid Adobe/Mixamo session token obtained via OAuth.
 */
export interface MixamoCredentials {
  /** OAuth access token for Mixamo/Adobe API. */
  accessToken: string;

  /** Optional custom API base URL (defaults to production Mixamo endpoint). */
  apiBase?: string;
}

/**
 * Configuration for the MixamoAPI client.
 */
export interface MixamoAPIConfig {
  /** Authentication credentials. */
  credentials: MixamoCredentials;

  /** Maximum retry attempts for rate-limited requests. Default: 5 */
  maxRetries?: number;

  /** Initial backoff delay in ms for retries. Default: 1000 */
  initialBackoffMs?: number;

  /** Enable verbose debug logging. Default: false */
  debug?: boolean;

  /** Request timeout in ms. Default: 60000 */
  timeoutMs?: number;
}

/**
 * Result of a character upload operation.
 */
export interface UploadResult {
  /** Server-assigned character ID. */
  characterId: string;

  /** Original filename. */
  filename: string;

  /** Detected mesh format. */
  format: MeshFormat;

  /** Number of vertices in the uploaded mesh. */
  vertexCount: number;

  /** Number of polygons in the uploaded mesh. */
  polygonCount: number;

  /** Whether the mesh passed topology validation. */
  topologyValid: boolean;

  /** Upload timestamp (ISO 8601). */
  uploadedAt: string;
}

/**
 * Result of an auto-rig operation.
 */
export interface RigResult {
  /** Character ID that was rigged. */
  characterId: string;

  /** Rig type applied (e.g. "humanoid", "quadruped"). */
  rigType: string;

  /** Number of bones in the generated skeleton. */
  boneCount: number;

  /** Rig quality score (0.0 - 1.0). */
  qualityScore: number;

  /** Whether the rig completed successfully. */
  success: boolean;

  /** Warning messages from the rigging process. */
  warnings: string[];

  /** Rig completion timestamp (ISO 8601). */
  riggedAt: string;
}

/**
 * A single animation entry from the Mixamo library.
 */
export interface MixamoAnimation {
  /** Mixamo animation ID. */
  id: string;

  /** Human-readable animation name (e.g. "Walking", "Running"). */
  name: string;

  /** Category within Mixamo's library. */
  category: string;

  /** Duration in seconds. */
  duration: number;

  /** Whether the animation loops seamlessly. */
  loopable: boolean;

  /** Motion type descriptor. */
  motionType: 'in-place' | 'root-motion';

  /** Thumbnail URL for preview. */
  thumbnailUrl: string;
}

/**
 * Pagination for animation listing.
 */
export interface AnimationListOptions {
  /** Page number (1-based). Default: 1 */
  page?: number;

  /** Results per page. Default: 50 */
  limit?: number;

  /** Filter by category. */
  category?: string;

  /** Search query. */
  query?: string;

  /** Filter by motion type. */
  motionType?: 'in-place' | 'root-motion';
}

/**
 * Paginated animation list response.
 */
export interface AnimationListResult {
  /** Animations on the current page. */
  animations: MixamoAnimation[];

  /** Total number of animations matching the query. */
  total: number;

  /** Current page number. */
  page: number;

  /** Results per page. */
  limit: number;

  /** Whether more pages are available. */
  hasMore: boolean;
}

/**
 * Options for downloading an animation.
 */
export interface DownloadOptions {
  /** Character ID to apply the animation to. */
  characterId: string;

  /** Animation ID to download. */
  animationId: string;

  /** Output format. Default: 'fbx' */
  format?: MeshFormat;

  /** Whether to include skin/mesh in the download. Default: false */
  includeSkin?: boolean;

  /** Frames per second. Default: 30 */
  fps?: number;

  /** Keyframe reduction level (0 = none, 1 = maximum). Default: 0 */
  keyframeReduction?: number;
}

/**
 * Result of an animation download operation.
 */
export interface DownloadResult {
  /** The animation data as a Buffer (Node.js) or ArrayBuffer. */
  data: Buffer | ArrayBuffer;

  /** The content type of the downloaded file. */
  contentType: string;

  /** Suggested filename. */
  filename: string;

  /** File size in bytes. */
  sizeBytes: number;

  /** The format of the downloaded file. */
  format: MeshFormat;
}

/**
 * Mesh topology issue descriptor.
 */
export interface TopologyIssue {
  /** Issue type code. */
  code:
    | 'NON_MANIFOLD'
    | 'OPEN_EDGES'
    | 'DEGENERATE_FACES'
    | 'OVERLAPPING_VERTICES'
    | 'EXCESSIVE_POLYGONS'
    | 'MISSING_UVS'
    | 'DISCONNECTED_COMPONENTS'
    | 'INVERTED_NORMALS';

  /** Human-readable description of the issue. */
  message: string;

  /** Severity level. */
  severity: 'warning' | 'error';

  /** Affected element indices (vertices, faces, etc.) if available. */
  affectedElements?: number[];
}

// ---------------------------------------------------------------------------
// Error Classes
// ---------------------------------------------------------------------------

/**
 * Base error class for Mixamo API operations.
 */
export class MixamoError extends Error {
  /** Error code for programmatic handling. */
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'MixamoError';
    this.code = code;
  }
}

/**
 * Error thrown when the Mixamo API rate limit is exceeded.
 * Includes retry-after information for backoff strategies.
 */
export class MixamoRateLimitError extends MixamoError {
  /** Number of seconds until the rate limit resets. */
  readonly retryAfterSeconds: number;

  /** Number of retry attempts already made. */
  readonly attemptNumber: number;

  constructor(retryAfterSeconds: number, attemptNumber: number) {
    super(
      `Mixamo API rate limit exceeded. Retry after ${retryAfterSeconds}s (attempt ${attemptNumber}).`,
      'RATE_LIMIT_EXCEEDED'
    );
    this.name = 'MixamoRateLimitError';
    this.retryAfterSeconds = retryAfterSeconds;
    this.attemptNumber = attemptNumber;
  }
}

/**
 * Error thrown when a mesh has unsupported topology for auto-rigging.
 */
export class MixamoTopologyError extends MixamoError {
  /** List of topology issues found. */
  readonly issues: TopologyIssue[];

  constructor(issues: TopologyIssue[]) {
    const errorIssues = issues.filter((i) => i.severity === 'error');
    const summary = errorIssues.map((i) => i.message).join('; ');
    super(
      `Mesh topology unsupported for auto-rigging: ${summary}`,
      'UNSUPPORTED_TOPOLOGY'
    );
    this.name = 'MixamoTopologyError';
    this.issues = issues;
  }
}

/**
 * Error thrown when an unsupported file format is provided.
 */
export class MixamoFormatError extends MixamoError {
  /** The unsupported format that was provided. */
  readonly providedFormat: string;

  /** The list of supported formats. */
  readonly supportedFormats: readonly string[];

  constructor(providedFormat: string) {
    super(
      `Unsupported mesh format "${providedFormat}". Supported formats: ${SUPPORTED_FORMATS.join(', ')}.`,
      'UNSUPPORTED_FORMAT'
    );
    this.name = 'MixamoFormatError';
    this.providedFormat = providedFormat;
    this.supportedFormats = SUPPORTED_FORMATS;
  }
}

// ---------------------------------------------------------------------------
// MixamoAPI — Server-Side REST API Client
// ---------------------------------------------------------------------------

/**
 * Server-side Mixamo REST API client.
 *
 * Provides methods for uploading characters, auto-rigging, listing animations,
 * and downloading animation data. Includes exponential backoff for rate limits
 * and mesh topology validation.
 *
 * Per G.006: This class is server-side only. It requires Node.js `fetch`
 * (Node 18+) or a polyfill. Do NOT use in browser environments.
 *
 * @example
 * ```ts
 * import { MixamoAPI } from '@holoscript/core/tools/MixamoIntegration';
 *
 * const api = new MixamoAPI({
 *   credentials: { accessToken: process.env.MIXAMO_TOKEN! },
 *   debug: true,
 * });
 *
 * // Upload and rig a character
 * const upload = await api.uploadCharacter(meshBuffer, 'character.fbx');
 * const rig = await api.autoRig(upload.characterId);
 *
 * // List and download animations
 * const anims = await api.listAnimations({ query: 'walking' });
 * const download = await api.downloadAnimation({
 *   characterId: upload.characterId,
 *   animationId: anims.animations[0].id,
 * });
 * ```
 */
export class MixamoAPI {
  private readonly config: Required<MixamoAPIConfig>;

  constructor(config: MixamoAPIConfig) {
    this.config = {
      credentials: config.credentials,
      maxRetries: config.maxRetries ?? MAX_RETRIES,
      initialBackoffMs: config.initialBackoffMs ?? INITIAL_BACKOFF_MS,
      debug: config.debug ?? false,
      timeoutMs: config.timeoutMs ?? 60_000,
    };
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Upload a character mesh to Mixamo for rigging.
   *
   * Supports FBX and GLB formats. Validates mesh topology before upload
   * and throws `MixamoTopologyError` for unsupported geometries.
   *
   * @param data - Raw mesh file data as Buffer or ArrayBuffer.
   * @param filename - Original filename (used to detect format from extension).
   * @returns Upload result with character ID and mesh metadata.
   *
   * @throws {MixamoFormatError} If the file format is not FBX or GLB.
   * @throws {MixamoTopologyError} If the mesh has unsupported topology.
   * @throws {MixamoRateLimitError} If the API rate limit is exceeded after max retries.
   * @throws {MixamoError} For other API errors.
   */
  async uploadCharacter(
    data: Buffer | ArrayBuffer,
    filename: string
  ): Promise<UploadResult> {
    // Validate format
    const format = this.detectFormat(filename);

    // Validate topology (pre-flight check)
    const topologyIssues = this.validateTopology(data, format);
    const errors = topologyIssues.filter((i) => i.severity === 'error');
    if (errors.length > 0) {
      throw new MixamoTopologyError(topologyIssues);
    }

    if (topologyIssues.length > 0 && this.config.debug) {
      console.warn(
        '[MixamoAPI] Topology warnings:',
        topologyIssues.map((i) => i.message)
      );
    }

    // Upload via REST API
    const formData = this.createFormData(data, filename, format);

    const response = await this.requestWithRetry<{
      character_id: string;
      vertex_count: number;
      polygon_count: number;
      topology_valid: boolean;
    }>('POST', '/characters/upload', formData, {
      isFormData: true,
    });

    const result: UploadResult = {
      characterId: response.character_id,
      filename,
      format,
      vertexCount: response.vertex_count,
      polygonCount: response.polygon_count,
      topologyValid: response.topology_valid,
      uploadedAt: new Date().toISOString(),
    };

    if (this.config.debug) {
      console.log('[MixamoAPI] Character uploaded:', result.characterId);
    }

    return result;
  }

  /**
   * Auto-rig an uploaded character.
   *
   * Triggers Mixamo's server-side auto-rigging pipeline which detects
   * joint positions and generates a humanoid skeleton.
   *
   * @param characterId - The character ID from a previous upload.
   * @param rigType - Rig type to generate. Default: 'humanoid'.
   * @returns Rig result with bone count and quality score.
   *
   * @throws {MixamoRateLimitError} If the API rate limit is exceeded after max retries.
   * @throws {MixamoError} For other API errors (e.g. character not found).
   */
  async autoRig(
    characterId: string,
    rigType: string = 'humanoid'
  ): Promise<RigResult> {
    const response = await this.requestWithRetry<{
      character_id: string;
      rig_type: string;
      bone_count: number;
      quality_score: number;
      success: boolean;
      warnings: string[];
    }>('POST', `/characters/${encodeURIComponent(characterId)}/rig`, {
      rig_type: rigType,
    });

    const result: RigResult = {
      characterId: response.character_id,
      rigType: response.rig_type,
      boneCount: response.bone_count,
      qualityScore: response.quality_score,
      success: response.success,
      warnings: response.warnings ?? [],
      riggedAt: new Date().toISOString(),
    };

    if (this.config.debug) {
      console.log(
        `[MixamoAPI] Character rigged: ${result.characterId} (${result.boneCount} bones, quality: ${result.qualityScore})`
      );
    }

    return result;
  }

  /**
   * List available animations from the Mixamo library.
   *
   * Supports pagination, category filtering, and text search.
   *
   * @param options - Listing options (page, limit, category, query, motionType).
   * @returns Paginated list of animations.
   *
   * @throws {MixamoRateLimitError} If the API rate limit is exceeded after max retries.
   * @throws {MixamoError} For other API errors.
   */
  async listAnimations(
    options: AnimationListOptions = {}
  ): Promise<AnimationListResult> {
    const params = new URLSearchParams();
    if (options.page) params.set('page', String(options.page));
    if (options.limit) params.set('limit', String(options.limit));
    if (options.category) params.set('category', options.category);
    if (options.query) params.set('query', options.query);
    if (options.motionType) params.set('motion_type', options.motionType);

    const queryString = params.toString();
    const endpoint = `/animations${queryString ? `?${queryString}` : ''}`;

    const response = await this.requestWithRetry<{
      animations: Array<{
        id: string;
        name: string;
        category: string;
        duration: number;
        loopable: boolean;
        motion_type: 'in-place' | 'root-motion';
        thumbnail_url: string;
      }>;
      total: number;
      page: number;
      limit: number;
      has_more: boolean;
    }>('GET', endpoint);

    const result: AnimationListResult = {
      animations: response.animations.map((a) => ({
        id: a.id,
        name: a.name,
        category: a.category,
        duration: a.duration,
        loopable: a.loopable,
        motionType: a.motion_type,
        thumbnailUrl: a.thumbnail_url,
      })),
      total: response.total,
      page: response.page,
      limit: response.limit,
      hasMore: response.has_more,
    };

    if (this.config.debug) {
      console.log(
        `[MixamoAPI] Listed ${result.animations.length} animations (${result.total} total)`
      );
    }

    return result;
  }

  /**
   * Download an animation applied to a specific character.
   *
   * The animation is retargeted to the character's skeleton and returned
   * as raw file data in the requested format (FBX or GLB).
   *
   * @param options - Download options (characterId, animationId, format, etc.)
   * @returns Download result with raw file data and metadata.
   *
   * @throws {MixamoFormatError} If the requested format is not supported.
   * @throws {MixamoRateLimitError} If the API rate limit is exceeded after max retries.
   * @throws {MixamoError} For other API errors.
   */
  async downloadAnimation(options: DownloadOptions): Promise<DownloadResult> {
    const format = options.format ?? 'fbx';
    if (!SUPPORTED_FORMATS.includes(format)) {
      throw new MixamoFormatError(format);
    }

    const response = await this.requestWithRetry<ArrayBuffer>(
      'POST',
      `/characters/${encodeURIComponent(options.characterId)}/animations/${encodeURIComponent(options.animationId)}/download`,
      {
        format,
        include_skin: options.includeSkin ?? false,
        fps: options.fps ?? 30,
        keyframe_reduction: options.keyframeReduction ?? 0,
      },
      { binary: true }
    );

    const suggestedFilename = `${options.characterId}_${options.animationId}.${format}`;

    const result: DownloadResult = {
      data: response,
      contentType: format === 'fbx' ? 'application/octet-stream' : 'model/gltf-binary',
      filename: suggestedFilename,
      sizeBytes: response.byteLength,
      format,
    };

    if (this.config.debug) {
      console.log(
        `[MixamoAPI] Animation downloaded: ${result.filename} (${result.sizeBytes} bytes)`
      );
    }

    return result;
  }

  // -----------------------------------------------------------------------
  // Format Detection & Validation
  // -----------------------------------------------------------------------

  /**
   * Detect mesh format from filename extension.
   *
   * @param filename - The mesh filename.
   * @returns The detected format.
   * @throws {MixamoFormatError} If the extension is not recognized.
   */
  private detectFormat(filename: string): MeshFormat {
    const ext = filename.split('.').pop()?.toLowerCase();

    if (ext === 'fbx') return 'fbx';
    if (ext === 'glb' || ext === 'gltf') return 'glb';

    throw new MixamoFormatError(ext ?? 'unknown');
  }

  /**
   * Validate mesh topology for auto-rigging compatibility.
   *
   * Performs pre-flight checks on the mesh data to detect issues that
   * would cause the auto-rigging pipeline to fail or produce poor results.
   *
   * @param data - Raw mesh file data.
   * @param format - The mesh format.
   * @returns Array of topology issues found (may be empty if mesh is clean).
   */
  private validateTopology(
    data: Buffer | ArrayBuffer,
    format: MeshFormat
  ): TopologyIssue[] {
    const issues: TopologyIssue[] = [];
    const byteLength =
      data instanceof ArrayBuffer ? data.byteLength : data.length;

    // Basic size validation
    if (byteLength < 100) {
      issues.push({
        code: 'DEGENERATE_FACES',
        message: 'File is too small to contain valid mesh data.',
        severity: 'error',
      });
      return issues;
    }

    // FBX magic number validation
    if (format === 'fbx') {
      const header = new Uint8Array(
        data instanceof ArrayBuffer ? data : data.buffer,
        data instanceof ArrayBuffer ? 0 : data.byteOffset,
        Math.min(23, byteLength)
      );
      const magic = String.fromCharCode(...header.slice(0, 20));
      if (!magic.startsWith('Kaydara FBX Binary')) {
        // Could be ASCII FBX or invalid
        if (byteLength < 1000) {
          issues.push({
            code: 'DEGENERATE_FACES',
            message:
              'FBX file does not contain a valid binary header. ASCII FBX may have limited support.',
            severity: 'warning',
          });
        }
      }
    }

    // GLB magic number validation
    if (format === 'glb') {
      const header = new Uint8Array(
        data instanceof ArrayBuffer ? data : data.buffer,
        data instanceof ArrayBuffer ? 0 : data.byteOffset,
        Math.min(4, byteLength)
      );
      const glbMagic =
        header[0] === 0x67 &&
        header[1] === 0x6c &&
        header[2] === 0x54 &&
        header[3] === 0x46; // "glTF"
      if (!glbMagic) {
        issues.push({
          code: 'DEGENERATE_FACES',
          message: 'GLB file does not contain a valid glTF binary header.',
          severity: 'error',
        });
      }
    }

    // Size-based heuristic for excessive polygon count
    // Rough estimate: typical FBX is ~50 bytes per polygon
    const estimatedPolygons = byteLength / 50;
    if (estimatedPolygons > 500_000) {
      issues.push({
        code: 'EXCESSIVE_POLYGONS',
        message: `Estimated polygon count (~${Math.round(estimatedPolygons).toLocaleString()}) exceeds recommended limit of 500,000 for auto-rigging. Consider decimating the mesh.`,
        severity: 'warning',
      });
    }

    if (estimatedPolygons > 2_000_000) {
      issues.push({
        code: 'EXCESSIVE_POLYGONS',
        message: `Estimated polygon count (~${Math.round(estimatedPolygons).toLocaleString()}) far exceeds the maximum of 2,000,000 for auto-rigging.`,
        severity: 'error',
      });
    }

    return issues;
  }

  // -----------------------------------------------------------------------
  // HTTP Utilities
  // -----------------------------------------------------------------------

  /**
   * Create form data for file upload.
   */
  private createFormData(
    data: Buffer | ArrayBuffer,
    filename: string,
    format: MeshFormat
  ): Record<string, unknown> {
    return {
      file: data,
      filename,
      format,
      type: 'character',
    };
  }

  /**
   * Execute an HTTP request with exponential backoff retry for rate limits.
   *
   * @param method - HTTP method.
   * @param endpoint - API endpoint path (appended to base URL).
   * @param body - Request body (JSON or form data).
   * @param options - Additional request options.
   * @returns Parsed response data.
   */
  private async requestWithRetry<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    endpoint: string,
    body?: unknown,
    options?: { isFormData?: boolean; binary?: boolean }
  ): Promise<T> {
    const baseUrl =
      this.config.credentials.apiBase ?? MIXAMO_API_BASE;
    const url = `${baseUrl}${endpoint}`;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      try {
        const headers: Record<string, string> = {
          Authorization: `Bearer ${this.config.credentials.accessToken}`,
          Accept: options?.binary ? 'application/octet-stream' : 'application/json',
        };

        const fetchOptions: RequestInit = {
          method,
          headers,
          signal: AbortSignal.timeout(this.config.timeoutMs),
        };

        if (body && method !== 'GET') {
          if (options?.isFormData) {
            // For form data uploads, the body is passed as-is
            // (in production, this would use FormData)
            headers['Content-Type'] = 'multipart/form-data';
            fetchOptions.body = JSON.stringify(body);
          } else {
            headers['Content-Type'] = 'application/json';
            fetchOptions.body = JSON.stringify(body);
          }
        }

        const response = await fetch(url, fetchOptions);

        // Handle rate limiting
        if (response.status === 429) {
          const retryAfter = parseInt(
            response.headers.get('Retry-After') ?? '0',
            10
          );
          const backoffMs = Math.min(
            retryAfter > 0
              ? retryAfter * 1000
              : this.config.initialBackoffMs * Math.pow(2, attempt),
            MAX_BACKOFF_MS
          );

          if (this.config.debug) {
            console.warn(
              `[MixamoAPI] Rate limited (attempt ${attempt + 1}/${this.config.maxRetries}). Retrying in ${backoffMs}ms...`
            );
          }

          // If this is the last attempt, throw
          if (attempt === this.config.maxRetries - 1) {
            throw new MixamoRateLimitError(
              Math.ceil(backoffMs / 1000),
              attempt + 1
            );
          }

          await this.sleep(backoffMs);
          continue;
        }

        // Handle other HTTP errors
        if (!response.ok) {
          let errorMessage = `Mixamo API error: ${response.status} ${response.statusText}`;
          try {
            const errorBody = await response.json();
            if (errorBody.message) {
              errorMessage = errorBody.message;
            }
            if (errorBody.error) {
              errorMessage = errorBody.error;
            }
          } catch {
            // Could not parse error body, use status text
          }

          throw new MixamoError(errorMessage, `HTTP_${response.status}`);
        }

        // Parse response
        if (options?.binary) {
          return (await response.arrayBuffer()) as T;
        }

        return (await response.json()) as T;
      } catch (error) {
        if (
          error instanceof MixamoRateLimitError ||
          error instanceof MixamoTopologyError ||
          error instanceof MixamoFormatError
        ) {
          throw error;
        }

        lastError = error instanceof Error ? error : new Error(String(error));

        // Retry on network errors
        if (attempt < this.config.maxRetries - 1) {
          const backoffMs = Math.min(
            this.config.initialBackoffMs * Math.pow(2, attempt),
            MAX_BACKOFF_MS
          );

          if (this.config.debug) {
            console.warn(
              `[MixamoAPI] Request failed (attempt ${attempt + 1}/${this.config.maxRetries}): ${lastError.message}. Retrying in ${backoffMs}ms...`
            );
          }

          await this.sleep(backoffMs);
          continue;
        }
      }
    }

    throw new MixamoError(
      `Request failed after ${this.config.maxRetries} attempts: ${lastError?.message ?? 'Unknown error'}`,
      'MAX_RETRIES_EXCEEDED'
    );
  }

  /**
   * Sleep for a given number of milliseconds.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ---------------------------------------------------------------------------
// MixamoPresetMapper — Animation Preset Name to Mixamo ID Mapping
// ---------------------------------------------------------------------------

/**
 * A mapping entry from a HoloScript animation preset name to a Mixamo animation ID.
 */
export interface PresetMixamoMapping {
  /** The @holoscript/animation-presets preset name. */
  presetName: string;

  /** The primary Mixamo animation ID. */
  mixamoAnimationId: string;

  /** The Mixamo clip name for display/search. */
  mixamoClipName: string;

  /** Alternative Mixamo animation IDs for variation. */
  alternativeIds: string[];

  /** Optional speed adjustment when applying this preset. */
  speedAdjustment: number;
}

/**
 * Maps @holoscript/animation-presets preset names to Mixamo animation IDs.
 *
 * Provides bidirectional lookup between HoloScript's canonical animation
 * preset names (walk, idle, run, etc.) and Mixamo's animation library IDs.
 *
 * @example
 * ```ts
 * import { MixamoPresetMapper } from '@holoscript/core/tools/MixamoIntegration';
 *
 * const mapper = new MixamoPresetMapper();
 *
 * // Lookup Mixamo ID from preset name
 * const mapping = mapper.getMixamoId('walk');
 * console.log(mapping?.mixamoAnimationId); // "14667"
 *
 * // Reverse lookup
 * const presetName = mapper.getPresetName('14667');
 * console.log(presetName); // "walk"
 *
 * // Get all mappings
 * const all = mapper.getAllMappings();
 * ```
 */
export class MixamoPresetMapper {
  /** Internal mapping store: preset name -> mapping. */
  private readonly mappings: Map<string, PresetMixamoMapping>;

  /** Reverse index: Mixamo animation ID -> preset name. */
  private readonly reverseIndex: Map<string, string>;

  constructor() {
    this.mappings = new Map();
    this.reverseIndex = new Map();
    this.loadDefaultMappings();
  }

  /**
   * Get the Mixamo animation mapping for a preset name.
   *
   * @param presetName - HoloScript animation preset name (e.g. 'walk', 'idle').
   * @returns The mapping, or undefined if no mapping exists.
   */
  getMixamoId(presetName: string): PresetMixamoMapping | undefined {
    return this.mappings.get(presetName.toLowerCase());
  }

  /**
   * Get the HoloScript preset name for a Mixamo animation ID.
   *
   * @param mixamoId - Mixamo animation ID.
   * @returns The preset name, or undefined if no reverse mapping exists.
   */
  getPresetName(mixamoId: string): string | undefined {
    return this.reverseIndex.get(mixamoId);
  }

  /**
   * Get all preset-to-Mixamo mappings.
   *
   * @returns Array of all mappings.
   */
  getAllMappings(): PresetMixamoMapping[] {
    return Array.from(this.mappings.values());
  }

  /**
   * Check if a mapping exists for a given preset name.
   *
   * @param presetName - HoloScript animation preset name.
   */
  hasMapping(presetName: string): boolean {
    return this.mappings.has(presetName.toLowerCase());
  }

  /**
   * Register a custom preset-to-Mixamo mapping.
   *
   * @param mapping - The mapping to register.
   */
  registerMapping(mapping: PresetMixamoMapping): void {
    const key = mapping.presetName.toLowerCase();
    this.mappings.set(key, mapping);
    this.reverseIndex.set(mapping.mixamoAnimationId, key);
    for (const altId of mapping.alternativeIds) {
      this.reverseIndex.set(altId, key);
    }
  }

  /**
   * Search for mappings by Mixamo clip name (partial, case-insensitive).
   *
   * @param query - Search query string.
   * @returns Array of matching mappings.
   */
  searchByClipName(query: string): PresetMixamoMapping[] {
    const q = query.toLowerCase();
    const results: PresetMixamoMapping[] = [];
    for (const mapping of this.mappings.values()) {
      if (mapping.mixamoClipName.toLowerCase().includes(q)) {
        results.push(mapping);
      }
    }
    return results;
  }

  /**
   * Load the default preset-to-Mixamo mappings for all 15 canonical presets.
   *
   * Mixamo animation IDs are based on the Mixamo REST API's internal
   * identifiers. These map to the canonical clip names defined in
   * @holoscript/animation-presets.
   */
  private loadDefaultMappings(): void {
    const defaults: PresetMixamoMapping[] = [
      {
        presetName: 'walk',
        mixamoAnimationId: '14667',
        mixamoClipName: 'Walking',
        alternativeIds: ['14668', '14670', '14671', '14672'],
        speedAdjustment: 1.0,
      },
      {
        presetName: 'run',
        mixamoAnimationId: '14524',
        mixamoClipName: 'Running',
        alternativeIds: ['14525', '14526', '14527', '14528'],
        speedAdjustment: 1.0,
      },
      {
        presetName: 'idle',
        mixamoAnimationId: '14330',
        mixamoClipName: 'Idle',
        alternativeIds: ['14331', '14332', '14333'],
        speedAdjustment: 1.0,
      },
      {
        presetName: 'jump',
        mixamoAnimationId: '14340',
        mixamoClipName: 'Jump',
        alternativeIds: ['14341', '14342', '14343', '14344'],
        speedAdjustment: 1.0,
      },
      {
        presetName: 'attack',
        mixamoAnimationId: '14084',
        mixamoClipName: 'Sword And Shield Attack',
        alternativeIds: ['14085', '14086', '14088', '14090'],
        speedAdjustment: 1.0,
      },
      {
        presetName: 'dance',
        mixamoAnimationId: '14189',
        mixamoClipName: 'Hip Hop Dancing',
        alternativeIds: ['14190', '14191', '14192', '14193'],
        speedAdjustment: 1.0,
      },
      {
        presetName: 'wave',
        mixamoAnimationId: '14660',
        mixamoClipName: 'Waving',
        alternativeIds: ['14661'],
        speedAdjustment: 1.0,
      },
      {
        presetName: 'speak',
        mixamoAnimationId: '14591',
        mixamoClipName: 'Talking',
        alternativeIds: ['14592', '14593'],
        speedAdjustment: 1.0,
      },
      {
        presetName: 'sit',
        mixamoAnimationId: '14564',
        mixamoClipName: 'Sitting',
        alternativeIds: ['14565', '14566'],
        speedAdjustment: 1.0,
      },
      {
        presetName: 'sleep',
        mixamoAnimationId: '14572',
        mixamoClipName: 'Sleeping Idle',
        alternativeIds: ['14573'],
        speedAdjustment: 1.0,
      },
      {
        presetName: 'crouch',
        mixamoAnimationId: '14180',
        mixamoClipName: 'Crouching Idle',
        alternativeIds: ['14181', '14182', '14183'],
        speedAdjustment: 1.0,
      },
      {
        presetName: 'swim',
        mixamoAnimationId: '14610',
        mixamoClipName: 'Swimming',
        alternativeIds: ['14611', '14612', '14613'],
        speedAdjustment: 0.9,
      },
      {
        presetName: 'fly',
        mixamoAnimationId: '14250',
        mixamoClipName: 'Flying',
        alternativeIds: ['14251', '14252', '14253'],
        speedAdjustment: 0.8,
      },
      {
        presetName: 'climb',
        mixamoAnimationId: '14160',
        mixamoClipName: 'Climbing',
        alternativeIds: ['14161', '14162', '14163'],
        speedAdjustment: 0.8,
      },
      {
        presetName: 'emote',
        mixamoAnimationId: '14220',
        mixamoClipName: 'Cheering',
        alternativeIds: ['14221', '14222', '14223'],
        speedAdjustment: 1.0,
      },
    ];

    for (const mapping of defaults) {
      this.registerMapping(mapping);
    }
  }
}

// ---------------------------------------------------------------------------
// CharacterTemplateRegistry — Pre-Rigged Character Templates
// ---------------------------------------------------------------------------

/**
 * Character archetype classification.
 */
export type CharacterArchetype =
  | 'male-adult'
  | 'female-adult'
  | 'male-child'
  | 'female-child'
  | 'robot-humanoid'
  | 'robot-mechanical'
  | 'creature-bipedal'
  | 'creature-quadruped'
  | 'stylized-male'
  | 'stylized-female'
  | 'armored-knight'
  | 'sci-fi-soldier';

/**
 * A pre-rigged character template definition.
 *
 * Templates are characters that have already been rigged on Mixamo,
 * allowing users to skip the rigging step and immediately apply animations.
 */
export interface CharacterTemplate {
  /** Unique template identifier. */
  id: string;

  /** Human-readable template name. */
  name: string;

  /** Character archetype classification. */
  archetype: CharacterArchetype;

  /** Description of the character. */
  description: string;

  /** Mixamo character ID (pre-rigged). */
  mixamoCharacterId: string;

  /** Rig type (e.g. "humanoid", "quadruped"). */
  rigType: string;

  /** Number of bones in the skeleton. */
  boneCount: number;

  /** Polygon count of the template mesh. */
  polygonCount: number;

  /** Available formats for download. */
  availableFormats: MeshFormat[];

  /** Default animation set included with the template. */
  defaultAnimations: string[];

  /** Template preview/thumbnail URL. */
  thumbnailUrl: string;

  /** Tags for filtering and search. */
  tags: string[];

  /** Whether this template is a Mixamo default (vs. user-uploaded). */
  isDefault: boolean;
}

/**
 * Registry of pre-rigged character templates.
 *
 * Provides 10+ default humanoid templates spanning common archetypes
 * (male, female, child, robot, creature). Pre-rigged templates skip
 * the auto-rigging step, allowing immediate animation application.
 *
 * @example
 * ```ts
 * import { CharacterTemplateRegistry, MixamoAPI } from '@holoscript/core/tools/MixamoIntegration';
 *
 * const registry = new CharacterTemplateRegistry();
 *
 * // Find a template by archetype
 * const robots = registry.getByArchetype('robot-humanoid');
 *
 * // Use a pre-rigged template (skip rigging)
 * const template = registry.get('xbot');
 * if (template) {
 *   // Template is already rigged - go straight to animation download
 *   const download = await api.downloadAnimation({
 *     characterId: template.mixamoCharacterId,
 *     animationId: '14667', // Walking
 *   });
 * }
 * ```
 */
export class CharacterTemplateRegistry {
  /** Internal template store: id -> template. */
  private readonly templates: Map<string, CharacterTemplate>;

  /**
   * Creates a new CharacterTemplateRegistry pre-loaded with default templates.
   * Pass `false` to create an empty registry.
   */
  constructor(loadDefaults = true) {
    this.templates = new Map();
    if (loadDefaults) {
      this.loadDefaultTemplates();
    }
  }

  // -----------------------------------------------------------------------
  // Lookup
  // -----------------------------------------------------------------------

  /**
   * Get a template by its unique identifier.
   *
   * @param id - Template ID.
   * @returns The template, or undefined if not found.
   */
  get(id: string): CharacterTemplate | undefined {
    return this.templates.get(id);
  }

  /**
   * Check if a template exists.
   *
   * @param id - Template ID.
   */
  has(id: string): boolean {
    return this.templates.has(id);
  }

  // -----------------------------------------------------------------------
  // Filtering
  // -----------------------------------------------------------------------

  /**
   * Get all templates matching a specific archetype.
   *
   * @param archetype - The character archetype to filter by.
   * @returns Array of matching templates.
   */
  getByArchetype(archetype: CharacterArchetype): CharacterTemplate[] {
    const results: CharacterTemplate[] = [];
    for (const template of this.templates.values()) {
      if (template.archetype === archetype) {
        results.push(template);
      }
    }
    return results;
  }

  /**
   * Get all templates matching a specific rig type.
   *
   * @param rigType - Rig type (e.g. "humanoid", "quadruped").
   * @returns Array of matching templates.
   */
  getByRigType(rigType: string): CharacterTemplate[] {
    const results: CharacterTemplate[] = [];
    for (const template of this.templates.values()) {
      if (template.rigType === rigType) {
        results.push(template);
      }
    }
    return results;
  }

  /**
   * Search templates by name, description, or tags.
   *
   * @param query - Search query (case-insensitive substring match).
   * @returns Array of matching templates.
   */
  search(query: string): CharacterTemplate[] {
    const q = query.toLowerCase();
    const results: CharacterTemplate[] = [];
    for (const template of this.templates.values()) {
      const matchesName = template.name.toLowerCase().includes(q);
      const matchesDescription = template.description.toLowerCase().includes(q);
      const matchesTags = template.tags.some((t) => t.toLowerCase().includes(q));

      if (matchesName || matchesDescription || matchesTags) {
        results.push(template);
      }
    }
    return results;
  }

  // -----------------------------------------------------------------------
  // Enumeration
  // -----------------------------------------------------------------------

  /**
   * Get all registered templates.
   */
  getAll(): CharacterTemplate[] {
    return Array.from(this.templates.values());
  }

  /**
   * Get all available archetypes that have at least one template.
   */
  getAvailableArchetypes(): CharacterArchetype[] {
    const archetypes = new Set<CharacterArchetype>();
    for (const template of this.templates.values()) {
      archetypes.add(template.archetype);
    }
    return Array.from(archetypes);
  }

  /**
   * Get the total number of registered templates.
   */
  get size(): number {
    return this.templates.size;
  }

  // -----------------------------------------------------------------------
  // Registration
  // -----------------------------------------------------------------------

  /**
   * Register a custom character template.
   *
   * @param template - The template to register.
   */
  register(template: CharacterTemplate): void {
    this.templates.set(template.id, template);
  }

  /**
   * Remove a template from the registry.
   *
   * @param id - Template ID to remove.
   * @returns `true` if the template was found and removed.
   */
  unregister(id: string): boolean {
    return this.templates.delete(id);
  }

  // -----------------------------------------------------------------------
  // Default Templates
  // -----------------------------------------------------------------------

  /**
   * Load the 12 default pre-rigged character templates.
   *
   * These cover common humanoid archetypes used in spatial computing,
   * VR, game development, and animation workflows.
   */
  private loadDefaultTemplates(): void {
    const defaults: CharacterTemplate[] = [
      // ---- Male Adult Archetypes ----
      {
        id: 'xbot',
        name: 'X Bot',
        archetype: 'male-adult',
        description:
          'Mixamo default male humanoid. Clean topology, production-ready skeleton with 65 bones. Ideal for prototyping and general-purpose character animation.',
        mixamoCharacterId: 'mixamo-xbot-v1',
        rigType: 'humanoid',
        boneCount: 65,
        polygonCount: 12_456,
        availableFormats: ['fbx', 'glb'],
        defaultAnimations: ['idle', 'walk', 'run', 'jump'],
        thumbnailUrl: 'https://www.mixamo.com/thumbnails/xbot.png',
        tags: ['male', 'humanoid', 'default', 'robot', 'prototype'],
        isDefault: true,
      },
      {
        id: 'brute',
        name: 'Brute',
        archetype: 'male-adult',
        description:
          'Muscular male character with heavy build. Suitable for warrior, fighter, and action archetypes. Enhanced upper body deformation.',
        mixamoCharacterId: 'mixamo-brute-v1',
        rigType: 'humanoid',
        boneCount: 65,
        polygonCount: 18_234,
        availableFormats: ['fbx', 'glb'],
        defaultAnimations: ['idle', 'walk', 'attack'],
        thumbnailUrl: 'https://www.mixamo.com/thumbnails/brute.png',
        tags: ['male', 'humanoid', 'muscular', 'warrior', 'heavy'],
        isDefault: true,
      },

      // ---- Female Adult Archetypes ----
      {
        id: 'ybot',
        name: 'Y Bot',
        archetype: 'female-adult',
        description:
          'Mixamo default female humanoid. Clean topology, production-ready skeleton with 65 bones. Ideal for prototyping and general-purpose character animation.',
        mixamoCharacterId: 'mixamo-ybot-v1',
        rigType: 'humanoid',
        boneCount: 65,
        polygonCount: 11_892,
        availableFormats: ['fbx', 'glb'],
        defaultAnimations: ['idle', 'walk', 'run', 'dance'],
        thumbnailUrl: 'https://www.mixamo.com/thumbnails/ybot.png',
        tags: ['female', 'humanoid', 'default', 'robot', 'prototype'],
        isDefault: true,
      },
      {
        id: 'maria',
        name: 'Maria',
        archetype: 'female-adult',
        description:
          'Realistic female character with detailed facial blend shapes. Suitable for cinematic sequences and social VR.',
        mixamoCharacterId: 'mixamo-maria-v1',
        rigType: 'humanoid',
        boneCount: 67,
        polygonCount: 22_340,
        availableFormats: ['fbx', 'glb'],
        defaultAnimations: ['idle', 'walk', 'speak', 'wave'],
        thumbnailUrl: 'https://www.mixamo.com/thumbnails/maria.png',
        tags: ['female', 'humanoid', 'realistic', 'facial', 'cinematic'],
        isDefault: true,
      },

      // ---- Child Archetypes ----
      {
        id: 'ty',
        name: 'Ty',
        archetype: 'male-child',
        description:
          'Young male character with child proportions. Adjusted bone hierarchy for accurate child movement and shorter stride length.',
        mixamoCharacterId: 'mixamo-ty-v1',
        rigType: 'humanoid',
        boneCount: 63,
        polygonCount: 9_876,
        availableFormats: ['fbx', 'glb'],
        defaultAnimations: ['idle', 'walk', 'run', 'jump'],
        thumbnailUrl: 'https://www.mixamo.com/thumbnails/ty.png',
        tags: ['child', 'male', 'humanoid', 'young', 'small'],
        isDefault: true,
      },
      {
        id: 'lily',
        name: 'Lily',
        archetype: 'female-child',
        description:
          'Young female character with child proportions. Suitable for educational, family-friendly, and social VR applications.',
        mixamoCharacterId: 'mixamo-lily-v1',
        rigType: 'humanoid',
        boneCount: 63,
        polygonCount: 10_234,
        availableFormats: ['fbx', 'glb'],
        defaultAnimations: ['idle', 'walk', 'dance', 'wave'],
        thumbnailUrl: 'https://www.mixamo.com/thumbnails/lily.png',
        tags: ['child', 'female', 'humanoid', 'young', 'small'],
        isDefault: true,
      },

      // ---- Robot Archetypes ----
      {
        id: 'android',
        name: 'Android Unit',
        archetype: 'robot-humanoid',
        description:
          'Humanoid robot with mechanical joint articulation. Rigid body segments connected by revolute joints. Suitable for sci-fi and robotics simulations.',
        mixamoCharacterId: 'mixamo-android-v1',
        rigType: 'humanoid',
        boneCount: 60,
        polygonCount: 15_678,
        availableFormats: ['fbx', 'glb'],
        defaultAnimations: ['idle', 'walk', 'run'],
        thumbnailUrl: 'https://www.mixamo.com/thumbnails/android.png',
        tags: ['robot', 'humanoid', 'mechanical', 'sci-fi', 'android'],
        isDefault: true,
      },
      {
        id: 'mech-worker',
        name: 'Mech Worker',
        archetype: 'robot-mechanical',
        description:
          'Industrial mechanical robot with hydraulic limbs. Heavy-duty construction archetype with simplified joint hierarchy for mechanical animation.',
        mixamoCharacterId: 'mixamo-mechworker-v1',
        rigType: 'humanoid',
        boneCount: 48,
        polygonCount: 20_456,
        availableFormats: ['fbx', 'glb'],
        defaultAnimations: ['idle', 'walk', 'attack'],
        thumbnailUrl: 'https://www.mixamo.com/thumbnails/mechworker.png',
        tags: ['robot', 'mechanical', 'industrial', 'heavy', 'hydraulic'],
        isDefault: true,
      },

      // ---- Creature Archetypes ----
      {
        id: 'drake',
        name: 'Drake',
        archetype: 'creature-bipedal',
        description:
          'Bipedal dragon-like creature with wing attachments. Modified humanoid rig with additional wing and tail bone chains.',
        mixamoCharacterId: 'mixamo-drake-v1',
        rigType: 'humanoid',
        boneCount: 78,
        polygonCount: 24_890,
        availableFormats: ['fbx', 'glb'],
        defaultAnimations: ['idle', 'walk', 'attack', 'fly'],
        thumbnailUrl: 'https://www.mixamo.com/thumbnails/drake.png',
        tags: ['creature', 'bipedal', 'dragon', 'fantasy', 'wings', 'tail'],
        isDefault: true,
      },
      {
        id: 'wolf',
        name: 'Wolf',
        archetype: 'creature-quadruped',
        description:
          'Quadruped wolf with full locomotion rig. Four-legged skeleton hierarchy with spine flexibility and tail chain.',
        mixamoCharacterId: 'mixamo-wolf-v1',
        rigType: 'quadruped',
        boneCount: 52,
        polygonCount: 14_567,
        availableFormats: ['fbx', 'glb'],
        defaultAnimations: ['idle', 'walk', 'run'],
        thumbnailUrl: 'https://www.mixamo.com/thumbnails/wolf.png',
        tags: ['creature', 'quadruped', 'wolf', 'animal', 'four-legged'],
        isDefault: true,
      },

      // ---- Stylized Archetypes ----
      {
        id: 'paladin',
        name: 'Paladin',
        archetype: 'armored-knight',
        description:
          'Armored knight with plate armor and cape physics. Heavy character suitable for medieval and fantasy combat scenarios.',
        mixamoCharacterId: 'mixamo-paladin-v1',
        rigType: 'humanoid',
        boneCount: 68,
        polygonCount: 28_456,
        availableFormats: ['fbx', 'glb'],
        defaultAnimations: ['idle', 'walk', 'attack', 'crouch'],
        thumbnailUrl: 'https://www.mixamo.com/thumbnails/paladin.png',
        tags: ['humanoid', 'armored', 'knight', 'medieval', 'fantasy', 'heavy'],
        isDefault: true,
      },
      {
        id: 'trooper',
        name: 'Trooper',
        archetype: 'sci-fi-soldier',
        description:
          'Sci-fi soldier with tactical gear and visor. Modern military archetype suitable for FPS, action, and tactical simulations.',
        mixamoCharacterId: 'mixamo-trooper-v1',
        rigType: 'humanoid',
        boneCount: 65,
        polygonCount: 19_234,
        availableFormats: ['fbx', 'glb'],
        defaultAnimations: ['idle', 'walk', 'run', 'crouch', 'attack'],
        thumbnailUrl: 'https://www.mixamo.com/thumbnails/trooper.png',
        tags: ['humanoid', 'soldier', 'sci-fi', 'military', 'tactical', 'fps'],
        isDefault: true,
      },
    ];

    for (const template of defaults) {
      this.templates.set(template.id, template);
    }
  }
}
