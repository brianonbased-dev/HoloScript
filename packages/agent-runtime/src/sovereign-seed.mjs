export const SOVEREIGN_SEED_PROMPT_SCHEMA = 'holoscript.agent-runtime.sovereign-seed-prompt.v1';

export const DEFAULT_SOVEREIGN_TOP_BUN_QUESTIONS = [
  {
    id: 'served-audience',
    question: 'Who is served: founder, agents, outside users, outside agents, or all of them?',
    evidence: 'Name each audience and one concrete outcome the surface gives them.',
  },
  {
    id: 'sovereign-novelty',
    question: 'Is this the most sovereign and novel route, or only a clone of a vendor workflow?',
    evidence:
      'Show caller-owned storage, identity, proof, and the HoloScript/HoloRepo move that makes it unlike the base workflow.',
  },
  {
    id: 'public-consumption',
    question:
      'Can a cold external agent consume this through public packages or cloud rails without founder-local context?',
    evidence:
      'Name the npm, PyPI, MCP, HoloRepo, or cloud readback path and the command that proves it.',
  },
  {
    id: 'db-ks-gold',
    question:
      "Does the seed create the operator's own DB, KS, and GOLD-compatible authority lane instead of copying founder state?",
    evidence:
      'Provide the HoloRepo config path, DB proof, KS proof, and GOLD-compatible bundle or adapter boundary.',
  },
  {
    id: 'human-agent-fit',
    question:
      'Can both a human operator and an agent run the loop, recover, and understand the boundary?',
    evidence:
      'Provide one human command, one JSON/CLI agent path, rollback notes, and known limits.',
  },
  {
    id: 'ai-first-runtime',
    question:
      'Is the runtime AI-first instead of a wrapper around chat, shell, or vendor session state?',
    evidence:
      'Name the first-class runtime resources: intent, memory, knowledge, tools, decisions, telemetry, receipts, recovery, and next actions.',
  },
  {
    id: 'second-brain-continuity',
    question:
      'What durable second-brain state survives sessions, devices, and sibling agent handoff?',
    evidence:
      'Provide caller-owned memory, KS/DB, GOLD-compatible authority, and handoff continuity proof without copying founder state.',
  },
  {
    id: 'autonomous-loop-control',
    question: 'Can the runtime run a bounded autonomous loop without live operator babysitting?',
    evidence:
      'Show plan, act, verify, remember, coordinate, recover, improve, stop conditions, rollback, and spend/custody gates.',
  },
  {
    id: 'self-improvement-farming',
    question:
      'How do outcomes, failures, telemetry, user intent, benchmarks, and package readbacks become the next improvement?',
    evidence:
      'Cite the memory/knowledge write, benchmark delta, task, idea seed, eval/corpus update, or package gate receipt.',
  },
  {
    id: 'self-improvement',
    question: 'What receipt, benchmark, or package gate feeds the next self-improvement pass?',
    evidence:
      'Cite a validation command, readback receipt, benchmark, or HoloRepo/HoloGate admission target.',
  },
];

function cleanText(value, fallback) {
  const text = String(value || '').trim();
  return text || fallback;
}

function cleanList(values, fallback = []) {
  const list = Array.isArray(values) ? values : fallback;
  return [...new Set(list.map((value) => String(value || '').trim()).filter(Boolean))];
}

function packageEntry(id, name, role, releaseLane = 'public') {
  return { id, name, role, releaseLane };
}

function renderSeedPrompt({
  productName,
  masterCanonLabel,
  packages,
  goldPackage,
  questions,
  requiredOutputs,
  includeCommands,
}) {
  const packageLines = packages.map((pkg) => `- ${pkg.name}: ${pkg.role} (${pkg.releaseLane})`);
  const questionLines = questions.map(
    (item, index) => `${index + 1}. ${item.question}\n   Evidence: ${item.evidence}`
  );
  const outputLines = requiredOutputs.map((item) => `- ${item}`);
  const commandLines = includeCommands
    ? [
        'npx -y @holoscript/holorepo init --storage-root <operator-owned-storage>',
        'npx -y @holoscript/holorepo doctor --json',
        'python -m pip install holoscript-holorepo',
      ]
    : [];

  return [
    `You are bootstrapping ${productName} from ${masterCanonLabel}.`,
    '',
    'Treat the canon as a prompt seed, not as founder state to copy. Your job is to grow an operator-owned substrate: HoloRepo config, DB, KS, receipts, a GOLD-compatible authority lane, and an AI-first runtime that can act as a second brain with bounded autonomous improvement. If a package or rail is not public yet, keep it behind an adapter boundary and say so.',
    '',
    'Public package rails:',
    ...packageLines,
    `- ${goldPackage.name}: future GOLD authority package (${goldPackage.releaseLane}); do not require it until published.`,
    '',
    'Top-bun questions before build or publish:',
    ...questionLines,
    '',
    'Required output:',
    ...outputLines,
    ...(commandLines.length ? ['', 'Starter commands:', ...commandLines] : []),
    '',
    'Return machine-readable JSON first, then a short human summary. Do not emit secrets, private paths, founder-local constants, wallet material, or raw database credentials.',
  ].join('\n');
}

export function buildSovereignSeedPrompt({
  productName = 'a HoloScript ecosystem',
  masterCanonLabel = 'the master canon',
  holorepoPackage = '@holoscript/holorepo',
  holorepoPyPackage = 'holoscript-holorepo',
  agentRuntimePackage = '@holoscript/agent-runtime',
  memoryPackage = '@holoscript/memory',
  goldPackage = '@holoscript/gold',
  goldReleaseLane = 'unreleased',
  questions = DEFAULT_SOVEREIGN_TOP_BUN_QUESTIONS,
  includeCommands = true,
} = {}) {
  const cleanProductName = cleanText(productName, 'a HoloScript ecosystem');
  const cleanCanon = cleanText(masterCanonLabel, 'the master canon');
  const cleanQuestions = (
    Array.isArray(questions) && questions.length ? questions : DEFAULT_SOVEREIGN_TOP_BUN_QUESTIONS
  ).map((item) => ({
    id: cleanText(item.id, 'question'),
    question: cleanText(
      item.question,
      'What must be true before this seed becomes a public consumption path?'
    ),
    evidence: cleanText(item.evidence, 'Name the receipt, command, or boundary.'),
  }));
  const packageRails = [
    packageEntry(
      'holorepo-npm',
      cleanText(holorepoPackage, '@holoscript/holorepo'),
      'JS/CLI HoloRepo bootstrap, graph, DB, KS, delivery, and receipts'
    ),
    packageEntry(
      'holorepo-pypi',
      cleanText(holorepoPyPackage, 'holoscript-holorepo'),
      'Python HoloRepo companion for DB/KS and agent-framework use'
    ),
    packageEntry(
      'agent-runtime',
      cleanText(agentRuntimePackage, '@holoscript/agent-runtime'),
      'Family-neutral runtime, memory, injection, and seed prompt helpers'
    ),
    packageEntry(
      'memory',
      cleanText(memoryPackage, '@holoscript/memory'),
      'Optional sovereign memory store peer; callers may use MCP fallback'
    ),
  ];
  const gold = {
    name: cleanText(goldPackage, '@holoscript/gold'),
    releaseLane: cleanText(goldReleaseLane, 'unreleased'),
    boundary:
      'GOLD is authority intake. Until the public package ships, consumers create a GOLD-compatible local bundle through caller-owned adapters.',
  };
  const requiredOutputs = cleanList([
    'holorepo.config.v1 using operator-owned storage and environment-provided credentials',
    'database proof or explicit DB-not-applicable receipt',
    'knowledge-store proof or explicit KS-not-applicable receipt',
    'GOLD-compatible authority bundle, adapter boundary, or future package migration note',
    'AI-first runtime resource contract for intent, memory, knowledge, tools, decisions, telemetry, receipts, recovery, and next actions',
    'second-brain continuity proof across sessions, devices, and agent-family handoff',
    'bounded autonomy envelope with stop conditions, rollback, spend/custody gates, and next-work farming',
    'public package/cloud readback commands',
    'human runbook plus agent-operable JSON/CLI path',
    'rollback, supersession, or recovery route',
  ]);

  return {
    schema: SOVEREIGN_SEED_PROMPT_SCHEMA,
    productName: cleanProductName,
    masterCanonLabel: cleanCanon,
    principle:
      'Seed with canon, then grow caller-owned HoloRepo DB, KS, GOLD-compatible authority, receipts, and package rails.',
    packages: packageRails,
    goldPackage: gold,
    questions: cleanQuestions,
    requiredOutputs,
    prompt: renderSeedPrompt({
      productName: cleanProductName,
      masterCanonLabel: cleanCanon,
      packages: packageRails,
      goldPackage: gold,
      questions: cleanQuestions,
      requiredOutputs,
      includeCommands,
    }),
  };
}
