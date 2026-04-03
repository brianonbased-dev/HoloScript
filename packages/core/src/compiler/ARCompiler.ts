/**
 * @fileoverview AR Compiler (Augmented Reality)
 * @module @holoscript/core/compiler
 *
 * PURPOSE:
 * Compile HoloScript compositions to Augmented Reality (AR) layers, focusing
 * on pass-through overlays, bounding box anchors, and QR/image tracking.
 */

import type { HoloComposition } from '../parser/HoloCompositionTypes.js';
import { CompilerBase, type CompilerToken } from './CompilerBase';
import { ANSCapabilityPath, type ANSCapabilityPathValue } from './identity/ANSNamespace';

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

  private extractNodesWithTrait(astNode: any, traitName: string) {
    const matched: any[] = [];
    const cleanTraitName = traitName.startsWith('@') ? traitName.slice(1) : traitName;
    const traverse = (node: any) => {
      if (!node || typeof node !== 'object') return;
      if (node.traits && node.traits.some((t: any) => t.name === cleanTraitName)) {
        matched.push(node);
      }
      for (const key of Object.keys(node)) {
        if (typeof node[key] === 'object') {
          traverse(node[key]);
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

  private generateARHooks(arNodes: any[], overlayNodes: any[]) {
    this.generatedCode.push(`\n// Engine Initialization via AR Traits`);

    if (this.options.target === 'webxr') {
      this.generatedCode.push(`const arRuntime = new ARRuntime({`);
      this.generatedCode.push(`  scene_id: 'auto_gen_ar_${Date.now()}',`);
      this.generatedCode.push(`  features: {`);
      this.generatedCode.push(`    hit_test: ${this.options.features.hit_test},`);
      this.generatedCode.push(`    image_tracking: ${this.options.features.image_tracking}`);
      this.generatedCode.push(`  }`);
      this.generatedCode.push(`});`);

      if (arNodes.length > 0) {
        this.generatedCode.push(`\n// Bind @ar_beacon detections`);
        this.generatedCode.push(`arRuntime.onBeaconDetected('global', (pose) => {`);
        this.generatedCode.push(`  console.log('Beacon detected at', pose);`);
        this.generatedCode.push(`});`);
      }
    }
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
