import fs from 'node:fs';
import path from 'node:path';
import type { Task, DifficultyTier } from '../types';

const TIERS: DifficultyTier[] = ['trivial-scene', 'multi-object-scene', 'agentic-multi-step'];

export function loadAllTasks(rootDir = __dirname): Task[] {
  const out: Task[] = [];
  for (const tier of TIERS) {
    const file = path.join(rootDir, `${tier}.json`);
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw) as Task[];
    for (const t of parsed) {
      if (t.tier !== tier) {
        throw new Error(`task ${t.id} declares tier=${t.tier} but lives in ${tier}.json`);
      }
      out.push(t);
    }
  }
  if (out.length !== 30) {
    throw new Error(`expected exactly 30 tasks, loaded ${out.length}`);
  }
  return out;
}

export function loadQuickSubset(): Task[] {
  const all = loadAllTasks();
  const byTier = new Map<DifficultyTier, Task[]>();
  for (const t of all) {
    if (!byTier.has(t.tier)) byTier.set(t.tier, []);
    byTier.get(t.tier)!.push(t);
  }
  return TIERS.map((tier) => {
    const list = byTier.get(tier);
    if (!list || list.length === 0) {
      throw new Error(`no tasks for tier ${tier}`);
    }
    return list[0];
  });
}
