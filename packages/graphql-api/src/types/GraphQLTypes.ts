import { ObjectType, Field, ID, registerEnumType, InputType } from 'type-graphql';
import 'reflect-metadata';

// ============================================================================
// Enums
// ============================================================================

export enum CompilerTarget {
  UNITY = 'UNITY',
  UNREAL = 'UNREAL',
  BABYLON = 'BABYLON',
  VRCHAT = 'VRCHAT',
  R3F = 'R3F',
  WASM = 'WASM',
  ANDROID = 'ANDROID',
  IOS = 'IOS',
  VISIONOS = 'VISIONOS',
  GODOT = 'GODOT',
  OPENXR = 'OPENXR',
}

registerEnumType(CompilerTarget, {
  name: 'CompilerTarget',
  description: 'Available HoloScript compiler targets',
});

// ============================================================================
// Input Types
// ============================================================================

@InputType()
export class ParseInput {
  @Field(() => String)
  code!: string;

  @Field(() => Boolean, { nullable: true, defaultValue: false })
  includeSourceMap?: boolean;
}

@InputType()
export class CompilerOptionsInput {
  @Field(() => Boolean, { nullable: true })
  minify?: boolean;

  @Field(() => Boolean, { nullable: true })
  sourceMaps?: boolean;

  @Field(() => String, { nullable: true })
  outputPath?: string;
}

@InputType()
export class CompileInput {
  @Field(() => String)
  code!: string;

  @Field(() => CompilerTarget)
  target!: CompilerTarget;

  @Field(() => CompilerOptionsInput, { nullable: true })
  options?: CompilerOptionsInput;
}

// ============================================================================
// Output Types
// ============================================================================

@ObjectType()
export class SourceLocation {
  @Field(() => Number)
  line!: number;

  @Field(() => Number)
  column!: number;

  @Field(() => Number)
  offset!: number;
}

@ObjectType()
export class ParseError {
  @Field(() => String)
  message!: string;

  @Field(() => SourceLocation, { nullable: true })
  location?: SourceLocation;

  @Field(() => String, { nullable: true })
  code?: string;
}

@ObjectType()
export class Warning {
  @Field(() => String)
  message!: string;

  @Field(() => SourceLocation, { nullable: true })
  location?: SourceLocation;

  @Field(() => String, { nullable: true })
  severity?: string;
}

@ObjectType()
export class ParseResult {
  @Field(() => Boolean)
  success!: boolean;

  @Field(() => String, { nullable: true, description: 'AST as JSON string' })
  ast?: string;

  @Field(() => [ParseError], { defaultValue: [] })
  errors!: ParseError[];

  @Field(() => [Warning], { defaultValue: [] })
  warnings!: Warning[];
}

@ObjectType()
export class CompilationMetadata {
  @Field(() => Number)
  compilationTime!: number;

  @Field(() => Number)
  outputSize!: number;

  @Field(() => String)
  targetVersion!: string;
}

@ObjectType()
export class CompileError {
  @Field(() => String)
  message!: string;

  @Field(() => SourceLocation, { nullable: true })
  location?: SourceLocation;

  @Field(() => String, { nullable: true })
  phase?: string;
}

@ObjectType()
export class CompilePayload {
  @Field(() => Boolean)
  success!: boolean;

  @Field(() => String, { nullable: true })
  output?: string;

  @Field(() => [CompileError], { defaultValue: [] })
  errors!: CompileError[];

  @Field(() => [Warning], { defaultValue: [] })
  warnings!: Warning[];

  @Field(() => CompilationMetadata, { nullable: true })
  metadata?: CompilationMetadata;
}

@ObjectType()
export class TargetInfo {
  @Field(() => CompilerTarget)
  target!: CompilerTarget;

  @Field(() => String)
  name!: string;

  @Field(() => String)
  description!: string;

  @Field(() => String)
  version!: string;

  @Field(() => [String])
  supportedFeatures!: string[];
}

// ============================================================================
// Subscription Types (Week 3)
// ============================================================================

export enum CompilationStage {
  PARSING = 'parsing',
  COMPILING = 'compiling',
  OPTIMIZING = 'optimizing',
  COMPLETE = 'complete',
  ERROR = 'error',
}

registerEnumType(CompilationStage, {
  name: 'CompilationStage',
  description: 'Current stage of compilation process',
});

@ObjectType()
export class CompilationProgressPayload {
  @Field(() => String)
  requestId!: string;

  @Field(() => String)
  target!: string;

  @Field(() => Number)
  progress!: number; // 0-100

  @Field(() => CompilationStage)
  stage!: CompilationStage;

  @Field(() => String)
  message!: string;

  @Field(() => Number)
  timestamp!: number;
}

@ObjectType()
export class ValidationError {
  @Field(() => String)
  message!: string;

  @Field(() => Number, { nullable: true })
  line?: number;

  @Field(() => Number, { nullable: true })
  column?: number;
}

@ObjectType()
export class ValidationResultPayload {
  @Field(() => String)
  codeHash!: string;

  @Field(() => Boolean)
  isValid!: boolean;

  @Field(() => [ValidationError])
  errors!: ValidationError[];

  @Field(() => [ValidationError])
  warnings!: ValidationError[];

  @Field(() => Number)
  timestamp!: number;
}

@InputType()
export class ValidationInput {
  @Field(() => String)
  code!: string;

  @Field(() => Boolean, { nullable: true, defaultValue: true })
  realTime?: boolean;
}

// ============================================================================
// Marketplace Bridge Types
// ============================================================================

@InputType({ description: 'Input for compiling a trait fetched from the Marketplace' })
export class CompileTraitByIdInput {
  @Field(() => String, { description: 'Trait ID in the Marketplace' })
  traitId!: string;

  @Field(() => CompilerTarget, { description: 'Target platform to compile for' })
  target!: CompilerTarget;

  @Field(() => String, {
    nullable: true,
    description: 'Semver version constraint (e.g. "1.2.0"). Omit for latest.',
  })
  version?: string;

  @Field(() => CompilerOptionsInput, { nullable: true })
  options?: CompilerOptionsInput;
}

@ObjectType({ description: 'Result of compiling a marketplace trait' })
export class CompileTraitPayload {
  @Field(() => Boolean)
  success!: boolean;

  @Field(() => String, { nullable: true, description: 'Compiled output code' })
  output?: string;

  @Field(() => [CompileError], { defaultValue: [] })
  errors!: CompileError[];

  @Field(() => [Warning], { defaultValue: [] })
  warnings!: Warning[];

  @Field(() => CompilationMetadata, { nullable: true })
  metadata?: CompilationMetadata;

  @Field(() => String, { nullable: true, description: 'Trait name from the marketplace' })
  traitName?: string;

  @Field(() => String, { nullable: true, description: 'Trait version that was compiled' })
  traitVersion?: string;
}
