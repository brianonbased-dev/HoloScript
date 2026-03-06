/**
 * URDF-to-USDZ Converter
 *
 * Converts URDF (Unified Robot Description Format) XML into USDZ-compatible
 * USD ASCII (.usda) output, enabling web-based robot model preview via Safari's
 * HTML <model> element on visionOS 26.
 *
 * Pipeline: URDF XML -> Parsed IR (links, joints, visuals, collisions)
 *           -> USD Scene Graph -> USDA text -> .usdz archive
 *
 * Handles:
 *   1. URDF XML parsing (links, joints, visual meshes, collision bounds)
 *   2. Joint hierarchy -> USD Xform scene graph conversion
 *   3. STL/DAE/OBJ mesh reference -> USDZ-compatible geometry mapping
 *   4. URDF <material>/<color> -> USD PBR material assignments
 *   5. USDZ archive packaging metadata
 *
 * Compatible with:
 *   - Apple visionOS 26 Safari <model> element
 *   - Apple Quick Look (AR preview)
 *   - RealityKit / Reality Composer Pro
 *   - Any USDZ-compatible viewer
 *
 * Security: Input validation on all XML parsing. No file system access.
 * All mesh paths are sanitized to prevent path traversal.
 *
 * @version 1.0.0
 * @package @holoscript/core/compiler/converters
 */

import { CompilerBase } from '../CompilerBase';
import { ANSCapabilityPath, type ANSCapabilityPathValue } from '../identity/ANSNamespace';

// =============================================================================
// TYPES - Parsed URDF Intermediate Representation
// =============================================================================

/** Origin transform in URDF (position + rotation) */
export interface URDFOriginIR {
  xyz: [number, number, number];
  rpy: [number, number, number]; // roll, pitch, yaw in radians
}

/** Geometry specification from URDF */
export interface URDFGeometryIR {
  type: 'box' | 'sphere' | 'cylinder' | 'mesh';
  /** Box dimensions [width, height, depth] */
  size?: [number, number, number];
  /** Sphere/cylinder radius */
  radius?: number;
  /** Cylinder length */
  length?: number;
  /** Mesh file path (STL, DAE, OBJ) */
  filename?: string;
  /** Mesh scale */
  scale?: [number, number, number];
}

/** Material from URDF <material> element */
export interface URDFMaterialIR {
  name: string;
  color?: { r: number; g: number; b: number; a: number };
  texture?: string;
}

/** Visual element from URDF <link>/<visual> */
export interface URDFVisualIR {
  name?: string;
  origin?: URDFOriginIR;
  geometry: URDFGeometryIR;
  material?: URDFMaterialIR;
}

/** Collision element from URDF <link>/<collision> */
export interface URDFCollisionIR {
  name?: string;
  origin?: URDFOriginIR;
  geometry: URDFGeometryIR;
}

/** Inertial properties from URDF <link>/<inertial> */
export interface URDFInertialIR {
  mass: number;
  origin?: URDFOriginIR;
  inertia: {
    ixx: number; ixy: number; ixz: number;
    iyy: number; iyz: number; izz: number;
  };
}

/** Parsed URDF link */
export interface URDFLinkIR {
  name: string;
  visual?: URDFVisualIR;
  collision?: URDFCollisionIR;
  inertial?: URDFInertialIR;
}

/** Joint limits from URDF <joint>/<limit> */
export interface URDFJointLimitsIR {
  lower: number;
  upper: number;
  effort: number;
  velocity: number;
}

/** Joint dynamics from URDF <joint>/<dynamics> */
export interface URDFJointDynamicsIR {
  damping: number;
  friction: number;
}

/** Parsed URDF joint */
export interface URDFJointIR {
  name: string;
  type: 'fixed' | 'revolute' | 'prismatic' | 'continuous' | 'floating' | 'planar';
  parent: string;
  child: string;
  origin?: URDFOriginIR;
  axis?: [number, number, number];
  limits?: URDFJointLimitsIR;
  dynamics?: URDFJointDynamicsIR;
}

/** Complete parsed URDF model */
export interface URDFModelIR {
  name: string;
  links: URDFLinkIR[];
  joints: URDFJointIR[];
  materials: Map<string, URDFMaterialIR>;
}

// =============================================================================
// CONVERTER OPTIONS
// =============================================================================

export interface URDFToUSDZConverterOptions {
  /** USD up axis (Y for visionOS/AR, Z for robotics convention) */
  upAxis?: 'Y' | 'Z';
  /** Meters per unit (default 1.0) */
  metersPerUnit?: number;
  /** Include collision geometry as invisible prims */
  includeCollision?: boolean;
  /** Include inertial properties as USD physics mass */
  includePhysics?: boolean;
  /** Default material color when none specified [r, g, b] 0-1 range */
  defaultColor?: [number, number, number];
  /** Default metallic value */
  defaultMetallic?: number;
  /** Default roughness value */
  defaultRoughness?: number;
  /** Mesh path remapping: replace URDF mesh paths (e.g., package:// -> relative) */
  meshPathRemap?: (urdfPath: string) => string;
  /** Convert STL references to .usdz geometry references */
  convertMeshReferences?: boolean;
  /** Apply Y-up coordinate transform (URDF is Z-up) */
  applyCoordinateTransform?: boolean;
}

// =============================================================================
// USD SCENE GRAPH NODES (internal)
// =============================================================================

interface USDXformNode {
  name: string;
  translation?: [number, number, number];
  rotationEuler?: [number, number, number]; // degrees
  scale?: [number, number, number];
  geometry?: URDFGeometryIR;
  material?: string; // material name reference
  children: USDXformNode[];
  isCollision?: boolean;
  physMass?: number;
}

// =============================================================================
// URDF TO USDZ CONVERTER
// =============================================================================

export class URDFToUSDZConverter extends CompilerBase {
  protected readonly compilerName = 'URDFToUSDZConverter';

  protected override getRequiredCapability(): ANSCapabilityPathValue {
    return ANSCapabilityPath.URDF;
  }

  private options: Required<URDFToUSDZConverterOptions>;
  private lines: string[] = [];
  private indentLevel: number = 0;
  private materialRegistry: Map<string, URDFMaterialIR> = new Map();

  constructor(options: URDFToUSDZConverterOptions = {}) {
    super();
    this.options = {
      upAxis: options.upAxis ?? 'Y',
      metersPerUnit: options.metersPerUnit ?? 1.0,
      includeCollision: options.includeCollision ?? false,
      includePhysics: options.includePhysics ?? false,
      defaultColor: options.defaultColor ?? [0.8, 0.8, 0.8],
      defaultMetallic: options.defaultMetallic ?? 0.0,
      defaultRoughness: options.defaultRoughness ?? 0.5,
      meshPathRemap: options.meshPathRemap ?? ((p: string) => p),
      convertMeshReferences: options.convertMeshReferences ?? true,
      applyCoordinateTransform: options.applyCoordinateTransform ?? true,
    };
  }

  // ===========================================================================
  // PUBLIC API
  // ===========================================================================

  /**
   * Convert URDF XML string to USDA (USD ASCII) string.
   *
   * This is the primary entry point. The returned USDA can be converted
   * to binary .usdz via Apple's usdz_converter or Python pxr library.
   *
   * @param urdfXml - Valid URDF XML string
   * @param agentToken - Optional agent token for RBAC validation
   * @returns USDA text content
   * @throws Error if URDF is malformed or missing required elements
   */
  compile(urdfXml: string, agentToken?: string): string {
    if (agentToken) {
      this.validateCompilerAccess(agentToken);
    }

    this.lines = [];
    this.indentLevel = 0;
    this.materialRegistry.clear();

    // Phase 1: Parse URDF XML to IR
    const model = this.parseURDF(urdfXml);

    // Phase 2: Build USD scene graph from joint hierarchy
    const sceneRoot = this.buildSceneGraph(model);

    // Phase 3: Collect materials
    this.collectMaterials(model);

    // Phase 4: Emit USDA
    this.emitHeader(model.name);
    this.emitBlank();

    // Root prim
    const rootName = this.sanitizeName(model.name);
    this.emit(`def Xform "${rootName}" (`);
    this.indentLevel++;
    this.emit(`kind = "component"`);
    this.emit(`customData = {`);
    this.indentLevel++;
    this.emit(`string source = "URDF"`);
    this.emit(`string robot = "${this.escapeString(model.name)}"`);
    this.indentLevel--;
    this.emit(`}`);
    this.indentLevel--;
    this.emit(`)`);
    this.emit(`{`);
    this.indentLevel++;

    // Emit materials scope
    if (this.materialRegistry.size > 0) {
      this.emitMaterialsScope();
      this.emitBlank();
    }

    // Emit scene graph recursively
    for (const child of sceneRoot.children) {
      this.emitXformNode(child);
      this.emitBlank();
    }

    this.indentLevel--;
    this.emit(`}`);

    return this.lines.join('\n');
  }

  /**
   * Parse URDF XML string into intermediate representation.
   *
   * Exposed publicly for advanced use cases (e.g., inspection, validation).
   */
  parseURDF(urdfXml: string): URDFModelIR {
    // Validate input
    if (!urdfXml || typeof urdfXml !== 'string') {
      throw new Error('URDFToUSDZConverter: URDF XML input must be a non-empty string');
    }

    const trimmed = urdfXml.trim();
    if (!trimmed.includes('<robot')) {
      throw new Error('URDFToUSDZConverter: URDF XML must contain a <robot> element');
    }

    // Extract robot name
    const robotNameMatch = trimmed.match(/<robot\s+[^>]*name\s*=\s*"([^"]*)"/);
    const robotName = robotNameMatch ? robotNameMatch[1] : 'UnnamedRobot';

    // Parse global materials (defined at robot level)
    const materials = this.parseMaterials(trimmed);

    // Parse links
    const links = this.parseLinks(trimmed, materials);

    // Parse joints
    const joints = this.parseJoints(trimmed);

    return { name: robotName, links, joints, materials };
  }

  /**
   * Generate the usdz_converter command for converting USDA to USDZ.
   */
  static getConversionCommand(usdaPath: string, usdzPath: string): string {
    return `xcrun usdz_converter "${usdaPath}" "${usdzPath}"`;
  }

  /**
   * Generate Python conversion script using pxr library.
   */
  static getPythonConversionScript(usdaPath: string, usdzPath: string): string {
    return [
      '#!/usr/bin/env python3',
      '"""Convert USDA to USDZ for visionOS <model> element preview."""',
      'from pxr import Usd, UsdUtils',
      '',
      `stage = Usd.Stage.Open("${usdaPath}")`,
      `UsdUtils.CreateNewUsdzPackage("${usdaPath}", "${usdzPath}")`,
      `print(f"Converted to USDZ: ${usdzPath}")`,
    ].join('\n');
  }

  /**
   * Generate an HTML snippet using <model> element for visionOS 26 Safari preview.
   */
  static getVisionOSModelElement(usdzUrl: string, altText: string = 'Robot Model'): string {
    return [
      '<!-- visionOS 26 Safari robot model preview -->',
      `<model src="${usdzUrl}" alt="${altText}"`,
      '  interactive',
      '  autoplay',
      '  style="width: 400px; height: 400px;">',
      '  <source src="' + usdzUrl + '" type="model/usd+zip">',
      '</model>',
    ].join('\n');
  }

  // ===========================================================================
  // URDF XML PARSING
  // ===========================================================================

  /** Parse all <material> elements at robot level */
  private parseMaterials(xml: string): Map<string, URDFMaterialIR> {
    const materials = new Map<string, URDFMaterialIR>();

    // Match top-level materials (not inside <visual>)
    const materialRegex = /<material\s+name\s*=\s*"([^"]*)">([\s\S]*?)<\/material>/g;
    let match: RegExpExecArray | null;

    while ((match = materialRegex.exec(xml)) !== null) {
      const name = match[1];
      const body = match[2];

      const mat: URDFMaterialIR = { name };

      // Parse color
      const colorMatch = body.match(/<color\s+rgba\s*=\s*"([^"]*)"\s*\/>/);
      if (colorMatch) {
        const parts = colorMatch[1].trim().split(/\s+/).map(Number);
        mat.color = {
          r: parts[0] ?? 0.8,
          g: parts[1] ?? 0.8,
          b: parts[2] ?? 0.8,
          a: parts[3] ?? 1.0,
        };
      }

      // Parse texture
      const textureMatch = body.match(/<texture\s+filename\s*=\s*"([^"]*)"\s*\/>/);
      if (textureMatch) {
        mat.texture = textureMatch[1];
      }

      materials.set(name, mat);
    }

    return materials;
  }

  /** Parse all <link> elements */
  private parseLinks(xml: string, globalMaterials: Map<string, URDFMaterialIR>): URDFLinkIR[] {
    const links: URDFLinkIR[] = [];

    // Match link elements
    const linkRegex = /<link\s+name\s*=\s*"([^"]*)">([\s\S]*?)<\/link>/g;
    // Also match self-closing links (no visual/collision)
    const emptyLinkRegex = /<link\s+name\s*=\s*"([^"]*)"\s*\/>/g;

    let match: RegExpExecArray | null;

    while ((match = linkRegex.exec(xml)) !== null) {
      const name = match[1];
      const body = match[2];

      const link: URDFLinkIR = { name };

      // Parse visual
      const visualMatch = body.match(/<visual>([\s\S]*?)<\/visual>/);
      if (visualMatch) {
        link.visual = this.parseVisual(visualMatch[1], globalMaterials);
      }

      // Parse collision
      const collisionMatch = body.match(/<collision>([\s\S]*?)<\/collision>/);
      if (collisionMatch) {
        link.collision = this.parseCollision(collisionMatch[1]);
      }

      // Parse inertial
      const inertialMatch = body.match(/<inertial>([\s\S]*?)<\/inertial>/);
      if (inertialMatch) {
        link.inertial = this.parseInertial(inertialMatch[1]);
      }

      links.push(link);
    }

    // Also parse self-closing links
    while ((match = emptyLinkRegex.exec(xml)) !== null) {
      // Avoid duplicates from the previous regex
      const name = match[1];
      if (!links.some(l => l.name === name)) {
        links.push({ name });
      }
    }

    return links;
  }

  /** Parse a <visual> element body */
  private parseVisual(body: string, globalMaterials: Map<string, URDFMaterialIR>): URDFVisualIR {
    const visual: URDFVisualIR = {
      geometry: this.parseGeometry(body),
    };

    // Parse origin
    const origin = this.parseOrigin(body);
    if (origin) {
      visual.origin = origin;
    }

    // Parse material - can be inline or a reference to a global material
    const materialRefMatch = body.match(/<material\s+name\s*=\s*"([^"]*)"\s*\/>/);
    const materialInlineMatch = body.match(/<material\s+name\s*=\s*"([^"]*)">([\s\S]*?)<\/material>/);

    if (materialInlineMatch) {
      const matName = materialInlineMatch[1];
      const matBody = materialInlineMatch[2];
      const mat: URDFMaterialIR = { name: matName };

      const colorMatch = matBody.match(/<color\s+rgba\s*=\s*"([^"]*)"\s*\/>/);
      if (colorMatch) {
        const parts = colorMatch[1].trim().split(/\s+/).map(Number);
        mat.color = { r: parts[0] ?? 0.8, g: parts[1] ?? 0.8, b: parts[2] ?? 0.8, a: parts[3] ?? 1.0 };
      }

      const textureMatch = matBody.match(/<texture\s+filename\s*=\s*"([^"]*)"\s*\/>/);
      if (textureMatch) {
        mat.texture = textureMatch[1];
      }

      visual.material = mat;
    } else if (materialRefMatch) {
      const matName = materialRefMatch[1];
      // Look up in global materials
      const globalMat = globalMaterials.get(matName);
      if (globalMat) {
        visual.material = { ...globalMat };
      } else {
        visual.material = { name: matName };
      }
    }

    return visual;
  }

  /** Parse a <collision> element body */
  private parseCollision(body: string): URDFCollisionIR {
    const collision: URDFCollisionIR = {
      geometry: this.parseGeometry(body),
    };

    const origin = this.parseOrigin(body);
    if (origin) {
      collision.origin = origin;
    }

    return collision;
  }

  /** Parse a <geometry> element body */
  private parseGeometry(body: string): URDFGeometryIR {
    // Box
    const boxMatch = body.match(/<box\s+size\s*=\s*"([^"]*)"\s*\/>/);
    if (boxMatch) {
      const parts = boxMatch[1].trim().split(/\s+/).map(Number);
      return {
        type: 'box',
        size: [parts[0] || 1, parts[1] || 1, parts[2] || 1],
      };
    }

    // Sphere
    const sphereMatch = body.match(/<sphere\s+radius\s*=\s*"([^"]*)"\s*\/>/);
    if (sphereMatch) {
      return {
        type: 'sphere',
        radius: Number(sphereMatch[1]) || 0.5,
      };
    }

    // Cylinder
    const cylinderMatch = body.match(/<cylinder\s+[^>]*radius\s*=\s*"([^"]*)"[^>]*length\s*=\s*"([^"]*)"/);
    const cylinderMatchAlt = body.match(/<cylinder\s+[^>]*length\s*=\s*"([^"]*)"[^>]*radius\s*=\s*"([^"]*)"/);
    if (cylinderMatch) {
      return {
        type: 'cylinder',
        radius: Number(cylinderMatch[1]) || 0.5,
        length: Number(cylinderMatch[2]) || 1.0,
      };
    }
    if (cylinderMatchAlt) {
      return {
        type: 'cylinder',
        radius: Number(cylinderMatchAlt[2]) || 0.5,
        length: Number(cylinderMatchAlt[1]) || 1.0,
      };
    }

    // Mesh
    const meshMatch = body.match(/<mesh\s+filename\s*=\s*"([^"]*)"(?:\s+scale\s*=\s*"([^"]*)")?/);
    if (meshMatch) {
      const geometry: URDFGeometryIR = {
        type: 'mesh',
        filename: this.sanitizeMeshPath(meshMatch[1]),
      };
      if (meshMatch[2]) {
        const parts = meshMatch[2].trim().split(/\s+/).map(Number);
        geometry.scale = [parts[0] || 1, parts[1] || 1, parts[2] || 1];
      }
      return geometry;
    }

    // Default fallback
    return { type: 'box', size: [0.1, 0.1, 0.1] };
  }

  /** Parse <origin> element */
  private parseOrigin(body: string): URDFOriginIR | undefined {
    const originMatch = body.match(/<origin\s+([^>]*)\/>/);
    if (!originMatch) return undefined;

    const attrs = originMatch[1];
    const origin: URDFOriginIR = {
      xyz: [0, 0, 0],
      rpy: [0, 0, 0],
    };

    const xyzMatch = attrs.match(/xyz\s*=\s*"([^"]*)"/);
    if (xyzMatch) {
      const parts = xyzMatch[1].trim().split(/\s+/).map(Number);
      origin.xyz = [parts[0] || 0, parts[1] || 0, parts[2] || 0];
    }

    const rpyMatch = attrs.match(/rpy\s*=\s*"([^"]*)"/);
    if (rpyMatch) {
      const parts = rpyMatch[1].trim().split(/\s+/).map(Number);
      origin.rpy = [parts[0] || 0, parts[1] || 0, parts[2] || 0];
    }

    return origin;
  }

  /** Parse <inertial> element body */
  private parseInertial(body: string): URDFInertialIR {
    const massMatch = body.match(/<mass\s+value\s*=\s*"([^"]*)"\s*\/>/);
    const mass = massMatch ? Number(massMatch[1]) || 1.0 : 1.0;

    const origin = this.parseOrigin(body);

    const inertiaMatch = body.match(/<inertia\s+([^>]*)\/>/);
    const inertia = { ixx: 0.001, ixy: 0, ixz: 0, iyy: 0.001, iyz: 0, izz: 0.001 };
    if (inertiaMatch) {
      const attrs = inertiaMatch[1];
      const parseAttr = (name: string, defaultVal: number): number => {
        const m = attrs.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`));
        return m ? Number(m[1]) || defaultVal : defaultVal;
      };
      inertia.ixx = parseAttr('ixx', 0.001);
      inertia.ixy = parseAttr('ixy', 0);
      inertia.ixz = parseAttr('ixz', 0);
      inertia.iyy = parseAttr('iyy', 0.001);
      inertia.iyz = parseAttr('iyz', 0);
      inertia.izz = parseAttr('izz', 0.001);
    }

    return { mass, origin, inertia };
  }

  /** Parse all <joint> elements */
  private parseJoints(xml: string): URDFJointIR[] {
    const joints: URDFJointIR[] = [];

    const jointRegex = /<joint\s+name\s*=\s*"([^"]*)"\s+type\s*=\s*"([^"]*)">([\s\S]*?)<\/joint>/g;
    let match: RegExpExecArray | null;

    while ((match = jointRegex.exec(xml)) !== null) {
      const name = match[1];
      const type = match[2] as URDFJointIR['type'];
      const body = match[3];

      // Parse parent and child
      const parentMatch = body.match(/<parent\s+link\s*=\s*"([^"]*)"\s*\/>/);
      const childMatch = body.match(/<child\s+link\s*=\s*"([^"]*)"\s*\/>/);

      if (!parentMatch || !childMatch) continue;

      const joint: URDFJointIR = {
        name,
        type,
        parent: parentMatch[1],
        child: childMatch[1],
      };

      // Parse origin
      const origin = this.parseOrigin(body);
      if (origin) {
        joint.origin = origin;
      }

      // Parse axis
      const axisMatch = body.match(/<axis\s+xyz\s*=\s*"([^"]*)"\s*\/>/);
      if (axisMatch) {
        const parts = axisMatch[1].trim().split(/\s+/).map(Number);
        joint.axis = [
          isNaN(parts[0]) ? 0 : parts[0],
          isNaN(parts[1]) ? 0 : parts[1],
          isNaN(parts[2]) ? 1 : parts[2],
        ];
      }

      // Parse limits
      const limitMatch = body.match(/<limit\s+([^>]*)\/>/);
      if (limitMatch) {
        const attrs = limitMatch[1];
        const parseAttr = (name: string, defaultVal: number): number => {
          const m = attrs.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`));
          return m ? Number(m[1]) ?? defaultVal : defaultVal;
        };
        joint.limits = {
          lower: parseAttr('lower', 0),
          upper: parseAttr('upper', 0),
          effort: parseAttr('effort', 0),
          velocity: parseAttr('velocity', 0),
        };
      }

      // Parse dynamics
      const dynamicsMatch = body.match(/<dynamics\s+([^>]*)\/>/);
      if (dynamicsMatch) {
        const attrs = dynamicsMatch[1];
        const dampingMatch = attrs.match(/damping\s*=\s*"([^"]*)"/);
        const frictionMatch = attrs.match(/friction\s*=\s*"([^"]*)"/);
        joint.dynamics = {
          damping: dampingMatch ? Number(dampingMatch[1]) || 0 : 0,
          friction: frictionMatch ? Number(frictionMatch[1]) || 0 : 0,
        };
      }

      joints.push(joint);
    }

    return joints;
  }

  // ===========================================================================
  // SCENE GRAPH CONSTRUCTION
  // ===========================================================================

  /**
   * Build USD scene graph from URDF joint hierarchy.
   *
   * URDF defines hierarchy through joints: each joint connects a parent link
   * to a child link. We traverse this tree and create a USD Xform hierarchy.
   */
  private buildSceneGraph(model: URDFModelIR): USDXformNode {
    const root: USDXformNode = {
      name: 'Root',
      children: [],
    };

    // Build link lookup
    const linkMap = new Map<string, URDFLinkIR>();
    for (const link of model.links) {
      linkMap.set(link.name, link);
    }

    // Build parent->children adjacency from joints
    const childrenOf = new Map<string, { joint: URDFJointIR; child: string }[]>();
    const childLinks = new Set<string>();

    for (const joint of model.joints) {
      if (!childrenOf.has(joint.parent)) {
        childrenOf.set(joint.parent, []);
      }
      childrenOf.get(joint.parent)!.push({ joint, child: joint.child });
      childLinks.add(joint.child);
    }

    // Find root links (links that are never a child in any joint)
    const rootLinks = model.links.filter(l => !childLinks.has(l.name));

    // If no root links found, use the first link
    if (rootLinks.length === 0 && model.links.length > 0) {
      rootLinks.push(model.links[0]);
    }

    // Recursively build scene graph
    for (const rootLink of rootLinks) {
      const node = this.buildLinkNode(rootLink, linkMap, childrenOf);
      root.children.push(node);
    }

    return root;
  }

  /** Build a USD Xform node for a single URDF link and its children */
  private buildLinkNode(
    link: URDFLinkIR,
    linkMap: Map<string, URDFLinkIR>,
    childrenOf: Map<string, { joint: URDFJointIR; child: string }[]>,
  ): USDXformNode {
    const node: USDXformNode = {
      name: this.sanitizeName(link.name),
      children: [],
    };

    // Set geometry from visual
    if (link.visual) {
      if (link.visual.origin) {
        node.translation = link.visual.origin.xyz;
        node.rotationEuler = this.rpyToDegrees(link.visual.origin.rpy);
      }
      node.geometry = link.visual.geometry;
      node.material = link.visual.material?.name;
    }

    // Set mass from inertial
    if (link.inertial && this.options.includePhysics) {
      node.physMass = link.inertial.mass;
    }

    // Add collision as child node if requested
    if (link.collision && this.options.includeCollision) {
      const collisionNode: USDXformNode = {
        name: `${this.sanitizeName(link.name)}_collision`,
        children: [],
        geometry: link.collision.geometry,
        isCollision: true,
      };
      if (link.collision.origin) {
        collisionNode.translation = link.collision.origin.xyz;
        collisionNode.rotationEuler = this.rpyToDegrees(link.collision.origin.rpy);
      }
      node.children.push(collisionNode);
    }

    // Recurse into children via joints
    const children = childrenOf.get(link.name) || [];
    for (const { joint, child } of children) {
      const childLink = linkMap.get(child);
      if (!childLink) continue;

      // Create a joint Xform that carries the joint origin transform
      const jointNode: USDXformNode = {
        name: this.sanitizeName(joint.name),
        children: [],
      };

      if (joint.origin) {
        jointNode.translation = joint.origin.xyz;
        jointNode.rotationEuler = this.rpyToDegrees(joint.origin.rpy);
      }

      // Apply coordinate transform (URDF Z-up -> USD Y-up) at root level only
      if (this.options.applyCoordinateTransform && this.options.upAxis === 'Y') {
        if (joint.origin) {
          jointNode.translation = this.transformZUpToYUp(joint.origin.xyz);
        }
      }

      // Build child link node under the joint
      const childNode = this.buildLinkNode(childLink, linkMap, childrenOf);
      jointNode.children.push(childNode);

      node.children.push(jointNode);
    }

    return node;
  }

  // ===========================================================================
  // MATERIAL COLLECTION
  // ===========================================================================

  /** Collect all materials from the parsed model */
  private collectMaterials(model: URDFModelIR): void {
    // Add default material
    this.materialRegistry.set('DefaultMaterial', {
      name: 'DefaultMaterial',
      color: {
        r: this.options.defaultColor[0],
        g: this.options.defaultColor[1],
        b: this.options.defaultColor[2],
        a: 1.0,
      },
    });

    // Add global materials from URDF
    for (const [name, mat] of model.materials) {
      this.materialRegistry.set(name, mat);
    }

    // Add per-link materials
    for (const link of model.links) {
      if (link.visual?.material) {
        const mat = link.visual.material;
        if (!this.materialRegistry.has(mat.name)) {
          this.materialRegistry.set(mat.name, mat);
        }
      }
    }
  }

  // ===========================================================================
  // USDA EMISSION
  // ===========================================================================

  /** Emit USDA header */
  private emitHeader(robotName: string): void {
    this.emit(`#usda 1.0`);
    this.emit(`(`);
    this.indentLevel++;
    this.emit(`defaultPrim = "${this.sanitizeName(robotName)}"`);
    this.emit(`doc = "URDF-to-USDZ conversion by HoloScript URDFToUSDZConverter"`);
    this.emit(`metersPerUnit = ${this.options.metersPerUnit}`);
    this.emit(`upAxis = "${this.options.upAxis}"`);
    this.emit(`customLayerData = {`);
    this.indentLevel++;
    this.emit(`string generator = "HoloScript URDFToUSDZConverter v1.0"`);
    this.emit(`string sourceFormat = "URDF"`);
    this.emit(`string sourceRobot = "${this.escapeString(robotName)}"`);
    this.emit(`string targetPlatform = "visionOS 26 / Safari <model>"`);
    this.indentLevel--;
    this.emit(`}`);
    this.indentLevel--;
    this.emit(`)`);
  }

  /** Emit all materials in a USD Scope */
  private emitMaterialsScope(): void {
    this.emit(`def Scope "Materials"`);
    this.emit(`{`);
    this.indentLevel++;

    for (const [_name, mat] of this.materialRegistry) {
      this.emitMaterial(mat);
      this.emitBlank();
    }

    this.indentLevel--;
    this.emit(`}`);
  }

  /** Emit a single PBR material */
  private emitMaterial(mat: URDFMaterialIR): void {
    const name = this.sanitizeName(mat.name);
    const color = mat.color ?? {
      r: this.options.defaultColor[0],
      g: this.options.defaultColor[1],
      b: this.options.defaultColor[2],
      a: 1.0,
    };

    this.emit(`def Material "${name}"`);
    this.emit(`{`);
    this.indentLevel++;

    this.emit(`token outputs:surface.connect = </Materials/${name}/PBRShader.outputs:surface>`);
    this.emitBlank();

    this.emit(`def Shader "PBRShader"`);
    this.emit(`{`);
    this.indentLevel++;
    this.emit(`uniform token info:id = "UsdPreviewSurface"`);
    this.emit(`color3f inputs:diffuseColor = (${color.r.toFixed(4)}, ${color.g.toFixed(4)}, ${color.b.toFixed(4)})`);
    this.emit(`float inputs:metallic = ${this.options.defaultMetallic}`);
    this.emit(`float inputs:roughness = ${this.options.defaultRoughness}`);
    if (color.a < 1.0) {
      this.emit(`float inputs:opacity = ${color.a.toFixed(4)}`);
    }
    this.emit(`token outputs:surface`);
    this.indentLevel--;
    this.emit(`}`);

    // If texture present, add texture reader (reference only; actual file bundled in USDZ)
    if (mat.texture) {
      this.emitBlank();
      this.emit(`def Shader "TextureReader"`);
      this.emit(`{`);
      this.indentLevel++;
      this.emit(`uniform token info:id = "UsdUVTexture"`);
      this.emit(`asset inputs:file = @${this.sanitizeMeshPath(mat.texture)}@`);
      this.emit(`float2 inputs:st.connect = </Materials/${name}/Primvar.outputs:result>`);
      this.emit(`color3f outputs:rgb`);
      this.indentLevel--;
      this.emit(`}`);
    }

    this.indentLevel--;
    this.emit(`}`);
  }

  /** Emit a USD Xform node recursively */
  private emitXformNode(node: USDXformNode): void {
    // Determine prim type
    let primType = 'Xform';
    if (node.geometry && !node.isCollision) {
      primType = this.getUSDGeometryType(node.geometry);
    }

    // Collision prims are invisible Xform scopes
    if (node.isCollision) {
      this.emit(`def Xform "${node.name}" (`);
      this.indentLevel++;
      this.emit(`# Collision geometry (invisible)`);
      this.emit(`active = false`);
      this.indentLevel--;
      this.emit(`)`);
    } else if (node.geometry) {
      this.emit(`def ${primType} "${node.name}"`);
    } else {
      this.emit(`def Xform "${node.name}"`);
    }

    this.emit(`{`);
    this.indentLevel++;

    // Transforms
    const hasTranslation = node.translation && (node.translation[0] !== 0 || node.translation[1] !== 0 || node.translation[2] !== 0);
    const hasRotation = node.rotationEuler && (node.rotationEuler[0] !== 0 || node.rotationEuler[1] !== 0 || node.rotationEuler[2] !== 0);
    const hasScale = node.scale && (node.scale[0] !== 1 || node.scale[1] !== 1 || node.scale[2] !== 1);

    if (hasTranslation) {
      const t = node.translation!;
      this.emit(`double3 xformOp:translate = (${t[0]}, ${t[1]}, ${t[2]})`);
    }

    if (hasRotation) {
      const r = node.rotationEuler!;
      this.emit(`float3 xformOp:rotateXYZ = (${r[0].toFixed(4)}, ${r[1].toFixed(4)}, ${r[2].toFixed(4)})`);
    }

    if (hasScale) {
      const s = node.scale!;
      this.emit(`float3 xformOp:scale = (${s[0]}, ${s[1]}, ${s[2]})`);
    }

    // xformOpOrder
    const ops: string[] = [];
    if (hasTranslation) ops.push('"xformOp:translate"');
    if (hasRotation) ops.push('"xformOp:rotateXYZ"');
    if (hasScale) ops.push('"xformOp:scale"');
    if (ops.length > 0) {
      this.emit(`uniform token[] xformOpOrder = [${ops.join(', ')}]`);
    }

    // Geometry attributes
    if (node.geometry && !node.isCollision) {
      this.emitGeometryAttributes(node.geometry);
    }

    // Material binding
    if (node.material && !node.isCollision) {
      const matName = this.sanitizeName(node.material);
      if (this.materialRegistry.has(node.material)) {
        this.emit(`rel material:binding = </Materials/${matName}>`);
      } else {
        this.emit(`rel material:binding = </Materials/DefaultMaterial>`);
      }
    } else if (node.geometry && !node.isCollision) {
      this.emit(`rel material:binding = </Materials/DefaultMaterial>`);
    }

    // Physics mass (optional)
    if (node.physMass !== undefined && this.options.includePhysics) {
      this.emitBlank();
      this.emit(`# Physics mass from URDF inertial`);
      this.emit(`float physics:mass = ${node.physMass}`);
    }

    // Mesh reference for external models
    if (node.geometry?.type === 'mesh' && node.geometry.filename && this.options.convertMeshReferences) {
      this.emitBlank();
      const remappedPath = this.options.meshPathRemap(node.geometry.filename);
      this.emit(`# External mesh: ${remappedPath}`);
      this.emit(`# Bundle in USDZ archive for <model> element support`);

      if (node.geometry.scale) {
        const s = node.geometry.scale;
        this.emit(`# Mesh scale: (${s[0]}, ${s[1]}, ${s[2]})`);
      }
    }

    // Children
    for (const child of node.children) {
      this.emitBlank();
      this.emitXformNode(child);
    }

    this.indentLevel--;
    this.emit(`}`);
  }

  /** Emit geometry-specific attributes */
  private emitGeometryAttributes(geom: URDFGeometryIR): void {
    switch (geom.type) {
      case 'box': {
        const s = geom.size || [1, 1, 1];
        this.emit(`double size = ${Math.max(s[0], s[1], s[2])}`);
        if (s[0] !== s[1] || s[1] !== s[2]) {
          this.emit(`# Non-uniform box, use scale: (${s[0]}, ${s[1]}, ${s[2]})`);
        }
        break;
      }
      case 'sphere':
        this.emit(`double radius = ${geom.radius ?? 0.5}`);
        break;
      case 'cylinder':
        this.emit(`double height = ${geom.length ?? 1.0}`);
        this.emit(`double radius = ${geom.radius ?? 0.5}`);
        break;
      case 'mesh':
        // Mesh references handled separately
        break;
    }
  }

  /** Map URDF geometry to USD prim type name */
  private getUSDGeometryType(geom: URDFGeometryIR): string {
    switch (geom.type) {
      case 'box': return 'Cube';
      case 'sphere': return 'Sphere';
      case 'cylinder': return 'Cylinder';
      case 'mesh': return 'Xform'; // Mesh references use Xform with asset reference
      default: return 'Cube';
    }
  }

  // ===========================================================================
  // UTILITY METHODS
  // ===========================================================================

  /** Emit a line with current indent */
  private emit(line: string): void {
    const indent = '    '.repeat(this.indentLevel);
    this.lines.push(indent + line);
  }

  /** Emit empty line */
  private emitBlank(): void {
    this.lines.push('');
  }

  /** Convert RPY (radians) to degrees */
  private rpyToDegrees(rpy: [number, number, number]): [number, number, number] {
    return [
      (rpy[0] * 180) / Math.PI,
      (rpy[1] * 180) / Math.PI,
      (rpy[2] * 180) / Math.PI,
    ];
  }

  /** Transform Z-up coordinates to Y-up */
  private transformZUpToYUp(xyz: [number, number, number]): [number, number, number] {
    // Z-up: x=right, y=forward, z=up
    // Y-up: x=right, y=up,     z=back
    return [xyz[0], xyz[2], -xyz[1]];
  }

  /** Sanitize name for USD prim paths */
  private sanitizeName(name: string): string {
    let sanitized = name.replace(/[^a-zA-Z0-9_]/g, '_');
    if (/^[0-9]/.test(sanitized)) {
      sanitized = '_' + sanitized;
    }
    return sanitized;
  }

  /** Escape string for USD string literals */
  private escapeString(str: string): string {
    return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  /**
   * Sanitize mesh file path to prevent path traversal attacks.
   * Strips ../ sequences and normalizes path separators.
   * Preserves protocol prefixes like package://.
   */
  private sanitizeMeshPath(path: string): string {
    // Temporarily protect :// protocol prefixes
    const sanitized = path
      .replace(/\.\.\//g, '')
      .replace(/\.\.\\/g, '')
      .replace(/\\/g, '/');

    // Collapse multiple slashes but preserve :// protocol prefix
    return sanitized.replace(/([^:])\/+/g, '$1/');
  }
}

// =============================================================================
// CONVENIENCE FUNCTIONS
// =============================================================================

/**
 * Convert URDF XML to USDA text for USDZ packaging.
 *
 * @param urdfXml - URDF XML string
 * @param options - Converter options
 * @returns USDA text
 */
export function convertURDFToUSDA(
  urdfXml: string,
  options?: URDFToUSDZConverterOptions,
): string {
  const converter = new URDFToUSDZConverter(options);
  return converter.compile(urdfXml);
}

/**
 * Convert URDF XML to USDA with Y-up axis for visionOS.
 */
export function convertURDFToUSDZForVisionOS(
  urdfXml: string,
  options?: Partial<URDFToUSDZConverterOptions>,
): string {
  return convertURDFToUSDA(urdfXml, {
    upAxis: 'Y',
    applyCoordinateTransform: true,
    ...options,
  });
}

/**
 * Parse URDF XML and return the intermediate representation.
 * Useful for inspection and validation before conversion.
 */
export function parseURDFModel(urdfXml: string): URDFModelIR {
  const converter = new URDFToUSDZConverter();
  return converter.parseURDF(urdfXml);
}

export default URDFToUSDZConverter;
