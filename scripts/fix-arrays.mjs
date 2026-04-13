import fs from 'fs';

// 1. SteeringBehaviors.ts
let p1 = 'packages/engine/src/navigation/SteeringBehaviors.ts';
let c1 = fs.readFileSync(p1, 'utf8');
c1 = c1.replace(/type Vec3 = \{ x: number; y: number; z: number \};/g, 'type Vec3 = [number, number, number];');
c1 = c1.replace(/velocity: \{ x: number; y: number; z: number \}/g, 'velocity: [number, number, number]');
c1 = c1.replace(/\{ x: 0, y: 0, z: 0 \}/g, '[0, 0, 0]');
c1 = c1.replace(/\{ x: 1, y: 0, z: 0 \}/g, '[1, 0, 0]');
// wander
c1 = c1.replace(/const wanderTarget: Vec3 = \{[\s\S]*?z: circleCenter\.z \+ Math\.sin\(this\.wanderAngle\) \* this\.config\.wanderRadius,\n    \};/m,
`const wanderTarget: Vec3 = [
      circleCenter[0] + Math.cos(this.wanderAngle) * this.config.wanderRadius,
      circleCenter[1],
      circleCenter[2] + Math.sin(this.wanderAngle) * this.config.wanderRadius,
    ];`);
c1 = c1.replace(/circleCenter\.x/g, 'circleCenter[0]').replace(/circleCenter\.y/g, 'circleCenter[1]').replace(/circleCenter\.z/g, 'circleCenter[2]');
// force.x += weighted.x etc.
c1 = c1.replace(/\.x/g, '[0]').replace(/\.y/g, '[1]').replace(/\.z/g, '[2]');
// Fix getters if any, wait: `.position[0]` -> `[0][0]`? `position` was already `[number, number, number]`.
// So `.position.x` was `position[0]`. In my auto-replace earlier, I did `.position.x -> .position[0]` and `.position[0][0]` now if I replace `.x` with `[0]`.
// BUT `.x` in `weighted.x` -> `weighted[0]` is correct. `avgVel.x` -> `avgVel[0]` is correct.
// `a.x - b.x` -> `a[0] - b[0]`. Let's just do it string by string.
c1 = fs.readFileSync(p1, 'utf8'); // restart to avoid double replacements
c1 = c1.replace(/type Vec3 = \{ x: number; y: number; z: number \};/, 'type Vec3 = [number, number, number];');
c1 = c1.replace(/velocity: \{ x: number; y: number; z: number \}/, 'velocity: [number, number, number]');
c1 = c1.replace(/\{ x: 0, y: 0, z: 0 \}/g, '[0, 0, 0]');
c1 = c1.replace(/\{ x: 1, y: 0, z: 0 \}/g, '[1, 0, 0]');
c1 = c1.replace(/circleCenter\.x/g, 'circleCenter[0]').replace(/circleCenter\.y/g, 'circleCenter[1]').replace(/circleCenter\.z/g, 'circleCenter[2]');
c1 = c1.replace(/x: circleCenter\[0\] \+ Math\.cos\(this\.wanderAngle\) \* this\.config\.wanderRadius,/g, 'circleCenter[0] + Math.cos(this.wanderAngle) * this.config.wanderRadius,');
c1 = c1.replace(/y: circleCenter\[1\],/g, 'circleCenter[1],');
c1 = c1.replace(/z: circleCenter\[2\] \+ Math\.sin\(this\.wanderAngle\) \* this\.config\.wanderRadius,/g, 'circleCenter[2] + Math.sin(this.wanderAngle) * this.config.wanderRadius');
c1 = c1.replace(/const wanderTarget: Vec3 = \{/g, 'const wanderTarget: Vec3 = [').replace(/wanderRadius,\n    \};/g, 'wanderRadius\n    ];');
c1 = c1.replace(/force\.x/g, 'force[0]').replace(/force\.y/g, 'force[1]').replace(/force\.z/g, 'force[2]');
c1 = c1.replace(/weighted\.x/g, 'weighted[0]').replace(/weighted\.y/g, 'weighted[1]').replace(/weighted\.z/g, 'weighted[2]');
c1 = c1.replace(/avgVel\.x/g, 'avgVel[0]').replace(/avgVel\.y/g, 'avgVel[1]').replace(/avgVel\.z/g, 'avgVel[2]');
c1 = c1.replace(/n\.velocity\.x/g, 'n.velocity[0]').replace(/n\.velocity\.y/g, 'n.velocity[1]').replace(/n\.velocity\.z/g, 'n.velocity[2]');
c1 = c1.replace(/center\.x/g, 'center[0]').replace(/center\.y/g, 'center[1]').replace(/center\.z/g, 'center[2]');
c1 = c1.replace(/away\.x/g, 'away[0]').replace(/away\.y/g, 'away[1]').replace(/away\.z/g, 'away[2]');
c1 = c1.replace(/accel\.x/g, 'accel[0]').replace(/accel\.y/g, 'accel[1]').replace(/accel\.z/g, 'accel[2]');
c1 = c1.replace(/agent\.velocity\.x/g, 'agent.velocity[0]').replace(/agent\.velocity\.y/g, 'agent.velocity[1]').replace(/agent\.velocity\.z/g, 'agent.velocity[2]');

c1 = c1.replace(/\{ x: a\.x - b\.x, y: a\.y - b\.y, z: a\.z - b\.z \}/g, '[a[0] - b[0], a[1] - b[1], a[2] - b[2]]');
c1 = c1.replace(/\{ x: a\.x \+ b\.x, y: a\.y \+ b\.y, z: a\.z \+ b\.z \}/g, '[a[0] + b[0], a[1] + b[1], a[2] + b[2]]');
c1 = c1.replace(/\{ x: v\.x \* s, y: v\.y \* s, z: v\.z \* s \}/g, '[v[0] * s, v[1] * s, v[2] * s]');
c1 = c1.replace(/v\.x \* v\.x \+ v\.y \* v\.y \+ v\.z \* v\.z/g, 'v[0] * v[0] + v[1] * v[1] + v[2] * v[2]');

fs.writeFileSync(p1, c1);
console.log('Fixed SteeringBehaviors');

// 2. Arrays -> objects in other places
let filesToFixObjects = [
    'packages/engine/src/particles/ParticleEmitter.ts',
    'packages/engine/src/physics/VRPhysicsBridge.ts',
    'packages/engine/src/procedural/LSystemGenerator.ts',
    'packages/engine/src/rendering/AdvancedLighting.ts',
    'packages/engine/src/rendering/CloudRenderer.ts',
    'packages/engine/src/rendering/ProjectorLight.ts',
    'packages/engine/src/scene/SceneNode.ts',
    'packages/engine/src/spatial/SpatialQuery.extra.test.ts',
    'packages/engine/src/spatial/SpatialQuery.test.ts',
    'packages/engine/src/runtime/profiles/HeadlessRuntime.ts',
    'packages/engine/src/runtime/HoloScriptPlusRuntime.ts'
];

for (let f of filesToFixObjects) {
    if (!fs.existsSync(f)) continue;
    let text = fs.readFileSync(f, 'utf8');
    // We target `position: [..., ..., ...]` or `position?: [...]`
    // but tests have `{ id: '1', type: 'agent', position: [0, 0, 0] }` 
    // And CloudRenderer: `position: { x, y, z }` was changed to `position: [x, y, z]`? 
    // Wait, the errors said: `Type 'number[]' is missing... x, y, z` OR `Object literal may only specify... 'x' does not exist in [number, number, number]`
    // So for SceneNode.ts(57,29): `this.local.position = { x, y, z };` -> error is 'x' does not exist! Because `local.position` is `[number, number, number]`. So we MUST change to `this.local.position = [x,y,z]`.
}
