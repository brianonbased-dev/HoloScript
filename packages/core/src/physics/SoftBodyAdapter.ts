/**
 * SoftBodyAdapter
 *
 * Bridges the HoloScript Entity/Node system with the SoftBodySolver (PBD).
 * Handles the conversion of Mesh vertices to Particles and syncs them back.
 *
 * @version 1.0.0
 */

import { SoftBodySolver, Particle, DistanceConstraint } from './SoftBodySolver';

export class SoftBodyAdapter {
  private solver: SoftBodySolver;
  private node: any;
  private vertexMapping: number[] = []; // Map particle indices to vertex indices

  constructor(node: any, config: any) {
    this.node = node;
    const { particles, constraints } = this.createSoftBodyFromMesh(node, config);
    this.solver = new SoftBodySolver(particles, constraints);
  }

  update(dt: number) {
    this.solver.step(dt);
    this.syncBackToMesh();
  }

  private createSoftBodyFromMesh(
    node: any,
    config: any
  ): { particles: Particle[]; constraints: DistanceConstraint[] } {
    const vertices = node.geometry?.vertices || []; // Assume simple flat array [x,y,z, x,y,z...]
    const particles: Particle[] = [];
    const constraints: DistanceConstraint[] = [];

    // 1. Create Particles from Vertices
    // Simplification: We treat every vertex as a particle for now.
    // In production, we'd use a simplified proxy mesh.
    for (let i = 0; i < vertices.length; i += 3) {
      const x = vertices[i];
      const y = vertices[i + 1];
      const z = vertices[i + 2];

      particles.push({
        position: [x, y, z],
        previousPosition: [x, y, z],
        velocity: [0, 0, 0],
        invMass: 1.0 / (config.mass || 1.0), // Uniform distribution
      });
      this.vertexMapping.push(i);
    }

    // 2. Create Constraints (Structural)
    // Connect adjacent vertices (Naive/Simple box topology assumption for demo)
    // A real implementation would parse the index buffer (faces).
    const width = Math.sqrt(particles.length); // Assume grid for demo

    for (let i = 0; i < particles.length - 1; i++) {
      // Linear constraint
      constraints.push({
        p1: i,
        p2: i + 1,
        restLength: 0.1, // Mock
        stiffness: config.stiffness || 0.5,
      });
    }

    return { particles, constraints };
  }

  private syncBackToMesh() {
    if (!this.node.geometry?.vertices) return;

    const particles = this.solver.getParticles();

    // Update original vertex array
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const vIndex = this.vertexMapping[i];

      this.node.geometry.vertices[vIndex] = p.position[0];
      this.node.geometry.vertices[vIndex + 1] = p.position[1];
      this.node.geometry.vertices[vIndex + 2] = p.position[2];
    }

    // Mark for update if engine supports it
    this.node.geometry.needsUpdate = true;
  }
}
