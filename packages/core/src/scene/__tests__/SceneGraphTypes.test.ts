/**
 * SceneGraphTypes.test.ts
 *
 * Tests for first-class scene graph types:
 * SceneNodeDescriptor, SceneEdge, SceneGraphDescriptor, SpatialRelation
 *
 * Validates type contracts, construction patterns, and interoperability
 * with existing SceneNode class and ISceneGraph export IR.
 */
import { describe, it, expect } from 'vitest';
import type {
  SpatialRelationType,
  SpatialRelation,
  SceneEdgeType,
  SceneEdge,
  SceneNodeDescriptor,
  SceneGraphDescriptor,
  SpatialVector3,
  ASTTransform,
  HoloScriptValue,
} from '../../types';

// =============================================================================
// HELPERS
// =============================================================================

function createTestTransform(
  px = 0, py = 0, pz = 0,
  rx = 0, ry = 0, rz = 0,
  sx = 1, sy = 1, sz = 1,
): ASTTransform {
  return {
    position: { x: px, y: py, z: pz },
    rotation: { x: rx, y: ry, z: rz },
    scale: { x: sx, y: sy, z: sz },
  };
}

function createTestNode(
  id: string,
  name: string,
  overrides?: Partial<SceneNodeDescriptor>,
): SceneNodeDescriptor {
  return {
    id,
    name,
    nodeType: 'object',
    transform: createTestTransform(),
    parentId: null,
    childIds: [],
    tags: [],
    layer: 0,
    visible: true,
    active: true,
    traits: [],
    properties: {},
    ...overrides,
  };
}

function createTestEdge(
  id: string,
  from: string,
  to: string,
  overrides?: Partial<SceneEdge>,
): SceneEdge {
  return {
    id,
    type: 'hierarchy',
    from,
    to,
    bidirectional: false,
    weight: 1.0,
    active: true,
    ...overrides,
  };
}

function createTestSpatialRelation(
  id: string,
  sourceNodeId: string,
  targetNodeId: string,
  type: SpatialRelationType = 'adjacent',
  overrides?: Partial<SpatialRelation>,
): SpatialRelation {
  return {
    id,
    type,
    sourceNodeId,
    targetNodeId,
    isConstraint: false,
    ...overrides,
  };
}

function createTestSceneGraph(
  name: string,
  overrides?: Partial<SceneGraphDescriptor>,
): SceneGraphDescriptor {
  const rootNode = createTestNode('root', 'Root', { nodeType: 'group' });
  const now = new Date().toISOString();
  const nodes = new Map<string, SceneNodeDescriptor>();
  nodes.set('root', rootNode);

  return {
    version: '1.0.0',
    name,
    nodes,
    edges: [],
    spatialRelations: [],
    rootId: 'root',
    coordinateSystem: 'y_up',
    unitScale: 1.0,
    metadata: {},
    createdAt: now,
    modifiedAt: now,
    ...overrides,
  };
}

// =============================================================================
// SPATIAL RELATION TYPES
// =============================================================================

describe('SpatialRelationType', () => {
  it('includes all hierarchical relation types', () => {
    const hierarchical: SpatialRelationType[] = ['parent_of', 'child_of', 'sibling_of'];
    for (const rel of hierarchical) {
      expect(typeof rel).toBe('string');
    }
  });

  it('includes all directional relation types', () => {
    const directional: SpatialRelationType[] = [
      'above', 'below', 'left_of', 'right_of',
      'in_front_of', 'behind',
    ];
    for (const rel of directional) {
      expect(typeof rel).toBe('string');
    }
  });

  it('includes containment and proximity types', () => {
    const containment: SpatialRelationType[] = [
      'inside', 'contains', 'adjacent', 'overlapping',
    ];
    for (const rel of containment) {
      expect(typeof rel).toBe('string');
    }
  });

  it('includes interaction-oriented types', () => {
    const interaction: SpatialRelationType[] = [
      'attached_to', 'aligned_with', 'facing', 'orbiting',
    ];
    for (const rel of interaction) {
      expect(typeof rel).toBe('string');
    }
  });
});

// =============================================================================
// SPATIAL RELATION
// =============================================================================

describe('SpatialRelation', () => {
  it('creates a basic relation', () => {
    const relation = createTestSpatialRelation('r1', 'nodeA', 'nodeB', 'above');
    expect(relation.id).toBe('r1');
    expect(relation.type).toBe('above');
    expect(relation.sourceNodeId).toBe('nodeA');
    expect(relation.targetNodeId).toBe('nodeB');
    expect(relation.isConstraint).toBe(false);
  });

  it('supports constraint mode with stiffness', () => {
    const relation = createTestSpatialRelation('r2', 'floor', 'table', 'above', {
      isConstraint: true,
      stiffness: 0.8,
      priority: 10,
    });
    expect(relation.isConstraint).toBe(true);
    expect(relation.stiffness).toBe(0.8);
    expect(relation.priority).toBe(10);
  });

  it('supports offset vectors', () => {
    const offset: SpatialVector3 = { x: 0, y: 1.5, z: 0 };
    const relation = createTestSpatialRelation('r3', 'base', 'lamp', 'above', {
      offset,
    });
    expect(relation.offset).toEqual({ x: 0, y: 1.5, z: 0 });
  });

  it('supports custom metadata', () => {
    const relation = createTestSpatialRelation('r4', 'a', 'b', 'attached_to', {
      metadata: {
        attachPoint: 'top_surface',
        breakForce: 100,
      },
    });
    expect(relation.metadata?.attachPoint).toBe('top_surface');
    expect(relation.metadata?.breakForce).toBe(100);
  });
});

// =============================================================================
// SCENE EDGE TYPE
// =============================================================================

describe('SceneEdgeType', () => {
  it('includes all expected edge types', () => {
    const edgeTypes: SceneEdgeType[] = [
      'hierarchy', 'spatial', 'dependency', 'dataflow',
      'physics_joint', 'audio_link', 'animation_link',
      'network_sync', 'reference',
    ];
    expect(edgeTypes).toHaveLength(9);
    for (const t of edgeTypes) {
      expect(typeof t).toBe('string');
    }
  });
});

// =============================================================================
// SCENE EDGE
// =============================================================================

describe('SceneEdge', () => {
  it('creates a hierarchy edge', () => {
    const edge = createTestEdge('e1', 'root', 'child1');
    expect(edge.id).toBe('e1');
    expect(edge.type).toBe('hierarchy');
    expect(edge.from).toBe('root');
    expect(edge.to).toBe('child1');
    expect(edge.bidirectional).toBe(false);
    expect(edge.weight).toBe(1.0);
    expect(edge.active).toBe(true);
  });

  it('creates a bidirectional physics joint edge', () => {
    const edge = createTestEdge('e2', 'bodyA', 'bodyB', {
      type: 'physics_joint',
      bidirectional: true,
      weight: 0.5,
      properties: {
        jointType: 'hinge',
        breakForce: 1000,
      },
    });
    expect(edge.type).toBe('physics_joint');
    expect(edge.bidirectional).toBe(true);
    expect(edge.weight).toBe(0.5);
    expect(edge.properties?.jointType).toBe('hinge');
  });

  it('supports spatial relation attachment', () => {
    const relation = createTestSpatialRelation('r1', 'shelf', 'book', 'above');
    const edge = createTestEdge('e3', 'shelf', 'book', {
      type: 'spatial',
      spatialRelation: relation,
    });
    expect(edge.type).toBe('spatial');
    expect(edge.spatialRelation?.type).toBe('above');
    expect(edge.spatialRelation?.sourceNodeId).toBe('shelf');
  });

  it('can be deactivated', () => {
    const edge = createTestEdge('e4', 'a', 'b', { active: false });
    expect(edge.active).toBe(false);
  });

  it('supports dataflow edges', () => {
    const edge = createTestEdge('e5', 'sensor', 'display', {
      type: 'dataflow',
      properties: {
        dataType: 'temperature',
        updateRate: 60,
      },
    });
    expect(edge.type).toBe('dataflow');
    expect(edge.properties?.dataType).toBe('temperature');
  });
});

// =============================================================================
// SCENE NODE DESCRIPTOR
// =============================================================================

describe('SceneNodeDescriptor', () => {
  it('creates a basic node', () => {
    const node = createTestNode('n1', 'TestNode');
    expect(node.id).toBe('n1');
    expect(node.name).toBe('TestNode');
    expect(node.nodeType).toBe('object');
    expect(node.parentId).toBeNull();
    expect(node.childIds).toEqual([]);
    expect(node.visible).toBe(true);
    expect(node.active).toBe(true);
    expect(node.layer).toBe(0);
    expect(node.tags).toEqual([]);
    expect(node.traits).toEqual([]);
  });

  it('creates a camera node with transform', () => {
    const node = createTestNode('cam1', 'MainCamera', {
      nodeType: 'camera',
      transform: createTestTransform(0, 5, -10, 0.3, 0, 0),
      tags: ['main_camera'],
      layer: 2,
    });
    expect(node.nodeType).toBe('camera');
    expect(node.transform.position).toEqual({ x: 0, y: 5, z: -10 });
    expect(node.transform.rotation.x).toBeCloseTo(0.3);
    expect(node.tags).toContain('main_camera');
    expect(node.layer).toBe(2);
  });

  it('creates a group node with children', () => {
    const group = createTestNode('grp1', 'Props', {
      nodeType: 'group',
      childIds: ['prop1', 'prop2', 'prop3'],
    });
    expect(group.nodeType).toBe('group');
    expect(group.childIds).toHaveLength(3);
    expect(group.childIds).toContain('prop2');
  });

  it('creates a node with parent reference', () => {
    const child = createTestNode('c1', 'Child', {
      parentId: 'root',
    });
    expect(child.parentId).toBe('root');
  });

  it('supports trait attachment', () => {
    const node = createTestNode('obj1', 'InteractiveBox', {
      traits: ['grabbable', 'throwable', 'hoverable'],
      properties: {
        shape: 'cube',
        color: '#ff0000',
        size: 1,
      } as Record<string, HoloScriptValue>,
    });
    expect(node.traits).toHaveLength(3);
    expect(node.traits).toContain('grabbable');
    expect(node.properties.shape).toBe('cube');
  });

  it('supports agent node type', () => {
    const agent = createTestNode('npc1', 'Guard', {
      nodeType: 'agent',
      traits: ['behavior_tree', 'perception', 'patrol'],
      metadata: { aiModel: 'guard_patrol_v2' },
    });
    expect(agent.nodeType).toBe('agent');
    expect(agent.metadata?.aiModel).toBe('guard_patrol_v2');
  });

  it('supports zone node type', () => {
    const zone = createTestNode('zone1', 'SafeZone', {
      nodeType: 'zone',
      transform: createTestTransform(0, 0, 0, 0, 0, 0, 10, 5, 10),
      properties: {
        bounds: { type: 'box', size: [10, 5, 10] },
      } as Record<string, HoloScriptValue>,
    });
    expect(zone.nodeType).toBe('zone');
    expect(zone.transform.scale).toEqual({ x: 10, y: 5, z: 10 });
  });

  it('supports anchor node type', () => {
    const anchor = createTestNode('anchor1', 'WorldAnchor', {
      nodeType: 'anchor',
      metadata: {
        anchorType: 'persistent',
        cloudAnchorId: 'abc123',
      },
    });
    expect(anchor.nodeType).toBe('anchor');
    expect(anchor.metadata?.anchorType).toBe('persistent');
  });

  it('supports inactive and invisible nodes', () => {
    const node = createTestNode('hidden1', 'HiddenObject', {
      visible: false,
      active: false,
    });
    expect(node.visible).toBe(false);
    expect(node.active).toBe(false);
  });
});

// =============================================================================
// SCENE GRAPH DESCRIPTOR
// =============================================================================

describe('SceneGraphDescriptor', () => {
  it('creates an empty scene graph', () => {
    const graph = createTestSceneGraph('TestScene');
    expect(graph.version).toBe('1.0.0');
    expect(graph.name).toBe('TestScene');
    expect(graph.nodes.size).toBe(1);
    expect(graph.nodes.has('root')).toBe(true);
    expect(graph.edges).toEqual([]);
    expect(graph.spatialRelations).toEqual([]);
    expect(graph.rootId).toBe('root');
    expect(graph.coordinateSystem).toBe('y_up');
    expect(graph.unitScale).toBe(1.0);
  });

  it('supports z_up coordinate system', () => {
    const graph = createTestSceneGraph('RoboticsScene', {
      coordinateSystem: 'z_up',
      unitScale: 0.01, // centimeters
    });
    expect(graph.coordinateSystem).toBe('z_up');
    expect(graph.unitScale).toBe(0.01);
  });

  it('builds a multi-node scene graph with hierarchy', () => {
    const nodes = new Map<string, SceneNodeDescriptor>();
    const root = createTestNode('root', 'Root', {
      nodeType: 'group',
      childIds: ['floor', 'table'],
    });
    const floor = createTestNode('floor', 'Floor', {
      parentId: 'root',
      nodeType: 'object',
      transform: createTestTransform(0, 0, 0, 0, 0, 0, 20, 0.1, 20),
    });
    const table = createTestNode('table', 'Table', {
      parentId: 'root',
      childIds: ['lamp'],
      nodeType: 'object',
      transform: createTestTransform(3, 0, 2),
    });
    const lamp = createTestNode('lamp', 'Lamp', {
      parentId: 'table',
      nodeType: 'light',
      transform: createTestTransform(0, 1.2, 0),
    });

    nodes.set('root', root);
    nodes.set('floor', floor);
    nodes.set('table', table);
    nodes.set('lamp', lamp);

    const edges = [
      createTestEdge('e1', 'root', 'floor'),
      createTestEdge('e2', 'root', 'table'),
      createTestEdge('e3', 'table', 'lamp'),
    ];

    const spatialRelations = [
      createTestSpatialRelation('r1', 'table', 'floor', 'above'),
      createTestSpatialRelation('r2', 'lamp', 'table', 'above', {
        offset: { x: 0, y: 1.2, z: 0 },
      }),
    ];

    const graph = createTestSceneGraph('LivingRoom', {
      nodes,
      edges,
      spatialRelations,
    });

    expect(graph.nodes.size).toBe(4);
    expect(graph.edges).toHaveLength(3);
    expect(graph.spatialRelations).toHaveLength(2);

    // Verify hierarchy consistency
    const tableNode = graph.nodes.get('table')!;
    expect(tableNode.parentId).toBe('root');
    expect(tableNode.childIds).toContain('lamp');

    // Verify spatial relations
    const lampAboveTable = graph.spatialRelations.find(
      r => r.sourceNodeId === 'lamp' && r.targetNodeId === 'table'
    );
    expect(lampAboveTable?.type).toBe('above');
    expect(lampAboveTable?.offset?.y).toBe(1.2);
  });

  it('supports scene-level metadata', () => {
    const graph = createTestSceneGraph('MetadataScene', {
      description: 'A test scene with rich metadata',
      metadata: {
        author: 'HoloScript Admin',
        targetPlatform: 'visionOS',
        lightingMode: 'baked',
        polyBudget: 100000,
      },
    });
    expect(graph.description).toBe('A test scene with rich metadata');
    expect(graph.metadata.author).toBe('HoloScript Admin');
    expect(graph.metadata.polyBudget).toBe(100000);
  });

  it('supports timestamp tracking', () => {
    const before = new Date().toISOString();
    const graph = createTestSceneGraph('TimedScene');
    const after = new Date().toISOString();

    expect(graph.createdAt >= before).toBe(true);
    expect(graph.createdAt <= after).toBe(true);
    expect(graph.modifiedAt >= before).toBe(true);
  });

  it('handles complex edge types in a single graph', () => {
    const nodes = new Map<string, SceneNodeDescriptor>();
    nodes.set('root', createTestNode('root', 'Root', { nodeType: 'group', childIds: ['sensor', 'display', 'body1', 'body2'] }));
    nodes.set('sensor', createTestNode('sensor', 'TempSensor', { parentId: 'root' }));
    nodes.set('display', createTestNode('display', 'Dashboard', { parentId: 'root' }));
    nodes.set('body1', createTestNode('body1', 'DoorFrame', { parentId: 'root' }));
    nodes.set('body2', createTestNode('body2', 'Door', { parentId: 'root' }));

    const edges: SceneEdge[] = [
      createTestEdge('e-hier-1', 'root', 'sensor', { type: 'hierarchy' }),
      createTestEdge('e-hier-2', 'root', 'display', { type: 'hierarchy' }),
      createTestEdge('e-data', 'sensor', 'display', {
        type: 'dataflow',
        properties: { dataType: 'float', label: 'temperature' },
      }),
      createTestEdge('e-joint', 'body1', 'body2', {
        type: 'physics_joint',
        bidirectional: true,
        properties: { jointType: 'hinge', axis: [0, 1, 0] },
      }),
    ];

    const graph = createTestSceneGraph('MixedEdgeScene', { nodes, edges });

    const hierarchyEdges = graph.edges.filter(e => e.type === 'hierarchy');
    const dataflowEdges = graph.edges.filter(e => e.type === 'dataflow');
    const jointEdges = graph.edges.filter(e => e.type === 'physics_joint');

    expect(hierarchyEdges).toHaveLength(2);
    expect(dataflowEdges).toHaveLength(1);
    expect(jointEdges).toHaveLength(1);
    expect(jointEdges[0].bidirectional).toBe(true);
  });

  it('supports node querying by type', () => {
    const nodes = new Map<string, SceneNodeDescriptor>();
    nodes.set('root', createTestNode('root', 'Root', { nodeType: 'group', childIds: ['cam', 'sun', 'obj1', 'npc1'] }));
    nodes.set('cam', createTestNode('cam', 'Camera', { parentId: 'root', nodeType: 'camera' }));
    nodes.set('sun', createTestNode('sun', 'Sun', { parentId: 'root', nodeType: 'light' }));
    nodes.set('obj1', createTestNode('obj1', 'Cube', { parentId: 'root', nodeType: 'object' }));
    nodes.set('npc1', createTestNode('npc1', 'NPC', { parentId: 'root', nodeType: 'agent' }));

    const graph = createTestSceneGraph('QueryScene', { nodes });

    // Query by type
    const cameras = Array.from(graph.nodes.values()).filter(n => n.nodeType === 'camera');
    const lights = Array.from(graph.nodes.values()).filter(n => n.nodeType === 'light');
    const agents = Array.from(graph.nodes.values()).filter(n => n.nodeType === 'agent');

    expect(cameras).toHaveLength(1);
    expect(cameras[0].name).toBe('Camera');
    expect(lights).toHaveLength(1);
    expect(agents).toHaveLength(1);
    expect(agents[0].name).toBe('NPC');
  });

  it('supports node querying by tag', () => {
    const nodes = new Map<string, SceneNodeDescriptor>();
    nodes.set('root', createTestNode('root', 'Root', { nodeType: 'group' }));
    nodes.set('a', createTestNode('a', 'A', { tags: ['interactive', 'destructible'] }));
    nodes.set('b', createTestNode('b', 'B', { tags: ['interactive'] }));
    nodes.set('c', createTestNode('c', 'C', { tags: ['static'] }));

    const graph = createTestSceneGraph('TagScene', { nodes });

    const interactive = Array.from(graph.nodes.values()).filter(
      n => n.tags.includes('interactive'),
    );
    expect(interactive).toHaveLength(2);

    const destructible = Array.from(graph.nodes.values()).filter(
      n => n.tags.includes('destructible'),
    );
    expect(destructible).toHaveLength(1);
    expect(destructible[0].id).toBe('a');
  });
});

// =============================================================================
// INTEROPERABILITY CHECKS
// =============================================================================

describe('Type Interoperability', () => {
  it('SceneNodeDescriptor transform is compatible with ASTTransform', () => {
    const transform: ASTTransform = {
      position: { x: 1, y: 2, z: 3 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    };
    const node = createTestNode('n1', 'Node', { transform });
    expect(node.transform.position).toEqual(transform.position);
    expect(node.transform.rotation).toEqual(transform.rotation);
    expect(node.transform.scale).toEqual(transform.scale);
  });

  it('SceneEdge from/to IDs can reference SceneNodeDescriptor IDs', () => {
    const node1 = createTestNode('a', 'NodeA');
    const node2 = createTestNode('b', 'NodeB');
    const edge = createTestEdge('e1', node1.id, node2.id);
    expect(edge.from).toBe('a');
    expect(edge.to).toBe('b');
  });

  it('SpatialRelation node IDs reference SceneNodeDescriptor IDs', () => {
    const node1 = createTestNode('shelf', 'Shelf');
    const node2 = createTestNode('book', 'Book');
    const relation = createTestSpatialRelation('r1', node1.id, node2.id, 'contains');
    expect(relation.sourceNodeId).toBe('shelf');
    expect(relation.targetNodeId).toBe('book');
    expect(relation.type).toBe('contains');
  });

  it('SceneGraphDescriptor can represent full scene with all type components', () => {
    const nodes = new Map<string, SceneNodeDescriptor>();
    nodes.set('root', createTestNode('root', 'Root', { nodeType: 'group', childIds: ['a', 'b'] }));
    nodes.set('a', createTestNode('a', 'NodeA', { parentId: 'root' }));
    nodes.set('b', createTestNode('b', 'NodeB', { parentId: 'root' }));

    const edges: SceneEdge[] = [
      createTestEdge('e1', 'root', 'a'),
      createTestEdge('e2', 'root', 'b'),
      createTestEdge('e3', 'a', 'b', { type: 'spatial' }),
    ];

    const spatialRelations: SpatialRelation[] = [
      createTestSpatialRelation('r1', 'a', 'b', 'adjacent'),
    ];

    const graph = createTestSceneGraph('FullScene', { nodes, edges, spatialRelations });

    // All nodes referenced by edges exist
    for (const edge of graph.edges) {
      expect(graph.nodes.has(edge.from)).toBe(true);
      expect(graph.nodes.has(edge.to)).toBe(true);
    }

    // All nodes referenced by spatial relations exist
    for (const rel of graph.spatialRelations) {
      expect(graph.nodes.has(rel.sourceNodeId)).toBe(true);
      expect(graph.nodes.has(rel.targetNodeId)).toBe(true);
    }

    // Root ID references an existing node
    expect(graph.nodes.has(graph.rootId)).toBe(true);

    // Parent/child consistency
    const nodeA = graph.nodes.get('a')!;
    const rootNode = graph.nodes.get('root')!;
    expect(nodeA.parentId).toBe('root');
    expect(rootNode.childIds).toContain('a');
  });
});
