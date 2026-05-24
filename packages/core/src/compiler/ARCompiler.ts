/**
 * @fileoverview AR Compiler (Augmented Reality)
 * @module @holoscript/core/compiler
 *
 * PURPOSE:
 * Compile HoloScript compositions to an Augmented Reality (AR) scaffold: a
 * WebXR/Three.js scene plus an input-driven registry of @ar_beacon nodes (real
 * id/type/position, bound per-beacon via ARRuntime.onBeaconDetected) and
 * @overlay nodes (real text/layout). Each beacon/overlay in the source produces
 * a distinct emitted entry.
 *
 * NOT YET EMITTED (deep-ratchet 2026-05-24, see C-AR): @geo_anchor, @qr_scan,
 * @ar_portal, @camera_overlay, @x402_paywall traits are not yet translated to
 * runtime constructs.
 */

import type { HoloComposition } from '../parser/HoloCompositionTypes.js';
import { CompilerBase, type CompilerToken } from './CompilerBase';
import { ANSCapabilityPath, type ANSCapabilityPathValue } from '@holoscript/core-types/ans';

export interface ARCompilerOptions {
  target: 'webxr' | 'ar.js';
  minify: boolean;
  source_maps: boolean;
  features: {
    hit_test: boolean;
    image_tracking: boolean;
  };
}

import type { ARCompilationResult } from './CompilerTypes';
export type { ARCompilationResult } from './CompilerTypes';

export class ARCompiler extends CompilerBase {
  protected readonly compilerName = 'ARCompiler';

  protected override getRequiredCapability(): ANSCapabilityPathValue {
    return ANSCapabilityPath.AR;
  }

  private options: ARCompilerOptions;
  private errors: string[] = [];
  private warnings: string[] = [];
  private generatedCode: string[] = [];
  private sceneCounter = 0;

  constructor(options: ARCompilerOptions) {
    super();
    this.options = options;
  }

  override compile(
    composition: HoloComposition,
    agentToken: string,
    outputPath?: string
  ): ARCompilationResult {
    this.validateCompilerAccess(agentToken as CompilerToken, outputPath);
    this.errors = [];
    this.warnings = [];
    this.generatedCode = [];

    if (!composition || composition.type !== 'Composition') {
      this.errors.push('Invalid composition tree');
      return this.buildResult();
    }

    const arNodes = this.extractNodesWithTrait(composition, '@ar_beacon');
    const overlayNodes = this.extractNodesWithTrait(composition, '@overlay');

    if (arNodes.length === 0 && overlayNodes.length === 0) {
      this.warnings.push('No AR traits found. Compilation may not trigger AR session.');
    }

    this.generateImports();
    this.generateSceneSetup();
    this.generateARHooks(arNodes, overlayNodes);

    return this.buildResult();
  }

  private extractNodesWithTrait(astNode: unknown, traitName: string) {
    const matched: Record<string, unknown>[] = [];
    const cleanTraitName = traitName.startsWith('@') ? traitName.slice(1) : traitName;
    const traverse = (node: unknown) => {
      if (!node || typeof node !== 'object') return;
      const n = node as Record<string, unknown>;
      if (
        Array.isArray(n.traits) &&
        n.traits.some((t: unknown) => (t as Record<string, unknown>).name === cleanTraitName)
      ) {
        matched.push(n);
      }
      for (const key of Object.keys(n)) {
        if (typeof n[key] === 'object') {
          traverse(n[key]);
        }
      }
    };
    traverse(astNode);
    return matched;
  }

  private generateImports() {
    this.generatedCode.push(`import * as THREE from 'three';`);
    if (this.options.target === 'webxr') {
      this.generatedCode.push(`import { ARRuntime } from '@holoscript/runtime';`);
    } else {
      this.generatedCode.push(`// AR.js fallback imports would go here`);
    }
  }

  private generateSceneSetup() {
    this.generatedCode.push(`\n// Initialize AR Scene`);
    this.generatedCode.push(`const scene = new THREE.Scene();`);
    this.generatedCode.push(
      `const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);`
    );
    this.generatedCode.push(
      `const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });`
    );
    this.generatedCode.push(`renderer.setPixelRatio(window.devicePixelRatio);`);
    this.generatedCode.push(`renderer.setSize(window.innerWidth, window.innerHeight);`);
    if (this.options.target === 'webxr') {
      this.generatedCode.push(`renderer.xr.enabled = true;`);
    }
    this.generatedCode.push(`document.body.appendChild(renderer.domElement);`);
  }

  private generateARHooks(
    arNodes: Record<string, unknown>[],
    overlayNodes: Record<string, unknown>[]
  ) {
    this.generatedCode.push(`\n// Engine Initialization via AR Traits`);

    if (this.options.target === 'webxr') {
      this.generatedCode.push(`const arRuntime = new ARRuntime({`);
      this.generatedCode.push(`  scene_id: 'auto_gen_ar_${this.sceneCounter++}',`);
      this.generatedCode.push(`  features: {`);
      this.generatedCode.push(`    hit_test: ${this.options.features.hit_test},`);
      this.generatedCode.push(`    image_tracking: ${this.options.features.image_tracking}`);
      this.generatedCode.push(`  }`);
      this.generatedCode.push(`});`);
    }

    // @ar_beacon → input-driven registry (real id/type/position per node),
    // then per-beacon binding via ARRuntime (webxr only).
    if (arNodes.length > 0) {
      this.generatedCode.push(`\n// @ar_beacon registry (one entry per source node)`);
      this.generatedCode.push(`const arBeacons = [`);
      arNodes.forEach((node, i) => {
        const cfg = this.getTraitConfig(node, 'ar_beacon');
        const entry = {
          id: this.scalar(cfg.id) ?? this.nodeName(node, `beacon_${i}`),
          type: this.scalar(cfg.type) ?? 'image',
          position: this.nodePosition(node),
        };
        this.generatedCode.push(`  ${JSON.stringify(entry)},`);
      });
      this.generatedCode.push(`];`);

      if (this.options.target === 'webxr') {
        this.generatedCode.push(`arBeacons.forEach((beacon) => {`);
        this.generatedCode.push(`  arRuntime.onBeaconDetected(beacon.id, (pose) => {`);
        this.generatedCode.push(
          `    console.log('AR beacon', beacon.id, beacon.type, 'anchored at', beacon.position, pose);`
        );
        this.generatedCode.push(`  });`);
        this.generatedCode.push(`});`);
      }
    }

    // @overlay → input-driven registry (real text/layout per node).
    if (overlayNodes.length > 0) {
      this.generatedCode.push(`\n// @overlay registry (one entry per source node)`);
      this.generatedCode.push(`const arOverlays = [`);
      overlayNodes.forEach((node, i) => {
        const cfg = this.getTraitConfig(node, 'overlay');
        const entry = {
          id: this.nodeName(node, `overlay_${i}`),
          text: this.scalar(this.getProp(node, 'text')) ?? this.scalar(cfg.text) ?? '',
          layout: this.scalar(this.getProp(node, 'layout')) ?? this.scalar(cfg.layout) ?? 'default',
        };
        this.generatedCode.push(`  ${JSON.stringify(entry)},`);
      });
      this.generatedCode.push(`];`);
    }
  }

  /** Merged config+params of the named trait on a node ({} if absent). */
  private getTraitConfig(node: Record<string, unknown>, traitName: string): Record<string, unknown> {
    const traits = node.traits;
    if (!Array.isArray(traits)) return {};
    const trait = traits.find(
      (t) => (t as Record<string, unknown> | null)?.name === traitName
    ) as Record<string, unknown> | undefined;
    if (!trait) return {};
    return {
      ...((trait.config as Record<string, unknown>) ?? {}),
      ...((trait.params as Record<string, unknown>) ?? {}),
    };
  }

  /** Value of an ObjectProperty by key (undefined if absent). */
  private getProp(node: Record<string, unknown>, key: string): unknown {
    const props = node.properties;
    if (!Array.isArray(props)) return undefined;
    const prop = props.find((p) => (p as Record<string, unknown> | null)?.key === key) as
      | Record<string, unknown>
      | undefined;
    return prop?.value;
  }

  private nodeName(node: Record<string, unknown>, fallback: string): string {
    return (this.scalar(node.name) ?? this.scalar(node.id) ?? fallback) as string;
  }

  private nodePosition(node: Record<string, unknown>): { x: number; y: number; z: number } | null {
    const p = node.position as { x?: number; y?: number; z?: number } | undefined;
    if (!p || typeof p !== 'object') return null;
    return { x: p.x ?? 0, y: p.y ?? 0, z: p.z ?? 0 };
  }

  /** Narrow a HoloValue to a JSON-embeddable scalar, else undefined. */
  private scalar(v: unknown): string | number | boolean | undefined {
    return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? v : undefined;
  }

  private buildResult(): ARCompilationResult {
    return {
      success: this.errors.length === 0,
      target: this.options.target,
      code: this.generatedCode.join('\n'),
      assets: [],
      warnings: this.warnings,
      errors: this.errors,
    };
  }
}

export default ARCompiler;
