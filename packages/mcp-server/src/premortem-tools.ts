/**
 * MCP Premortem Tools for HoloScript
 *
 * Pre-mortem analysis for any plan, feature, deployment, or architectural decision.
 * Travels 6 months into the future and reports back how your next move failed.
 * Surfaces failure narratives, early warning signs, hidden assumptions, and a revised plan.
 *
 * Reference: ~/.claude/skills/premortem/SKILL.md
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';

export const premortemTools: Tool[] = [
  {
    name: 'holo_premortem',
    description:
      'Pre-mortem analysis for any plan, feature, deployment, or architectural decision. ' +
      'Travels 6 months into the future and reports back how the plan failed. ' +
      'Returns structured output: verdict (SOUND / PROCEED_WITH_CAUTION / RESTRUCTURE_REQUIRED / FATAL_FLAW), ' +
      'most likely failure story, most dangerous failure story, early warning signs, ' +
      'the single hidden assumption the plan rests on, a revised plan with gaps closed, ' +
      'and any irreducible risks. ' +
      'Use before shipping, before committing to architecture, before announcing, ' +
      'before any move where failure is expensive.',
    inputSchema: {
      type: 'object',
      properties: {
        target: {
          type: 'string',
          description:
            'What to pre-mortem. Builtin: "this" reads the current mode directive or recent git context. ' +
            'Any other string is treated as a file path if it exists on disk; otherwise it is used as the plan text directly.',
        },
        content: {
          type: 'string',
          description:
            'Optional explicit plan content. When provided, this overrides the resolved target content.',
        },
        context: {
          type: 'string',
          description:
            'Optional additional context (e.g. "ship deadline is Friday", "target audience is investors", ' +
            '"this is for a NeurIPS submission").',
        },
      },
      required: ['target'],
    },
  },
];
