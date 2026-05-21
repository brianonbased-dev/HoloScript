/** @module Interface holoscript:core/types@1.0.0 **/
export type PropertyValue = PropertyValueStringVal | PropertyValueNumberVal | PropertyValueBooleanVal | PropertyValueArrayVal | PropertyValueObjectVal | PropertyValueNullVal;
export interface PropertyValueStringVal {
  tag: 'string-val',
  val: string,
}
export interface PropertyValueNumberVal {
  tag: 'number-val',
  val: number,
}
export interface PropertyValueBooleanVal {
  tag: 'boolean-val',
  val: boolean,
}
export interface PropertyValueArrayVal {
  tag: 'array-val',
  val: string,
}
export interface PropertyValueObjectVal {
  tag: 'object-val',
  val: string,
}
export interface PropertyValueNullVal {
  tag: 'null-val',
}
export interface Position {
  line: number,
  column: number,
  offset: number,
}
export interface Span {
  start: Position,
  end: Position,
}
export interface Property {
  name: string,
  value: PropertyValue,
  span?: Span,
}
export interface EnvironmentNode {
  properties: Array<Property>,
  span?: Span,
}
export interface ActionNode {
  name: string,
  parameters: Array<string>,
  body: string,
  span?: Span,
}
export interface TemplateNode {
  name: string,
  traits: Array<string>,
  properties: Array<Property>,
  state: Array<Property>,
  actions: Array<ActionNode>,
  span?: Span,
}
export interface ObjectNode {
  name: string,
  template?: string,
  traits: Array<string>,
  properties: Array<Property>,
  span?: Span,
}
export interface SpatialGroupNode {
  name: string,
  objects: Array<ObjectNode>,
  span?: Span,
}
export interface AnimationNode {
  name: string,
  property: string,
  fromVal?: number,
  toVal: number,
  duration: number,
  easing?: string,
  loopMode?: string,
  span?: Span,
}
export interface TimelineEntry {
  time: number,
  target: string,
  action: string,
}
export interface TimelineNode {
  name: string,
  entries: Array<TimelineEntry>,
  span?: Span,
}
export interface LightNode {
  lightType: string,
  name: string,
  properties: Array<Property>,
  span?: Span,
}
export interface CameraNode {
  cameraType: string,
  name: string,
  properties: Array<Property>,
  span?: Span,
}
export interface EventHandler {
  eventType: string,
  target?: string,
  body: string,
  span?: Span,
}
export interface CompositionNode {
  name: string,
  environment?: EnvironmentNode,
  templates: Array<TemplateNode>,
  objects: Array<ObjectNode>,
  spatialGroups: Array<SpatialGroupNode>,
  animations: Array<AnimationNode>,
  timelines: Array<TimelineNode>,
  lights: Array<LightNode>,
  cameras: Array<CameraNode>,
  eventHandlers: Array<EventHandler>,
  span?: Span,
}
/**
 * # Variants
 * 
 * ## `"error"`
 * 
 * ## `"warning"`
 * 
 * ## `"info"`
 * 
 * ## `"hint"`
 */
export type Severity = 'error' | 'warning' | 'info' | 'hint';
export interface Diagnostic {
  severity: Severity,
  message: string,
  span?: Span,
  code?: string,
}
export type ParseResult = ParseResultOk | ParseResultErr;
export interface ParseResultOk {
  tag: 'ok',
  val: CompositionNode,
}
export interface ParseResultErr {
  tag: 'err',
  val: Array<Diagnostic>,
}
export interface ValidationResult {
  valid: boolean,
  diagnostics: Array<Diagnostic>,
}
export interface TraitDef {
  name: string,
  category: string,
  description: string,
}
/**
 * # Variants
 * 
 * ## `"unity-csharp"`
 * 
 * ## `"godot-gdscript"`
 * 
 * ## `"aframe-html"`
 * 
 * ## `"threejs"`
 * 
 * ## `"babylonjs"`
 * 
 * ## `"gltf-json"`
 * 
 * ## `"glb-binary"`
 */
export type CompileTarget = 'unity-csharp' | 'godot-gdscript' | 'aframe-html' | 'threejs' | 'babylonjs' | 'gltf-json' | 'glb-binary';
export type CompileResult = CompileResultText | CompileResultBinary | CompileResultError;
export interface CompileResultText {
  tag: 'text',
  val: string,
}
export interface CompileResultBinary {
  tag: 'binary',
  val: Uint8Array,
}
export interface CompileResultError {
  tag: 'error',
  val: Array<Diagnostic>,
}
