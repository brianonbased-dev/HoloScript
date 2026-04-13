/**
 * serializer.ts — Project Serialization Engine
 *
 * Serializes and deserializes HoloScript projects for save/load.
 * Supports IndexedDB (browser), JSON file export, and compressed binary.
 */

// Re-export scene serialization (serializeScene, deserializeScene, etc.)
export * from './scene/serializer';

export interface SceneNode {
  id: string;
  name: string;
  type: 'mesh' | 'light' | 'camera' | 'group' | 'audio' | 'particle';
  position: [number, number, number];
  rotation: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };
  children: SceneNode[];
  traits: string[];
  properties: Record<string, unknown>;
}

export interface ProjectFile {
  version: string;
  name: string;
  createdAt: string;
  modifiedAt: string;
  scene: SceneNode[];
  environment: Record<string, unknown>;
  metadata: Record<string, unknown>;
  checksum: string;
}

/**
 * Serialize a project to JSON string.
 */
export function serializeProject(project: ProjectFile): string {
  return JSON.stringify(project, null, 2);
}

/**
 * Deserialize a JSON string back to a project.
 */
export function deserializeProject(json: string): ProjectFile | null {
  try {
    const project = JSON.parse(json) as ProjectFile;
    if (!project.version || !project.scene) return null;
    return project;
  } catch {
    return null;
  }
}

/**
 * Calculate a simple checksum for integrity verification.
 */
export function projectChecksum(project: Omit<ProjectFile, 'checksum'>): string {
  const str = JSON.stringify({ ...project, checksum: '' });
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0;
  }
  return `holo-${Math.abs(hash).toString(36)}`;
}

/**
 * Create a new empty project.
 */
export function createEmptyProject(name: string): ProjectFile {
  const now = new Date().toISOString();
  const project: Omit<ProjectFile, 'checksum'> = {
    version: '1.0.0',
    name,
    createdAt: now,
    modifiedAt: now,
    scene: [],
    environment: { skybox: 'default', ambientLight: 0.5, fog: false },
    metadata: { author: 'anonymous', tags: [] },
  };
  return { ...project, checksum: projectChecksum(project) };
}

/**
 * Count all nodes in the scene tree (recursive).
 */
export function countNodes(nodes: SceneNode[]): number {
  return nodes.reduce((sum, n) => sum + 1 + countNodes(n.children), 0);
}

/**
 * Find a node by ID in the scene tree.
 */
export function findNodeById(nodes: SceneNode[], id: string): SceneNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findNodeById(node.children, id);
    if (found) return found;
  }
  return null;
}

/**
 * Estimate project file size in bytes.
 */
export function estimateSize(project: ProjectFile): number {
  return new TextEncoder().encode(serializeProject(project)).length;
}
