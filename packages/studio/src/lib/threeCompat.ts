/**
 * Three.js compatibility shim.
 *
 * The monorepo has multiple three.js versions coexisting (studio pins 0.182,
 * but semantic-2d's @react-three/fiber@^8.17.10 peer pulls three@0.160 into
 * the pnpm store). When a WebGLRenderer from one version touches a Material
 * instance from another, `material.onBuild is not a function` fires on shader
 * rebuild (e.g., after a WebGL context loss).
 *
 * Long-term fix: pnpm.overrides + upgrade semantic-2d to fiber v9 so there is
 * a single three.js instance. Until that reinstall happens, this runtime
 * patch adds a no-op onBuild to Material.prototype on the studio-imported
 * three instance, preventing the crash.
 */
import { Material } from 'three';

type MaterialWithOnBuild = typeof Material.prototype & { onBuild?: () => void };

const proto = Material.prototype as MaterialWithOnBuild;
if (typeof proto.onBuild !== 'function') {
  proto.onBuild = function onBuild() {
    /* compat shim — see module docstring */
  };
}
