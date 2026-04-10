/**
 * Scene Graph Tests
 *
 * Unit tests for scene graph IR types and factory functions.
 *
 * @module export
 * @version 3.3.0
 */

import { describe, it, expect } from 'vitest';
import {
  createIdentityTransform,
  createEmptyNode,
  createDefaultMaterial,
  createEmptySceneGraph,
  isMeshComponent,
  isLightComponent,
  isCameraComponent,
  isColliderComponent,
  isRigidbodyComponent,
  ISceneNode,
  IComponent,
  IMeshComponent,
  ILightComponent,
  ICameraComponent,
  IColliderComponent,
  IRigidbodyComponent,
} from '../SceneGraph';

describe('SceneGraph', () => {
  describe('createIdentityTransform', () => {
    it('should create transform at origin', () => {
      const transform = createIdentityTransform();
      expect(transform.position).toEqual({ x: 0, y: 0, z: 0 });
    });

    it('should create identity rotation', () => {
      const transform = createIdentityTransform();
      expect(transform.rotation).toEqual({ x: 0, y: 0, z: 0, w: 1 });
    });

    it('should create unit scale', () => {
      const transform = createIdentityTransform();
      expect(transform.scale).toEqual({ x: 1, y: 1, z: 1 });
    });
  });

  describe('createEmptyNode', () => {
    it('should create node with given id and name', () => {
      const node = createEmptyNode('test-id', 'TestNode');
      expect(node.id).toBe('test-id');
      expect(node.name).toBe('TestNode');
    });

    it('should default to empty type', () => {
      const node = createEmptyNode('id', 'name');
      expect(node.type).toBe('empty');
    });

    it('should create active node', () => {
      const node = createEmptyNode('id', 'name');
      expect(node.active).toBe(true);
    });

    it('should initialize empty children array', () => {
      const node = createEmptyNode('id', 'name');
      expect(node.children).toEqual([]);
    });

    it('should initialize empty components array', () => {
      const node = createEmptyNode('id', 'name');
      expect(node.components).toEqual([]);
    });

    it('should initialize empty tags array', () => {
      const node = createEmptyNode('id', 'name');
      expect(node.tags).toEqual([]);
    });

    it('should set default layer to 1', () => {
      const node = createEmptyNode('id', 'name');
      expect(node.layers).toBe(1);
    });

    it('should have identity transform', () => {
      const node = createEmptyNode('id', 'name');
      expect(node.transform).toEqual(createIdentityTransform());
    });
  });

  describe('createDefaultMaterial', () => {
    it('should create material with given id and name', () => {
      const material = createDefaultMaterial('mat-1', 'TestMaterial');
      expect(material.id).toBe('mat-1');
      expect(material.name).toBe('TestMaterial');
    });

    it('should default to PBR type', () => {
      const material = createDefaultMaterial('id', 'name');
      expect(material.type).toBe('pbr');
    });

    it('should have white base color', () => {
      const material = createDefaultMaterial('id', 'name');
      expect(material.baseColor).toEqual([1, 1, 1, 1]);
    });

    it('should be single-sided by default', () => {
      const material = createDefaultMaterial('id', 'name');
      expect(material.doubleSided).toBe(false);
    });

    it('should default to opaque alpha mode', () => {
      const material = createDefaultMaterial('id', 'name');
      expect(material.alphaMode).toBe('opaque');
    });

    it('should have default metallic value of 0', () => {
      const material = createDefaultMaterial('id', 'name');
      expect(material.metallic).toBe(0);
    });

    it('should have default roughness of 0.5', () => {
      const material = createDefaultMaterial('id', 'name');
      expect(material.roughness).toBe(0.5);
    });

    it('should have black emissive color', () => {
      const material = createDefaultMaterial('id', 'name');
      expect(material.emissiveColor).toEqual([0, 0, 0]);
    });
  });

  describe('createEmptySceneGraph', () => {
    it('should create scene with given name', () => {
      const scene = createEmptySceneGraph('MyScene');
      expect(scene.metadata.name).toBe('MyScene');
    });

    it('should use correct version', () => {
      const scene = createEmptySceneGraph('Test');
      expect(scene.version).toBe('3.3.0');
    });

    it('should use correct generator', () => {
      const scene = createEmptySceneGraph('Test');
      expect(scene.generator).toBe('HoloScript');
    });

    it('should create root node named Root', () => {
      const scene = createEmptySceneGraph('Test');
      expect(scene.root.name).toBe('Root');
    });

    it('should set createdAt timestamp', () => {
      const scene = createEmptySceneGraph('Test');
      expect(scene.metadata.createdAt).toBeTruthy();
      expect(() => new Date(scene.metadata.createdAt)).not.toThrow();
    });

    it('should set modifiedAt timestamp', () => {
      const scene = createEmptySceneGraph('Test');
      expect(scene.metadata.modifiedAt).toBeTruthy();
    });

    it('should initialize empty arrays', () => {
      const scene = createEmptySceneGraph('Test');
      expect(scene.materials).toEqual([]);
      expect(scene.textures).toEqual([]);
      expect(scene.meshes).toEqual([]);
      expect(scene.animations).toEqual([]);
      expect(scene.skins).toEqual([]);
      expect(scene.buffers).toEqual([]);
      expect(scene.bufferViews).toEqual([]);
      expect(scene.accessors).toEqual([]);
    });
  });

  describe('Type Guards', () => {
    describe('isMeshComponent', () => {
      it('should return true for mesh component', () => {
        const component: IMeshComponent = {
          type: 'mesh',
          meshRef: 'mesh-1',
          enabled: true,
        };
        expect(isMeshComponent(component)).toBe(true);
      });

      it('should return false for other components', () => {
        const component: IComponent = {
          type: 'light',
          enabled: true,
        };
        expect(isMeshComponent(component)).toBe(false);
      });
    });

    describe('isLightComponent', () => {
      it('should return true for light component', () => {
        const component: ILightComponent = {
          type: 'light',
          lightType: 'point',
          color: [1, 1, 1],
          intensity: 1,
          enabled: true,
        };
        expect(isLightComponent(component)).toBe(true);
      });

      it('should return false for other components', () => {
        const component: IComponent = {
          type: 'mesh',
          enabled: true,
        };
        expect(isLightComponent(component)).toBe(false);
      });
    });

    describe('isCameraComponent', () => {
      it('should return true for camera component', () => {
        const component: ICameraComponent = {
          type: 'camera',
          projection: 'perspective',
          fov: 60,
          near: 0.1,
          far: 1000,
          enabled: true,
        };
        expect(isCameraComponent(component)).toBe(true);
      });

      it('should return false for other components', () => {
        const component: IComponent = {
          type: 'mesh',
          enabled: true,
        };
        expect(isCameraComponent(component)).toBe(false);
      });
    });

    describe('isColliderComponent', () => {
      it('should return true for collider component', () => {
        const component: IColliderComponent = {
          type: 'collider',
          shape: 'box',
          isTrigger: false,
          enabled: true,
        };
        expect(isColliderComponent(component)).toBe(true);
      });

      it('should return false for other components', () => {
        const component: IComponent = {
          type: 'mesh',
          enabled: true,
        };
        expect(isColliderComponent(component)).toBe(false);
      });
    });

    describe('isRigidbodyComponent', () => {
      it('should return true for rigidbody component', () => {
        const component: IRigidbodyComponent = {
          type: 'rigidbody',
          mass: 1,
          useGravity: true,
          isKinematic: false,
          enabled: true,
        };
        expect(isRigidbodyComponent(component)).toBe(true);
      });

      it('should return false for other components', () => {
        const component: IComponent = {
          type: 'mesh',
          enabled: true,
        };
        expect(isRigidbodyComponent(component)).toBe(false);
      });
    });
  });

  describe('Node Hierarchy', () => {
    it('should support nested children', () => {
      const root = createEmptyNode('root', 'Root');
      const child1 = createEmptyNode('child-1', 'Child1');
      const child2 = createEmptyNode('child-2', 'Child2');
      const grandchild = createEmptyNode('grandchild', 'Grandchild');

      root.children.push(child1, child2);
      child1.children.push(grandchild);

      expect(root.children).toHaveLength(2);
      expect(child1.children).toHaveLength(1);
      expect(child1.children[0].name).toBe('Grandchild');
    });

    it('should support complex node types', () => {
      const mesh = createEmptyNode('m1', 'Mesh');
      mesh.type = 'mesh';

      const light = createEmptyNode('l1', 'Light');
      light.type = 'light';

      const camera = createEmptyNode('c1', 'Camera');
      camera.type = 'camera';

      expect(mesh.type).toBe('mesh');
      expect(light.type).toBe('light');
      expect(camera.type).toBe('camera');
    });

    it('should support tags', () => {
      const node = createEmptyNode('id', 'name');
      node.tags = ['player', 'interactive', 'entity'];

      expect(node.tags).toContain('player');
      expect(node.tags).toContain('interactive');
      expect(node.tags).toHaveLength(3);
    });

    it('should support layers bitmask', () => {
      const node = createEmptyNode('id', 'name');
      node.layers = 0b1010; // Layers 2 and 4

      expect(node.layers & 0b0010).toBeTruthy();
      expect(node.layers & 0b1000).toBeTruthy();
      expect(node.layers & 0b0001).toBeFalsy();
    });
  });

  describe('Transform', () => {
    it('should support custom position', () => {
      const node = createEmptyNode('id', 'name');
      node.transform.position = { x: 10, y: 20, z: 30 };

      expect(node.transform.position.x).toBe(10);
      expect(node.transform.position.y).toBe(20);
      expect(node.transform.position.z).toBe(30);
    });

    it('should support custom rotation', () => {
      const node = createEmptyNode('id', 'name');
      // 90 degree rotation around Y
      const sin45 = Math.sin(Math.PI / 4);
      const cos45 = Math.cos(Math.PI / 4);
      node.transform.rotation = { x: 0, y: sin45, z: 0, w: cos45 };

      expect(node.transform.rotation.w).toBeCloseTo(cos45);
    });

    it('should support non-uniform scale', () => {
      const node = createEmptyNode('id', 'name');
      node.transform.scale = { x: 2, y: 0.5, z: 1.5 };

      expect(node.transform.scale.x).toBe(2);
      expect(node.transform.scale.y).toBe(0.5);
      expect(node.transform.scale.z).toBe(1.5);
    });
  });
});
