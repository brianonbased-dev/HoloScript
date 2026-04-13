/**
 * Sprint 23 Acceptance Tests â€” Scene + Math
 *
 * Covers:
 *   packages/core/src/scene/
 *     SceneNode       â€” hierarchy, transforms, tags, traversal
 *     SceneSerializer â€” node-based serialization, trait/Set/Map sanitization
 *     SceneDeserializer â€” reconstruct node tree, Map trait rebuild
 *     SceneManager    â€” save/load/has/delete/list/exportJSON/importJSON
 *     StateSnapshotCapture â€” capture with subsystems, defaults
 *
 *   packages/core/src/math/
 *     SplinePath      â€” add/remove points, evaluate, arc length, tangent
 *     SplineFollower  â€” playback, update, markers, onComplete
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { SceneNode } from '@holoscript/engine/scene';
import { SceneSerializer } from '@holoscript/engine/scene';
import { SceneDeserializer } from '@holoscript/engine/scene';
import { SceneManager } from '@holoscript/engine/scene';
import { StateSnapshotCapture } from '@holoscript/engine/scene';
import { SplinePath } from '../math/SplinePath.js';
import { SplineFollower } from '../math/SplineFollower.js';

// ---------------------------------------------------------------------------
// Helper: minimal HSPlusNode for serialization tests
// ---------------------------------------------------------------------------
function makeNode(
  id: string,
  type = 'entity',
  children: any[] = [],
  traits?: Map<string, any>
): any {
  return { id, type, properties: {}, traits: traits ?? new Map(), children };
}

// =============================================================================
// Feature 1A: SceneNode â€” constructor and transforms
// =============================================================================

describe('Feature 1A: SceneNode â€” constructor and transforms', () => {
  it('constructor sets id', () => {
    const n = new SceneNode('node-1');
    expect(n.id).toBe('node-1');
  });

  it('name defaults to id when not provided', () => {
    const n = new SceneNode('abc');
    expect(n.name).toBe('abc');
  });

  it('name is set when provided', () => {
    const n = new SceneNode('id', 'My Node');
    expect(n.name).toBe('My Node');
  });

  it('setPosition updates local transform', () => {
    const n = new SceneNode('n');
    n.setPosition(1, 2, 3);
    const t = n.getLocalTransform();
    expect(t.position).toEqual({ x: 1, y: 2, z: 3 });
  });

  it('setRotation updates local transform', () => {
    const n = new SceneNode('n');
    n.setRotation(10, 20, 30);
    const t = n.getLocalTransform();
    expect(t.rotation).toEqual({ x: 10, y: 20, z: 30 });
  });

  it('setScale updates local transform', () => {
    const n = new SceneNode('n');
    n.setScale(2, 2, 2);
    const t = n.getLocalTransform();
    expect(t.scale).toEqual({ x: 2, y: 2, z: 2 });
  });

  it('getWorldPosition reflects setPosition for root node', () => {
    const n = new SceneNode('n');
    n.setPosition(5, 10, 15);
    const wp = n.getWorldPosition();
    expect(wp.x).toBeCloseTo(5, 3);
    expect(wp.y).toBeCloseTo(10, 3);
    expect(wp.z).toBeCloseTo(15, 3);
  });

  it('getWorldMatrix returns 16-element Float64Array', () => {
    const n = new SceneNode('n');
    const m = n.getWorldMatrix();
    expect(m).toBeInstanceOf(Float64Array);
    expect(m.length).toBe(16);
  });
});

// =============================================================================
// Feature 1B: SceneNode â€” hierarchy
// =============================================================================

describe('Feature 1B: SceneNode â€” hierarchy', () => {
  let parent: SceneNode;
  let child: SceneNode;

  beforeEach(() => {
    parent = new SceneNode('parent');
    child = new SceneNode('child');
  });

  it('addChild links child.getParent() to parent', () => {
    parent.addChild(child);
    expect(child.getParent()).toBe(parent);
  });

  it('getChildren() includes added child', () => {
    parent.addChild(child);
    expect(parent.getChildren()).toContain(child);
  });

  it('getChildCount() reflects number of children', () => {
    parent.addChild(child);
    parent.addChild(new SceneNode('c2'));
    expect(parent.getChildCount()).toBe(2);
  });

  it('removeChild disconnects child', () => {
    parent.addChild(child);
    parent.removeChild(child);
    expect(parent.getChildren()).not.toContain(child);
    expect(child.getParent()).toBeNull();
  });

  it('traverse visits parent and all descendants', () => {
    const grandchild = new SceneNode('gc');
    parent.addChild(child);
    child.addChild(grandchild);

    const visited: string[] = [];
    parent.traverse((n) => visited.push(n.id));
    expect(visited).toContain('parent');
    expect(visited).toContain('child');
    expect(visited).toContain('gc');
    expect(visited.length).toBe(3);
  });

  it('traverse passes correct depth', () => {
    parent.addChild(child);
    const depths: number[] = [];
    parent.traverse((_n, d) => depths.push(d));
    expect(depths[0]).toBe(0); // parent
    expect(depths[1]).toBe(1); // child
  });
});

// =============================================================================
// Feature 1C: SceneNode â€” tags and visibility
// =============================================================================

describe('Feature 1C: SceneNode â€” tags and visibility', () => {
  let n: SceneNode;

  beforeEach(() => {
    n = new SceneNode('n');
  });

  it('visible defaults to true', () => {
    expect(n.visible).toBe(true);
  });

  it('visible can be set to false', () => {
    n.visible = false;
    expect(n.visible).toBe(false);
  });

  it('layer defaults to 0', () => {
    expect(n.layer).toBe(0);
  });

  it('tags is a Set', () => {
    expect(n.tags).toBeInstanceOf(Set);
  });

  it('tags can be added and queried', () => {
    n.tags.add('selectable');
    expect(n.tags.has('selectable')).toBe(true);
  });
});

// =============================================================================
// Feature 2A: SceneSerializer â€” serialize HSPlusNode
// =============================================================================

describe('Feature 2A: SceneSerializer â€” node serialization', () => {
  let ser: SceneSerializer;

  beforeEach(() => {
    ser = new SceneSerializer();
  });

  it('serialize(node) returns a SerializedScene', () => {
    const scene = ser.serialize(makeNode('root'));
    expect(scene).toBeDefined();
  });

  it('version is 1', () => {
    expect(ser.serialize(makeNode('root')).version).toBe(1);
  });

  it('name is set when provided', () => {
    expect(ser.serialize(makeNode('root'), 'MyScene').name).toBe('MyScene');
  });

  it('timestamp is an ISO string', () => {
    const ts = ser.serialize(makeNode('root')).timestamp;
    expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('root has id, type, properties, traits, children', () => {
    const root = ser.serialize(makeNode('r', 'scene')).root;
    expect(root).toHaveProperty('id');
    expect(root).toHaveProperty('type');
    expect(root).toHaveProperty('properties');
    expect(root).toHaveProperty('traits');
    expect(root).toHaveProperty('children');
  });

  it('children are serialized recursively', () => {
    const parent = makeNode('parent', 'entity', [makeNode('child')]);
    const scene = ser.serialize(parent);
    expect(scene.root.children.length).toBe(1);
    expect(scene.root.children[0].id).toBe('child');
  });
});

// =============================================================================
// Feature 2B: SceneSerializer â€” sanitization
// =============================================================================

describe('Feature 2B: SceneSerializer â€” sanitization', () => {
  let ser: SceneSerializer;

  beforeEach(() => {
    ser = new SceneSerializer();
  });

  it('Map traits get serialized as plain objects', () => {
    const traits = new Map([['color', '#f00']]);
    const node = makeNode('n', 'entity', [], traits);
    const serialized = ser.serializeNode(node);
    expect(typeof serialized.traits).toBe('object');
    expect(Array.isArray(serialized.traits)).toBe(false);
  });

  it('Set properties get serialized as arrays', () => {
    const node = {
      id: 'n',
      type: 'entity',
      properties: { tags: new Set(['a', 'b']) },
      traits: new Map(),
      children: [],
    };
    const serialized = ser.serializeNode(node);
    expect(Array.isArray(serialized.properties.tags)).toBe(true);
  });

  it('function values are removed from traits', () => {
    const traits = new Map([['fn', () => {}]]);
    const node = makeNode('n', 'entity', [], traits);
    const serialized = ser.serializeNode(node);
    expect(serialized.traits['fn']).toBeUndefined();
  });

  it('_prefixed property keys are stripped', () => {
    const node = {
      id: 'n',
      type: 'entity',
      properties: { _internal: 'hidden', visible: true },
      traits: new Map(),
      children: [],
    };
    const serialized = ser.serializeNode(node);
    expect(serialized.properties['_internal']).toBeUndefined();
    expect(serialized.properties['visible']).toBe(true);
  });

  it('toJSON returns a parseable JSON string', () => {
    const json = ser.toJSON(makeNode('root'));
    expect(() => JSON.parse(json)).not.toThrow();
  });
});

// =============================================================================
// Feature 2C: SceneDeserializer â€” reconstruct node tree
// =============================================================================

describe('Feature 2C: SceneDeserializer â€” deserialize', () => {
  let ser: SceneSerializer;
  let deser: SceneDeserializer;

  beforeEach(() => {
    ser = new SceneSerializer();
    deser = new SceneDeserializer();
  });

  it('deserialize() returns a node with id', () => {
    const scene = ser.serialize(makeNode('root', 'scene'));
    const node = deser.deserialize(scene);
    expect(node.id).toBe('root');
  });

  it('deserialized node type matches', () => {
    const scene = ser.serialize(makeNode('root', 'landscape'));
    const node = deser.deserialize(scene);
    expect(node.type).toBe('landscape');
  });

  it('traits is a Map after deserialization', () => {
    const traits = new Map([['speed', 5]]);
    const scene = ser.serialize(makeNode('root', 'entity', [], traits));
    const node = deser.deserialize(scene);
    expect(node.traits).toBeInstanceOf(Map);
  });

  it('fromJSON() round-trip preserves scene name', () => {
    const json = ser.toJSON(makeNode('root'), 'LevelOne');
    const result = deser.fromJSON(json);
    expect(result.name).toBe('LevelOne');
  });

  it('fromJSON() children are reconstructed', () => {
    const parent = makeNode('p', 'entity', [makeNode('c1'), makeNode('c2')]);
    const json = ser.toJSON(parent);
    const result = deser.fromJSON(json);
    expect(result.node.children.length).toBe(2);
  });
});

// =============================================================================
// Feature 3A: SceneManager â€” save / load / has / delete
// =============================================================================

describe('Feature 3A: SceneManager â€” save/load/has/delete', () => {
  let mgr: SceneManager;

  beforeEach(() => {
    mgr = new SceneManager();
  });

  it('save() makes has() true', () => {
    mgr.save('level1', makeNode('root'));
    expect(mgr.has('level1')).toBe(true);
  });

  it('load() returns the saved node', () => {
    mgr.save('level1', makeNode('root'));
    const result = mgr.load('level1');
    expect(result).not.toBeNull();
    expect(result?.node).toBeDefined();
  });

  it('load() returns null for unknown scene', () => {
    expect(mgr.load('nope')).toBeNull();
  });

  it('delete() removes scene', () => {
    mgr.save('tmp', makeNode('root'));
    mgr.delete('tmp');
    expect(mgr.has('tmp')).toBe(false);
  });

  it('count reflects saved scenes', () => {
    mgr.save('a', makeNode('root'));
    mgr.save('b', makeNode('root'));
    expect(mgr.count).toBe(2);
  });

  it('list() entries have name, timestamp, nodeCount', () => {
    mgr.save('scene1', makeNode('root'));
    const entries = mgr.list();
    expect(entries[0]).toHaveProperty('name', 'scene1');
    expect(entries[0]).toHaveProperty('timestamp');
    expect(entries[0]).toHaveProperty('nodeCount');
  });
});

// =============================================================================
// Feature 3B: SceneManager â€” exportJSON / importJSON
// =============================================================================

describe('Feature 3B: SceneManager â€” exportJSON/importJSON', () => {
  let mgr: SceneManager;

  beforeEach(() => {
    mgr = new SceneManager();
  });

  it('exportJSON() returns a JSON string', () => {
    mgr.save('s', makeNode('root'));
    const json = mgr.exportJSON('s');
    expect(typeof json).toBe('string');
    expect(() => JSON.parse(json!)).not.toThrow();
  });

  it('exportJSON() returns null for unknown scene', () => {
    expect(mgr.exportJSON('unknown')).toBeNull();
  });

  it('importJSON() restores scene by name', () => {
    mgr.save('original', makeNode('root'));
    const json = mgr.exportJSON('original')!;
    const mgr2 = new SceneManager();
    const name = mgr2.importJSON(json);
    expect(name).toBe('original');
    expect(mgr2.has('original')).toBe(true);
  });
});

// =============================================================================
// Feature 3C: StateSnapshotCapture â€” capture
// =============================================================================

describe('Feature 3C: StateSnapshotCapture â€” capture', () => {
  let cap: StateSnapshotCapture;

  beforeEach(() => {
    cap = new StateSnapshotCapture();
  });

  it('capture() returns an object with timestamp', () => {
    const snap = cap.capture({});
    expect(snap.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('capture() with no options has empty animation ids', () => {
    expect(cap.capture({}).animation.activeClipIds).toHaveLength(0);
  });

  it('capture() uses animationEngine.getActiveIds()', () => {
    const snap = cap.capture({ animationEngine: { getActiveIds: () => ['clip1', 'clip2'] } });
    expect(snap.animation.activeClipIds).toContain('clip1');
  });

  it('capture() records particle systems', () => {
    const ps = { id: 'ps1', isEmitting: () => true, getActiveCount: () => 10 };
    const snap = cap.capture({ particleSystems: [ps] });
    expect(snap.particles[0].emitterId).toBe('ps1');
    expect(snap.particles[0].isEmitting).toBe(true);
    expect(snap.particles[0].activeCount).toBe(10);
  });

  it('capture() records UI keyboard state', () => {
    const snap = cap.capture({ keyboardSystem: { focusedInputId: 'input-1', cursorIndex: 3 } });
    expect(snap.ui.focusedInputId).toBe('input-1');
    expect(snap.ui.cursorIndex).toBe(3);
  });

  it('capture() stores custom data', () => {
    const snap = cap.capture({ custom: { level: 5, health: 80 } });
    expect(snap.custom.level).toBe(5);
  });
});

// =============================================================================
// Feature 4A: SplinePath â€” points and evaluate
// =============================================================================

describe('Feature 4A: SplinePath â€” points and evaluate', () => {
  let sp: SplinePath;

  beforeEach(() => {
    sp = new SplinePath();
    sp.setType('linear');
  });

  it('addPoint increases getPointCount()', () => {
    sp.addPoint(0, 0);
    sp.addPoint(10, 0);
    expect(sp.getPointCount()).toBe(2);
  });

  it('removePoint decreases getPointCount()', () => {
    sp.addPoint(0, 0);
    sp.addPoint(10, 0);
    sp.removePoint(0);
    expect(sp.getPointCount()).toBe(1);
  });

  it('evaluate(0) returns first point (linear)', () => {
    sp.addPoint(1, 2, 3);
    sp.addPoint(10, 20, 30);
    const p = sp.evaluate(0);
    expect(p.x).toBeCloseTo(1, 3);
    expect(p.y).toBeCloseTo(2, 3);
  });

  it('evaluate(1) returns last point (linear)', () => {
    sp.addPoint(0, 0);
    sp.addPoint(10, 0);
    const p = sp.evaluate(1);
    expect(p.x).toBeCloseTo(10, 3);
  });

  it('evaluate(0.5) returns midpoint (linear, equal points)', () => {
    sp.addPoint(0, 0);
    sp.addPoint(10, 0);
    const p = sp.evaluate(0.5);
    expect(p.x).toBeCloseTo(5, 3);
  });

  it('empty spline evaluate returns 0,0,0', () => {
    const p = sp.evaluate(0.5);
    expect(p).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('setType/getType round-trip', () => {
    sp.setType('catmull-rom');
    expect(sp.getType()).toBe('catmull-rom');
  });

  it('setLoop/isLoop round-trip', () => {
    sp.setLoop(true);
    expect(sp.isLoop()).toBe(true);
  });

  it('getPoints() returns a copy', () => {
    sp.addPoint(1, 2);
    const pts = sp.getPoints();
    pts.push({ x: 999, y: 999, z: 0 });
    expect(sp.getPointCount()).toBe(1);
  });
});

// =============================================================================
// Feature 4B: SplinePath â€” arc length and tangent
// =============================================================================

describe('Feature 4B: SplinePath â€” arc length and tangent', () => {
  it('getLength() for two points = Euclidean distance (linear)', () => {
    const sp = new SplinePath();
    sp.setType('linear');
    sp.addPoint(0, 0, 0);
    sp.addPoint(3, 4, 0);
    // Distance = 5
    expect(sp.getLength()).toBeCloseTo(5, 1);
  });

  it('evaluateAtDistance(0) returns start', () => {
    const sp = new SplinePath();
    sp.setType('linear');
    sp.addPoint(0, 0, 0);
    sp.addPoint(10, 0, 0);
    const p = sp.evaluateAtDistance(0);
    expect(p.x).toBeCloseTo(0, 2);
  });

  it('evaluateAtDistance(totalLength) returns end', () => {
    const sp = new SplinePath();
    sp.setType('linear');
    sp.addPoint(0, 0, 0);
    sp.addPoint(10, 0, 0);
    const p = sp.evaluateAtDistance(sp.getLength());
    expect(p.x).toBeCloseTo(10, 1);
  });

  it('getTangent() returns a unit vector', () => {
    const sp = new SplinePath();
    sp.setType('linear');
    sp.addPoint(0, 0, 0);
    sp.addPoint(1, 0, 0);
    const tang = sp.getTangent(0.5);
    const len = Math.sqrt(tang.x ** 2 + tang.y ** 2 + tang.z ** 2);
    expect(len).toBeCloseTo(1, 2);
  });

  it('getTangent() points in correct direction (x-axis path)', () => {
    const sp = new SplinePath();
    sp.setType('linear');
    sp.addPoint(0, 0, 0);
    sp.addPoint(10, 0, 0);
    const tang = sp.getTangent(0.5);
    expect(tang.x).toBeGreaterThan(0);
    expect(Math.abs(tang.y)).toBeLessThan(0.01);
  });
});

// =============================================================================
// Feature 5A: SplineFollower â€” playback control
// =============================================================================

describe('Feature 5A: SplineFollower â€” playback', () => {
  let sp: SplinePath;
  let sf: SplineFollower;

  beforeEach(() => {
    sp = new SplinePath();
    sp.setType('linear');
    sp.addPoint(0, 0, 0);
    sp.addPoint(10, 0, 0);
    sf = new SplineFollower(sp);
  });

  it('isPlaying() starts false', () => {
    expect(sf.isPlaying()).toBe(false);
  });

  it('play() sets isPlaying to true', () => {
    sf.play();
    expect(sf.isPlaying()).toBe(true);
  });

  it('pause() sets isPlaying to false', () => {
    sf.play();
    sf.pause();
    expect(sf.isPlaying()).toBe(false);
  });

  it('stop() sets isPlaying to false and t to 0', () => {
    sf.play();
    sf.setT(0.5);
    sf.stop();
    expect(sf.isPlaying()).toBe(false);
    expect(sf.getT()).toBe(0);
  });

  it('setT/getT round-trip', () => {
    sf.setT(0.3);
    expect(sf.getT()).toBeCloseTo(0.3, 5);
  });

  it('setT clamps below 0', () => {
    sf.setT(-1);
    expect(sf.getT()).toBe(0);
  });

  it('setT clamps above 1', () => {
    sf.setT(2);
    expect(sf.getT()).toBe(1);
  });

  it('update() while not playing does not change t', () => {
    sf.setT(0.5);
    sf.update(1.0);
    expect(sf.getT()).toBeCloseTo(0.5, 5);
  });

  it('update() while playing advances t', () => {
    sf.play();
    sf.setSpeed(1);
    sf.update(0.1);
    expect(sf.getT()).toBeGreaterThan(0);
  });

  it('setSpeed/getSpeed round-trip', () => {
    sf.setSpeed(3);
    expect(sf.getSpeed()).toBe(3);
  });
});

// =============================================================================
// Feature 5B: SplineFollower â€” markers and completion
// =============================================================================

describe('Feature 5B: SplineFollower â€” markers and events', () => {
  let sp: SplinePath;
  let sf: SplineFollower;

  beforeEach(() => {
    sp = new SplinePath();
    sp.setType('linear');
    sp.addPoint(0, 0, 0);
    sp.addPoint(10, 0, 0);
    sf = new SplineFollower(sp);
  });

  it('addMarker() adds to getMarkers()', () => {
    sf.addMarker(0.5, 'midpoint');
    expect(sf.getMarkers().length).toBe(1);
  });

  it('marker has t and label', () => {
    sf.addMarker(0.25, 'quarter');
    const m = sf.getMarkers()[0];
    expect(m.t).toBe(0.25);
    expect(m.label).toBe('quarter');
  });

  it('onMarker() callback fires when passing marker', () => {
    let triggered = '';
    sf.addMarker(0.1, 'start-marker');
    sf.onMarker((m) => {
      triggered = m.label;
    });
    sf.play();
    sf.setSpeed(100); // fast enough to pass marker in one step
    sf.update(0.1);
    expect(triggered).toBe('start-marker');
  });

  it('onComplete() fires when spline finishes (no loop)', () => {
    let done = false;
    sf.onComplete(() => {
      done = true;
    });
    sf.play();
    sf.setSpeed(100);
    sf.update(1);
    expect(done).toBe(true);
  });

  it('getDistanceTraveled() at t=0 is 0', () => {
    sf.setT(0);
    expect(sf.getDistanceTraveled()).toBeCloseTo(0, 3);
  });

  it('getRemainingDistance() at t=0 equals spline length', () => {
    sf.setT(0);
    expect(sf.getRemainingDistance()).toBeCloseTo(sp.getLength(), 1);
  });
});
