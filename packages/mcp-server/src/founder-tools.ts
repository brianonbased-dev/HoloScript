/**
 * MCP Founder Tools for HoloScript
 *
 * Provides structured founder decision-proxy rulings for agents.
 * Wraps the /founder skill protocol into a programmatic MCP interface.
 *
 * Reference: ~/.claude/skills/founder/SKILL.md
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';

export const founderTools: Tool[] = [
  {
    name: 'holo_founder',
    description:
      'Founder decision proxy for the HoloScript / Infinitus ecosystem. ' +
      'Takes an agent question and returns a structured ruling with authority layer, ' +
      'citation, and recommended action — so the agent can proceed without stalling. ' +
      'Use before: asking the founder, proposing a workaround/mock/fallback, ' +
      'reaching for a local/dev service where production exists, descoping a gap, ' +
      'or making editorial calls on the 17-paper program. ' +
      'Returns: JSON with layer, ruling, citation, action, and optional gap.',
    inputSchema: {
      type: 'object',
      properties: {
        question: {
          type: 'string',
          description:
            'The decision to resolve. Examples: ' +
            '"Should we ship X without tests?" | ' +
            '"Use absorb.holoscript.net or hit prod orchestrator?" | ' +
            '"Can we descope the navmesh for this sprint?" | ' +
            '"Which repo does this go in?" | ' +
            '"Is this a bandaid or a proper fix?"',
        },
        context: {
          type: 'string',
          description:
            'Optional additional context (e.g., "this is for a NeurIPS submission", ' +
            '"target audience is investors", "ship deadline is Friday").',
        },
        mode: {
          type: 'string',
          enum: ['single', 'batch'],
          description:
            'single = one question. batch = multiple questions separated by " // " ' +
            '(space-slash-slash-space). Defaults to single.',
        },
        explain: {
          type: 'boolean',
          description:
            'If true, returns the full reasoning chain (layer + citation + dynamic notes). ' +
            'If false (default), returns a concise ruling suitable for silent internalization.',
        },
      },
      required: ['question'],
    },
  },
];
