/**
 * MpegGscCodec - MPEG Gaussian Splat Coding Stub
 *
 * Placeholder implementation for the MPEG Gaussian Splat Coding (GSC) standard,
 * currently in the MPEG Exploration phase. This stub provides the architecture
 * for when the standard is finalized.
 *
 * Status (as of 2026-03-01):
 *   - MPEG Working Groups WG4, WG5, WG7 are exploring GSC
 *   - No formal standardization kicked off yet
 *   - Exploring compression via GPCC v1 and HEVC for GS data
 *   - Multiple approaches being evaluated (codec-based, point cloud-based)
 *
 * When the MPEG GSC standard is finalized, this stub will be replaced with
 * a full implementation. The IGaussianCodec interface ensures the rendering
 * pipeline does not need to change.
 *
 * Architecture decision (W.038):
 *   This stub exists to ensure the codec registry can handle MPEG GSC
 *   from day one when the standard ships, without requiring architecture changes.
 *
 * @module gpu/codecs
 * @version 1.0.0
 */

import {
  AbstractGaussianCodec,
  CodecNotSupportedError,
  _CodecDecodeError,
} from './IGaussianCodec.js';
import type {
  GaussianSplatData,
  GaussianCodecCapabilities,
  GaussianDecodeOptions,
  CodecResult,
  CodecMetadata,
} from './types.js';

// =============================================================================
// MPEG GSC Constants (Provisional)
// =============================================================================

/**
 * Provisional MPEG GSC magic number.
 *
 * This is a placeholder. The actual magic bytes will be defined when the
 * MPEG GSC standard is finalized. Using "MGSC" (0x4D475343) as a temporary
 * identifier for stub testing.
 */
const MPEG_GSC_MAGIC = 0x4d475343; // "MGSC" in ASCII, little-endian

/**
 * Provisional MPEG GSC file header size.
 */
const _MPEG_GSC_HEADER_SIZE = 32;

// =============================================================================
// MPEG GSC Codec Stub
// =============================================================================

export class MpegGscCodec extends AbstractGaussianCodec {
  private readonly codecId = 'mpeg.gsc.v1' as const;

  // ─── Capabilities ─────────────────────────────────────────────────────────

  getCapabilities(): GaussianCodecCapabilities {
    return {
      id: this.codecId,
      name: 'MPEG Gaussian Splat Coding (Stub)',
      version: '0.1.0-stub',
      fileExtensions: [], // TBD when standard is finalized
      mimeTypes: [], // TBD when standard is finalized
      canEncode: false,
      canDecode: false,
      canStream: false,
      canDecodeTemporal: false,
      maxSHDegree: 3,
      maxGaussianCount: -1, // Unlimited (TBD)
      requiresWasm: true, // Likely will require WASM for HEVC decode
      requiresWebGPU: false,
      standard: 'mpeg',
      maturity: 'stub',
    };
  }

  // ─── Probe ────────────────────────────────────────────────────────────────

  canDecode(buffer: ArrayBuffer): boolean {
    if (buffer.byteLength < 4) return false;
    const view = new DataView(buffer);
    return view.getUint32(0, true) === MPEG_GSC_MAGIC;
  }

  // ─── Extract Metadata (Stub) ──────────────────────────────────────────────

  async extractMetadata(_buffer: ArrayBuffer): Promise<CodecMetadata> {
    // When the standard is finalized, this will parse the MPEG GSC header.
    // For now, return a placeholder indicating the stub status.
    throw new CodecNotSupportedError(
      this.codecId,
      'extractMetadata (MPEG GSC standard is not yet finalized)'
    );
  }

  // ─── Decode (Stub) ────────────────────────────────────────────────────────

  async decode(
    _buffer: ArrayBuffer,
    _options?: GaussianDecodeOptions
  ): Promise<CodecResult<GaussianSplatData>> {
    throw new CodecNotSupportedError(
      this.codecId,
      'decode (MPEG GSC standard is not yet finalized - ' +
        'currently in MPEG Exploration phase as of 2026-03-01)'
    );
  }

  // ─── Decompress (Stub) ────────────────────────────────────────────────────

  async decompress(_compressed: ArrayBuffer): Promise<ArrayBuffer> {
    // MPEG GSC will likely use HEVC or GPCC v1 for compression.
    // The specific decompression pipeline will be defined by the standard.
    throw new CodecNotSupportedError(
      this.codecId,
      'decompress (MPEG GSC standard is not yet finalized)'
    );
  }

  // ─── Informational Methods ────────────────────────────────────────────────

  /**
   * Get the current standardization status of MPEG GSC.
   *
   * This method is specific to the MPEG stub and provides context about
   * when the full implementation can be expected.
   */
  getStandardizationStatus(): MpegGscStatus {
    return {
      phase: 'exploration',
      workingGroups: ['WG4', 'WG5', 'WG7'],
      lastMeetingDate: '2026-01-23',
      lastMeetingName: '41st JVET / 153rd MPEG',
      compressionApproaches: [
        'GPCC v1 (Geometry-based Point Cloud Compression)',
        'HEVC (High Efficiency Video Coding) for attribute maps',
        'Custom Gaussian-specific entropy coding',
      ],
      expectedTimeline: 'TBD - no formal standardization kicked off',
      referenceUrl: 'https://mpeg.expert/gsc/index.html',
    };
  }

  /**
   * Check if a newer version of the MPEG GSC codec is available.
   *
   * In the future, this could check a remote registry for codec updates.
   * For now, it always returns false since the standard is not finalized.
   */
  async checkForUpdates(): Promise<boolean> {
    // When the standard ships, this will check for WASM module updates.
    return false;
  }
}

// =============================================================================
// MPEG GSC Status Type
// =============================================================================

/**
 * Information about the MPEG GSC standardization progress.
 */
export interface MpegGscStatus {
  /** Current phase in the MPEG standardization process */
  phase:
    | 'exploration'
    | 'call_for_proposals'
    | 'working_draft'
    | 'committee_draft'
    | 'final_draft'
    | 'published';

  /** MPEG working groups involved */
  workingGroups: string[];

  /** Date of the most recent meeting with GSC discussion */
  lastMeetingDate: string;

  /** Name/number of the most recent meeting */
  lastMeetingName: string;

  /** Compression approaches being explored */
  compressionApproaches: string[];

  /** Expected timeline for standardization */
  expectedTimeline: string;

  /** URL for more information */
  referenceUrl: string;
}
