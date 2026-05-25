/**
 * MVHEVCCompiler — Generates an MV-HEVC spatial-video export plan for Apple Vision Pro.
 *
 * This compiler does not encode video bytes. It produces stereo rig metadata,
 * Swift/RealityKit scaffold source, and an advisory mux command that a real
 * encoder pipeline can consume.
 *
 * Output includes:
 * - Camera rig parameters for stereo pair rendering
 * - MV-HEVC muxing configuration (ISO/IEC 23008-2 Annex G)
 * - Swift code for AVFoundation spatial video playback
 * - RealityKit VideoPlayerComponent integration
 *
 * @see W.156: MV-HEVC is Apple's standard for spatial video on Vision Pro
 * @see P.156.01: Stereo Camera Rig pattern (65mm IPD baseline)
 */

export interface HoloComposition {
  name?: string;
  objects: Array<{
    traits?: Array<{ name: string; config?: Record<string, unknown> }>;
  }>;
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface MVHEVCConfig {
  /** Inter-pupillary distance in meters. Default: 0.065 (65mm human average) */
  ipd: number;
  /** Video resolution per eye [width, height]. Default: [1920, 1080] */
  resolution: [number, number];
  /** Frames per second. Default: 30 */
  fps: number;
  /** Focus/convergence distance in meters. Default: 2.0 */
  convergenceDistance: number;
  /** Horizontal field of view in degrees. Default: 90 */
  fovDegrees: number;
  /** HEVC encoding quality. Default: 'high' */
  quality: 'low' | 'medium' | 'high';
  /** Output container format. Default: 'mov' */
  container: 'mov' | 'mp4';
  /** Disparity adjustment for depth comfort. Default: 1.0 */
  disparityScale: number;
}

export interface MVHEVCStereoView {
  /** Eye identifier */
  eye: 'left' | 'right';
  /** Camera offset from center (negative = left, positive = right) */
  cameraOffset: number;
  /** View shear for toe-in-free convergence */
  viewShear: number;
  /** HEVC layer index (0 = base layer, 1 = enhancement layer) */
  layerIndex: number;
}

export interface MVHEVCCompilationResult {
  /** Truthful artifact class: this is an export plan/scaffold, not encoded video bytes. */
  artifactKind: 'mvhevc-plan';
  /** Stereo rig configuration */
  config: MVHEVCConfig;
  /** Left and right eye view parameters */
  views: MVHEVCStereoView[];
  /** Swift code for spatial video playback on Vision Pro */
  swiftCode: string;
  /** Advisory mux command string. It is not executed by this compiler. */
  muxCommand: string;
  /** Concrete limitations that keep the compiler honest at call sites. */
  limitations: string[];
  /** ISOBMFF metadata for spatial video signaling */
  metadata: {
    stereoMode: 'side-by-side' | 'multiview-hevc';
    baseline: number;
    convergence: number;
    horizontalFOV: number;
  };
}

// ── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: MVHEVCConfig = {
  ipd: 0.065,
  resolution: [1920, 1080],
  fps: 30,
  convergenceDistance: 2.0,
  fovDegrees: 90,
  quality: 'high',
  container: 'mov',
  disparityScale: 1.0,
};

const QUALITY_BITRATE: Record<string, number> = {
  low: 10_000_000, // 10 Mbps per eye
  medium: 25_000_000, // 25 Mbps per eye
  high: 50_000_000, // 50 Mbps per eye
};

const MVHEVC_PLAN_LIMITATIONS = [
  'Generates Swift source and mux metadata only.',
  'Does not invoke VideoToolbox, AVAssetWriter, ffmpeg, or libx265.',
  'Does not return encoded MV-HEVC bytes or validate multiview NAL/SEI layers.',
];

// ── Compiler ─────────────────────────────────────────────────────────────────

export class MVHEVCCompiler {
  compile(composition: HoloComposition, agentToken: string, outputPath?: string): string {
    void agentToken;
    void outputPath;

    const result = this.compileMVHEVC(composition);
    return result.swiftCode;
  }

  /**
   * MV-HEVC planning result with stereo rig metadata, Swift scaffold, and mux command.
   */
  compileMVHEVC(
    composition: HoloComposition,
    overrides?: Partial<MVHEVCConfig>
  ): MVHEVCCompilationResult {
    const config = this.resolveConfig(composition, overrides);
    const views = this.generateStereoViews(config);
    const swiftCode = this.generateSwiftCode(composition, config);
    const muxCommand = this.generateMuxCommand(config);

    return {
      artifactKind: 'mvhevc-plan',
      config,
      views,
      swiftCode,
      muxCommand,
      limitations: [...MVHEVC_PLAN_LIMITATIONS],
      metadata: {
        stereoMode: 'multiview-hevc',
        baseline: config.ipd,
        convergence: config.convergenceDistance,
        horizontalFOV: config.fovDegrees,
      },
    };
  }

  /**
   * Generate left/right stereo view parameters.
   * Uses half-IPD offset with view shearing for convergence.
   */
  private generateStereoViews(config: MVHEVCConfig): MVHEVCStereoView[] {
    const halfIPD = (config.ipd * config.disparityScale) / 2;
    const shearFactor = 1 / config.convergenceDistance;

    return [
      {
        eye: 'left',
        cameraOffset: -halfIPD,
        viewShear: halfIPD * shearFactor,
        layerIndex: 0, // Base layer
      },
      {
        eye: 'right',
        cameraOffset: halfIPD,
        viewShear: -halfIPD * shearFactor,
        layerIndex: 1, // Enhancement layer
      },
    ];
  }

  /**
   * Extract MV-HEVC config from composition @spatial_video traits.
   */
  private resolveConfig(
    composition: HoloComposition,
    overrides?: Partial<MVHEVCConfig>
  ): MVHEVCConfig {
    const config = { ...DEFAULT_CONFIG };

    for (const obj of composition.objects) {
      const svTrait = obj.traits?.find((t) => t.name === 'spatial_video');
      if (svTrait?.config) {
        const p = svTrait.config;
        if (typeof p['ipd'] === 'number') config.ipd = p['ipd'];
        if (Array.isArray(p['resolution'])) config.resolution = p['resolution'] as [number, number];
        if (typeof p['fps'] === 'number') config.fps = p['fps'];
        if (typeof p['convergence'] === 'number') config.convergenceDistance = p['convergence'];
        if (typeof p['fov'] === 'number') config.fovDegrees = p['fov'];
        if (typeof p['quality'] === 'string')
          config.quality = p['quality'] as MVHEVCConfig['quality'];
      }
    }

    if (overrides) Object.assign(config, overrides);
    return config;
  }

  /**
   * Generate Swift scaffold code for spatial video playback on Apple Vision Pro.
   */
  private generateSwiftCode(composition: HoloComposition, config: MVHEVCConfig): string {
    const sceneName = composition.name || 'SpatialVideoScene';
    const bitrate = QUALITY_BITRATE[config.quality] ?? QUALITY_BITRATE.high;

    return `// MVHEVCCompiler output — MV-HEVC planner/scaffold for Apple Vision Pro
// Not an encoded .${config.container} artifact. Feed rendered eye frames into a platform encoder.
// Stereo baseline: ${config.ipd * 1000}mm IPD, ${config.resolution[0]}x${config.resolution[1]} per eye
// Convergence: ${config.convergenceDistance}m, FOV: ${config.fovDegrees}°, ${config.fps}fps

import SwiftUI
import RealityKit
import AVFoundation
import AVKit

// MARK: - Stereo Camera Rig

struct StereoCameraConfig {
    let ipd: Float = ${config.ipd}
    let convergenceDistance: Float = ${config.convergenceDistance}
    let fovDegrees: Float = ${config.fovDegrees}
    let resolution: SIMD2<Int> = [${config.resolution[0]}, ${config.resolution[1]}]
    let fps: Int = ${config.fps}
    let bitrate: Int = ${bitrate}
}

// MARK: - Spatial Video Player

struct ${sceneName}: View {
    @State private var player: AVPlayer?

    var body: some View {
        RealityView { content in
            // Spatial video entity with VideoPlayerComponent
            let entity = Entity()

            if let url = Bundle.main.url(forResource: "${sceneName.toLowerCase()}", withExtension: "${config.container}") {
                let player = AVPlayer(url: url)

                // Configure for MV-HEVC spatial video playback
                var videoComponent = VideoPlayerComponent(avPlayer: player)
                entity.components.set(videoComponent)

                // Position the video surface
                entity.position = [0, 1.5, -2]
                entity.scale = [${(config.resolution[0] / config.resolution[1]).toFixed(2)}, 1.0, 1.0]

                content.add(entity)
                self.player = player
            }
        }
        .onAppear {
            player?.play()
        }
    }
}

// MARK: - Stereo Rendering Pipeline

struct StereoRenderPipeline {
    let config = StereoCameraConfig()

    /// Render left and right eye views for MV-HEVC encoding
    func renderStereoFrame(scene: Entity, timestamp: TimeInterval) -> (left: CGImage, right: CGImage)? {
        let halfIPD = config.ipd / 2

        // Left eye: offset camera by -halfIPD
        let leftView = renderEyeView(
            scene: scene,
            cameraOffset: SIMD3<Float>(-halfIPD, 0, 0),
            viewShear: halfIPD / config.convergenceDistance,
            timestamp: timestamp
        )

        // Right eye: offset camera by +halfIPD
        let rightView = renderEyeView(
            scene: scene,
            cameraOffset: SIMD3<Float>(halfIPD, 0, 0),
            viewShear: -halfIPD / config.convergenceDistance,
            timestamp: timestamp
        )

        guard let left = leftView, let right = rightView else { return nil }
        return (left, right)
    }

    private func renderEyeView(
        scene: Entity,
        cameraOffset: SIMD3<Float>,
        viewShear: Float,
        timestamp: TimeInterval
    ) -> CGImage? {
        // Configure asymmetric frustum (view shearing, not toe-in)
        // Prevents vertical parallax artifacts
        // Implementation: offset camera position, shear projection matrix column 2
        return nil // Platform-specific Metal rendering
    }
}

// MARK: - AVAssetWriter MV-HEVC Muxer

extension StereoRenderPipeline {
    /// Create AVAssetWriter configured for MV-HEVC output
    func createMVHEVCWriter(outputURL: URL) throws -> AVAssetWriter {
        let writer = try AVAssetWriter(outputURL: outputURL, fileType: .mov)

        // Base layer (left eye) — HEVC Main Profile
        let baseSettings: [String: Any] = [
            AVVideoCodecKey: AVVideoCodecType.hevc,
            AVVideoWidthKey: config.resolution[0],
            AVVideoHeightKey: config.resolution[1],
            AVVideoCompressionPropertiesKey: [
                AVVideoAverageBitRateKey: config.bitrate,
                AVVideoProfileLevelKey: "HEVC_Main_AutoLevel",
            ] as [String: Any],
        ]
        let baseInput = AVAssetWriterInput(mediaType: .video, outputSettings: baseSettings)
        baseInput.expectsMediaDataInRealTime = false
        writer.add(baseInput)

        // Enhancement layer (right eye) — MV-HEVC Stereo Profile
        // Tagged with kCMTagStereoInterpretation for spatial video
        let enhancementSettings: [String: Any] = [
            AVVideoCodecKey: AVVideoCodecType.hevc,
            AVVideoWidthKey: config.resolution[0],
            AVVideoHeightKey: config.resolution[1],
            AVVideoCompressionPropertiesKey: [
                AVVideoAverageBitRateKey: config.bitrate,
                AVVideoProfileLevelKey: "HEVC_Main_AutoLevel",
            ] as [String: Any],
        ]
        let enhancementInput = AVAssetWriterInput(mediaType: .video, outputSettings: enhancementSettings)
        enhancementInput.expectsMediaDataInRealTime = false
        writer.add(enhancementInput)

        return writer
    }
}
`;
  }

  /**
   * Generate an advisory FFmpeg command string for muxing separate L/R HEVC streams.
   */
  private generateMuxCommand(config: MVHEVCConfig): string {
    const bitrate = Math.round(
      (QUALITY_BITRATE[config.quality] ?? QUALITY_BITRATE.high) / 1_000_000
    );
    return [
      'ffmpeg',
      '-i left_eye.hevc -i right_eye.hevc',
      `-c:v hevc -b:v ${bitrate}M`,
      '-tag:v hvc1',
      `-r ${config.fps}`,
      `-s ${config.resolution[0]}x${config.resolution[1]}`,
      '-movflags +faststart',
      '-brand mp42',
      // MV-HEVC signaling via SEI messages
      '-metadata:s:v:0 stereo_mode=multiview_hevc',
      '-metadata:s:v:0 "handler_name=Left Eye"',
      '-metadata:s:v:1 "handler_name=Right Eye"',
      `-f ${config.container}`,
      `output_spatial.${config.container}`,
    ].join(' \\\n  ');
  }
}
