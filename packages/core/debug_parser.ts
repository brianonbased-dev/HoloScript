import { HoloScriptPlusParser } from './src/parser/HoloScriptPlusParser';
import { readFileSync } from 'fs';
import { join } from 'path';

const parser = new HoloScriptPlusParser({ enableVRTraits: true });
const repoRoot = join(process.cwd(), '../..');

const examples = [
  'examples/hsplus/agents/moderator-agent.hsplus',
  'examples/hsplus/agents/planner-agent.hsplus',
  'examples/hsplus/agents/researcher-agent.hsplus',
  'examples/hsplus/agents/watcher-agent.hsplus',
  'examples/hsplus/multi-agent/planner-executor-reviewer.hsplus',
  'examples/hsplus/multi-agent/swarm-consensus.hsplus',
  'examples/hsplus/governance/norm-enforcer.hsplus',
];

import { writeFileSync } from 'fs';

const allErrors: Record<string, any> = {};

for (const e of examples) {
  const fullPath = join(repoRoot, e);
  const src = readFileSync(fullPath, 'utf8');
  const res = parser.parse(src);
  if (!res.success) {
    console.log('FAIL:', e);
    allErrors[e] = res.errors;
  } else {
    console.log('PASS:', e);
  }
}

writeFileSync('parser_errors.json', JSON.stringify(allErrors, null, 2), 'utf8');
