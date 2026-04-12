import { expect, test, describe } from 'vitest';
import { StructuralSolverTET10, tet4ToTet10 } from '../simulation/StructuralSolverTET10';
import { force } from '../simulation/units/PhysicalQuantity';

describe('Nonlinear V&V — Cantilever Beam', () => {
    test('Geometric nonlinear (Large Rotation) effect', async () => {
        // 1. Setup a simple beam mesh (L=5, W=1, H=1)
        // Two tet4 elements making a box (1.0 x 1.0 x 5.0)
        // Vertices at x=0, x=5
        const vertices = new Float64Array([
            0,0,0,  5,0,0,  5,1,0,  0,1,0,  // z=0 layer
            0,0,1,  5,0,1,  5,1,1,  0,1,1   // z=1 layer
        ]);
        
        // 12 tetrahedra for a 5x1x1 beam
        const t4tets = new Uint32Array([
            0,1,2,4, 1,2,4,5, 2,4,5,6, 0,2,3,4, 2,3,4,6, 3,4,6,7
        ]);
        
        const { vertices: v10, tetrahedra: t10 } = tet4ToTet10(vertices, t4tets);

        // TET10 load distribution: avoid applying full load to one corner node.
        // For quadratic elements, a single corner point load under-excites midside nodes
        // and can create artificial imbalance / poor nonlinear convergence.
        const maxX = Math.max(...Array.from(v10).filter((_, i) => i % 3 === 0));
        const minX = Math.min(...Array.from(v10).filter((_, i) => i % 3 === 0));
        const tipNodes: number[] = [];
        const fixedFaceNodes: number[] = [];
        for (let n = 0; n < v10.length / 3; n++) {
            const x = v10[n * 3];
            if (Math.abs(x - maxX) < 1e-6) tipNodes.push(n);
            if (Math.abs(x - minX) < 1e-6) fixedFaceNodes.push(n);
        }
        const totalTipForce = -5e5;
        const tipLoadPerNode = force(totalTipForce / Math.max(1, tipNodes.length));
        
        const config = {
            vertices: v10,
            tetrahedra: t10,
            material: 'aluminum',
            constraints: [
                { id: 'fixed', type: 'fixed', nodes: fixedFaceNodes } // All nodes at fixed face (X=min)
            ],
            loads: tipNodes.map((nodeIndex, i) => ({
                id: `tip-load-${i}`,
                type: 'point' as const,
                nodeIndex,
                force: [force(0), tipLoadPerNode, force(0)] as [number, number, number],
            })),
            nonlinear: true,
            loadSteps: 10,
            useGPU: false, // Force CPU for test environment
            tolerance: 1e-4
        };
        
        const solver = new StructuralSolverTET10(config as any);
        
        // 2. Solve
        console.log('--- Starting Nonlinear Validation Run ---');
        const result = await solver.solve();
        console.log(`Converged in ${result.iterations} iterations`);
        
        const displacements = solver.getDisplacements();
        
        // 3. Validation Logic
        // Find tip nodes (X=5)
        // Node 1 was (5,0,0) in original mesh.
        const tipXDisp = displacements[1 * 3];
        const tipYDisp = displacements[1 * 3 + 1];
        
        console.log(`Tip Displacement: UX=${tipXDisp.toExponential(4)}, UY=${tipYDisp.toExponential(4)}`);
        
        // In linear theory, UX would be 0 (for pure vertical load).
        // In nonlinear theory (Large Rotation), the tip should move INWARDS (negative UX)
        // because the beam rotates down while maintaining constant length.
        
        expect(result.converged).toBe(true);
        expect(tipYDisp).toBeLessThan(0); // Should deflect down
        expect(tipXDisp).toBeLessThan(0); // Horizontal shortening (Large Rotation effect)
        expect(Math.abs(tipXDisp)).toBeGreaterThan(1e-4); // Significant enough to measure for current load level
        
        console.log('--- Nonlinear Validation Passed ---');
    });
});
