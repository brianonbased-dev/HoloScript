/**
 * Agent Attention Market — scoring prototype for board work
 *
 * Computes an attention score for each open task so agents
 * prioritize high-value work over low-value noise.
 *
 * Usage:
 *   node scripts/agent-attention-market.mjs --team <teamId>
 *   node scripts/agent-attention-market.mjs --dump   (uses local board snapshot)
 *
 * Scoring dimensions (0-100 each):
 *   priority        — P1=100, P2=75, P4=50, P8=25
 *   urgency         — grows with hours since creation
 *   claim_history   — tasks claimed-and-unclaimed get a difficulty bonus
 *   tag_match       — placeholder for agent-capability matching
 *   scope_size      — inverse of estimated_hours (smaller = higher score)
 *
 * Final score = weighted sum. Top 20 tasks returned.
 */

const PRIORITY_WEIGHTS = { P1: 100, P2: 75, P4: 50, P8: 25 };
const WEIGHTS = {
  priority: 0.55,
  urgency: 0.15,
  claim_history: 0.15,
  tag_match: 0.10,
  scope_size: 0.05,
};

function parsePriority(p) {
  const key = String(p).toUpperCase();
  return PRIORITY_WEIGHTS[key] || PRIORITY_WEIGHTS.P8;
}

function hoursSince(ts) {
  if (!ts) return 0;
  const created = typeof ts === 'string' ? new Date(ts) : new Date(Number(ts));
  return Math.max(0, (Date.now() - created.getTime()) / 36e5);
}

function urgencyScore(task) {
  const age = hoursSince(task.created_at || task.createdAt);
  // Cap at 72h for full urgency score
  return Math.min(100, (age / 72) * 100);
}

function claimHistoryScore(task) {
  const claims = task.claim_count || task.claimCount || 0;
  // More claims = more difficulty = higher attention needed
  return Math.min(100, claims * 20);
}

function tagMatchScore(task, agentTags = []) {
  if (!agentTags.length || !task.tags) return 50; // neutral
  const taskTags = Array.isArray(task.tags) ? task.tags : [];
  const overlap = taskTags.filter((t) => agentTags.includes(t)).length;
  return Math.min(100, (overlap / Math.max(1, taskTags.length)) * 100);
}

function scopeSizeScore(task) {
  const hours = task.estimated_hours || task.estimatedHours || 4;
  // Inverse: 1h = 100, 40h = 25
  return Math.min(100, Math.max(0, 100 - (hours - 1) * 2));
}

export function scoreTask(task, agentTags = []) {
  const priority = parsePriority(task.priority);
  const urgency = urgencyScore(task);
  const claimHistory = claimHistoryScore(task);
  const tagMatch = tagMatchScore(task, agentTags);
  const scopeSize = scopeSizeScore(task);

  const score =
    priority * WEIGHTS.priority +
    urgency * WEIGHTS.urgency +
    claimHistory * WEIGHTS.claim_history +
    tagMatch * WEIGHTS.tag_match +
    scopeSize * WEIGHTS.scope_size;

  return {
    task_id: task.id,
    title: task.title,
    priority: task.priority,
    score: Math.round(score * 10) / 10,
    breakdown: {
      priority,
      urgency: Math.round(urgency * 10) / 10,
      claim_history: claimHistory,
      tag_match: tagMatch,
      scope_size: scopeSize,
    },
  };
}

export function rankTasks(tasks, agentTags = []) {
  return tasks
    .map((t) => scoreTask(t, agentTags))
    .sort((a, b) => b.score - a.score);
}

async function fetchBoard(teamId) {
  const apiKey = process.env.HOLOMESH_API_KEY;
  const base = process.env.HOLOMESH_API_URL || 'https://mcp.holoscript.net/api/holomesh';
  const res = await fetch(`${base}/team/${teamId}/board`);
  if (!res.ok) throw new Error(`Board fetch failed: ${res.status}`);
  return res.json();
}

function parseArgs(argv) {
  const args = { team: null, dump: false, tags: [] };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--team') args.team = argv[++i];
    else if (argv[i] === '--dump') args.dump = true;
    else if (argv[i] === '--tags') args.tags = argv[++i].split(',');
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  let tasks;

  if (args.dump) {
    // Read from stdin or a local board.json
    const raw = require('fs').readFileSync(0, 'utf-8');
    const board = JSON.parse(raw);
    tasks = board.tasks?.filter((t) => t.status === 'open') || [];
  } else if (args.team) {
    const board = await fetchBoard(args.team);
    tasks = board.tasks?.filter((t) => t.status === 'open') || [];
  } else {
    console.error('Usage: node scripts/agent-attention-market.mjs --team <teamId> [--tags tag1,tag2]');
    console.error('   or: cat board.json | node scripts/agent-attention-market.mjs --dump [--tags tag1,tag2]');
    process.exit(1);
  }

  const ranked = rankTasks(tasks, args.tags);
  console.log(JSON.stringify(ranked.slice(0, 20), null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
