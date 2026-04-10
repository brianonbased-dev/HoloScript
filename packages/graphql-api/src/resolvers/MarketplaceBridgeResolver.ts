/**
 * MarketplaceBridgeResolver
 *
 * Bridges the GraphQL API and Marketplace API domains by exposing a
 * `compileTraitById` mutation that:
 *   1. Fetches trait source from the Marketplace API (HTTP)
 *   2. Compiles it with the HoloScript compiler
 *   3. Returns the compiled output via GraphQL
 *
 * This avoids clients needing to orchestrate two separate API calls.
 */

import { Resolver, Mutation, Arg } from 'type-graphql';
import {
  CompileTraitByIdInput,
  CompileTraitPayload,
  CompilerTarget,
} from '../types/GraphQLTypes.js';

/**
 * Base URL of the Marketplace API.
 *
 * In production / Railway this is set via MARKETPLACE_API_URL.
 * In local dev, marketplace-api runs on port 3000 by default.
 */
const MARKETPLACE_API_URL = process.env.MARKETPLACE_API_URL || 'http://localhost:3000';

/** Shape of the GET /api/v1/traits/:id response from marketplace-api. */
interface MarketplaceTraitResponse {
  success: boolean;
  data: {
    name: string;
    version: string;
    source: string;
    [key: string]: unknown;
  };
  error?: { code: string; message: string };
}

@Resolver()
export class MarketplaceBridgeResolver {
  /**
   * Fetch a trait from the Marketplace and compile it to the requested target.
   *
   * Example GraphQL mutation:
   * ```graphql
   * mutation {
   *   compileTraitById(input: {
   *     traitId: "spatial-audio",
   *     target: UNITY,
   *     version: "1.0.0"
   *   }) {
   *     success
   *     output
   *     traitName
   *     traitVersion
   *     errors { message phase }
   *     metadata { compilationTime outputSize targetVersion }
   *   }
   * }
   * ```
   */
  @Mutation(() => CompileTraitPayload, {
    description:
      'Fetch a trait from the Marketplace by ID and compile it to a target platform in one step',
  })
  async compileTraitById(
    @Arg('input', () => CompileTraitByIdInput) input: CompileTraitByIdInput
  ): Promise<CompileTraitPayload> {
    const startTime = Date.now();

    // -----------------------------------------------------------------------
    // 1. Fetch trait source from Marketplace API
    // -----------------------------------------------------------------------
    let traitData: MarketplaceTraitResponse['data'];

    try {
      const url = new URL(
        `/api/v1/traits/${encodeURIComponent(input.traitId)}`,
        MARKETPLACE_API_URL
      );
      if (input.version) {
        url.searchParams.set('version', input.version);
      }

      const response = await fetch(url.toString());

      if (!response.ok) {
        const errorBody = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        const errorObj = errorBody?.error as Record<string, unknown> | undefined;
        return {
          success: false,
          output: undefined,
          errors: [
            {
              message:
                (errorObj?.message as string) ||
                `Marketplace API returned ${response.status}: Failed to fetch trait "${input.traitId}"`,
              phase: 'fetch',
            },
          ],
          warnings: [],
          metadata: undefined,
          traitName: undefined,
          traitVersion: undefined,
        };
      }

      const body = (await response.json()) as MarketplaceTraitResponse;
      if (!body.success || !body.data?.source) {
        return {
          success: false,
          output: undefined,
          errors: [
            {
              message: `Trait "${input.traitId}" has no source code in the marketplace`,
              phase: 'fetch',
            },
          ],
          warnings: [],
          metadata: undefined,
          traitName: body.data?.name,
          traitVersion: body.data?.version,
        };
      }

      traitData = body.data;
    } catch (fetchError: unknown) {
      const errMessage = fetchError instanceof Error ? fetchError.message : String(fetchError);
      return {
        success: false,
        output: undefined,
        errors: [
          {
            message: `Failed to reach Marketplace API: ${errMessage}`,
            phase: 'fetch',
          },
        ],
        warnings: [
          {
            message: `Ensure MARKETPLACE_API_URL is set correctly (current: ${MARKETPLACE_API_URL})`,
          },
        ],
        metadata: undefined,
        traitName: undefined,
        traitVersion: undefined,
      };
    }

    // -----------------------------------------------------------------------
    // 2. Compile the fetched source
    // -----------------------------------------------------------------------
    try {
      const { HoloScriptPlusParser } = await import('@holoscript/core');

      const parser = new HoloScriptPlusParser();
      const parseResult = parser.parse(traitData.source);

      if (!parseResult.ast) {
        return {
          success: false,
          output: undefined,
          errors: [
            {
              message: `Failed to parse trait "${traitData.name}" source code`,
              phase: 'parse',
            },
          ],
          warnings: [],
          metadata: undefined,
          traitName: traitData.name,
          traitVersion: traitData.version,
        };
      }

      const core = await import('@holoscript/core');
      let compiler: { compile(ast: unknown): string };
      let compiledOutput: string;

      switch (input.target) {
        case CompilerTarget.UNITY:
          compiler = new core.UnityCompiler(input.options || {});
          compiledOutput = compiler.compile(parseResult.ast);
          break;
        case CompilerTarget.BABYLON:
          compiler = new core.BabylonCompiler(input.options || {});
          compiledOutput = compiler.compile(parseResult.ast);
          break;
        case CompilerTarget.R3F:
          compiler = new core.R3FCompiler();
          compiledOutput = compiler.compile(parseResult.ast);
          break;
        case CompilerTarget.UNREAL:
          compiler = new core.UnrealCompiler(input.options || {});
          compiledOutput = compiler.compile(parseResult.ast);
          break;
        case CompilerTarget.GODOT:
          compiler = new core.GodotCompiler(input.options || {});
          compiledOutput = compiler.compile(parseResult.ast);
          break;
        case CompilerTarget.VRCHAT:
          compiler = new core.VRChatCompiler(input.options || {});
          compiledOutput = compiler.compile(parseResult.ast);
          break;
        case CompilerTarget.VISIONOS:
          compiler = new core.VisionOSCompiler(input.options || {});
          compiledOutput = compiler.compile(parseResult.ast);
          break;
        case CompilerTarget.ANDROID:
          compiler = new core.AndroidXRCompiler(input.options || {});
          compiledOutput = compiler.compile(parseResult.ast);
          break;
        case CompilerTarget.OPENXR:
          compiler = new core.OpenXRCompiler(input.options || {});
          compiledOutput = compiler.compile(parseResult.ast);
          break;
        case CompilerTarget.IOS:
          compiler = new core.ARCompiler(input.options || {});
          compiledOutput = compiler.compile(parseResult.ast);
          break;
        default:
          return {
            success: false,
            output: undefined,
            errors: [
              {
                message: `Compiler target ${input.target} not yet implemented`,
                phase: 'compile',
              },
            ],
            warnings: [],
            metadata: undefined,
            traitName: traitData.name,
            traitVersion: traitData.version,
          };
      }

      const compilationTime = Date.now() - startTime;

      return {
        success: true,
        output: compiledOutput,
        errors: [],
        warnings: parseResult.warnings || [],
        metadata: {
          compilationTime,
          outputSize: compiledOutput.length,
          targetVersion: '3.42.0',
        },
        traitName: traitData.name,
        traitVersion: traitData.version,
      };
    } catch (compileError: unknown) {
      const errMessage =
        compileError instanceof Error ? compileError.message : 'Unknown compilation error';
      return {
        success: false,
        output: undefined,
        errors: [
          {
            message: errMessage,
            phase: 'compile',
          },
        ],
        warnings: [],
        metadata: undefined,
        traitName: traitData.name,
        traitVersion: traitData.version,
      };
    }
  }
}
