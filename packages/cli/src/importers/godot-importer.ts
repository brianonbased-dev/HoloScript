/**
 * Godot Scene Importer
 *
 * Imports Godot .tscn scene files into HoloScript .holo format.
 * Supports:
 * - Node hierarchy
 * - 3D nodes (MeshInstance3D, CSGBox3D, etc.)
 * - Transform3D components
 * - Common Godot nodes → HoloScript traits mapping
 * - Material and mesh references
 * - Physics (RigidBody3D, CollisionShape3D)
 *
 * @packageDocumentation
 */

import * as fs from 'fs';
import * as path from 'path';

// =============================================================================
// TYPES
// =============================================================================

/** Godot resource header */
interface GodotHeader {
  format: number;
  gdscript?: string;
  loadSteps?: number;
  type?: string;
  uid?: string;
}

/** External resource reference */
interface GodotExtResource {
  id: string;
  type: string;
  path: string;
  uid?: string;
}

/** Sub-resource definition */
interface GodotSubResource {
  id: string;
  type: string;
  properties: Record<string, unknown>;
}

/** Godot node */
interface GodotNode {
  name: string;
  type: string;
  parent?: string;
  instance?: string;
  properties: Record<string, unknown>;
}

/** Parsed Godot scene */
interface ParsedGodotScene {
  header: GodotHeader;
  extResources: Map<string, GodotExtResource>;
  subResources: Map<string, GodotSubResource>;
  nodes: GodotNode[];
}

/** Node tree for hierarchy */
interface GodotNodeTree {
  node: GodotNode;
  children: GodotNodeTree[];
}

// =============================================================================
// IMPORT RESULT
// =============================================================================

export interface GodotImportResult {
  success: boolean;
  holoCode: string;
  sceneName: string;
  objectCount: number;
  errors: string[];
  warnings: string[];
  stats: {
    nodesImported: number;
    meshesImported: number;
    lightsImported: number;
    camerasImported: number;
    traitsGenerated: number;
    extResourcesReferenced: number;
  };
}

// =============================================================================
// GODOT TSCN PARSER
// =============================================================================

/**
 * Parse Godot .tscn text scene format.
 */
function parseGodotScene(content: string): ParsedGodotScene {
  const lines = content.split('\n');
  const result: ParsedGodotScene = {
    header: { format: 3 },
    extResources: new Map(),
    subResources: new Map(),
    nodes: [],
  };

  let currentSection: 'none' | 'ext_resource' | 'sub_resource' | 'node' = 'none';
  let currentItem: Record<string, unknown> = {};

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith(';')) continue;

    // Header: [gd_scene format=3]
    if (line.startsWith('[gd_scene')) {
      const props = parseInlineProps(line);
      result.header = {
        format: parseInt(props.format as string) || 3,
        loadSteps: parseInt(props.load_steps as string),
        type: props.type as string,
        uid: props.uid as string,
      };
      continue;
    }

    // External resource: [ext_resource type="..." path="..." id="..."]
    if (line.startsWith('[ext_resource')) {
      const props = parseInlineProps(line);
      const extRes: GodotExtResource = {
        id: (props.id as string) || '',
        type: (props.type as string) || '',
        path: (props.path as string) || '',
        uid: props.uid as string,
      };
      result.extResources.set(extRes.id, extRes);
      continue;
    }

    // Sub-resource: [sub_resource type="..." id="..."]
    if (line.startsWith('[sub_resource')) {
      if (currentSection === 'sub_resource' && currentItem.id) {
        result.subResources.set(currentItem.id as string, {
          id: currentItem.id as string,
          type: currentItem.type as string,
          properties: { ...currentItem },
        });
      }
      const props = parseInlineProps(line);
      currentSection = 'sub_resource';
      currentItem = {
        id: props.id as string,
        type: props.type as string,
      };
      continue;
    }

    // Node: [node name="..." type="..." parent="..."]
    if (line.startsWith('[node')) {
      // Save previous section
      if (currentSection === 'sub_resource' && currentItem.id) {
        result.subResources.set(currentItem.id as string, {
          id: currentItem.id as string,
          type: currentItem.type as string,
          properties: { ...currentItem },
        });
      }
      if (currentSection === 'node' && currentItem.name) {
        result.nodes.push({
          name: currentItem.name as string,
          type: currentItem.type as string,
          parent: currentItem.parent as string | undefined,
          instance: currentItem.instance as string | undefined,
          properties: { ...currentItem },
        });
      }

      const props = parseInlineProps(line);
      currentSection = 'node';
      currentItem = {
        name: props.name as string,
        type: props.type as string,
        parent: props.parent as string,
        instance: props.instance as string,
      };
      continue;
    }

    // Property lines (key = value)
    if (line.includes('=') && currentSection !== 'none') {
      const [key, ...valueParts] = line.split('=');
      const keyTrim = key.trim();
      const valueStr = valueParts.join('=').trim();
      currentItem[keyTrim] = parseGodotValue(valueStr);
    }
  }

  // Save last section
  if (currentSection === 'sub_resource' && currentItem.id) {
    result.subResources.set(currentItem.id as string, {
      id: currentItem.id as string,
      type: currentItem.type as string,
      properties: { ...currentItem },
    });
  }
  if (currentSection === 'node' && currentItem.name) {
    result.nodes.push({
      name: currentItem.name as string,
      type: currentItem.type as string,
      parent: currentItem.parent as string | undefined,
      instance: currentItem.instance as string | undefined,
      properties: { ...currentItem },
    });
  }

  return result;
}

/**
 * Parse inline properties from section header like [node name="..." type="..."]
 */
function parseInlineProps(line: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  // Match key="value" or key=value patterns
  const propPattern = /(\w+)\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/g;
  let match;
  while ((match = propPattern.exec(line)) !== null) {
    const key = match[1];
    const value = match[2] ?? match[3] ?? match[4];
    result[key] = value;
  }

  return result;
}

/**
 * Parse Godot value types (Vector3, Color, etc.)
 */
function parseGodotValue(valueStr: string): unknown {
  // Vector3(x, y, z)
  const vec3Match = valueStr.match(
    /Vector3\s*\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)/
  );
  if (vec3Match) {
    return {
      x: parseFloat(vec3Match[1]),
      y: parseFloat(vec3Match[2]),
      z: parseFloat(vec3Match[3]),
    };
  }

  // Quaternion(x, y, z, w)
  const quatMatch = valueStr.match(
    /Quaternion\s*\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)/
  );
  if (quatMatch) {
    return {
      x: parseFloat(quatMatch[1]),
      y: parseFloat(quatMatch[2]),
      z: parseFloat(quatMatch[3]),
      w: parseFloat(quatMatch[4]),
    };
  }

  // Transform3D(basis, origin)
  const transformMatch = valueStr.match(/Transform3D\s*\(([\s\S]+)\)/);
  if (transformMatch) {
    const nums = transformMatch[1].match(/-?[\d.]+/g)?.map(parseFloat) || [];
    if (nums.length >= 12) {
      return {
        basis: [
          [nums[0], nums[1], nums[2]],
          [nums[3], nums[4], nums[5]],
          [nums[6], nums[7], nums[8]],
        ],
        origin: { x: nums[9], y: nums[10], z: nums[11] },
      };
    }
  }

  // Color(r, g, b, a)
  const colorMatch = valueStr.match(
    /Color\s*\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)(?:\s*,\s*(-?[\d.]+))?\s*\)/
  );
  if (colorMatch) {
    return {
      r: parseFloat(colorMatch[1]),
      g: parseFloat(colorMatch[2]),
      b: parseFloat(colorMatch[3]),
      a: colorMatch[4] ? parseFloat(colorMatch[4]) : 1.0,
    };
  }

  // SubResource/ExtResource references
  const resMatch = valueStr.match(/(?:Sub|Ext)Resource\s*\(\s*"?(\w+)"?\s*\)/);
  if (resMatch) {
    return { resourceRef: resMatch[1] };
  }

  // Boolean
  if (valueStr === 'true') return true;
  if (valueStr === 'false') return false;

  // Number
  if (/^-?\d+\.?\d*$/.test(valueStr)) {
    return parseFloat(valueStr);
  }

  // Quoted string
  if (
    (valueStr.startsWith('"') && valueStr.endsWith('"')) ||
    (valueStr.startsWith("'") && valueStr.endsWith("'"))
  ) {
    return valueStr.slice(1, -1);
  }

  // Default: return as string
  return valueStr;
}

// =============================================================================
// SCENE TREE BUILDER
// =============================================================================

/**
 * Build hierarchical tree from flat node list.
 */
function buildNodeTree(nodes: GodotNode[]): GodotNodeTree[] {
  const nodeMap = new Map<string, GodotNodeTree>();
  const roots: GodotNodeTree[] = [];

  // Create tree nodes
  for (const node of nodes) {
    nodeMap.set(node.name, { node, children: [] });
  }

  // Build hierarchy
  for (const node of nodes) {
    const treeNode = nodeMap.get(node.name)!;

    if (!node.parent) {
      // Root node
      roots.push(treeNode);
    } else {
      // Find parent path
      const parentPath =
        node.parent === '.' ? nodes[0]?.name : resolveParentPath(node.parent, nodes[0]?.name || '');
      const parent = nodeMap.get(parentPath);
      if (parent) {
        parent.children.push(treeNode);
      } else {
        // Orphan node, add to roots
        roots.push(treeNode);
      }
    }
  }

  return roots;
}

function resolveParentPath(parentRef: string, rootName: string): string {
  if (parentRef === '.') return rootName;
  if (parentRef.startsWith('./')) return parentRef.slice(2);
  return parentRef.split('/').pop() || parentRef;
}

// =============================================================================
// HOLO CODE GENERATOR
// =============================================================================

/**
 * Generate .holo code from Godot scene.
 */
function generateHoloCode(
  scene: ParsedGodotScene,
  sceneName: string
): { code: string; stats: GodotImportResult['stats'] } {
  const stats: GodotImportResult['stats'] = {
    nodesImported: 0,
    meshesImported: 0,
    lightsImported: 0,
    camerasImported: 0,
    traitsGenerated: 0,
    extResourcesReferenced: 0,
  };

  const lines: string[] = [];
  lines.push(`composition "${sceneName}" {`);
  lines.push('  environment {');
  lines.push('    // Imported from Godot');
  lines.push('    ambient_light: 0.4');
  lines.push('  }');
  lines.push('');

  // Build tree
  const trees = buildNodeTree(scene.nodes);

  // Extract lights and cameras first
  for (const tree of trees) {
    extractSpecialNodes(tree, lines, stats);
  }

  // Process nodes
  for (const tree of trees) {
    generateNodeCode(tree, scene, 1, lines, stats);
  }

  lines.push('}');

  return { code: lines.join('\n'), stats };
}

function extractSpecialNodes(
  tree: GodotNodeTree,
  lines: string[],
  stats: GodotImportResult['stats']
): void {
  const node = tree.node;
  const type = node.type;

  // Lights
  if (type === 'DirectionalLight3D' || type === 'OmniLight3D' || type === 'SpotLight3D') {
    lines.push(generateLight(node, stats));
    stats.lightsImported++;
  }

  // Cameras
  if (type === 'Camera3D') {
    lines.push(generateCamera(node, stats));
    stats.camerasImported++;
  }

  // Recurse
  for (const child of tree.children) {
    extractSpecialNodes(child, lines, stats);
  }
}

function generateLight(node: GodotNode, _stats: GodotImportResult['stats']): string {
  const lightTypeMap: Record<string, string> = {
    DirectionalLight3D: 'directional_light',
    OmniLight3D: 'point_light',
    SpotLight3D: 'spot_light',
  };

  const lightType = lightTypeMap[node.type] || 'point_light';
  const transform = getTransformPosition(node);
  const color = node.properties.light_color as { r: number; g: number; b: number } | undefined;
  const intensity = (node.properties.light_energy as number) || 1.0;

  const hexColor = color ? rgbToHex(color.r, color.g, color.b) : '#ffffff';

  return `  ${lightType} "${sanitizeName(node.name)}" {
    position: [${transform.x}, ${transform.y}, ${transform.z}]
    color: "${hexColor}"
    intensity: ${intensity}
  }
`;
}

function generateCamera(node: GodotNode, _stats: GodotImportResult['stats']): string {
  const transform = getTransformPosition(node);
  const fov = (node.properties.fov as number) || 75;
  const near = (node.properties.near as number) || 0.05;
  const far = (node.properties.far as number) || 4000;

  return `  perspective_camera "${sanitizeName(node.name)}" {
    position: [${transform.x}, ${transform.y}, ${transform.z}]
    fov: ${fov}
    near: ${near}
    far: ${far}
  }
`;
}

function generateNodeCode(
  tree: GodotNodeTree,
  scene: ParsedGodotScene,
  depth: number,
  lines: string[],
  stats: GodotImportResult['stats']
): void {
  const node = tree.node;

  // Skip already processed lights/cameras
  if (['DirectionalLight3D', 'OmniLight3D', 'SpotLight3D', 'Camera3D'].includes(node.type)) {
    for (const child of tree.children) {
      generateNodeCode(child, scene, depth, lines, stats);
    }
    return;
  }

  // Skip non-visual nodes
  if (shouldSkipNode(node.type)) {
    for (const child of tree.children) {
      generateNodeCode(child, scene, depth, lines, stats);
    }
    return;
  }

  stats.nodesImported++;
  const indent = '  '.repeat(depth);

  // Determine geometry
  const geometry = getGeometry(node, scene, stats);

  // Collect traits
  const traits = mapNodeToTraits(node);
  stats.traitsGenerated += traits.length;

  const traitStr = traits.length > 0 ? ' ' + traits.map((t) => `@${t}`).join(' ') : '';
  lines.push(`${indent}object "${sanitizeName(node.name)}"${traitStr} {`);

  // Geometry
  lines.push(`${indent}  geometry: "${geometry}"`);

  // Transform
  const transform = node.properties.transform as
    | { origin: { x: number; y: number; z: number } }
    | undefined;
  if (transform?.origin) {
    const pos = transform.origin;
    lines.push(`${indent}  position: [${pos.x}, ${pos.y}, ${pos.z}]`);
  }

  // Rotation (from transform basis)
  const rotation = extractRotation(node.properties.transform);
  if (rotation) {
    lines.push(
      `${indent}  rotation: [${rotation.x.toFixed(2)}, ${rotation.y.toFixed(2)}, ${rotation.z.toFixed(2)}]`
    );
  }

  // Scale from CSG or mesh
  const scale = extractScale(node);
  if (scale && (scale.x !== 1 || scale.y !== 1 || scale.z !== 1)) {
    lines.push(`${indent}  scale: [${scale.x}, ${scale.y}, ${scale.z}]`);
  }

  // Physics for RigidBody3D
  if (node.type === 'RigidBody3D') {
    const mass = (node.properties.mass as number) || 1;
    lines.push(`${indent}  physics: {`);
    lines.push(`${indent}    type: "dynamic"`);
    lines.push(`${indent}    mass: ${mass}`);
    lines.push(`${indent}  }`);
  }

  // Color from material if available
  const color = extractColor(node, scene);
  if (color) {
    lines.push(`${indent}  color: "${color}"`);
  }

  lines.push(`${indent}}`);
  lines.push('');

  // Process children
  for (const child of tree.children) {
    generateNodeCode(child, scene, depth, lines, stats);
  }
}

function getGeometry(
  node: GodotNode,
  scene: ParsedGodotScene,
  stats: GodotImportResult['stats']
): string {
  const type = node.type;

  // CSG primitives
  const csgMap: Record<string, string> = {
    CSGBox3D: 'cube',
    CSGSphere3D: 'sphere',
    CSGCylinder3D: 'cylinder',
    CSGTorus3D: 'torus',
    CSGPolygon3D: 'plane',
    CSGCapsule3D: 'capsule',
  };
  if (csgMap[type]) {
    stats.meshesImported++;
    return csgMap[type];
  }

  // MeshInstance3D with mesh reference
  if (type === 'MeshInstance3D') {
    const meshRef = node.properties.mesh as { resourceRef: string } | undefined;
    if (meshRef?.resourceRef) {
      const subRes = scene.subResources.get(meshRef.resourceRef);
      if (subRes) {
        const resType = subRes.type;
        const meshMap: Record<string, string> = {
          BoxMesh: 'cube',
          SphereMesh: 'sphere',
          CylinderMesh: 'cylinder',
          CapsuleMesh: 'capsule',
          PlaneMesh: 'plane',
          TorusMesh: 'torus',
          QuadMesh: 'plane',
        };
        if (meshMap[resType]) {
          stats.meshesImported++;
          return meshMap[resType];
        }
      }

      // External resource
      const extRes = scene.extResources.get(meshRef.resourceRef);
      if (extRes?.path) {
        stats.meshesImported++;
        stats.extResourcesReferenced++;

        // Convert .mesh to .glb reference
        const meshPath = extRes.path.replace(/^res:\/\//, '').replace('.mesh', '.glb');
        return `model/${meshPath}`;
      }
    }
    stats.meshesImported++;
    return 'cube';
  }

  // StaticBody3D, RigidBody3D, CharacterBody3D - use child collision shapes
  if (['StaticBody3D', 'RigidBody3D', 'CharacterBody3D'].includes(type)) {
    return 'cube';
  }

  // Node3D container
  if (type === 'Node3D') {
    return 'cube';
  }

  return 'cube';
}

function mapNodeToTraits(node: GodotNode): string[] {
  const traits: string[] = [];
  const type = node.type;

  // Physics bodies
  if (type === 'RigidBody3D') {
    traits.push('physics');
  }
  if (type === 'StaticBody3D') {
    traits.push('collidable');
  }
  if (type === 'CharacterBody3D') {
    traits.push('physics', 'collidable');
  }
  if (type === 'Area3D') {
    traits.push('trigger');
  }

  // Animation player
  if (node.properties.AnimationPlayer || type === 'AnimationPlayer') {
    traits.push('animated');
  }

  // Audio
  if (type === 'AudioStreamPlayer3D') {
    traits.push('spatial_audio');
  }

  return traits;
}

function shouldSkipNode(type: string): boolean {
  const skipTypes = [
    'Node3D',
    'CollisionShape3D',
    'CollisionPolygon3D',
    'RayCast3D',
    'AnimationPlayer',
    'AnimationTree',
    'Timer',
    'Path3D',
    'PathFollow3D',
    'NavigationAgent3D',
    'NavigationObstacle3D',
    'Marker3D',
    'RemoteTransform3D',
    'Skeleton3D',
    'BoneAttachment3D',
  ];
  return skipTypes.includes(type);
}

function getTransformPosition(node: GodotNode): { x: number; y: number; z: number } {
  const transform = node.properties.transform as
    | { origin: { x: number; y: number; z: number } }
    | undefined;
  if (transform?.origin) {
    return transform.origin;
  }
  return { x: 0, y: 0, z: 0 };
}

function extractRotation(transform: unknown): { x: number; y: number; z: number } | null {
  if (!transform || typeof transform !== 'object') return null;
  const t = transform as { basis?: number[][] };
  if (!t.basis || !Array.isArray(t.basis)) return null;

  // Extract euler from basis matrix (simplified)
  const m = t.basis;
  if (m.length < 3) return null;

  // Simplified euler extraction
  const sy = Math.sqrt(m[0][0] * m[0][0] + m[1][0] * m[1][0]);
  const singular = sy < 1e-6;

  let x: number, y: number, z: number;
  if (!singular) {
    x = Math.atan2(m[2][1], m[2][2]);
    y = Math.atan2(-m[2][0], sy);
    z = Math.atan2(m[1][0], m[0][0]);
  } else {
    x = Math.atan2(-m[1][2], m[1][1]);
    y = Math.atan2(-m[2][0], sy);
    z = 0;
  }

  const toDeg = 180 / Math.PI;
  const result = { x: x * toDeg, y: y * toDeg, z: z * toDeg };

  // Skip near-zero rotations
  if (Math.abs(result.x) < 0.1 && Math.abs(result.y) < 0.1 && Math.abs(result.z) < 0.1) {
    return null;
  }

  return result;
}

function extractScale(node: GodotNode): { x: number; y: number; z: number } | null {
  // CSG nodes have size property
  const size = node.properties.size as { x: number; y: number; z: number } | undefined;
  if (size) {
    return size;
  }

  // Check for scale in transform basis
  const transform = node.properties.transform as { basis?: number[][] } | undefined;
  if (transform?.basis) {
    const m = transform.basis;
    if (m.length >= 3) {
      const sx = Math.sqrt(m[0][0] * m[0][0] + m[0][1] * m[0][1] + m[0][2] * m[0][2]);
      const sy = Math.sqrt(m[1][0] * m[1][0] + m[1][1] * m[1][1] + m[1][2] * m[1][2]);
      const sz = Math.sqrt(m[2][0] * m[2][0] + m[2][1] * m[2][1] + m[2][2] * m[2][2]);
      if (sx !== 1 || sy !== 1 || sz !== 1) {
        return { x: sx, y: sy, z: sz };
      }
    }
  }

  return null;
}

function extractColor(node: GodotNode, scene: ParsedGodotScene): string | null {
  // Check material reference
  const matRef = node.properties.material as { resourceRef: string } | undefined;
  if (matRef?.resourceRef) {
    const subRes = scene.subResources.get(matRef.resourceRef);
    if (subRes) {
      const albedo = subRes.properties.albedo_color as
        | { r: number; g: number; b: number }
        | undefined;
      if (albedo) {
        return rgbToHex(albedo.r, albedo.g, albedo.b);
      }
    }
  }

  return null;
}

// =============================================================================
// UTILITIES
// =============================================================================

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/^_+|_+$/g, '');
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (v: number) =>
    Math.round(Math.min(1, Math.max(0, v)) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// =============================================================================
// MAIN IMPORT FUNCTION
// =============================================================================

export interface GodotImportOptions {
  /** Path to .tscn file */
  inputPath: string;
  /** Output path for .holo file (optional) */
  outputPath?: string;
  /** Scene name override */
  sceneName?: string;
}

/**
 * Import a Godot scene file into HoloScript.
 */
export async function importGodot(options: GodotImportOptions): Promise<GodotImportResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    // Read file
    const content = await fs.promises.readFile(options.inputPath, 'utf-8');
    const ext = path.extname(options.inputPath).toLowerCase();

    if (ext !== '.tscn' && ext !== '.escn') {
      errors.push(`Unsupported file type: ${ext}. Expected .tscn or .escn`);
      return {
        success: false,
        holoCode: '',
        sceneName: '',
        objectCount: 0,
        errors,
        warnings,
        stats: {
          nodesImported: 0,
          meshesImported: 0,
          lightsImported: 0,
          camerasImported: 0,
          traitsGenerated: 0,
          extResourcesReferenced: 0,
        },
      };
    }

    // Parse scene
    const scene = parseGodotScene(content);
    if (scene.nodes.length === 0) {
      errors.push('No nodes found in scene file');
      return {
        success: false,
        holoCode: '',
        sceneName: '',
        objectCount: 0,
        errors,
        warnings,
        stats: {
          nodesImported: 0,
          meshesImported: 0,
          lightsImported: 0,
          camerasImported: 0,
          traitsGenerated: 0,
          extResourcesReferenced: 0,
        },
      };
    }

    // Determine scene name
    const sceneName =
      options.sceneName || path.basename(options.inputPath, path.extname(options.inputPath));

    // Generate .holo code
    const { code, stats } = generateHoloCode(scene, sceneName);

    // Write output if path provided
    if (options.outputPath) {
      await fs.promises.writeFile(options.outputPath, code, 'utf-8');
    }

    return {
      success: true,
      holoCode: code,
      sceneName,
      objectCount: stats.nodesImported,
      errors,
      warnings,
      stats,
    };
  } catch (error) {
    errors.push(`Import failed: ${error instanceof Error ? error.message : String(error)}`);
    return {
      success: false,
      holoCode: '',
      sceneName: options.sceneName || '',
      objectCount: 0,
      errors,
      warnings,
      stats: {
        nodesImported: 0,
        meshesImported: 0,
        lightsImported: 0,
        camerasImported: 0,
        traitsGenerated: 0,
        extResourcesReferenced: 0,
      },
    };
  }
}

// =============================================================================
// CLI EXPORT
// =============================================================================

export { parseGodotScene, buildNodeTree, generateHoloCode };
