/**
 * PhysicsDebugDrawer.ts
 *
 * Renders wireframes for physics bodies using WebGPURenderer.
 * Essential for verifying collision shapes and interaction logic.
 */

import type { IPhysicsWorld, IRigidBodyState } from '../../physics/PhysicsTypes';
import { WebGPURenderer } from './WebGPURenderer';

/** Internal interface for physics worlds that expose state maps */
interface PhysicsWorldWithStates extends IPhysicsWorld {
  getStates(): Record<string, IRigidBodyState>;
}

/** Internal interface for renderer methods used by debug drawer */
interface DebugRenderer {
  createElement(type: string, params: Record<string, unknown>): DebugMesh;
  destroy(mesh: DebugMesh): void;
}

/** Debug mesh representation */
interface DebugMesh {
  position: unknown;
  rotation: unknown;
  material: { color: string };
}

/** Physics body shape description */
interface PhysicsBodyShape {
  shape?: string;
  shapeParams?: number[];
}

export class PhysicsDebugDrawer {
  private world: IPhysicsWorld;
  private renderer: WebGPURenderer;
  private enabled: boolean = false;
  private debugMeshes: Map<string, DebugMesh> = new Map(); // bodyId -> RenderNode

  constructor(world: IPhysicsWorld, renderer: WebGPURenderer) {
    this.world = world;
    this.renderer = renderer;
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.clear();
    }
  }

  public update(): void {
    if (!this.enabled) return;

    const states = (this.world as unknown as PhysicsWorldWithStates).getStates() || {};

    // Sync meshes with physics bodies
    for (const [id, state] of Object.entries(states || {})) {
      let mesh = this.debugMeshes.get(id);

      if (!mesh) {
        // Create debug mesh if new body found
        // We need access to body Props to know shape, but getStates doesn't return shape
        // For now, we assume a default box or need to expand getStates/getBody
        const body = this.world.getBody(id);
        if (body) {
          mesh = this.createDebugMesh(body);
          this.debugMeshes.set(id, mesh);
        }
      }

      if (mesh) {
        // Update transform
        mesh.position = state.position;
        mesh.rotation = state.rotation;

        // Color coding
        if (state.isSleeping) {
          mesh.material.color = '#333333'; // Grey for sleeping
        } else {
          mesh.material.color = '#00ff00'; // Green for active
        }
      }
    }

    // Cleanup removed bodies
    for (const [id, mesh] of this.debugMeshes) {
      if (!states[id]) {
        (this.renderer as unknown as DebugRenderer).destroy(mesh);
        this.debugMeshes.delete(id);
      }
    }
  }

  private createDebugMesh(body: IRigidBodyState & Partial<PhysicsBodyShape>): DebugMesh {
    // This uses renderer.createElement which is generic
    // We assume the renderer supports 'mesh' and basic primitives
    const shape = body.shape || 'box';
    const params = body.shapeParams || [1, 1, 1];

    const meshParams: Record<string, unknown> = { wireframe: true, color: '#00ff00' };

    if (shape === 'box') {
      meshParams.geometry = 'box';
      meshParams.size = params; // [x, y, z]
    } else if (shape === 'sphere') {
      meshParams.geometry = 'sphere';
      meshParams.radius = params[0];
    } else if (shape === 'capsule') {
      meshParams.geometry = 'capsule';
      meshParams.radius = params[0];
      meshParams.height = params[1];
    } else {
      meshParams.geometry = 'box'; // Fallback
      meshParams.size = [0.2, 0.2, 0.2];
    }

    return (this.renderer as unknown as DebugRenderer).createElement('mesh', meshParams);
  }

  public clear(): void {
    for (const mesh of this.debugMeshes.values()) {
      (this.renderer as unknown as DebugRenderer).destroy(mesh);
    }
    this.debugMeshes.clear();
  }
}

