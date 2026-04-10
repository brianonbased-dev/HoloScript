/**
 * Unity Scene Importer
 *
 * Imports Unity .unity scene files and .prefab files into HoloScript .holo format.
 * Supports:
 * - GameObject hierarchy
 * - Transform components
 * - Common Unity components → HoloScript traits mapping
 * - Material references
 * - Basic physics (Rigidbody, Collider)
 *
 * @packageDocumentation
 */

import * as fs from 'fs';
import * as path from 'path';

// =============================================================================
// TYPES
// =============================================================================

/** Unity YAML document structure */
interface UnityDocument {
  fileID: string;
  type: string;
  data: Record<string, unknown>;
}

/** Unity Transform component */
interface UnityTransform {
  m_LocalPosition: { x: number; y: number; z: number };
  m_LocalRotation: { x: number; y: number; z: number; w: number };
  m_LocalScale: { x: number; y: number; z: number };
  m_Children?: Array<{ fileID: string }>;
  m_Father?: { fileID: string };
}

/** Unity GameObject */
interface UnityGameObject {
  m_Name: string;
  m_IsActive: number;
  m_Component: Array<{ component: { fileID: string } }>;
}

/** Unity MeshFilter component */
interface UnityMeshFilter {
  m_Mesh?: { fileID: string; guid?: string };
}

/** Unity MeshRenderer component */
interface _UnityMeshRenderer {
  m_Materials?: Array<{ fileID: string; guid?: string }>;
  m_Enabled?: number;
}

/** Unity Rigidbody component */
interface UnityRigidbody {
  m_Mass: number;
  m_Drag: number;
  m_AngularDrag: number;
  m_UseGravity: number;
  m_IsKinematic: number;
}

/** Unity Collider base */
interface UnityCollider {
  m_IsTrigger: number;
  m_Enabled?: number;
}

/** Unity BoxCollider */
interface _UnityBoxCollider extends UnityCollider {
  m_Size: { x: number; y: number; z: number };
  m_Center: { x: number; y: number; z: number };
}

/** Unity SphereCollider */
interface _UnitySphereCollider extends UnityCollider {
  m_Radius: number;
  m_Center: { x: number; y: number; z: number };
}

/** Unity Light component */
interface UnityLight {
  m_Type: number; // 0=Spot, 1=Directional, 2=Point, 3=Area
  m_Color: { r: number; g: number; b: number; a: number };
  m_Intensity: number;
  m_Range?: number;
  m_SpotAngle?: number;
}

/** Unity Camera component */
interface UnityCamera {
  field_of_view?: number;
  near_clip_plane?: number;
  far_clip_plane?: number;
  orthographic?: number;
  orthographic_size?: number;
}

/** Parsed Unity scene */
interface ParsedUnityScene {
  name: string;
  documents: Map<string, UnityDocument>;
  gameObjects: UnityGameObjectNode[];
}

/** GameObject with resolved components */
interface UnityGameObjectNode {
  fileID: string;
  name: string;
  active: boolean;
  transform: UnityTransform;
  components: ResolvedComponent[];
  children: UnityGameObjectNode[];
}

/** Resolved component with type */
interface ResolvedComponent {
  type: string;
  data: Record<string, unknown>;
}

// =============================================================================
// IMPORT RESULT
// =============================================================================

export interface UnityImportResult {
  success: boolean;
  holoCode: string;
  sceneName: string;
  objectCount: number;
  errors: string[];
  warnings: string[];
  stats: {
    gameObjectsImported: number;
    componentsProcessed: number;
    traitsGenerated: number;
    lightsImported: number;
    camerasImported: number;
  };
}

// =============================================================================
// UNITY YAML PARSER
// =============================================================================

/**
 * Parse Unity YAML format (multi-document YAML with tagged objects).
 * Unity uses a custom format with `--- !u!<classID> &<fileID>` headers.
 */
function parseUnityYAML(content: string): Map<string, UnityDocument> {
  const documents = new Map<string, UnityDocument>();

  // Split by document markers
  const docPattern = /---\s+!u!(\d+)\s+&(\d+)/g;
  const matches = [...content.matchAll(docPattern)];

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const classID = match[1];
    const fileID = match[2];

    // Get content between this match and the next
    const startIdx = match.index! + match[0].length;
    const endIdx = i + 1 < matches.length ? matches[i + 1].index : content.length;
    const docContent = content.slice(startIdx, endIdx).trim();

    // Parse the YAML-ish content
    const data = parseSimpleYAML(docContent);
    const type = getUnityTypeName(parseInt(classID));

    documents.set(fileID, { fileID, type, data });
  }

  return documents;
}

/**
 * Simple YAML parser for Unity's format (nested key-value pairs).
 */
function parseSimpleYAML(content: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = content.split('\n');

  // Track the current context: each entry has an indent level, a target object, and its key in the parent
  const stack: Array<{
    indent: number;
    obj: Record<string, unknown>;
    key?: string;
    parentObj?: Record<string, unknown>;
  }> = [{ indent: -1, obj: result }];

  // Track the current array being built from consecutive list items
  let currentArray: unknown[] | null = null;
  let currentArrayIndent = -1;

  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith('#')) continue;

    const indentMatch = line.match(/^(\s*)/);
    const indent = indentMatch ? indentMatch[1].length : 0;
    const trimmed = line.trim();

    // Check if this is a YAML list item: "- key: value" or "- {inline}"
    const listItemMatch = trimmed.match(/^-\s+(.*)$/);
    if (listItemMatch) {
      const itemContent = listItemMatch[1].trim();

      // If we don't have a current array at this indent, convert the parent empty object to an array
      if (currentArray === null || indent !== currentArrayIndent) {
        // Pop stack to find the empty object placeholder that should become an array
        while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
          stack.pop();
        }

        // The top of the stack should be the object whose parent key needs to become an array
        // We need to go one level up: the current stack top's parent should have a key that is {}
        const stackTop = stack[stack.length - 1];
        if (stackTop.key && stackTop.parentObj) {
          // Convert this empty object placeholder to an array
          currentArray = [];
          currentArrayIndent = indent;
          stackTop.parentObj[stackTop.key] = currentArray;
        } else {
          // Fallback: search the current object for an empty-object key
          const parentKeys = Object.keys(stackTop.obj);
          currentArray = null;
          for (let k = parentKeys.length - 1; k >= 0; k--) {
            const key = parentKeys[k];
            const val = stackTop.obj[key];
            if (
              val &&
              typeof val === 'object' &&
              !Array.isArray(val) &&
              Object.keys(val as Record<string, unknown>).length === 0
            ) {
              currentArray = [];
              currentArrayIndent = indent;
              stackTop.obj[key] = currentArray;
              break;
            }
          }
          if (currentArray === null) {
            // Last resort: create a detached array
            currentArray = [];
            currentArrayIndent = indent;
          }
        }
      }

      // Parse the list item content
      if (itemContent.startsWith('{') && itemContent.endsWith('}')) {
        // Inline object: - {fileID: 400001}
        currentArray.push(parseInlineObject(itemContent));
      } else {
        // Key-value item: - component: {fileID: 400001}
        const kvMatch = itemContent.match(/^(\w+):\s*(.*)$/);
        if (kvMatch) {
          const key = kvMatch[1];
          const valueStr = kvMatch[2].trim();
          const itemObj: Record<string, unknown> = {};

          if (valueStr.startsWith('{') && valueStr.endsWith('}')) {
            itemObj[key] = parseInlineObject(valueStr);
          } else if (valueStr.startsWith('[')) {
            itemObj[key] = parseInlineArray(valueStr);
          } else if (valueStr === '' || valueStr === '{}') {
            itemObj[key] = {};
          } else {
            itemObj[key] = parsePrimitive(valueStr);
          }
          currentArray.push(itemObj);
        } else {
          // Plain value: - someValue
          currentArray.push(parsePrimitive(itemContent));
        }
      }
      continue;
    }

    // Not a list item -- reset the current array tracking
    currentArray = null;
    currentArrayIndent = -1;

    // Pop stack to find parent
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }

    const parent = stack[stack.length - 1].obj;

    // Key: value
    const kvMatch = trimmed.match(/^(\w+):\s*(.*)$/);
    if (kvMatch) {
      const key = kvMatch[1];
      const valueStr = kvMatch[2].trim();

      if (valueStr === '' || valueStr === '{}') {
        // Nested object (may become an array if followed by list items)
        const nested: Record<string, unknown> = {};
        parent[key] = nested;
        stack.push({ indent, obj: nested, key, parentObj: parent });
      } else if (valueStr.startsWith('{') && valueStr.endsWith('}')) {
        // Inline object like {x: 0, y: 1, z: 2}
        parent[key] = parseInlineObject(valueStr);
      } else if (valueStr.startsWith('[')) {
        // Array (simplified)
        parent[key] = parseInlineArray(valueStr);
      } else {
        // Primitive
        parent[key] = parsePrimitive(valueStr);
      }
    }
  }

  return result;
}

function parseInlineObject(str: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const inner = str.slice(1, -1).trim();
  if (!inner) return result;

  // Match key: value pairs
  const pairPattern = /(\w+):\s*(-?[\d.]+|"[^"]*"|'[^']*'|\w+)/g;
  let match;
  while ((match = pairPattern.exec(inner)) !== null) {
    result[match[1]] = parsePrimitive(match[2]);
  }
  return result;
}

function parseInlineArray(str: string): unknown[] {
  const result: unknown[] = [];
  const inner = str.slice(1, -1).trim();
  if (!inner) return result;

  // Split by commas (simplified)
  const items = inner.split(',').map((s) => s.trim());
  for (const item of items) {
    if (item.startsWith('{')) {
      result.push(parseInlineObject(item));
    } else {
      result.push(parsePrimitive(item));
    }
  }
  return result;
}

function parsePrimitive(str: string): unknown {
  // Number
  if (/^-?\d+\.?\d*$/.test(str)) {
    return parseFloat(str);
  }
  // Boolean
  if (str === 'true' || str === '1') return true;
  if (str === 'false' || str === '0') return false;
  // Null
  if (str === 'null' || str === '~') return null;
  // String (strip quotes)
  if ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'"))) {
    return str.slice(1, -1);
  }
  return str;
}

/**
 * Map Unity class IDs to type names.
 */
function getUnityTypeName(classID: number): string {
  const classMap: Record<number, string> = {
    1: 'GameObject',
    4: 'Transform',
    20: 'Camera',
    23: 'MeshRenderer',
    33: 'MeshFilter',
    54: 'Rigidbody',
    64: 'MeshCollider',
    65: 'BoxCollider',
    108: 'Light',
    114: 'MonoBehaviour',
    135: 'SphereCollider',
    136: 'CapsuleCollider',
    1001: 'Prefab',
    1660057539: 'SceneRoots',
  };
  return classMap[classID] || `UnknownClass_${classID}`;
}

// =============================================================================
// SCENE BUILDER
// =============================================================================

/**
 * Build a scene tree from parsed Unity documents.
 */
function buildSceneTree(
  documents: Map<string, UnityDocument>,
  sceneName: string
): ParsedUnityScene {
  const gameObjectNodes = new Map<string, UnityGameObjectNode>();
  const transformToGameObject = new Map<string, string>();

  // First pass: create all GameObjects
  for (const [fileID, doc] of documents) {
    if (doc.type === 'GameObject') {
      const goData = doc.data as unknown as { GameObject: UnityGameObject };
      const go = goData.GameObject || (doc.data as unknown as UnityGameObject);

      gameObjectNodes.set(fileID, {
        fileID,
        name: go.m_Name || `Object_${fileID}`,
        active: go.m_IsActive !== 0,
        transform: null as unknown as UnityTransform,
        components: [],
        children: [],
      });
    }
  }

  // Second pass: link transforms and components
  for (const [fileID, doc] of documents) {
    if (doc.type === 'Transform') {
      const tfData = doc.data as unknown as { Transform: UnityTransform };
      const tf = tfData.Transform || (doc.data as unknown as UnityTransform);

      // Find which GameObject owns this transform
      for (const [goID, goDoc] of documents) {
        if (goDoc.type === 'GameObject') {
          const goData = goDoc.data as unknown as { GameObject: UnityGameObject };
          const go = goData.GameObject || (goDoc.data as unknown as UnityGameObject);

          const components = go.m_Component || [];
          for (const comp of components) {
            if (String(comp.component?.fileID) === fileID) {
              const node = gameObjectNodes.get(goID);
              if (node) {
                node.transform = tf;
                transformToGameObject.set(fileID, goID);
              }
              break;
            }
          }
        }
      }
    }
  }

  // Third pass: resolve component types
  for (const [fileID, doc] of documents) {
    if (doc.type !== 'GameObject' && doc.type !== 'Transform') {
      // Find which GameObject this component belongs to
      for (const [goID, node] of gameObjectNodes) {
        const goDoc = documents.get(goID);
        if (goDoc?.type === 'GameObject') {
          const goData = goDoc.data as unknown as { GameObject: UnityGameObject };
          const go = goData.GameObject || (goDoc.data as unknown as UnityGameObject);

          const components = go.m_Component || [];
          for (const comp of components) {
            if (String(comp.component?.fileID) === fileID) {
              node.components.push({
                type: doc.type,
                data: doc.data,
              });
              break;
            }
          }
        }
      }
    }
  }

  // Fourth pass: build hierarchy
  const rootNodes: UnityGameObjectNode[] = [];
  for (const [tfID, doc] of documents) {
    if (doc.type === 'Transform') {
      const tfData = doc.data as unknown as { Transform: UnityTransform };
      const tf = tfData.Transform || (doc.data as unknown as UnityTransform);

      const goID = transformToGameObject.get(tfID);
      if (!goID) continue;

      const node = gameObjectNodes.get(goID);
      if (!node) continue;

      if (!tf.m_Father || String(tf.m_Father.fileID) === '0') {
        // Root node
        rootNodes.push(node);
      } else {
        // Find parent
        const parentGoID = transformToGameObject.get(String(tf.m_Father.fileID));
        if (parentGoID) {
          const parent = gameObjectNodes.get(parentGoID);
          if (parent) {
            parent.children.push(node);
          }
        }
      }
    }
  }

  return {
    name: sceneName,
    documents,
    gameObjects: rootNodes,
  };
}

// =============================================================================
// HOLO CODE GENERATOR
// =============================================================================

/**
 * Generate .holo code from Unity scene.
 */
function generateHoloCode(scene: ParsedUnityScene): {
  code: string;
  stats: UnityImportResult['stats'];
} {
  const stats = {
    gameObjectsImported: 0,
    componentsProcessed: 0,
    traitsGenerated: 0,
    lightsImported: 0,
    camerasImported: 0,
  };

  const lines: string[] = [];
  lines.push(`composition "${scene.name}" {`);
  lines.push('  environment {');
  lines.push('    // Imported from Unity');
  lines.push('    ambient_light: 0.4');
  lines.push('  }');
  lines.push('');

  // Process lights and cameras first (from any node)
  const allNodes = flattenNodes(scene.gameObjects);
  for (const node of allNodes) {
    for (const comp of node.components) {
      if (comp.type === 'Light') {
        lines.push(generateLight(node, comp, stats));
        stats.lightsImported++;
      }
      if (comp.type === 'Camera') {
        lines.push(generateCamera(node, comp, stats));
        stats.camerasImported++;
      }
    }
  }

  // Process GameObjects
  for (const node of scene.gameObjects) {
    generateNode(node, 1, lines, stats);
  }

  lines.push('}');

  return { code: lines.join('\n'), stats };
}

function flattenNodes(nodes: UnityGameObjectNode[]): UnityGameObjectNode[] {
  const result: UnityGameObjectNode[] = [];
  function walk(node: UnityGameObjectNode) {
    result.push(node);
    for (const child of node.children) {
      walk(child);
    }
  }
  for (const n of nodes) walk(n);
  return result;
}

function generateNode(
  node: UnityGameObjectNode,
  depth: number,
  lines: string[],
  stats: UnityImportResult['stats']
): void {
  if (!node.active) return;

  stats.gameObjectsImported++;
  const indent = '  '.repeat(depth);

  // Determine geometry from mesh or default to cube
  let geometry = 'cube';
  const meshFilter = node.components.find((c) => c.type === 'MeshFilter');
  if (meshFilter) {
    const mfData = meshFilter.data as unknown as { MeshFilter: UnityMeshFilter };
    const mf = mfData.MeshFilter || (meshFilter.data as unknown as UnityMeshFilter);
    if (mf.m_Mesh?.guid) {
      geometry = `model/${mf.m_Mesh.guid}.glb`;
    }
  }

  // Collect traits
  const traits: string[] = [];
  for (const comp of node.components) {
    stats.componentsProcessed++;
    const mappedTraits = mapComponentToTraits(comp);
    traits.push(...mappedTraits);
    stats.traitsGenerated += mappedTraits.length;
  }

  const traitStr = traits.length > 0 ? ' ' + traits.map((t) => `@${t}`).join(' ') : '';
  lines.push(`${indent}object "${sanitizeName(node.name)}"${traitStr} {`);

  // Transform
  if (node.transform) {
    const pos = node.transform.m_LocalPosition || { x: 0, y: 0, z: 0 };
    const rot = node.transform.m_LocalRotation || { x: 0, y: 0, z: 0, w: 1 };
    const scale = node.transform.m_LocalScale || { x: 1, y: 1, z: 1 };

    // Convert quaternion to euler (simplified)
    const euler = quaternionToEuler(rot);

    lines.push(`${indent}  geometry: "${geometry}"`);
    lines.push(`${indent}  position: [${pos.x}, ${pos.y}, ${pos.z}]`);
    if (euler.x !== 0 || euler.y !== 0 || euler.z !== 0) {
      lines.push(
        `${indent}  rotation: [${euler.x.toFixed(2)}, ${euler.y.toFixed(2)}, ${euler.z.toFixed(2)}]`
      );
    }
    if (scale.x !== 1 || scale.y !== 1 || scale.z !== 1) {
      lines.push(`${indent}  scale: [${scale.x}, ${scale.y}, ${scale.z}]`);
    }
  }

  // Physics
  const rigidbody = node.components.find((c) => c.type === 'Rigidbody');
  if (rigidbody) {
    const rbData = rigidbody.data as unknown as { Rigidbody: UnityRigidbody };
    const rb = rbData.Rigidbody || (rigidbody.data as unknown as UnityRigidbody);

    lines.push(`${indent}  physics: {`);
    lines.push(`${indent}    mass: ${rb.m_Mass || 1}`);
    if (rb.m_UseGravity === 0) lines.push(`${indent}    gravity: false`);
    if (rb.m_IsKinematic === 1) lines.push(`${indent}    type: "kinematic"`);
    lines.push(`${indent}  }`);
  }

  lines.push(`${indent}}`);
  lines.push('');

  // Recursively process children
  for (const child of node.children) {
    generateNode(child, depth, lines, stats);
  }
}

function generateLight(
  node: UnityGameObjectNode,
  comp: ResolvedComponent,
  _stats: UnityImportResult['stats']
): string {
  const lightData = comp.data as unknown as { Light: UnityLight };
  const light = lightData.Light || (comp.data as unknown as UnityLight);

  const lightTypes = ['spot_light', 'directional_light', 'point_light', 'area_light'];
  const lightType = lightTypes[light.m_Type] || 'point_light';

  const color = light.m_Color || { r: 1, g: 1, b: 1 };
  const hexColor = rgbToHex(color.r, color.g, color.b);

  const pos = node.transform?.m_LocalPosition || { x: 0, y: 0, z: 0 };

  return `  ${lightType} "${sanitizeName(node.name)}" {
    position: [${pos.x}, ${pos.y}, ${pos.z}]
    color: "${hexColor}"
    intensity: ${light.m_Intensity || 1}
  }
`;
}

function generateCamera(
  node: UnityGameObjectNode,
  comp: ResolvedComponent,
  _stats: UnityImportResult['stats']
): string {
  const camData = comp.data as unknown as { Camera: UnityCamera };
  const cam = camData.Camera || (comp.data as unknown as UnityCamera);

  const cameraType = cam.orthographic === 1 ? 'orthographic_camera' : 'perspective_camera';
  const pos = node.transform?.m_LocalPosition || { x: 0, y: 0, z: 0 };

  return `  ${cameraType} "${sanitizeName(node.name)}" {
    position: [${pos.x}, ${pos.y}, ${pos.z}]
    fov: ${cam.field_of_view || 60}
    near: ${cam.near_clip_plane || 0.1}
    far: ${cam.far_clip_plane || 1000}
  }
`;
}

/**
 * Map Unity component types to HoloScript traits.
 */
function mapComponentToTraits(comp: ResolvedComponent): string[] {
  const traits: string[] = [];

  switch (comp.type) {
    case 'Rigidbody':
      traits.push('physics');
      {
        const rbData = comp.data as unknown as { Rigidbody: UnityRigidbody };
        const rb = rbData.Rigidbody || (comp.data as unknown as UnityRigidbody);
        if (rb.m_IsKinematic === 1) traits.push('kinematic');
      }
      break;

    case 'BoxCollider':
    case 'SphereCollider':
    case 'CapsuleCollider':
    case 'MeshCollider':
      {
        const colData = comp.data as unknown as {
          BoxCollider?: UnityCollider;
          SphereCollider?: UnityCollider;
        };
        const col =
          colData.BoxCollider || colData.SphereCollider || (comp.data as unknown as UnityCollider);
        if (col.m_IsTrigger === 1) {
          traits.push('trigger');
        } else {
          traits.push('collidable');
        }
      }
      break;

    case 'MeshRenderer':
      // Could add visible trait, but it's default
      break;

    case 'XRGrabInteractable':
    case 'XRDirectInteractor':
    case 'VRTK_InteractableObject':
      traits.push('grabbable');
      break;

    case 'Animator':
      traits.push('animated');
      break;

    case 'AudioSource':
      traits.push('spatial_audio');
      break;
  }

  return traits;
}

// =============================================================================
// UTILITIES
// =============================================================================

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/^_+|_+$/g, '');
}

function quaternionToEuler(q: { x: number; y: number; z: number; w: number }): {
  x: number;
  y: number;
  z: number;
} {
  // Simplified quaternion to euler conversion
  const sinr_cosp = 2 * (q.w * q.x + q.y * q.z);
  const cosr_cosp = 1 - 2 * (q.x * q.x + q.y * q.y);
  const x = Math.atan2(sinr_cosp, cosr_cosp) * (180 / Math.PI);

  const sinp = Math.sqrt(1 + 2 * (q.w * q.y - q.x * q.z));
  const cosp = Math.sqrt(1 - 2 * (q.w * q.y - q.x * q.z));
  const y = (2 * Math.atan2(sinp, cosp) - Math.PI / 2) * (180 / Math.PI);

  const siny_cosp = 2 * (q.w * q.z + q.x * q.y);
  const cosy_cosp = 1 - 2 * (q.y * q.y + q.z * q.z);
  const z = Math.atan2(siny_cosp, cosy_cosp) * (180 / Math.PI);

  return { x, y, z };
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

export interface UnityImportOptions {
  /** Path to .unity or .prefab file */
  inputPath: string;
  /** Output path for .holo file (optional) */
  outputPath?: string;
  /** Scene name override */
  sceneName?: string;
  /** Include inactive GameObjects */
  includeInactive?: boolean;
}

/**
 * Import a Unity scene or prefab file into HoloScript.
 */
export async function importUnity(options: UnityImportOptions): Promise<UnityImportResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    // Read file
    const content = await fs.promises.readFile(options.inputPath, 'utf-8');
    const ext = path.extname(options.inputPath).toLowerCase();

    if (ext !== '.unity' && ext !== '.prefab') {
      errors.push(`Unsupported file type: ${ext}. Expected .unity or .prefab`);
      return {
        success: false,
        holoCode: '',
        sceneName: '',
        objectCount: 0,
        errors,
        warnings,
        stats: {
          gameObjectsImported: 0,
          componentsProcessed: 0,
          traitsGenerated: 0,
          lightsImported: 0,
          camerasImported: 0,
        },
      };
    }

    // Parse Unity YAML
    const documents = parseUnityYAML(content);
    if (documents.size === 0) {
      errors.push('No valid Unity documents found in file');
      return {
        success: false,
        holoCode: '',
        sceneName: '',
        objectCount: 0,
        errors,
        warnings,
        stats: {
          gameObjectsImported: 0,
          componentsProcessed: 0,
          traitsGenerated: 0,
          lightsImported: 0,
          camerasImported: 0,
        },
      };
    }

    // Determine scene name
    const sceneName =
      options.sceneName || path.basename(options.inputPath, path.extname(options.inputPath));

    // Build scene tree
    const scene = buildSceneTree(documents, sceneName);

    // Generate .holo code
    const { code, stats } = generateHoloCode(scene);

    // Write output if path provided
    if (options.outputPath) {
      await fs.promises.writeFile(options.outputPath, code, 'utf-8');
    }

    return {
      success: true,
      holoCode: code,
      sceneName,
      objectCount: stats.gameObjectsImported,
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
        gameObjectsImported: 0,
        componentsProcessed: 0,
        traitsGenerated: 0,
        lightsImported: 0,
        camerasImported: 0,
      },
    };
  }
}

// =============================================================================
// CLI EXPORT
// =============================================================================

export { parseUnityYAML, buildSceneTree, generateHoloCode };
