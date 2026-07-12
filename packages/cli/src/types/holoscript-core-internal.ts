import type {} from '@holoscript/core';

declare module '@holoscript/core' {
  export class PhysicsColliderCompiler {
    compileToObject(ast: unknown): { colliderCount: number; [key: string]: unknown };
  }

  export class ComputePhysicsCompiler {
    constructor(options?: Record<string, unknown>);
    compileProject(ast: unknown): Record<string, string>;
  }

  export class MediaPipelineCompiler {
    render(ast: unknown, options?: Record<string, unknown>): {
      width: number;
      height: number;
      fps: number;
      frames: unknown[];
    };
    static toAPNG(clip: unknown): Uint8Array;
  }

  export class CpuPathTracer {
    render(ast: unknown, options?: Record<string, unknown>): {
      width: number;
      height: number;
    };
    static toPNG(image: unknown): Uint8Array;
  }

  export class PathTracerCompiler {
    constructor(options?: Record<string, unknown>);
    compileProject(ast: unknown): Record<string, string>;
  }

  export class DesktopGPUCompiler {
    compileProject(ast: unknown): Record<string, string>;
  }

  export class SpatialAudioCompiler {
    compileToModel(ast: unknown): {
      sources: unknown[];
      zones: unknown[];
      surfaces: unknown[];
      portals: unknown[];
    };
    compile(ast: unknown): string;
  }

  export class Native2DCompiler {
    compile(
      ast: unknown,
      agentToken?: string,
      outputPath?: string,
      options?: { format?: 'html' | 'react' }
    ): string;
  }
}
