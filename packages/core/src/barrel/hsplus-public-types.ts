/**
 * HoloScript+ public types — excludes symbols already re-exported via `legacy-exports`
 * (e.g. Vector3, Color, HSPlusAST, ReactiveState) to avoid TS2308 duplicate exports.
 */

export type {
  HSPlusRuntime,
  HSPlusNode,
  HSPlusBuiltins,
  StateDeclaration,
  VRHand,
  Quaternion,
  Transform,
} from '../types/HoloScriptPlus';

export type {
  HSPlusIfDirective,
  HSPlusForDirective,
  HSPlusWhileDirective,
  HSPlusForEachDirective,
  HSPlusStateDirective,
  HSPlusTraitDirective,
} from '../types/AdvancedTypeSystem';
