import { Resolver, Query, Arg } from 'type-graphql';
import {
  ParseInput,
  ParseResult,
  ParseError,
  CompilerTarget,
  TargetInfo,
} from '../types/GraphQLTypes.js';

@Resolver()
export class QueryResolver {
  /**
   * Parse HoloScript code and return the AST
   */
  @Query(() => ParseResult, {
    description: 'Parse HoloScript code and return the AST with error handling',
  })
  async parseHoloScript(@Arg('input', () => ParseInput) input: ParseInput): Promise<ParseResult> {
    try {
      // Dynamic import to avoid ESM/CJS interop issues with viem
      const { HoloScriptPlusParser } = await import('@holoscript/core');
      const parser = new HoloScriptPlusParser();
      const result = parser.parse(input.code);

      // Convert AST to JSON string for GraphQL
      const astJson = JSON.stringify(result.ast, null, 2);

      return {
        success: true,
        ast: astJson,
        errors: [],
        warnings: result.warnings || [],
      };
    } catch (error: unknown) {
      // Handle parsing errors
      const errObj = error as Record<string, unknown>;
      const location = errObj?.location as
        | { line: number; column: number; offset: number }
        | undefined;
      return {
        success: false,
        ast: undefined,
        errors: [
          {
            message:
              (error instanceof Error ? error.message : String(error)) || 'Unknown parsing error',
            location: location
              ? {
                  line: location.line,
                  column: location.column,
                  offset: location.offset,
                }
              : undefined,
            code: errObj?.code as string | undefined,
          },
        ],
        warnings: [],
      };
    }
  }

  /**
   * List all available compiler targets
   */
  @Query(() => [CompilerTarget], {
    description: 'List all available compiler targets',
  })
  async listTargets(): Promise<CompilerTarget[]> {
    return Object.values(CompilerTarget);
  }

  /**
   * Get information about a specific compiler target
   */
  @Query(() => TargetInfo, {
    nullable: true,
    description: 'Get detailed information about a specific compiler target',
  })
  async getTargetInfo(
    @Arg('target', () => CompilerTarget) target: CompilerTarget
  ): Promise<TargetInfo | null> {
    const targetInfoMap: Record<CompilerTarget, TargetInfo> = {
      [CompilerTarget.UNITY]: {
        target: CompilerTarget.UNITY,
        name: 'Unity',
        description: 'Unity game engine with C# scripting',
        version: '2022.3+',
        supportedFeatures: ['VR', 'AR', 'Physics', 'Networking', 'Animations'],
      },
      [CompilerTarget.UNREAL]: {
        target: CompilerTarget.UNREAL,
        name: 'Unreal Engine',
        description: 'Unreal Engine with Blueprint and C++',
        version: '5.3+',
        supportedFeatures: ['VR', 'AR', 'Physics', 'Niagara', 'Metahumans'],
      },
      [CompilerTarget.BABYLON]: {
        target: CompilerTarget.BABYLON,
        name: 'Babylon.js',
        description: 'WebGL-based 3D engine for browsers',
        version: '6.0+',
        supportedFeatures: ['WebXR', 'Physics', 'PBR', 'Node Material Editor'],
      },
      [CompilerTarget.VRCHAT]: {
        target: CompilerTarget.VRCHAT,
        name: 'VRChat',
        description: 'VRChat platform with Udon scripting',
        version: '2024.1+',
        supportedFeatures: ['Udon', 'Networking', 'Avatars', 'Worlds'],
      },
      [CompilerTarget.R3F]: {
        target: CompilerTarget.R3F,
        name: 'React Three Fiber',
        description: 'React renderer for Three.js',
        version: '8.0+',
        supportedFeatures: ['WebXR', 'React Hooks', 'Fiber reconciler', 'Drei helpers'],
      },
      [CompilerTarget.WASM]: {
        target: CompilerTarget.WASM,
        name: 'WebAssembly',
        description: 'Compiled WebAssembly module',
        version: 'MVP+',
        supportedFeatures: ['SIMD', 'Threads', 'Memory64', 'Tail calls'],
      },
      [CompilerTarget.ANDROID]: {
        target: CompilerTarget.ANDROID,
        name: 'Android',
        description: 'Native Android with ARCore',
        version: 'API 29+',
        supportedFeatures: ['ARCore', 'OpenXR', 'Vulkan', 'Camera2'],
      },
      [CompilerTarget.IOS]: {
        target: CompilerTarget.IOS,
        name: 'iOS',
        description: 'Native iOS with ARKit',
        version: 'iOS 16+',
        supportedFeatures: ['ARKit', 'RealityKit', 'Metal', 'AVFoundation'],
      },
      [CompilerTarget.VISIONOS]: {
        target: CompilerTarget.VISIONOS,
        name: 'visionOS',
        description: 'Apple Vision Pro spatial computing',
        version: 'visionOS 1.0+',
        supportedFeatures: ['RealityKit', 'SwiftUI', 'Spatial Audio', 'Hand Tracking'],
      },
      [CompilerTarget.GODOT]: {
        target: CompilerTarget.GODOT,
        name: 'Godot Engine',
        description: 'Open-source game engine with GDScript',
        version: '4.2+',
        supportedFeatures: ['VR', 'Physics', 'GDScript', 'C#', 'Networking'],
      },
      [CompilerTarget.OPENXR]: {
        target: CompilerTarget.OPENXR,
        name: 'OpenXR',
        description: 'Cross-platform VR/AR standard',
        version: '1.0+',
        supportedFeatures: ['Hand Tracking', 'Eye Tracking', 'Passthrough', 'Composition Layers'],
      },
    };

    return targetInfoMap[target] || null;
  }
}
