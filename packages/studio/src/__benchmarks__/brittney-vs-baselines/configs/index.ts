import Anthropic from '@anthropic-ai/sdk';
import type { ConfigName, ConfigRunner } from '../types';
import { makeBrittneyProd } from './brittney-prod';
import { makeClaudeCodeBaseline } from './claude-code-baseline';
import { makeCursorBaseline } from './cursor-baseline';
import { makeVanillaBaseline } from './vanilla-baseline';

export interface BuildConfigsOptions {
  anthropicApiKey: string;
  brittneyEndpoint: string;
  brittneyAuthHeader?: string;
  brittneyCookie?: string;
}

export function buildAllConfigs(opts: BuildConfigsOptions): ConfigRunner[] {
  const client = new Anthropic({ apiKey: opts.anthropicApiKey });
  return [
    makeBrittneyProd({
      endpoint: opts.brittneyEndpoint,
      authHeader: opts.brittneyAuthHeader,
      cookie: opts.brittneyCookie,
    }),
    makeCursorBaseline({ client }),
    makeClaudeCodeBaseline({ client }),
    makeVanillaBaseline({ client }),
  ];
}

export const ALL_CONFIG_NAMES: ConfigName[] = [
  'brittney-prod',
  'cursor-baseline',
  'claude-code-baseline',
  'vanilla-baseline',
];

export {
  makeBrittneyProd,
  makeCursorBaseline,
  makeClaudeCodeBaseline,
  makeVanillaBaseline,
};
