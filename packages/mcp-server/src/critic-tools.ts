/**
 * MCP Critic Tools for HoloScript
 *
 * Provides structured, brutal-honest critique of code, architecture,
 * documentation, pitches, demos, and infrastructure. Uses an LLM-backed
 * pipeline with the critic skill protocol.
 *
 * Reference: ~/.claude/skills/critic/SKILL.md
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';

export const criticTools: Tool[] = [
  {
    name: 'holo_critic',
    description:
      'Brutal honest critic for the HoloScript ecosystem. ' +
      'Takes code, architecture descriptions, pitch materials, demos, docs, or infrastructure configs ' +
      'and returns a structured verdict (NOT_READY / FRAGILE / ADEQUATE / WOULD_LAND) ' +
      'plus categorized findings (Critical / Serious / Annoying / Nitpick). ' +
      'Every criticism includes what is wrong, why it matters, and what good looks like. ' +
      'Use before shipping, presenting, or submitting to review.',
    inputSchema: {
      type: 'object',
      properties: {
        target: {
          type: 'string',
          description:
            'What to critique. Builtin modes: file | pitch | demo | architecture | tests | docs | studio | absorb | holomesh | infra | full | code. ' +
            'Any other string is treated as a file path and the file is read and critiqued.',
        },
        content: {
          type: 'string',
          description:
            'The content to critique (code, text, architecture description, pitch text, etc.). ' +
            'If target is a file path, this field is optional and the file content is read from disk.',
        },
        mode: {
          type: 'string',
          enum: ['code', 'pitch', 'full'],
          description:
            'Output format mode. code = VERDICT + Critical/Serious/Annoying/Nitpick sections. ' +
            'pitch = VERDICT + challengeable lines + claims without evidence + skeptic view + what would make it undeniable. ' +
            'full = runs all applicable critique dimensions and returns the union. Defaults to code.',
        },
        context: {
          type: 'string',
          description:
            'Optional additional context (e.g. "this is for a NeurIPS submission", "target audience is investors", ' +
            '"ship deadline is Friday").',
        },
      },
      required: ['target'],
    },
  },
];
