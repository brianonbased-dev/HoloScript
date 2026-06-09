/**
 * HoloScript-as-IDE *authoring* tools for Brittney — "(A)-slim" per /critic,
 * verified live + useful 2026-06-09. First-class, direct-MCP (one hop to
 * mcp.holoscript.net) trait-tier authoring for `.hs` / `.hsplus`.
 *
 * Scope discipline (deliberately narrow — both proved out before wiring):
 *  - hs_diagnostics — catches UNKNOWN / non-existent traits. Verified it
 *    correctly flagged HALLUCINATED traits (@caching, @parallax_camera) that
 *    are NOT in the registry — the exact guardrail against Brittney inventing
 *    traits, so it is bound first-class.
 *  - hs_refactor — safe rename / extract-template / inline / organize / group.
 *    Verified: clean rename with a changes log.
 *
 * Deliberately EXCLUDED (do not add back without re-verifying):
 *  - hs_scan_project — takes a server filesystem path; no fit for cloud
 *    Brittney's in-memory scene.
 *  - the positional LSP family (hs_hover / hs_go_to_definition /
 *    hs_find_references) — Brittney has a scene + chat, no cursor.
 *  (hs_ai_review / hs_ai_fix_code were probed `scaffold` — they threw on missing
 *  input; the mcp-server input guard landed 2026-06-09 and both verified useful on
 *  real input — review caught a duplicate trait + grade, fix returned a
 *  parser-validated fix — so they ARE bound below now.)
 *
 * Both bound tools take `code` — exactly what Brittney already has (scene
 * source / the generated `.hsplus`). Execution routes through
 * MCPToolExecutor.getDirectMCPConfigs (the same direct-MCP path as holo_parse).
 */
import type { StudioToolDefinition } from './StudioAPITools';

const hsDiagnostics: StudioToolDefinition = {
  type: 'function',
  function: {
    name: 'hs_diagnostics',
    description:
      'Validate HoloScript / .hsplus code — LSP-style diagnostics: syntax errors, UNKNOWN-TRAIT warnings (use this to CONFIRM a trait actually exists before adding OR proposing it — never invent traits; e.g. @caching / @parallax_camera are NOT real traits), missing-property hints, each with line/column + quick fixes. Run it before claiming a trait composition is good.',
    parameters: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'HoloScript / .hsplus code to diagnose',
        },
        severity: {
          type: 'string',
          enum: ['error', 'warning', 'info', 'all'],
          description: 'Filter by severity (default: all)',
        },
      },
      required: ['code'],
    },
  },
};

const hsRefactor: StudioToolDefinition = {
  type: 'function',
  function: {
    name: 'hs_refactor',
    description:
      'Refactor HoloScript / .hsplus code: rename an object/template across the code, extract an object into a reusable template, inline a template, organize imports, or group objects into a spatial_group. Returns the rewritten code + a changes log.',
    parameters: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'HoloScript / .hsplus code to refactor',
        },
        operation: {
          type: 'string',
          enum: ['rename', 'extract_template', 'inline_template', 'organize_imports', 'group_objects'],
          description: 'Refactor operation',
        },
        target: {
          type: 'string',
          description: 'Target name (for rename: the old name)',
        },
        newName: {
          type: 'string',
          description: 'New name (for rename / extract_template)',
        },
      },
      required: ['code', 'operation'],
    },
  },
};

const hsAiReview: StudioToolDefinition = {
  type: 'function',
  function: {
    name: 'hs_ai_review',
    description:
      'AI review of HoloScript / .hsplus code for best practices: trait-compatibility warnings (e.g. @grabbable pairs with @collidable), performance & structure issues, multiplayer-readiness, plus a model review and a letter grade. Use to sanity-check a composition before shipping.',
    parameters: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'HoloScript / .hsplus code to review',
        },
        focus: {
          type: 'string',
          enum: ['performance', 'traits', 'structure', 'multiplayer', 'all'],
          description: 'Focus area (default: all)',
        },
      },
      required: ['code'],
    },
  },
};

const hsAiFixCode: StudioToolDefinition = {
  type: 'function',
  function: {
    name: 'hs_ai_fix_code',
    description:
      'Take broken HoloScript / .hsplus code and return a corrected, PARSER-VALIDATED version — fixes unbalanced braces, unknown traits, missing required properties, and common mistakes. Returns the fixed code + the list of fixes applied.',
    parameters: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'HoloScript / .hsplus code to fix',
        },
        format: {
          type: 'string',
          enum: ['hs', 'hsplus', 'holo', 'auto'],
          description: 'Expected format (default: auto-detect)',
        },
      },
      required: ['code'],
    },
  },
};

export const HS_AUTHORING_TOOLS: StudioToolDefinition[] = [
  hsDiagnostics,
  hsRefactor,
  hsAiReview,
  hsAiFixCode,
];

export const HS_AUTHORING_TOOL_NAMES = new Set(HS_AUTHORING_TOOLS.map((t) => t.function.name));
