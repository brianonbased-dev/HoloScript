/**
 * Compute-axis graded-trace MCP tools — the live surface over compute-trace-store.ts.
 *
 * Mirrors the daemon-lifecycle export tool (holo_export_emergence_corpus) for the
 * COMPUTE axis of the native-model program (P.004 / P.005 / EXP-3). The store is
 * the additive sibling of daemon-emergence-store.ts; these tools are its read +
 * grade-and-record surface.
 *
 *   holo_grade_compute_mutation — grade ONE proposed compute mutation against a
 *       SimulationContract bound AND write the graded tuple through to the durable
 *       corpus. This is how a LIVE session produces REAL compute training data
 *       (today the corpus is synthetic-bound — harvest_real.py reports 0 real
 *       compute rows). Additive: there was no live grading site to modify.
 *   holo_export_compute_traces — project the durable corpus into the normalized
 *       JSONL shape scripts/corpus/harvest_real.py reads. Read-only.
 *   holo_compute_trace_stats   — diagnostics: where the corpus lives + how much
 *       real compute data has accrued. Read-only.
 */

import { type Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  gradeComputeMutation,
  exportTracesJsonl,
  computeTraceStats,
  type ComputePropertyBound,
  type ComputeMutation,
} from './compute-trace-store.js';

export const computeTraceTools: Tool[] = [
  {
    name: 'holo_grade_compute_mutation',
    description:
      'Grade ONE proposed compute scene-mutation against its SimulationContract ' +
      'property bound (exact-value match, clamp-to-bounds) AND durably record the ' +
      '(instruction → mutation → expected/graded value → pass/fail → CAEL receipt) ' +
      'tuple to the compute-axis corpus. This is how a LIVE session produces REAL ' +
      'compute-axis training data for the HoloScript native-model program: today ' +
      'the compute corpus is SYNTHETIC-BOUND (scripts/corpus/harvest_real.py reports ' +
      '0 real compute rows). The caller supplies the ground-truth expected value for ' +
      'the op it asked; this tool grades + records, it does NOT change grading ' +
      'semantics. Best-effort persistence never affects the returned verdict. ' +
      'Returns: { passed, expectedValue, gradedValue, recorded }.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        sessionId: { type: 'string', description: 'Stable session/agent id (provenance + dedup).' },
        instruction: {
          type: 'string',
          description: 'The natural-language instruction the agent was given.',
        },
        contractId: {
          type: 'string',
          description: 'The SimulationContract id the mutation must respect.',
        },
        scene: { type: 'string', description: 'The scene source the instruction was applied to.' },
        bound: {
          type: 'object',
          description:
            'The declared SimulationContract property bound: { trait, property, min, max, current }.',
          properties: {
            trait: { type: 'string' },
            property: { type: 'string' },
            min: { type: 'number' },
            max: { type: 'number' },
            current: { type: 'number' },
          },
          required: ['trait', 'property', 'min', 'max', 'current'],
        },
        mutation: {
          type: 'object',
          description:
            'The proposed mutation: { tool, objectName, traitName, propertyKey, propertyValue }.',
          properties: {
            tool: { type: 'string' },
            objectName: { type: 'string' },
            traitName: { type: 'string' },
            propertyKey: { type: 'string' },
            propertyValue: { type: 'number' },
          },
          required: ['tool', 'objectName', 'traitName', 'propertyKey', 'propertyValue'],
        },
        expectedValue: {
          type: 'number',
          description: 'Ground-truth expected value the gate grades against.',
        },
        opLabel: {
          type: 'string',
          description:
            'Op family label (e.g. "midpoint", "plus30") — corpus-balance signal. Optional.',
        },
        caelReceiptRef: {
          type: 'string',
          description: 'Reference to the CAEL receipt anchoring this grade. Optional.',
        },
      },
      required: [
        'sessionId',
        'instruction',
        'contractId',
        'scene',
        'bound',
        'mutation',
        'expectedValue',
      ],
    },
  },
  {
    name: 'holo_export_compute_traces',
    description:
      'Export the durable COMPUTE-AXIS graded-trace corpus to a normalized JSONL ' +
      'file the training-corpus builder consumes — the (system, user, target, ' +
      'grader, grader_key, family, modality, source) shape read by ' +
      'scripts/corpus/harvest_real.py, contract-identical to scripts/exp3/' +
      'compute_suite.py rows by construction. Read-only — does NOT mutate the ' +
      'corpus. By default keeps only SimContract-PASSED rows (positive SFT ' +
      'supervision). Returns: { path, rows, bytes, stats }.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        outPath: {
          type: 'string',
          description:
            'Destination JSONL path. Default: <data-dir>/compute-traces/compute-corpus.normalized.jsonl.',
        },
        passedOnly: {
          type: 'boolean',
          description:
            'Keep only rows whose mutation PASSED the SimContract (default true — positive supervision).',
        },
      },
    },
  },
  {
    name: 'holo_compute_trace_stats',
    description:
      'Diagnostics for the COMPUTE-AXIS corpus: where it lives on disk and how much ' +
      'REAL graded compute data has accrued (records, passed/failed, sessions, ' +
      'contracts). Read-only. Use to answer "is there real compute training data ' +
      'yet?" — 0 records means the corpus is still synthetic-bound.',
    inputSchema: { type: 'object' as const, properties: {} },
  },
];

export async function handleComputeTraceTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown | null> {
  switch (name) {
    case 'holo_grade_compute_mutation': {
      const result = gradeComputeMutation({
        sessionId: args.sessionId as string,
        instruction: args.instruction as string,
        contractId: args.contractId as string,
        scene: args.scene as string,
        bound: args.bound as ComputePropertyBound,
        mutation: args.mutation as ComputeMutation,
        expectedValue: args.expectedValue as number,
        opLabel: (args.opLabel as string | undefined) ?? null,
        caelReceiptRef: (args.caelReceiptRef as string | undefined) ?? null,
      });
      return {
        passed: result.passed,
        expectedValue: result.expectedValue,
        gradedValue: result.gradedValue,
        recorded: true,
        gradedAt: result.record.gradedAt,
      };
    }
    case 'holo_export_compute_traces': {
      const outPath = typeof args.outPath === 'string' ? args.outPath : undefined;
      const passedOnly = args.passedOnly === undefined ? true : Boolean(args.passedOnly);
      const result = exportTracesJsonl(outPath, { passedOnly });
      return { ...result, stats: computeTraceStats() };
    }
    case 'holo_compute_trace_stats':
      return computeTraceStats();
    default:
      return null;
  }
}
