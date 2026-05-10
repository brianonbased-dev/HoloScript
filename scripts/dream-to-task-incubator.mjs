/**
 * Dream-to-Task Incubator — routine prototype
 *
 * Decomposes a high-level vision/dream into actionable board tasks.
 * Usage:
 *   node scripts/dream-to-task-incubator.mjs --dream dream.json
 *   cat dream.json | node scripts/dream-to-task-incubator.mjs --stdin
 *
 * The script outputs a JSON array of tasks that can be fed into
 *   /room add-tasks  (or POST /api/holomesh/team/:id/board)
 */

import { readFileSync, existsSync } from 'fs';

const PHASES = [
  {
    suffix: 'Research & Discovery',
    template: 'Survey existing work, identify gaps, and compile evidence for "{title}". Deliver a findings memo.',
    tags: ['research'],
  },
  {
    suffix: 'Architecture & Contract',
    template: 'Design the type contract, public API surface, and integration points for "{title}". Include trait/compiler impact analysis.',
    tags: ['architecture'],
  },
  {
    suffix: 'Prototype Implementation',
    template: 'Ship a runnable prototype of "{title}" with core happy-path working. Include 1-2 integration tests.',
    tags: ['implement'],
  },
  {
    suffix: 'Test Hardening & Edge Cases',
    template: 'Add false-case tests, stress the prototype, fix pre-existing failures for "{title}". Target >80% branch coverage.',
    tags: ['test'],
  },
  {
    suffix: 'Integration & Wiring',
    template: 'Wire the prototype into the real pipeline (ImportPipeline, compiler dispatch, studio UI, etc.) for "{title}". Verify end-to-end.',
    tags: ['integrate'],
  },
  {
    suffix: 'Documentation & Handoff',
    template: 'Write the skill memo, update NORTH_STAR if architecture changed, and post a handoff for "{title}".',
    tags: ['docs'],
  },
];

function parseArgs(argv) {
  const args = { stdin: false, dream: null, post: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--stdin') args.stdin = true;
    else if (argv[i] === '--dream') args.dream = argv[++i];
    else if (argv[i] === '--post') args.post = true;
  }
  return args;
}

function loadDream(args) {
  let raw;
  if (args.stdin) {
    raw = readFileSync(0, 'utf-8');
  } else if (args.dream && existsSync(args.dream)) {
    raw = readFileSync(args.dream, 'utf-8');
  } else {
    console.error('Usage: node scripts/dream-to-task-incubator.mjs --dream <dream.json>');
    console.error('   or: cat dream.json | node scripts/dream-to-task-incubator.mjs --stdin');
    process.exit(1);
  }
  return JSON.parse(raw);
}

function derivePriority(dream) {
  if (dream.priority) return dream.priority;
  if (dream.constraints?.some((c) => /critical|security|blocker/i.test(c))) return 'P1';
  if (dream.constraints?.some((c) => /performance|memory|scale/i.test(c))) return 'P2';
  return 'P4';
}

export function incubate(dream) {
  const baseTitle = dream.title || 'Untitled Dream';
  const baseVision = dream.vision || '';
  const constraints = dream.constraints || [];
  const priority = derivePriority(dream);
  const phases = dream.phases || PHASES;

  const tasks = phases.map((phase, idx) => {
    const title = `${baseTitle} — ${phase.suffix}`;
    const description = phase.template
      .replace('{title}', baseTitle)
      .replace('{vision}', baseVision)
      + (constraints.length ? `\n\nConstraints: ${constraints.join(', ')}` : '');

    return {
      title,
      description,
      priority,
      tags: [...(dream.tags || []), ...phase.tags],
      stage: idx === 0 ? 'research' : idx === phases.length - 1 ? 'docs' : 'implement',
      estimated_hours: dream.estimated_hours_per_phase || 4,
    };
  });

  return tasks;
}

async function postToBoard(tasks) {
  const teamId = process.env.HOLOMESH_TEAM_ID;
  const apiKey = process.env.HOLOMESH_API_KEY;
  const baseUrl = process.env.HOLOMESH_API_URL || 'https://mcp.holoscript.net/api/holomesh';

  if (!teamId || !apiKey) {
    console.error('HOLOMESH_TEAM_ID and HOLOMESH_API_KEY required for --post');
    process.exit(1);
  }

  const res = await fetch(`${baseUrl}/team/${teamId}/board`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ action: 'add', tasks }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Board POST failed: ${res.status} ${body}`);
  }
  return res.json();
}

async function main() {
  const args = parseArgs(process.argv);
  const dream = loadDream(args);
  const tasks = incubate(dream);

  if (args.post) {
    const result = await postToBoard(tasks);
    console.log(JSON.stringify({ success: true, added: result.added || tasks.length, tasks }, null, 2));
  } else {
    console.log(JSON.stringify(tasks, null, 2));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
