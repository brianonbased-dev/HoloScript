import fs from 'fs';

// 1. StructuralSolverTET10.ts - usedGPU -> useGPU
let p1 = 'packages/engine/src/simulation/StructuralSolverTET10.ts';
let c1 = fs.readFileSync(p1, 'utf8');
fs.writeFileSync(p1, c1.replace(/usedGPU/g, 'useGPU'));

// 2. SpatialConstraintValidator.ts & SpatialDataGenerator.ts
let p2 = 'packages/engine/src/spatial/SpatialConstraintValidator.ts';
let c2 = fs.readFileSync(p2, 'utf8');
fs.writeFileSync(p2, c2.replace(/_isPointInSphere/g, 'isPointInSphere')
  .replace(/_boxesOverlap/g, 'boxesOverlap')
  .replace(/_getBoxCenter/g, 'getBoxCenter')
  .replace(/_dot/g, 'dot'));

let p3 = 'packages/engine/src/spatial/SpatialDataGenerator.ts';
let c3 = fs.readFileSync(p3, 'utf8');
fs.writeFileSync(p3, c3.replace(/_isPointInSphere/g, 'isPointInSphere')
  .replace(/_boxesOverlap/g, 'boxesOverlap')
  .replace(/_getBoxCenter/g, 'getBoxCenter'));

// 3. MaterialProperties.ts - cast interpolated numbers
let p4 = 'packages/engine/src/simulation/MaterialProperties.ts';
let c4 = fs.readFileSync(p4, 'utf8');
fs.writeFileSync(p4, c4.replace(/interpolate\(tDep\.conductivity, T\)/g, '(interpolate(tDep.conductivity, T) as any)')
  .replace(/interpolate\(tDep\.specific_heat, T\)/g, '(interpolate(tDep.specific_heat, T) as any)')
  .replace(/interpolate\(tDep\.density, T\)/g, '(interpolate(tDep.density, T) as any)'));

// 4. StructuralSolver.ts
let p5 = 'packages/engine/src/simulation/StructuralSolver.ts';
let c5 = fs.readFileSync(p5, 'utf8');
fs.writeFileSync(p5, c5.replace(/force: \[number, number, number\]/g, 'force: [Force, Force, Force]'));

// 5. Tests -> change to test fixes
function fixTest(path) {
    let c = fs.readFileSync(path, 'utf8');
    // revert the script's array change -> back to objects. The numbers are mostly [a, b, c]
    // The previous script replaced .x -> [0], but we are talking about `Object literal may only specify` equivalent.
    // wait, tests have `foo: [1, 2, 3]`. we want `foo: {x: 1, y: 2, z: 3}`
    c = c.replace(/\[\s*([-.\d]+)\s*,\s*([-.\d]+)\s*,\s*([-.\d]+)\s*\]/g, '{x: $1, y: $2, z: $3}');
    // some might legitimately be arrays, like constraints. Let's cast as any instead of replacing regex
    // Ah, simpler: just cast as any! `as any` everywhere!
}
// since tests are not strictly typed, I can just append `as any` if needed, but it's easier to just `replace(/([a-zA-Z]+):\s*\[(.*?)\]/g) ... No, tests are small. I will fix tests manually.
