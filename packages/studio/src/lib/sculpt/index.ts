export * from './sculptingBrushes';
// strokeSmoothing has a `Vec3` name collision with sculptingBrushes.
// Import directly from './strokeSmoothing' for stroke-specific Vec3 type.
export {
  catmullRomPoint,
  catmullRomInterpolate,
  strokeLength,
  resampleStroke,
  gaussianSmoothStroke,
  type Vec3 as StrokeVec3,
} from './strokeSmoothing';
export * from './ikSolver';
