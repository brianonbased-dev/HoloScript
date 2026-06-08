/**
 * @holoscript/sdk/schema — runtime validation schemas for HoloSmartAsset.
 *
 * Hand-crafted declarations mirroring packages/holoscript/src/schema/index.ts
 * (barrel for ./smart-asset).
 *
 * Note: the zod schema objects expose .parse(), .safeParse(), .optional(), etc.
 * through the ZodObject / ZodType interface. We declare them as ZodType<T>
 * with the correct inferred output type so callers get proper inference without
 * a full @types/zod import dependency in consumers.
 */

/** Minimal Zod validation issue shape */
export interface ZodIssue {
  path: (string | number)[];
  message: string;
  code: string;
  [key: string]: unknown;
}

/** Minimal Zod error shape */
export interface ZodError {
  errors: ZodIssue[];
  message: string;
  [key: string]: unknown;
}

/** Minimal ZodType surface needed for schema consumers */
export interface ZodType<Output> {
  parse(data: unknown): Output;
  safeParse(data: unknown): { success: true; data: Output } | { success: false; error: ZodError };
  optional(): ZodType<Output | undefined>;
  [key: string]: unknown;
}

// --- Metadata ---

export interface HoloSmartAssetMetadata {
  name: string;
  version: string;
  author?: string;
  description?: string;
  tags?: string[];
  thumbnail?: string;
  license?: string;
}

export declare const HoloSmartAssetMetadataSchema: ZodType<HoloSmartAssetMetadata>;

// --- Physics properties ---

export type ColliderType = 'box' | 'sphere' | 'capsule' | 'mesh';

export interface HoloPhysicsProperties {
  mass?: number;
  friction?: number;
  restitution?: number;
  isStatic?: boolean;
  colliderType?: ColliderType;
}

export declare const HoloPhysicsPropertiesSchema: ZodType<HoloPhysicsProperties>;

// --- AI behavior ---

export interface HoloAIBehavior {
  personality?: string;
  interactions?: string[];
  knowledgeBaseId?: string;
}

export declare const HoloAIBehaviorSchema: ZodType<HoloAIBehavior>;

// --- Smart asset ---

export interface HoloSmartAsset {
  metadata: HoloSmartAssetMetadata;
  script: string;
  physics?: HoloPhysicsProperties;
  ai?: HoloAIBehavior;
  assets?: Record<string, string | Uint8Array>;
  dependencies?: Record<string, string>;
}

export declare const HoloSmartAssetSchema: ZodType<HoloSmartAsset>;

export type HoloSmartAssetType = HoloSmartAsset;
