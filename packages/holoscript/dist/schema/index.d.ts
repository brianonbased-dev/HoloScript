import { z } from 'zod';

declare const HoloSmartAssetMetadataSchema: z.ZodObject<{
    name: z.ZodString;
    version: z.ZodString;
    author: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
    tags: z.ZodOptional<z.ZodArray<z.ZodString>>;
    thumbnail: z.ZodOptional<z.ZodString>;
    license: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
type HoloSmartAssetMetadata = z.infer<typeof HoloSmartAssetMetadataSchema>;
declare const HoloPhysicsPropertiesSchema: z.ZodObject<{
    mass: z.ZodOptional<z.ZodNumber>;
    friction: z.ZodOptional<z.ZodNumber>;
    restitution: z.ZodOptional<z.ZodNumber>;
    isStatic: z.ZodOptional<z.ZodBoolean>;
    colliderType: z.ZodOptional<z.ZodEnum<{
        box: "box";
        sphere: "sphere";
        capsule: "capsule";
        mesh: "mesh";
    }>>;
}, z.core.$strip>;
type HoloPhysicsProperties = z.infer<typeof HoloPhysicsPropertiesSchema>;
type ColliderType = NonNullable<HoloPhysicsProperties['colliderType']>;
declare const HoloAIBehaviorSchema: z.ZodObject<{
    personality: z.ZodOptional<z.ZodString>;
    interactions: z.ZodOptional<z.ZodArray<z.ZodString>>;
    knowledgeBaseId: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
type HoloAIBehavior = z.infer<typeof HoloAIBehaviorSchema>;
/**
 * HoloSmartAsset
 *
 * Represents a self-contained, portable HoloScript asset.
 * It packages code, assets, physics properties, and AI behaviors into a single unit.
 */
interface HoloSmartAsset {
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
declare const HoloSmartAssetSchema: z.ZodObject<{
    metadata: z.ZodObject<{
        name: z.ZodString;
        version: z.ZodString;
        author: z.ZodOptional<z.ZodString>;
        description: z.ZodOptional<z.ZodString>;
        tags: z.ZodOptional<z.ZodArray<z.ZodString>>;
        thumbnail: z.ZodOptional<z.ZodString>;
        license: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    script: z.ZodString;
    physics: z.ZodOptional<z.ZodObject<{
        mass: z.ZodOptional<z.ZodNumber>;
        friction: z.ZodOptional<z.ZodNumber>;
        restitution: z.ZodOptional<z.ZodNumber>;
        isStatic: z.ZodOptional<z.ZodBoolean>;
        colliderType: z.ZodOptional<z.ZodEnum<{
            box: "box";
            sphere: "sphere";
            capsule: "capsule";
            mesh: "mesh";
        }>>;
    }, z.core.$strip>>;
    ai: z.ZodOptional<z.ZodObject<{
        personality: z.ZodOptional<z.ZodString>;
        interactions: z.ZodOptional<z.ZodArray<z.ZodString>>;
        knowledgeBaseId: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    assets: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnion<readonly [z.ZodString, z.ZodCustom<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>]>>>;
    dependencies: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
}, z.core.$strip>;
type HoloSmartAssetType = HoloSmartAsset;
type ZodIssue = z.core.$ZodIssue;
type ZodError = z.ZodError;
type ZodType<Output> = z.ZodType<Output>;

export { type ColliderType, type HoloAIBehavior, HoloAIBehaviorSchema, type HoloPhysicsProperties, HoloPhysicsPropertiesSchema, type HoloSmartAsset, type HoloSmartAssetMetadata, HoloSmartAssetMetadataSchema, HoloSmartAssetSchema, type HoloSmartAssetType, type ZodError, type ZodIssue, type ZodType };
