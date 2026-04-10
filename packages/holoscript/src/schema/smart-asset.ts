import { z } from 'zod';

// Zod Schemas for Runtime Validation

export const HoloSmartAssetMetadataSchema = z.object({
  name: z.string(),
  version: z.string(),
  author: z.string().optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  thumbnail: z.string().optional(), // path to thumbnail image
  license: z.string().optional(),
});

export const HoloPhysicsPropertiesSchema = z.object({
  mass: z.number().optional(),
  friction: z.number().optional(),
  restitution: z.number().optional(),
  isStatic: z.boolean().optional(),
  colliderType: z.enum(['box', 'sphere', 'capsule', 'mesh']).optional(),
});

export const HoloAIBehaviorSchema = z.object({
  personality: z.string().optional(),
  interactions: z.array(z.string()).optional(), // List of interaction triggers
  knowledgeBaseId: z.string().optional(),
});

/**
 * HoloSmartAsset
 *
 * Represents a self-contained, portable HoloScript asset.
 * It packages code, assets, physics properties, and AI behaviors into a single unit.
 */
export interface HoloSmartAsset {
  /**
   * Metadata describing the asset.
   */
  metadata: z.infer<typeof HoloSmartAssetMetadataSchema>;

  /**
   * The core HoloScript code defining the asset's visual and functional behavior.
   */
  script: string;

  /**
   * Physics properties for the asset.
   */
  physics?: z.infer<typeof HoloPhysicsPropertiesSchema>;

  /**
   * AI behavior configuration.
   */
  ai?: z.infer<typeof HoloAIBehaviorSchema>;

  /**
   * Map of relative paths to raw file buffers or base64 strings (for textures, audio, etc.).
   * This allows the asset to be completely self-contained.
   */
  assets?: Record<string, string | Uint8Array>;

  /**
   * Dependencies on other Smart Assets (by ID/Version).
   */
  dependencies?: Record<string, string>;
}

export const HoloSmartAssetSchema = z.object({
  metadata: HoloSmartAssetMetadataSchema,
  script: z.string(),
  physics: HoloPhysicsPropertiesSchema.optional(),
  ai: HoloAIBehaviorSchema.optional(),
  assets: z.record(z.union([z.string(), z.instanceof(Uint8Array)])).optional(),
  dependencies: z.record(z.string()).optional(),
});
