/**
 * BusinessQuest MCP Tools — No-code VRR (Virtual Reality Reality) scaffolding
 *
 * Exposes structured JSON drafts that compile to HoloComposition trees with
 * @vrr_twin, @quest_hub, @inventory_sync, and related traits — no .holo source required.
 *
 * @module @holoscript/core/compiler/BusinessQuestTools
 * @see VRRCompiler — consumes the generated composition AST
 * @see GLTFPipelineMCPTool — sibling MCP tool patterns
 */

import { z } from 'zod';

import type { HoloComposition, HoloObjectDecl, HoloObjectTrait, HoloValue } from '../parser/HoloCompositionTypes';

import type { MCPToolCallRequest, MCPToolCallResponse, MCPToolDefinition } from './GLTFPipelineMCPTool';

// =============================================================================
// ZOD — runtime draft schema (strict JSON from agents / studio forms)
// =============================================================================

const vrrQuestEntrySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  steps: z.array(z.string()).min(1),
});

export const businessVRRDraftSchema = z.object({
  compositionName: z
    .string()
    .min(1)
    .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'compositionName must be a valid HoloScript identifier'),
  twin: z.object({
    mirrorId: z.string().min(1),
    realitySync: z.array(z.string()).min(1),
    geoSync: z
      .object({
        center: z.string().min(1),
        radius: z.number().nonnegative().optional(),
      })
      .optional(),
  }),
  weather: z
    .object({
      provider: z.enum(['weather.gov', 'openweathermap']),
      refresh: z.string().optional(),
    })
    .optional(),
  events: z
    .object({
      provider: z.enum(['eventbrite', 'ticketmaster']),
      refresh: z.string().optional(),
    })
    .optional(),
  businesses: z
    .array(
      z.object({
        id: z.string().min(1),
        displayName: z.string().optional(),
        geo: z.object({
          lat: z.number().gte(-90).lte(90),
          lng: z.number().gte(-180).lte(180),
        }),
        inventory: z
          .object({
            provider: z.enum(['square_pos', 'shopify', 'woocommerce']),
            refresh: z.string().optional(),
            websocket: z.boolean().optional(),
          })
          .optional(),
        quests: z.array(vrrQuestEntrySchema).min(1),
      })
    )
    .min(1),
  layerShift: z
    .object({
      from: z.enum(['ar', 'vrr', 'vr']),
      to: z.enum(['ar', 'vrr', 'vr']),
      price: z.number().nonnegative().optional(),
      persistState: z.boolean().optional(),
    })
    .optional(),
});

export type BusinessVRRDraft = z.infer<typeof businessVRRDraftSchema>;

export interface BusinessQuestValidationIssue {
  path: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface BusinessQuestValidationResult {
  ok: boolean;
  issues: BusinessQuestValidationIssue[];
}

// =============================================================================
// Trait helpers — VRRCompiler reads `params`; parser AST uses `config`
// =============================================================================

type VrrTrait = HoloObjectTrait & { params: Record<string, unknown> };

function vrrTrait(name: string, params: Record<string, unknown>): VrrTrait {
  return {
    type: 'ObjectTrait',
    name,
    config: params as Record<string, HoloValue>,
    params,
  } as VrrTrait;
}

function emptyCompositionShell(name: string): HoloComposition {
  return {
    type: 'Composition',
    name,
    templates: [],
    objects: [],
    spatialGroups: [],
    lights: [],
    imports: [],
    timelines: [],
    audio: [],
    zones: [],
    transitions: [],
    conditionals: [],
    iterators: [],
    npcs: [],
    quests: [],
    abilities: [],
    dialogues: [],
    stateMachines: [],
    achievements: [],
    talentTrees: [],
    shapes: [],
    metadata: {
      source: 'business-quest-tools',
      draftKind: 'hololand-vrr',
    },
  };
}

/**
 * Build a HoloComposition AST from a validated business VRR draft (no .holo text).
 */
export function buildVRRCompositionFromDraft(draft: BusinessVRRDraft): HoloComposition {
  const composition = emptyCompositionShell(draft.compositionName);

  const twinTraits: VrrTrait[] = [
    vrrTrait('vrr_twin', { mirror: draft.twin.mirrorId }),
    vrrTrait('reality_mirror', { sync: draft.twin.realitySync }),
  ];
  if (draft.twin.geoSync) {
    twinTraits.push(
      vrrTrait('geo_sync', {
        center: draft.twin.geoSync.center,
        radius: draft.twin.geoSync.radius ?? 0,
      })
    );
  }

  const twinObject: HoloObjectDecl = {
    type: 'Object',
    name: `${draft.compositionName}_twin_root`,
    properties: [],
    traits: twinTraits,
  };

  const objects: HoloObjectDecl[] = [twinObject];

  if (draft.weather) {
    objects.push({
      type: 'Object',
      name: `${draft.compositionName}_weather`,
      properties: [],
      traits: [
        vrrTrait('weather_sync', {
          provider: draft.weather.provider,
          refresh: draft.weather.refresh ?? '5_minutes',
        }),
      ],
    });
  }

  if (draft.events) {
    objects.push({
      type: 'Object',
      name: `${draft.compositionName}_events`,
      properties: [],
      traits: [
        vrrTrait('event_sync', {
          provider: draft.events.provider,
          refresh: draft.events.refresh ?? '5_minutes',
        }),
      ],
    });
  }

  for (const biz of draft.businesses) {
    const questPayload = biz.quests.map((q) => ({
      id: q.id,
      title: q.title,
      steps: q.steps,
    }));

    const bizTraits: VrrTrait[] = [
      vrrTrait('geo_anchor', { lat: biz.geo.lat, lng: biz.geo.lng }),
      vrrTrait('quest_hub', { quests: questPayload }),
    ];

    if (biz.inventory) {
      bizTraits.push(
        vrrTrait('inventory_sync', {
          provider: biz.inventory.provider,
          refresh: biz.inventory.refresh ?? '1_minute',
          websocket: biz.inventory.websocket ?? false,
        })
      );
    }

    objects.push({
      type: 'Object',
      name: biz.displayName ?? biz.id,
      properties: [],
      traits: bizTraits,
    });
  }

  if (draft.layerShift) {
    objects.push({
      type: 'Object',
      name: `${draft.compositionName}_layer_shift`,
      properties: [],
      traits: [
        vrrTrait('layer_shift', {
          from: draft.layerShift.from,
          to: draft.layerShift.to,
          price: draft.layerShift.price ?? 0,
          persist_state: draft.layerShift.persistState !== false,
        }),
      ],
    });
  }

  composition.objects = objects;
  return composition;
}

/**
 * Structural validation (Zod) plus optional VRRCompiler parse for trait wiring checks.
 */
export function validateBusinessVRRDraft(
  draft: unknown,
  options?: { parseWithVrrCompiler?: boolean }
): Promise<BusinessQuestValidationResult> {
  const issues: BusinessQuestValidationIssue[] = [];
  const parsed = businessVRRDraftSchema.safeParse(draft);
  if (!parsed.success) {
    for (const err of parsed.error.issues) {
      issues.push({
        path: err.path.join('.'),
        message: err.message,
        severity: 'error',
      });
    }
    return Promise.resolve({ ok: false, issues });
  }

  if (options?.parseWithVrrCompiler) {
    return import('./VRRCompiler')
      .then(({ VRRCompiler }) => {
        const composition = buildVRRCompositionFromDraft(parsed.data);
        const compiler = new VRRCompiler({
          target: 'threejs',
          minify: false,
          source_maps: false,
          api_integrations: {},
          performance: { target_fps: 60, max_players: 1000, lazy_loading: true },
        });
        const data = compiler.parseVRRComposition(composition);
        if (data.questNodes.length === 0) {
          issues.push({
            path: 'businesses',
            message: 'VRR parse found no @quest_hub nodes — check draft.quests',
            severity: 'warning',
          });
        }
        if (data.twinNodes.length === 0) {
          issues.push({
            path: 'twin',
            message: 'VRR parse found no @vrr_twin nodes',
            severity: 'warning',
          });
        }
        return { ok: issues.every((i) => i.severity !== 'error'), issues };
      })
      .catch((err: unknown) => {
        issues.push({
          path: '',
          message: err instanceof Error ? err.message : String(err),
          severity: 'error',
        });
        return { ok: false, issues };
      });
  }

  return Promise.resolve({ ok: true, issues });
}

/**
 * Human-readable HoloScript-style preview (for review; round-trip via parser not guaranteed).
 */
export function draftToHoloPreview(draft: BusinessVRRDraft): string {
  const lines: string[] = [];
  lines.push(`// Preview — generated by BusinessQuestTools (no-code VRR draft)`);
  lines.push(`composition "${draft.compositionName}" {`);
  lines.push(
    `  // twin: mirror=${draft.twin.mirrorId} sync=[${draft.twin.realitySync.join(', ')}]`
  );
  if (draft.weather) {
    lines.push(`  // weather: ${draft.weather.provider}`);
  }
  if (draft.events) {
    lines.push(`  // events: ${draft.events.provider}`);
  }
  for (const biz of draft.businesses) {
    lines.push(`  // business "${biz.id}" @ geo ${biz.geo.lat},${biz.geo.lng}`);
    for (const q of biz.quests) {
      lines.push(`  //   quest "${q.title}" (${q.steps.length} steps)`);
    }
  }
  lines.push(`}`);
  return lines.join('\n');
}

// =============================================================================
// MCP tool definitions
// =============================================================================

export const BUSINESS_QUEST_TOOLS: MCPToolDefinition[] = [
  {
    name: 'holoscript_business_quest_scaffold_vrr',
    description:
      'Build a HoloComposition JSON for Hololand VRR from a structured draft (no .holo source). ' +
      'Includes @vrr_twin, @reality_mirror, optional @geo_sync, @weather_sync, @event_sync, ' +
      'per-business @geo_anchor + @quest_hub + optional @inventory_sync, and optional @layer_shift.',
    inputSchema: {
      type: 'object',
      properties: {
        draft: {
          type: 'object',
          description: 'BusinessVRRDraft — see businessVRRDraftSchema in @holoscript/core',
        },
        runVrrParse: {
          type: 'boolean',
          description: 'If true, run VRRCompiler.parseVRRComposition and return trait counts',
          default: false,
        },
        agentToken: {
          type: 'string',
          description: 'Optional agent token for future RBAC (reserved)',
        },
      },
      required: ['draft'],
    },
  },
  {
    name: 'holoscript_business_quest_validate_vrr_draft',
    description: 'Validate a BusinessVRRDraft (Zod). Optionally run VRRCompiler parse smoke check.',
    inputSchema: {
      type: 'object',
      properties: {
        draft: { type: 'object', description: 'Candidate BusinessVRRDraft JSON' },
        parseWithVrrCompiler: {
          type: 'boolean',
          description: 'When true, dynamically loads VRRCompiler for wiring verification',
          default: false,
        },
      },
      required: ['draft'],
    },
  },
  {
    name: 'holoscript_business_quest_preview_holo',
    description:
      'Return a commented HoloScript-style preview string for founder review (not a full parser round-trip).',
    inputSchema: {
      type: 'object',
      properties: {
        draft: { type: 'object' },
      },
      required: ['draft'],
    },
  },
];

// =============================================================================
// MCP handlers
// =============================================================================

export async function handleBusinessQuestToolCall(
  request: MCPToolCallRequest
): Promise<MCPToolCallResponse> {
  try {
    switch (request.name) {
      case 'holoscript_business_quest_scaffold_vrr':
        return await handleScaffold(request.arguments);
      case 'holoscript_business_quest_validate_vrr_draft':
        return await handleValidate(request.arguments);
      case 'holoscript_business_quest_preview_holo':
        return await handlePreview(request.arguments);
      default:
        return {
          isError: true,
          content: [{ type: 'text', text: `Unknown tool: ${request.name}` }],
        };
    }
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}

async function handleScaffold(args: Record<string, unknown>): Promise<MCPToolCallResponse> {
  const parsed = businessVRRDraftSchema.safeParse(args.draft);
  if (!parsed.success) {
    return {
      isError: true,
      content: [{ type: 'text', text: JSON.stringify(parsed.error.flatten(), null, 2) }],
    };
  }

  const composition = buildVRRCompositionFromDraft(parsed.data);
  const runParse = Boolean(args.runVrrParse);

  let vrrSummary: Record<string, number> | undefined;
  if (runParse) {
    const { VRRCompiler } = await import('./VRRCompiler');
    const compiler = new VRRCompiler({
      target: 'threejs',
      minify: false,
      source_maps: false,
      api_integrations: {},
      performance: { target_fps: 60, max_players: 1000, lazy_loading: true },
    });
    const data = compiler.parseVRRComposition(composition);
    vrrSummary = {
      twinNodes: data.twinNodes.length,
      weatherNodes: data.weatherNodes.length,
      eventNodes: data.eventNodes.length,
      inventoryNodes: data.inventoryNodes.length,
      questNodes: data.questNodes.length,
      layerShiftNodes: data.layerShiftNodes.length,
      paywallNodes: data.paywallNodes.length,
      geoAnchorNodes: data.geoAnchorNodes.length,
    };
  }

  const payload = {
    success: true,
    compositionName: composition.name,
    objectCount: composition.objects.length,
    composition,
    vrrTraitCounts: vrrSummary,
  };

  return {
    isError: false,
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
  };
}

async function handleValidate(args: Record<string, unknown>): Promise<MCPToolCallResponse> {
  const parseWithVrrCompiler = Boolean(args.parseWithVrrCompiler);
  const result = await validateBusinessVRRDraft(args.draft, { parseWithVrrCompiler });
  return {
    isError: !result.ok,
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
  };
}

async function handlePreview(args: Record<string, unknown>): Promise<MCPToolCallResponse> {
  const parsed = businessVRRDraftSchema.safeParse(args.draft);
  if (!parsed.success) {
    return {
      isError: true,
      content: [{ type: 'text', text: JSON.stringify(parsed.error.flatten(), null, 2) }],
    };
  }
  const text = draftToHoloPreview(parsed.data);
  return {
    isError: false,
    content: [{ type: 'text', text }],
  };
}

/**
 * Register all BusinessQuest tools with an MCP server instance.
 */
export function registerBusinessQuestTools(server: {
  registerTool(
    definition: MCPToolDefinition,
    handler: (req: MCPToolCallRequest) => Promise<MCPToolCallResponse>
  ): void;
}): void {
  for (const tool of BUSINESS_QUEST_TOOLS) {
    server.registerTool(tool, handleBusinessQuestToolCall);
  }
}

export default handleBusinessQuestToolCall;
