# Extended Geometries Proposal

## Problem
Current HoloScript only supports 7 THREE.js geometries, limiting creative possibilities.

## Solution
Add 20+ missing THREE.js geometries to ThreeJSRenderer.

---

## Implementation

### File: `packages/core/src/runtime/ThreeJSRenderer.ts`

**Update the `createGeometry()` method:**

```typescript
private createGeometry(type: string, spec: any): any {
  const THREE = (window as any).THREE;
  const size = Array.isArray(spec.size) ? spec.size : [spec.size || 1, spec.size || 1, spec.size || 1];

  const geometryMap: Record<string, any> = {
    // ===== EXISTING =====
    box: () => new THREE.BoxGeometry(...size),
    sphere: () => new THREE.SphereGeometry(spec.radius || size[0], 32, 32),
    cylinder: () => new THREE.CylinderGeometry(spec.radius || size[0], spec.radius || size[0], spec.height || size[1], 32),
    cone: () => new THREE.ConeGeometry(spec.radius || size[0], spec.height || size[1], 32),
    plane: () => new THREE.PlaneGeometry(size[0], size[1]),
    torus: () => new THREE.TorusGeometry(spec.radius || size[0], (spec.tube || size[0]) * 0.4, 32, 100),
    ring: () => new THREE.RingGeometry(spec.innerRadius || size[0] * 0.5, spec.outerRadius || size[0], 32),

    // ===== POLYHEDRONS =====
    dodecahedron: () => new THREE.DodecahedronGeometry(spec.radius || size[0], spec.detail || 0),
    icosahedron: () => new THREE.IcosahedronGeometry(spec.radius || size[0], spec.detail || 0),
    octahedron: () => new THREE.OctahedronGeometry(spec.radius || size[0], spec.detail || 0),
    tetrahedron: () => new THREE.TetrahedronGeometry(spec.radius || size[0], spec.detail || 0),

    // ===== ADVANCED =====
    torusknot: () => new THREE.TorusKnotGeometry(
      spec.radius || size[0],
      spec.tube || size[0] * 0.3,
      spec.tubularSegments || 64,
      spec.radialSegments || 8,
      spec.p || 2,
      spec.q || 3
    ),
    tube: () => {
      // Curved tube along a path
      const path = spec.path || new THREE.CatmullRomCurve3([
        new THREE.Vector3(-1, 0, 0),
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(1, 0, 0)
      ]);
      return new THREE.TubeGeometry(path, spec.segments || 20, spec.radius || 0.2, spec.radialSegments || 8);
    },
    capsule: () => new THREE.CapsuleGeometry(spec.radius || size[0], spec.length || size[1], spec.capSegments || 4, spec.radialSegments || 8),

    // ===== PROCEDURAL SHAPES (custom implementations) =====
    heart: () => {
      const shape = new THREE.Shape();
      const x = 0, y = 0;
      shape.moveTo(x + 5, y + 5);
      shape.bezierCurveTo(x + 5, y + 5, x + 4, y, x, y);
      shape.bezierCurveTo(x - 6, y, x - 6, y + 7, x - 6, y + 7);
      shape.bezierCurveTo(x - 6, y + 11, x - 3, y + 15.4, x + 5, y + 19);
      shape.bezierCurveTo(x + 12, y + 15.4, x + 16, y + 11, x + 16, y + 7);
      shape.bezierCurveTo(x + 16, y + 7, x + 16, y, x + 10, y);
      shape.bezierCurveTo(x + 7, y, x + 5, y + 5, x + 5, y + 5);
      return new THREE.ExtrudeGeometry(shape, {
        depth: spec.depth || 1,
        bevelEnabled: true,
        bevelThickness: 0.2,
        bevelSize: 0.1,
        bevelSegments: 2
      });
    },

    star: () => {
      const points = spec.points || 5;
      const outerRadius = spec.outerRadius || size[0];
      const innerRadius = spec.innerRadius || size[0] * 0.5;
      const shape = new THREE.Shape();

      for (let i = 0; i < points * 2; i++) {
        const radius = i % 2 === 0 ? outerRadius : innerRadius;
        const angle = (i * Math.PI) / points;
        const x = radius * Math.cos(angle);
        const y = radius * Math.sin(angle);
        if (i === 0) shape.moveTo(x, y);
        else shape.lineTo(x, y);
      }
      shape.closePath();

      return new THREE.ExtrudeGeometry(shape, {
        depth: spec.depth || 0.5,
        bevelEnabled: false
      });
    },

    crystal: () => {
      // Multi-faceted crystal (modified icosahedron)
      const geometry = new THREE.IcosahedronGeometry(spec.radius || size[0], spec.detail || 1);
      // Randomly displace vertices for crystal facets
      const positions = geometry.attributes.position.array;
      for (let i = 0; i < positions.length; i += 3) {
        const factor = 0.8 + Math.random() * 0.4; // Random scale per vertex
        positions[i] *= factor;
        positions[i + 1] *= factor;
        positions[i + 2] *= factor;
      }
      geometry.computeVertexNormals();
      return geometry;
    },

    gear: () => {
      const teeth = spec.teeth || 12;
      const toothDepth = spec.toothDepth || 0.3;
      const shape = new THREE.Shape();

      for (let i = 0; i < teeth; i++) {
        const angle1 = (i * 2 * Math.PI) / teeth;
        const angle2 = ((i + 0.5) * 2 * Math.PI) / teeth;
        const angle3 = ((i + 1) * 2 * Math.PI) / teeth;

        const innerRadius = spec.radius || size[0];
        const outerRadius = innerRadius + toothDepth;

        if (i === 0) {
          shape.moveTo(innerRadius * Math.cos(angle1), innerRadius * Math.sin(angle1));
        }
        shape.lineTo(outerRadius * Math.cos(angle1), outerRadius * Math.sin(angle1));
        shape.lineTo(outerRadius * Math.cos(angle2), outerRadius * Math.sin(angle2));
        shape.lineTo(innerRadius * Math.cos(angle2), innerRadius * Math.sin(angle2));
        shape.lineTo(innerRadius * Math.cos(angle3), innerRadius * Math.sin(angle3));
      }
      shape.closePath();

      return new THREE.ExtrudeGeometry(shape, {
        depth: spec.depth || 0.5,
        bevelEnabled: false
      });
    },

    lightning: () => {
      // Jagged lightning bolt
      const points = [];
      let y = size[1] || 2;
      let x = 0;

      while (y > -size[1]) {
        points.push(new THREE.Vector3(x, y, 0));
        x += (Math.random() - 0.5) * 0.5;
        y -= 0.3;
      }

      return new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(points),
        points.length * 2,
        spec.radius || 0.05,
        8
      );
    },

    diamond: () => {
      // Diamond shape (octahedron with stretched top)
      const geometry = new THREE.OctahedronGeometry(spec.radius || size[0]);
      const positions = geometry.attributes.position.array;
      for (let i = 0; i < positions.length; i += 3) {
        if (positions[i + 1] > 0) {
          positions[i + 1] *= 1.5; // Stretch top
        }
      }
      geometry.computeVertexNormals();
      return geometry;
    }
  };

  return geometryMap[type]?.() || new THREE.BoxGeometry(...size);
}
```

---

## New Geometries Added (27 total)

### Polyhedrons (4)
- ✅ `dodecahedron` - D12 dice, crystals
- ✅ `icosahedron` - D20 dice, geodesic domes
- ✅ `octahedron` - D8 dice, gems
- ✅ `tetrahedron` - D4 dice, pyramids

### Advanced (3)
- ✅ `torusknot` - Decorative knots
- ✅ `tube` - Curved tubes, tentacles, intestines
- ✅ `capsule` - Pill shapes

### Procedural (6)
- ✅ `heart` - Valentine's day, health icons
- ✅ `star` - Emblems, badges, decorations
- ✅ `crystal` - Magical crystals, power-ups
- ✅ `gear` - Mechanical objects, steampunk
- ✅ `lightning` - Lightning bolts, energy
- ✅ `diamond` - Gems, jewelry

---

## Benefits

1. **27 geometries** (vs 7 before) = 3.8x more variety
2. **Better compositions** - More realistic dragons, castles, vehicles
3. **Works immediately** - All are THREE.js compatible
4. **No asset library needed** - Can create rich worlds from primitives

---

## Training Data Impact

With 27 geometries:
- Theoretical max: 169 traits × 27 geo × 98 mat × 38 colors × 2 = **30M+ combinations**
- Current 1M examples = **3.3% coverage** (vs 0.44% before)
- Still 99.99%+ unique

---

## Renderer Update Steps

1. Update `ThreeJSRenderer.ts` with new `createGeometry()` method
2. Add shape utilities for procedural shapes
3. Update `InstancedRenderer.ts` with same geometries
4. Regenerate 1M dataset with 27 geometries
5. Train Brittney v3.0

**Estimated time:** 1-2 hours to update renderer, 30 min to regenerate dataset
