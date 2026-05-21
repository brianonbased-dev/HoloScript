# Engine

**Spatial engine package for runtime, ECS-style systems, networking, rendering, and physics.**

## Overview

`@holoscript/engine` is a lower-level execution package for scene simulation concerns that sit beneath higher-level runtime or editor experiences.

## Installation

```bash
npm install @holoscript/engine
```

## Use When

- You need lower-level scene execution primitives.
- You are building custom runtime layers or experiments.
- You want tighter access to systems like rendering, networking, or physics orchestration.

## Key Capabilities

- Core execution systems for scene simulation.
- Lower-level hooks for engine-oriented integrations.
- Useful bridge between compiler output and platform runtimes.

## Mesh Import MVP for Solver Pipeline (paper-gap TVCG)

The engine provides a narrow MVP for importing structured meshes into the simulation/solver pipeline:

- **Supported (MVP)**: STL (surface → optional tet via AutoMesher fallback), OBJ (surface), GMSH 2.x `.msh` (direct TetMesh with tetrahedra).
- **Pipeline handoff**: `importMesh*` → `TetMesh`/`SurfaceMesh` → `StructuralSolver` (or other tet-based solvers) for physics/structural analysis.
- **Error contract**: Malformed/unsupported inputs reliably throw `MeshImportError` (codes: GMSH_INVALID, GMSH_UNSUPPORTED).
- **Detection**: `detectFormat()` by extension or content heuristic (binary STL size, $MeshFormat, solid/endsolid, etc.).
- **Usage (solver pipeline)**:
  ```ts
  import { importMeshSync, importMesh, MeshImportError } from '@holoscript/engine/simulation/import';
  import { StructuralSolver } from '@holoscript/engine/simulation';

  // GMSH .msh (volumetric, direct to solver)
  const gmsh = await fetch('model.msh').then(r => r.text());
  const { tetMesh } = importMeshSync(gmsh);
  const solver = new StructuralSolver({ vertices: tetMesh.vertices, tetrahedra: tetMesh.tetrahedra, ... });
  solver.solve();

  // STL (surface, auto-tet fallback for MVP)
  const stlBuf = await file.arrayBuffer();
  const imported = await importMesh(stlBuf, { tetrahedralize: true });
  // ... feed imported.tetMesh to solver
  ```

**MVP boundary (explicit)**: Only the formats above. No full CAD (STEP, IGES, SolidWorks), no NURBS, no hybrid polyhedral yet. Future expansion planned; current docs and code reject everything else with contract error. See `packages/engine/src/simulation/import/{MeshImporter,GmshParser,STLParser}.ts` and `__tests__/MeshImporter.test.ts` for validation (valid meshes import + feed solver; bad inputs throw).

This closes the "structured meshes only" limitation for TVCG / paper-gap work while documenting the exact supported slice.

## See Also

- [Runtime](./runtime.md)
- [Holo VM](./holo-vm.md)
- [VM Bridge](./vm-bridge.md)
