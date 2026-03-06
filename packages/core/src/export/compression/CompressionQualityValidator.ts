/**
 * Compression Quality Validator
 *
 * Evaluates all 18+ export targets for compression quality and lossy detection.
 * Ensures that lossy compression stages are flagged with quality metrics so
 * developers can make informed decisions about fidelity vs. file size trade-offs.
 *
 * Validates:
 *   - Texture compression quality (KTX2 / Basis Universal / ASTC / ETC2)
 *   - Mesh compression quality (Draco quantization bit depths)
 *   - Audio compression quality (Opus / AAC bitrate thresholds)
 *   - Gaussian splat compression (SPZ quantization levels)
 *   - Overall pipeline quality score per export target
 *
 * @version 1.0.0
 */

import type { CompressionOptions, CompressionQualityPreset } from './CompressionTypes';

// ═══════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════

export type QualityLevel = 'lossless' | 'near-lossless' | 'lossy' | 'destructive';

export interface CompressionStage {
  name: string;
  type: 'texture' | 'mesh' | 'audio' | 'gaussian' | 'animation' | 'metadata';
  qualityLevel: QualityLevel;
  qualityScore: number; // 0-1
  isLossy: boolean;
  details: string;
  recommendation?: string;
}

export interface TargetQualityReport {
  targetName: string;
  overallScore: number; // 0-1
  overallLevel: QualityLevel;
  stages: CompressionStage[];
  warnings: string[];
  isAcceptable: boolean;
}

export interface ValidationConfig {
  minAcceptableScore: number; // 0-1, default 0.6
  warnOnLossy: boolean;
  warnOnDestructive: boolean;
  textureQualityFloor: number; // 0-100
  meshQuantizationFloor: number; // bits
  gaussianBudgetEnforcement: boolean;
}

// ═══════════════════════════════════════════════════════════════════
// Export Target Definitions
// ═══════════════════════════════════════════════════════════════════

export interface ExportTargetProfile {
  name: string;
  textureCompression: { format: string; quality: number; isLossy: boolean };
  meshCompression: { enabled: boolean; positionBits: number; normalBits: number };
  audioCompression: { codec: string; bitrate: number; isLossy: boolean };
  gaussianHandling: { maxCount: number; compressionFormat: string; isLossy: boolean };
  supportsLossless: boolean;
}

export const EXPORT_TARGET_PROFILES: Record<string, ExportTargetProfile> = {
  'gltf-binary': {
    name: 'glTF Binary (.glb)',
    textureCompression: { format: 'ktx2-uastc', quality: 85, isLossy: true },
    meshCompression: { enabled: true, positionBits: 14, normalBits: 10 },
    audioCompression: { codec: 'none', bitrate: 0, isLossy: false },
    gaussianHandling: { maxCount: 2000000, compressionFormat: 'none', isLossy: false },
    supportsLossless: true,
  },
  'webxr': {
    name: 'WebXR (Progressive)',
    textureCompression: { format: 'ktx2-etc1s', quality: 70, isLossy: true },
    meshCompression: { enabled: true, positionBits: 12, normalBits: 8 },
    audioCompression: { codec: 'opus', bitrate: 128000, isLossy: true },
    gaussianHandling: { maxCount: 500000, compressionFormat: 'spz', isLossy: true },
    supportsLossless: false,
  },
  'quest3': {
    name: 'Meta Quest 3 (APK)',
    textureCompression: { format: 'astc-4x4', quality: 75, isLossy: true },
    meshCompression: { enabled: true, positionBits: 14, normalBits: 10 },
    audioCompression: { codec: 'opus', bitrate: 96000, isLossy: true },
    gaussianHandling: { maxCount: 180000, compressionFormat: 'spz', isLossy: true },
    supportsLossless: false,
  },
  'visionos': {
    name: 'Apple Vision Pro (USDZ)',
    textureCompression: { format: 'astc-6x6', quality: 80, isLossy: true },
    meshCompression: { enabled: true, positionBits: 16, normalBits: 12 },
    audioCompression: { codec: 'aac', bitrate: 192000, isLossy: true },
    gaussianHandling: { maxCount: 1000000, compressionFormat: 'quantized', isLossy: true },
    supportsLossless: false,
  },
  'android-xr': {
    name: 'Android XR (Jetpack XR)',
    textureCompression: { format: 'etc2', quality: 70, isLossy: true },
    meshCompression: { enabled: true, positionBits: 14, normalBits: 10 },
    audioCompression: { codec: 'opus', bitrate: 96000, isLossy: true },
    gaussianHandling: { maxCount: 300000, compressionFormat: 'spz', isLossy: true },
    supportsLossless: false,
  },
  'desktop-vr': {
    name: 'Desktop VR (SteamVR/PCVR)',
    textureCompression: { format: 'bc7', quality: 90, isLossy: true },
    meshCompression: { enabled: false, positionBits: 32, normalBits: 32 },
    audioCompression: { codec: 'none', bitrate: 0, isLossy: false },
    gaussianHandling: { maxCount: 2000000, compressionFormat: 'none', isLossy: false },
    supportsLossless: true,
  },
  'mobile-ar': {
    name: 'Mobile AR (ARCore/ARKit)',
    textureCompression: { format: 'astc-8x8', quality: 60, isLossy: true },
    meshCompression: { enabled: true, positionBits: 12, normalBits: 8 },
    audioCompression: { codec: 'aac', bitrate: 64000, isLossy: true },
    gaussianHandling: { maxCount: 100000, compressionFormat: 'spz', isLossy: true },
    supportsLossless: false,
  },
  'web-embed': {
    name: 'Web Embed (iframe)',
    textureCompression: { format: 'webp', quality: 75, isLossy: true },
    meshCompression: { enabled: true, positionBits: 12, normalBits: 8 },
    audioCompression: { codec: 'opus', bitrate: 64000, isLossy: true },
    gaussianHandling: { maxCount: 200000, compressionFormat: 'spz', isLossy: true },
    supportsLossless: false,
  },
  'unreal-engine': {
    name: 'Unreal Engine (FBX/USD)',
    textureCompression: { format: 'none', quality: 100, isLossy: false },
    meshCompression: { enabled: false, positionBits: 32, normalBits: 32 },
    audioCompression: { codec: 'none', bitrate: 0, isLossy: false },
    gaussianHandling: { maxCount: 5000000, compressionFormat: 'none', isLossy: false },
    supportsLossless: true,
  },
  'unity': {
    name: 'Unity (FBX/USD)',
    textureCompression: { format: 'none', quality: 100, isLossy: false },
    meshCompression: { enabled: false, positionBits: 32, normalBits: 32 },
    audioCompression: { codec: 'none', bitrate: 0, isLossy: false },
    gaussianHandling: { maxCount: 5000000, compressionFormat: 'none', isLossy: false },
    supportsLossless: true,
  },
  'a2a-agent-card': {
    name: 'A2A Agent Card (JSON)',
    textureCompression: { format: 'none', quality: 100, isLossy: false },
    meshCompression: { enabled: false, positionBits: 0, normalBits: 0 },
    audioCompression: { codec: 'none', bitrate: 0, isLossy: false },
    gaussianHandling: { maxCount: 0, compressionFormat: 'none', isLossy: false },
    supportsLossless: true,
  },
  'xr-agent-model': {
    name: 'XR Agent Model (ExecuTorch)',
    textureCompression: { format: 'none', quality: 100, isLossy: false },
    meshCompression: { enabled: false, positionBits: 0, normalBits: 0 },
    audioCompression: { codec: 'none', bitrate: 0, isLossy: false },
    gaussianHandling: { maxCount: 0, compressionFormat: 'none', isLossy: false },
    supportsLossless: true,
  },
  'three-js': {
    name: 'Three.js Scene',
    textureCompression: { format: 'ktx2-uastc', quality: 80, isLossy: true },
    meshCompression: { enabled: true, positionBits: 14, normalBits: 10 },
    audioCompression: { codec: 'none', bitrate: 0, isLossy: false },
    gaussianHandling: { maxCount: 500000, compressionFormat: 'none', isLossy: false },
    supportsLossless: true,
  },
  'react-three-fiber': {
    name: 'React Three Fiber (JSX)',
    textureCompression: { format: 'ktx2-uastc', quality: 80, isLossy: true },
    meshCompression: { enabled: true, positionBits: 14, normalBits: 10 },
    audioCompression: { codec: 'none', bitrate: 0, isLossy: false },
    gaussianHandling: { maxCount: 500000, compressionFormat: 'none', isLossy: false },
    supportsLossless: true,
  },
  'usd': {
    name: 'Universal Scene Description (USD)',
    textureCompression: { format: 'none', quality: 100, isLossy: false },
    meshCompression: { enabled: false, positionBits: 32, normalBits: 32 },
    audioCompression: { codec: 'none', bitrate: 0, isLossy: false },
    gaussianHandling: { maxCount: 5000000, compressionFormat: 'none', isLossy: false },
    supportsLossless: true,
  },
  'holoscript-pack': {
    name: 'HoloScript Pack (.hsp)',
    textureCompression: { format: 'ktx2-uastc', quality: 85, isLossy: true },
    meshCompression: { enabled: true, positionBits: 16, normalBits: 12 },
    audioCompression: { codec: 'opus', bitrate: 128000, isLossy: true },
    gaussianHandling: { maxCount: 2000000, compressionFormat: 'spz', isLossy: true },
    supportsLossless: false,
  },
  'marketplace': {
    name: 'HoloScript Marketplace',
    textureCompression: { format: 'ktx2-uastc', quality: 80, isLossy: true },
    meshCompression: { enabled: true, positionBits: 14, normalBits: 10 },
    audioCompression: { codec: 'opus', bitrate: 96000, isLossy: true },
    gaussianHandling: { maxCount: 500000, compressionFormat: 'spz', isLossy: true },
    supportsLossless: false,
  },
  'wasm': {
    name: 'WASM Module',
    textureCompression: { format: 'none', quality: 100, isLossy: false },
    meshCompression: { enabled: false, positionBits: 0, normalBits: 0 },
    audioCompression: { codec: 'none', bitrate: 0, isLossy: false },
    gaussianHandling: { maxCount: 0, compressionFormat: 'none', isLossy: false },
    supportsLossless: true,
  },
};

// ═══════════════════════════════════════════════════════════════════
// Validator
// ═══════════════════════════════════════════════════════════════════

const DEFAULT_VALIDATION_CONFIG: ValidationConfig = {
  minAcceptableScore: 0.6,
  warnOnLossy: true,
  warnOnDestructive: true,
  textureQualityFloor: 40,
  meshQuantizationFloor: 8,
  gaussianBudgetEnforcement: true,
};

export class CompressionQualityValidator {
  private config: ValidationConfig;

  constructor(config: Partial<ValidationConfig> = {}) {
    this.config = { ...DEFAULT_VALIDATION_CONFIG, ...config };
  }

  /**
   * Validate a single export target's compression quality.
   */
  validateTarget(targetName: string, overrides?: Partial<CompressionOptions>): TargetQualityReport {
    const profile = EXPORT_TARGET_PROFILES[targetName];
    if (!profile) {
      return {
        targetName,
        overallScore: 0,
        overallLevel: 'destructive',
        stages: [],
        warnings: [`Unknown export target: ${targetName}`],
        isAcceptable: false,
      };
    }

    const stages: CompressionStage[] = [];
    const warnings: string[] = [];

    // Evaluate texture compression
    stages.push(this.evaluateTextureCompression(profile, overrides));

    // Evaluate mesh compression
    stages.push(this.evaluateMeshCompression(profile, overrides));

    // Evaluate audio compression
    stages.push(this.evaluateAudioCompression(profile));

    // Evaluate Gaussian splat handling
    stages.push(this.evaluateGaussianCompression(profile));

    // Compute overall score
    const activeStages = stages.filter(s => s.qualityScore > 0 || s.isLossy);
    const overallScore = activeStages.length > 0
      ? activeStages.reduce((sum, s) => sum + s.qualityScore, 0) / activeStages.length
      : 1.0;

    // Determine overall level
    const overallLevel = this.scoreToLevel(overallScore);

    // Generate warnings
    if (this.config.warnOnLossy) {
      const lossyStages = stages.filter(s => s.isLossy);
      if (lossyStages.length > 0) {
        warnings.push(
          `${lossyStages.length} lossy compression stage(s): ${lossyStages.map(s => s.name).join(', ')}`
        );
      }
    }

    if (this.config.warnOnDestructive) {
      const destructiveStages = stages.filter(s => s.qualityLevel === 'destructive');
      if (destructiveStages.length > 0) {
        warnings.push(
          `DESTRUCTIVE compression detected in: ${destructiveStages.map(s => s.name).join(', ')}. Visual artifacts likely.`
        );
      }
    }

    // Check quality floor violations
    const textureStage = stages.find(s => s.type === 'texture');
    if (textureStage && profile.textureCompression.quality < this.config.textureQualityFloor) {
      warnings.push(
        `Texture quality (${profile.textureCompression.quality}) below floor (${this.config.textureQualityFloor})`
      );
    }

    const meshStage = stages.find(s => s.type === 'mesh');
    if (meshStage && profile.meshCompression.enabled && profile.meshCompression.positionBits < this.config.meshQuantizationFloor) {
      warnings.push(
        `Mesh position quantization (${profile.meshCompression.positionBits} bits) below floor (${this.config.meshQuantizationFloor} bits)`
      );
    }

    return {
      targetName: profile.name,
      overallScore,
      overallLevel,
      stages,
      warnings,
      isAcceptable: overallScore >= this.config.minAcceptableScore,
    };
  }

  /**
   * Validate all known export targets.
   */
  validateAllTargets(): TargetQualityReport[] {
    return Object.keys(EXPORT_TARGET_PROFILES).map(name => this.validateTarget(name));
  }

  /**
   * Get a summary of quality across all targets.
   */
  getSummary(): {
    totalTargets: number;
    lossless: string[];
    nearLossless: string[];
    lossy: string[];
    destructive: string[];
    acceptable: number;
    unacceptable: number;
  } {
    const reports = this.validateAllTargets();
    return {
      totalTargets: reports.length,
      lossless: reports.filter(r => r.overallLevel === 'lossless').map(r => r.targetName),
      nearLossless: reports.filter(r => r.overallLevel === 'near-lossless').map(r => r.targetName),
      lossy: reports.filter(r => r.overallLevel === 'lossy').map(r => r.targetName),
      destructive: reports.filter(r => r.overallLevel === 'destructive').map(r => r.targetName),
      acceptable: reports.filter(r => r.isAcceptable).length,
      unacceptable: reports.filter(r => !r.isAcceptable).length,
    };
  }

  // ─── Private Evaluation Methods ─────────────────────────────────

  private evaluateTextureCompression(
    profile: ExportTargetProfile,
    overrides?: Partial<CompressionOptions>,
  ): CompressionStage {
    const quality = overrides?.textureQuality ?? profile.textureCompression.quality;
    const format = profile.textureCompression.format;

    if (format === 'none' || !format) {
      return {
        name: 'Texture Compression',
        type: 'texture',
        qualityLevel: 'lossless',
        qualityScore: 1.0,
        isLossy: false,
        details: 'No texture compression applied (lossless)',
      };
    }

    const score = quality / 100;
    const level = this.scoreToLevel(score);
    const isLossy = profile.textureCompression.isLossy;

    let recommendation: string | undefined;
    if (quality < 50) {
      recommendation = `Consider increasing texture quality above 50 (currently ${quality}) to reduce visible artifacts.`;
    }

    return {
      name: 'Texture Compression',
      type: 'texture',
      qualityLevel: level,
      qualityScore: score,
      isLossy,
      details: `${format} at quality ${quality}/100`,
      recommendation,
    };
  }

  private evaluateMeshCompression(
    profile: ExportTargetProfile,
    overrides?: Partial<CompressionOptions>,
  ): CompressionStage {
    if (!profile.meshCompression.enabled) {
      return {
        name: 'Mesh Compression',
        type: 'mesh',
        qualityLevel: 'lossless',
        qualityScore: 1.0,
        isLossy: false,
        details: 'No mesh compression (full precision)',
      };
    }

    const posBits = overrides?.positionBits ?? profile.meshCompression.positionBits;
    const normBits = overrides?.normalBits ?? profile.meshCompression.normalBits;

    // Score based on quantization bit depth (32 bits = lossless, 8 bits = destructive)
    const posScore = Math.min(1.0, posBits / 16);
    const normScore = Math.min(1.0, normBits / 12);
    const score = (posScore * 0.6 + normScore * 0.4); // position matters more

    const level = this.scoreToLevel(score);

    let recommendation: string | undefined;
    if (posBits < 10) {
      recommendation = `Position quantization at ${posBits} bits may cause visible mesh jitter. Consider >= 12 bits.`;
    }

    return {
      name: 'Mesh Compression',
      type: 'mesh',
      qualityLevel: level,
      qualityScore: score,
      isLossy: true,
      details: `Draco: position=${posBits}b, normals=${normBits}b`,
      recommendation,
    };
  }

  private evaluateAudioCompression(profile: ExportTargetProfile): CompressionStage {
    if (profile.audioCompression.codec === 'none' || !profile.audioCompression.codec) {
      return {
        name: 'Audio Compression',
        type: 'audio',
        qualityLevel: 'lossless',
        qualityScore: 1.0,
        isLossy: false,
        details: 'No audio compression (PCM/WAV)',
      };
    }

    const bitrate = profile.audioCompression.bitrate;
    // Score: 320kbps+ = near-lossless, 128kbps = good, 64kbps = lossy, <32kbps = destructive
    let score: number;
    if (bitrate >= 320000) score = 0.95;
    else if (bitrate >= 192000) score = 0.85;
    else if (bitrate >= 128000) score = 0.75;
    else if (bitrate >= 96000) score = 0.65;
    else if (bitrate >= 64000) score = 0.55;
    else score = 0.3;

    const level = this.scoreToLevel(score);

    let recommendation: string | undefined;
    if (bitrate < 64000) {
      recommendation = `Audio bitrate (${Math.round(bitrate / 1000)}kbps) is very low. Consider >= 96kbps for spatial audio.`;
    }

    return {
      name: 'Audio Compression',
      type: 'audio',
      qualityLevel: level,
      qualityScore: score,
      isLossy: profile.audioCompression.isLossy,
      details: `${profile.audioCompression.codec} at ${Math.round(bitrate / 1000)}kbps`,
      recommendation,
    };
  }

  private evaluateGaussianCompression(profile: ExportTargetProfile): CompressionStage {
    if (profile.gaussianHandling.compressionFormat === 'none' || profile.gaussianHandling.maxCount === 0) {
      return {
        name: 'Gaussian Splat Compression',
        type: 'gaussian',
        qualityLevel: profile.gaussianHandling.maxCount === 0 ? 'lossless' : 'lossless',
        qualityScore: 1.0,
        isLossy: false,
        details: profile.gaussianHandling.maxCount === 0
          ? 'No Gaussian data in this target'
          : `Uncompressed, max ${this.formatCount(profile.gaussianHandling.maxCount)} Gaussians`,
      };
    }

    // SPZ is lossy; quantized is lossy; none is lossless
    const format = profile.gaussianHandling.compressionFormat;
    let score: number;
    switch (format) {
      case 'quantized':
        score = 0.8;
        break;
      case 'spz':
        score = 0.7;
        break;
      default:
        score = 0.6;
    }

    const level = this.scoreToLevel(score);

    let recommendation: string | undefined;
    if (profile.gaussianHandling.maxCount < 200000) {
      recommendation = `Low Gaussian budget (${this.formatCount(profile.gaussianHandling.maxCount)}). Complex scenes may need LOD or culling.`;
    }

    return {
      name: 'Gaussian Splat Compression',
      type: 'gaussian',
      qualityLevel: level,
      qualityScore: score,
      isLossy: profile.gaussianHandling.isLossy,
      details: `${format} compression, max ${this.formatCount(profile.gaussianHandling.maxCount)}`,
      recommendation,
    };
  }

  // ─── Utilities ──────────────────────────────────────────────────

  private scoreToLevel(score: number): QualityLevel {
    if (score >= 0.95) return 'lossless';
    if (score >= 0.8) return 'near-lossless';
    if (score >= 0.5) return 'lossy';
    return 'destructive';
  }

  private formatCount(n: number): string {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
    return String(n);
  }
}
