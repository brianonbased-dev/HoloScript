/**
 * PhysicsDebugDrawer.ts
 *
 * Renders wireframes for physics bodies using WebGPURenderer.
 * Essential for verifying collision shapes and interaction logic.
 */

import { IPhysicsWorld, BodyState } from '../physics/PhysicsTypes';
import { WebGPURenderer } from './WebGPURenderer';

export class PhysicsDebugDrawer {
  private world: IPhysicsWorld;
  private renderer: WebGPURenderer;
  private enabled: boolean = false;
  private debugMeshes: Map<string, any> = new Map(); // bodyId -> RenderNode

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

    const states = this.world.getStates();

    // Sync meshes with physics bodies
    for (const [id, state] of Object.entries(states)) {
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
        this.renderer.destroy(mesh);
        this.debugMeshes.delete(id);
      }
    }
  }

  private createDebugMesh(body: any): any {
    // This uses renderer.createElement which is generic
    // We assume the renderer supports 'mesh' and basic primitives
    const shape = body.shape || 'box';
    const params = body.shapeParams || [1, 1, 1];

    let meshParams: any = { wireframe: true, color: '#00ff00' };

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

    return this.renderer.createElement('mesh', meshParams);
  }

  public clear(): void {
    for (const mesh of this.debugMeshes.values()) {
      this.renderer.destroy(mesh);
    }
    this.debugMeshes.clear();
  }
}
