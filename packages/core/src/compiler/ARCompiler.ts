/**
 * @fileoverview AR Compiler (Augmented Reality)
 * @module @holoscript/core/compiler
 *
 * PURPOSE:
 * Compile HoloScript compositions to Augmented Reality (AR) layers, focusing
 * on pass-through overlays, bounding box anchors, and QR/image tracking.
 */

import type {
  HoloComposition,
  HoloObjectDecl,
  HoloObjectTrait,
  HoloValue,
} from '../parser/HoloCompositionTypes.js';
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

type ARTraitName =
  | 'ar_beacon'
  | 'overlay'
  | 'geo_anchor'
  | 'qr_scan'
  | 'ar_portal'
  | 'camera_overlay'
  | 'x402_paywall';

const AR_TRAIT_NAMES: readonly ARTraitName[] = [
  'ar_beacon',
  'overlay',
  'geo_anchor',
  'qr_scan',
  'ar_portal',
  'camera_overlay',
  'x402_paywall',
];

interface Vector3Literal {
  x: number;
  y: number;
  z: number;
}

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

  constructor(options: Partial<ARCompilerOptions> = {}) {
    super();
    this.options = {
      target: options.target ?? 'webxr',
      minify: options.minify ?? false,
      source_maps: options.source_maps ?? false,
      features: {
        hit_test: options.features?.hit_test ?? false,
        image_tracking: options.features?.image_tracking ?? false,
      },
    };
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

    const arNodes = this.extractNodesWithAnyTrait(composition, AR_TRAIT_NAMES);
    const beaconNodes = this.extractNodesWithTrait(composition, 'ar_beacon');
    const overlayNodes = this.extractNodesWithTrait(composition, '@overlay');
    const geoAnchorNodes = this.extractNodesWithTrait(composition, 'geo_anchor');
    const qrScanNodes = this.extractNodesWithTrait(composition, 'qr_scan');
    const portalNodes = this.extractNodesWithTrait(composition, 'ar_portal');
    const cameraOverlayNodes = this.extractNodesWithTrait(composition, 'camera_overlay');
    const paywallNodes = this.extractNodesWithTrait(composition, 'x402_paywall');

    if (arNodes.length === 0) {
      this.warnings.push('No AR traits found. Compilation may not trigger AR session.');
    }

    this.generateImports();
    this.generateSceneSetup();
    this.generateSceneNodes(arNodes);
    this.generateARHooks({
      beaconNodes,
      overlayNodes,
      geoAnchorNodes,
      qrScanNodes,
      portalNodes,
      cameraOverlayNodes,
      paywallNodes,
    });

    return this.buildResult();
  }

  private extractNodesWithTrait(astNode: unknown, traitName: string): HoloObjectDecl[] {
    return this.extractNodesWithAnyTrait(astNode, [traitName]);
  }

  private extractNodesWithAnyTrait(
    astNode: unknown,
    traitNames: readonly string[]
  ): HoloObjectDecl[] {
    const matched: HoloObjectDecl[] = [];
    const seen = new Set<HoloObjectDecl>();
    const cleanTraitNames = new Set(traitNames.map((name) => this.cleanTraitName(name)));

    const traverse = (node: unknown) => {
      if (Array.isArray(node)) {
        for (const item of node) traverse(item);
        return;
      }
      if (!node || typeof node !== 'object') return;
      const record = node as Record<string, unknown>;
      if (
        this.isObjectDecl(record) &&
        this.nodeHasAnyTrait(record, cleanTraitNames) &&
        !seen.has(record)
      ) {
        matched.push(record);
        seen.add(record);
      }
      for (const value of Object.values(record)) {
        if (value && typeof value === 'object') {
          traverse(value);
        }
      }
    };
    traverse(astNode);
    return matched;
  }

  private cleanTraitName(traitName: string): string {
    return traitName.startsWith('@') ? traitName.slice(1) : traitName;
  }

  private isObjectDecl(record: Record<string, unknown>): record is HoloObjectDecl {
    return (
      (record.type === 'Object' || record.type === 'ObjectDecl') &&
      typeof record.name === 'string' &&
      Array.isArray(record.traits) &&
      Array.isArray(record.properties)
    );
  }

  private nodeHasAnyTrait(node: HoloObjectDecl, traitNames: ReadonlySet<string>): boolean {
    return node.traits.some((trait) => traitNames.has(this.cleanTraitName(String(trait.name))));
  }

  private getTrait(node: HoloObjectDecl, traitName: string): HoloObjectTrait | undefined {
    const cleanTraitName = traitName.startsWith('@') ? traitName.slice(1) : traitName;
    return node.traits.find((trait) => this.cleanTraitName(String(trait.name)) === cleanTraitName);
  }

  private findObjProp(node: HoloObjectDecl, key: string): HoloValue | undefined {
    return node.properties.find((prop) => prop.key === key)?.value;
  }

  private getTraitValue(
    node: HoloObjectDecl,
    traitName: string,
    keys: readonly string[],
    fallback?: HoloValue
  ): HoloValue | undefined {
    const trait = this.getTrait(node, traitName);
    const config = trait?.config ?? trait?.params ?? {};
    for (const key of keys) {
      if (config[key] !== undefined) return config[key];
    }
    for (const key of keys) {
      const prop = this.findObjProp(node, key);
      if (prop !== undefined) return prop;
    }
    return fallback;
  }

  private valueToString(value: HoloValue | undefined, fallback: string): string {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return fallback;
  }

  private valueToNumber(value: HoloValue | undefined, fallback: number): number {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return fallback;
  }

  private valueToVector(value: HoloValue | undefined, fallback: Vector3Literal): Vector3Literal {
    if (Array.isArray(value)) {
      return {
        x: this.valueToNumber(value[0], fallback.x),
        y: this.valueToNumber(value[1], fallback.y),
        z: this.valueToNumber(value[2], fallback.z),
      };
    }
    if (value && typeof value === 'object' && !Array.isArray(value) && !('__bind' in value)) {
      return {
        x: this.valueToNumber(value['x'], fallback.x),
        y: this.valueToNumber(value['y'], fallback.y),
        z: this.valueToNumber(value['z'], fallback.z),
      };
    }
    return fallback;
  }

  private objectPosition(node: HoloObjectDecl): Vector3Literal {
    return this.valueToVector(this.findObjProp(node, 'position'), { x: 0, y: 0, z: 0 });
  }

  private objectScale(node: HoloObjectDecl): Vector3Literal {
    return this.valueToVector(this.findObjProp(node, 'scale'), { x: 1, y: 1, z: 1 });
  }

  private emitVectorLiteral(vector: Vector3Literal): string {
    return `{ x: ${vector.x}, y: ${vector.y}, z: ${vector.z} }`;
  }

  private emitVectorSet(vector: Vector3Literal): string {
    return `${vector.x}, ${vector.y}, ${vector.z}`;
  }

  private jsString(value: string): string {
    return `'${this.escapeStringValue(value, 'TypeScript')}'`;
  }

  private jsIdentifier(value: string): string {
    const safe = value.replace(/[^A-Za-z0-9_$]/g, '_').replace(/^[^A-Za-z_$]+/, '');
    return safe || 'node';
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

  private generateSceneNodes(arNodes: HoloObjectDecl[]) {
    if (arNodes.length === 0) return;

    this.generatedCode.push(`\n// Scene nodes emitted from AR trait inputs`);
    for (const node of arNodes) {
      const objectName = node.name;
      const nodeVar = `arNode_${this.jsIdentifier(objectName)}`;
      const position = this.objectPosition(node);
      const scale = this.objectScale(node);
      const color = this.valueToString(this.findObjProp(node, 'color'), '#00d6ff');
      this.generatedCode.push(`const ${nodeVar} = new THREE.Group();`);
      this.generatedCode.push(`${nodeVar}.name = ${this.jsString(objectName)};`);
      this.generatedCode.push(`${nodeVar}.position.set(${this.emitVectorSet(position)});`);
      this.generatedCode.push(`${nodeVar}.scale.set(${this.emitVectorSet(scale)});`);
      this.generatedCode.push(
        `const ${nodeVar}Mesh = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.16), new THREE.MeshBasicMaterial({ color: ${this.jsString(color)}, wireframe: true }));`
      );
      this.generatedCode.push(`${nodeVar}.add(${nodeVar}Mesh);`);
      this.generatedCode.push(`scene.add(${nodeVar});`);
    }
  }

  private generateARHooks(nodes: {
    beaconNodes: HoloObjectDecl[];
    overlayNodes: HoloObjectDecl[];
    geoAnchorNodes: HoloObjectDecl[];
    qrScanNodes: HoloObjectDecl[];
    portalNodes: HoloObjectDecl[];
    cameraOverlayNodes: HoloObjectDecl[];
    paywallNodes: HoloObjectDecl[];
  }) {
    this.generatedCode.push(`\n// Engine Initialization via AR Traits`);

    if (this.options.target === 'webxr') {
      this.generatedCode.push(`const arRuntime = new ARRuntime({`);
      this.generatedCode.push(`  scene_id: 'auto_gen_ar_${this.sceneCounter++}',`);
      this.generatedCode.push(`  features: {`);
      this.generatedCode.push(`    hit_test: ${this.options.features.hit_test},`);
      this.generatedCode.push(`    image_tracking: ${this.options.features.image_tracking}`);
      this.generatedCode.push(`  }`);
      this.generatedCode.push(`});`);

      this.generateBeaconHooks(nodes.beaconNodes);
      this.generateOverlayHooks(nodes.overlayNodes);
      this.generateGeoAnchorHooks(nodes.geoAnchorNodes);
      this.generateQrScanHooks(nodes.qrScanNodes);
      this.generatePortalHooks(nodes.portalNodes);
      this.generateCameraOverlayHooks(nodes.cameraOverlayNodes);
      this.generateX402PaywallHooks(nodes.paywallNodes);
    }
  }

  private generateBeaconHooks(nodes: HoloObjectDecl[]) {
    if (nodes.length === 0) return;

    this.generatedCode.push(`\n// Bind @ar_beacon detections`);
    for (const node of nodes) {
      const objectName = node.name;
      const beaconId = this.valueToString(
        this.getTraitValue(node, 'ar_beacon', ['id', 'marker_id', 'marker'], objectName),
        objectName
      );
      const beaconType = this.valueToString(
        this.getTraitValue(node, 'ar_beacon', ['type', 'kind'], 'image'),
        'image'
      );
      const position = this.valueToVector(
        this.getTraitValue(
          node,
          'ar_beacon',
          ['position', 'coords'],
          this.findObjProp(node, 'position')
        ),
        this.objectPosition(node)
      );
      const beaconVar = `arBeacon_${this.jsIdentifier(objectName)}`;

      this.generatedCode.push(`const ${beaconVar} = {`);
      this.generatedCode.push(`  id: ${this.jsString(beaconId)},`);
      this.generatedCode.push(`  type: ${this.jsString(beaconType)},`);
      this.generatedCode.push(`  objectName: ${this.jsString(objectName)},`);
      this.generatedCode.push(`  position: ${this.emitVectorLiteral(position)}`);
      this.generatedCode.push(`};`);
      this.generatedCode.push(`arRuntime.registerBeacon?.(${beaconVar});`);
      this.generatedCode.push(`arRuntime.onBeaconDetected(${this.jsString(beaconId)}, (pose) => {`);
      this.generatedCode.push(
        `  const anchoredNode = scene.getObjectByName(${this.jsString(objectName)});`
      );
      this.generatedCode.push(`  if (anchoredNode) anchoredNode.visible = true;`);
      this.generatedCode.push(
        `  console.log('Beacon ${this.escapeStringValue(beaconId, 'TypeScript')} detected for ${this.escapeStringValue(objectName, 'TypeScript')}', pose);`
      );
      this.generatedCode.push(`});`);
    }
  }

  private generateOverlayHooks(nodes: HoloObjectDecl[]) {
    if (nodes.length === 0) return;

    this.generatedCode.push(`\n// DOM overlays from @overlay traits`);
    this.generatedCode.push(`const arOverlayRoot = document.createElement('div');`);
    this.generatedCode.push(`arOverlayRoot.id = 'holoscript-ar-overlay';`);
    this.generatedCode.push(`arOverlayRoot.style.position = 'fixed';`);
    this.generatedCode.push(`arOverlayRoot.style.inset = '0';`);
    this.generatedCode.push(`arOverlayRoot.style.pointerEvents = 'none';`);
    this.generatedCode.push(`document.body.appendChild(arOverlayRoot);`);

    for (const node of nodes) {
      const objectName = node.name;
      const overlayId = this.valueToString(
        this.getTraitValue(node, 'overlay', ['id'], `${objectName}_overlay`),
        `${objectName}_overlay`
      );
      const text = this.valueToString(
        this.getTraitValue(node, 'overlay', ['text', 'content', 'label'], 'AR overlay'),
        'AR overlay'
      );
      const overlayVar = `arOverlay_${this.jsIdentifier(objectName)}`;
      this.generatedCode.push(`const ${overlayVar} = document.createElement('div');`);
      this.generatedCode.push(`${overlayVar}.id = ${this.jsString(overlayId)};`);
      this.generatedCode.push(
        `${overlayVar}.dataset.holoscriptObject = ${this.jsString(objectName)};`
      );
      this.generatedCode.push(`${overlayVar}.textContent = ${this.jsString(text)};`);
      this.generatedCode.push(`${overlayVar}.style.pointerEvents = 'auto';`);
      this.generatedCode.push(`arOverlayRoot.appendChild(${overlayVar});`);
      this.generatedCode.push(
        `arRuntime.registerOverlay?.({ id: ${this.jsString(overlayId)}, objectName: ${this.jsString(objectName)}, element: ${overlayVar} });`
      );
    }
  }

  private generateGeoAnchorHooks(nodes: HoloObjectDecl[]) {
    if (nodes.length === 0) return;

    this.generatedCode.push(`\n// Geospatial anchors from @geo_anchor traits`);
    for (const node of nodes) {
      const objectName = node.name;
      const anchorId = this.valueToString(
        this.getTraitValue(node, 'geo_anchor', ['id', 'anchor_id'], objectName),
        objectName
      );
      const latitude = this.valueToNumber(
        this.getTraitValue(node, 'geo_anchor', ['latitude', 'lat'], 0),
        0
      );
      const longitude = this.valueToNumber(
        this.getTraitValue(node, 'geo_anchor', ['longitude', 'lng', 'lon'], 0),
        0
      );
      const altitude = this.valueToNumber(
        this.getTraitValue(node, 'geo_anchor', ['altitude', 'alt'], 0),
        0
      );
      const geoVar = `geoAnchor_${this.jsIdentifier(objectName)}`;
      this.generatedCode.push(`const ${geoVar} = {`);
      this.generatedCode.push(`  id: ${this.jsString(anchorId)},`);
      this.generatedCode.push(`  objectName: ${this.jsString(objectName)},`);
      this.generatedCode.push(`  latitude: ${latitude},`);
      this.generatedCode.push(`  longitude: ${longitude},`);
      this.generatedCode.push(`  altitude: ${altitude}`);
      this.generatedCode.push(`};`);
      this.generatedCode.push(`arRuntime.registerGeoAnchor?.(${geoVar});`);
    }
  }

  private generateQrScanHooks(nodes: HoloObjectDecl[]) {
    if (nodes.length === 0) return;

    this.generatedCode.push(`\n// QR/image scanner bindings from @qr_scan traits`);
    for (const node of nodes) {
      const objectName = node.name;
      const qrId = this.valueToString(
        this.getTraitValue(node, 'qr_scan', ['id', 'code_id', 'marker'], objectName),
        objectName
      );
      const payload = this.valueToString(
        this.getTraitValue(node, 'qr_scan', ['payload', 'value', 'pattern'], ''),
        ''
      );
      const qrVar = `qrScan_${this.jsIdentifier(objectName)}`;
      this.generatedCode.push(`const ${qrVar} = {`);
      this.generatedCode.push(`  id: ${this.jsString(qrId)},`);
      this.generatedCode.push(`  objectName: ${this.jsString(objectName)},`);
      this.generatedCode.push(`  payload: ${this.jsString(payload)}`);
      this.generatedCode.push(`};`);
      this.generatedCode.push(`arRuntime.registerQrScanner?.(${qrVar});`);
      this.generatedCode.push(
        `arRuntime.onQRCodeDetected?.(${this.jsString(qrId)}, (payload) => {`
      );
      this.generatedCode.push(
        `  console.log('QR ${this.escapeStringValue(qrId, 'TypeScript')} detected for ${this.escapeStringValue(objectName, 'TypeScript')}', payload);`
      );
      this.generatedCode.push(`});`);
    }
  }

  private generatePortalHooks(nodes: HoloObjectDecl[]) {
    if (nodes.length === 0) return;

    this.generatedCode.push(`\n// AR portals from @ar_portal traits`);
    for (const node of nodes) {
      const objectName = node.name;
      const portalId = this.valueToString(
        this.getTraitValue(node, 'ar_portal', ['id', 'portal_id'], objectName),
        objectName
      );
      const destination = this.valueToString(
        this.getTraitValue(node, 'ar_portal', ['destination', 'target', 'scene'], ''),
        ''
      );
      const portalVar = `arPortal_${this.jsIdentifier(objectName)}`;
      this.generatedCode.push(`const ${portalVar} = {`);
      this.generatedCode.push(`  id: ${this.jsString(portalId)},`);
      this.generatedCode.push(`  objectName: ${this.jsString(objectName)},`);
      this.generatedCode.push(`  destination: ${this.jsString(destination)},`);
      this.generatedCode.push(`  position: ${this.emitVectorLiteral(this.objectPosition(node))}`);
      this.generatedCode.push(`};`);
      this.generatedCode.push(`arRuntime.registerPortal?.(${portalVar});`);
    }
  }

  private generateCameraOverlayHooks(nodes: HoloObjectDecl[]) {
    if (nodes.length === 0) return;

    this.generatedCode.push(`\n// Camera overlays from @camera_overlay traits`);
    for (const node of nodes) {
      const objectName = node.name;
      const overlayId = this.valueToString(
        this.getTraitValue(node, 'camera_overlay', ['id'], objectName),
        objectName
      );
      const text = this.valueToString(
        this.getTraitValue(node, 'camera_overlay', ['text', 'label', 'content'], ''),
        ''
      );
      const cameraOverlayVar = `cameraOverlay_${this.jsIdentifier(objectName)}`;
      this.generatedCode.push(`const ${cameraOverlayVar} = {`);
      this.generatedCode.push(`  id: ${this.jsString(overlayId)},`);
      this.generatedCode.push(`  objectName: ${this.jsString(objectName)},`);
      this.generatedCode.push(`  text: ${this.jsString(text)},`);
      this.generatedCode.push(`  position: ${this.emitVectorLiteral(this.objectPosition(node))}`);
      this.generatedCode.push(`};`);
      this.generatedCode.push(`arRuntime.registerCameraOverlay?.(${cameraOverlayVar});`);
    }
  }

  private generateX402PaywallHooks(nodes: HoloObjectDecl[]) {
    if (nodes.length === 0) return;

    this.generatedCode.push(`\n// x402 payment gates from @x402_paywall traits`);
    for (const node of nodes) {
      const objectName = node.name;
      const paywallId = this.valueToString(
        this.getTraitValue(node, 'x402_paywall', ['id'], objectName),
        objectName
      );
      const price = this.valueToNumber(
        this.getTraitValue(node, 'x402_paywall', ['price', 'amount'], 0),
        0
      );
      const asset = this.valueToString(
        this.getTraitValue(node, 'x402_paywall', ['asset', 'currency'], 'USDC'),
        'USDC'
      );
      const network = this.valueToString(
        this.getTraitValue(node, 'x402_paywall', ['network', 'chain'], 'base'),
        'base'
      );
      const paywallVar = `x402Paywall_${this.jsIdentifier(objectName)}`;
      this.generatedCode.push(`const ${paywallVar} = {`);
      this.generatedCode.push(`  id: ${this.jsString(paywallId)},`);
      this.generatedCode.push(`  objectName: ${this.jsString(objectName)},`);
      this.generatedCode.push(`  protocol: 'x402',`);
      this.generatedCode.push(`  price: ${price},`);
      this.generatedCode.push(`  asset: ${this.jsString(asset)},`);
      this.generatedCode.push(`  network: ${this.jsString(network)}`);
      this.generatedCode.push(`};`);
      this.generatedCode.push(`arRuntime.requirePayment?.(${paywallVar});`);
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
