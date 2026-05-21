/** @module Interface holoscript:core/spatial-engine@2.0.0 **/
export function perlinNoiseTwoD(x: number, y: number, seed: number): number;
export function perlinNoiseThreeD(x: number, y: number, z: number, seed: number): number;
export function fbmNoise(x: number, y: number, octaves: number, lacunarity: number, persistence: number, seed: number): number;
export function sphereSphereTest(ax: number, ay: number, az: number, ar: number, bx: number, by: number, bz: number, br: number): boolean;
export function aabbOverlap(aminX: number, aminY: number, aminZ: number, amaxX: number, amaxY: number, amaxZ: number, bminX: number, bminY: number, bminZ: number, bmaxX: number, bmaxY: number, bmaxZ: number): boolean;
export function rayAabbTest(rayOx: number, rayOy: number, rayOz: number, rayDx: number, rayDy: number, rayDz: number, minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): number;
export function frustumCullAabb(frustumJson: string, minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): boolean;
