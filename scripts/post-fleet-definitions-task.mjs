#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

function loadAiEcosystemEnv() {
  const candidates = [join(homedir(), '.ai-ecosystem', '.env')];
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, 'utf-8').split('\n')) {
      if (line.match(/^\s*#/) || !line.includes('=')) continue;
      const i = line.indexOf('=');
      const k = line.slice(0, i).trim();
      let v = line.slice(i + 1).trim();
      v = v.replace(/^["']|["']$/g, '');
      process.env[k] = v;
    }
    break;
  }
}

loadAiEcosystemEnv();
const apiKey = process.env.HOLOMESH_API_KEY;
const teamId = process.env.HOLOMESH_TEAM_ID;
if (!apiKey || !teamId) {
  console.error('Missing HOLOMESH_API_KEY or HOLOMESH_TEAM_ID (load ~/.ai-ecosystem/.env)');
  process.exit(1);
}

const body = {
  tasks: [
    {
      title:
        '[research-ops] Fleet prod-replica matrix: paper to code paths, shared GPU profile, agent config; underutilized gap list',
      description: `Commenced from DEFINITIONS update 2026-04-26.
Deliver: (1) table or memo row per gated paper in research/ mapping prod-replica intent to HoloScript packages and ai-ecosystem agents; (2) list underutilized monorepo assets (snn-webgpu, llm-provider profiles, etc.) with wire-to-fleet or explicit defer; (3) align fleet harnesses to declared profiles.
Ref: HoloScript docs/Definitions.md and ai-ecosystem DEFINITIONS.md (Fleet, room and paper experiments).`,
      priority: 2,
      tags: ['docs', 'fleet', 'papers', 'research-ops'],
    },
  ],
};

const res = await fetch(`https://mcp.holoscript.net/api/holomesh/team/${teamId}/board`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(body),
});
const text = await res.text();
console.log(res.status, text);
