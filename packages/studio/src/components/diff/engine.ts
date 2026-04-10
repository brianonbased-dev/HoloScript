import type { HoloComposition, ObjectDiff, DiffStatus, TextDiffLine } from './types';

export function diffCompositions(a: HoloComposition, b: HoloComposition): ObjectDiff[] {
  const diffs: ObjectDiff[] = [];
  const namesA = new Set(a.objects.map((o) => o.name));
  const namesB = new Set(b.objects.map((o) => o.name));

  // Objects in both
  for (const objA of a.objects) {
    const objB = b.objects.find((o) => o.name === objA.name);
    if (!objB) {
      diffs.push({
        name: objA.name,
        status: 'removed',
        objectA: objA,
        traitDiffs: objA.traits.map((t) => ({ name: t.name, status: 'removed' as DiffStatus })),
        propDiffs: objA.properties.map((p) => ({
          key: p.key,
          status: 'removed' as DiffStatus,
          valueA: p.value,
        })),
      });
      continue;
    }

    // Compare traits
    const traitsA = new Set(objA.traits.map((t) => t.name));
    const traitsB = new Set(objB.traits.map((t) => t.name));
    const traitDiffs: { name: string; status: DiffStatus }[] = [];

    for (const t of traitsA) {
      traitDiffs.push({ name: t, status: traitsB.has(t) ? 'unchanged' : 'removed' });
    }
    for (const t of traitsB) {
      if (!traitsA.has(t)) traitDiffs.push({ name: t, status: 'added' });
    }

    // Compare properties
    const propsA = new Map(objA.properties.map((p) => [p.key, p.value]));
    const propsB = new Map(objB.properties.map((p) => [p.key, p.value]));
    const propDiffs: { key: string; status: DiffStatus; valueA?: string; valueB?: string }[] = [];

    for (const [key, valA] of propsA) {
      const valB = propsB.get(key);
      if (valB === undefined) {
        propDiffs.push({ key, status: 'removed', valueA: valA });
      } else if (valA !== valB) {
        propDiffs.push({ key, status: 'modified', valueA: valA, valueB: valB });
      } else {
        propDiffs.push({ key, status: 'unchanged', valueA: valA, valueB: valB });
      }
    }
    for (const [key, valB] of propsB) {
      if (!propsA.has(key)) {
        propDiffs.push({ key, status: 'added', valueB: valB });
      }
    }

    const hasChanges =
      traitDiffs.some((d) => d.status !== 'unchanged') ||
      propDiffs.some((d) => d.status !== 'unchanged');

    diffs.push({
      name: objA.name,
      status: hasChanges ? 'modified' : 'unchanged',
      objectA: objA,
      objectB: objB,
      traitDiffs,
      propDiffs,
    });
  }

  // Objects only in B
  for (const objB of b.objects) {
    if (!namesA.has(objB.name)) {
      diffs.push({
        name: objB.name,
        status: 'added',
        objectB: objB,
        traitDiffs: objB.traits.map((t) => ({ name: t.name, status: 'added' as DiffStatus })),
        propDiffs: objB.properties.map((p) => ({
          key: p.key,
          status: 'added' as DiffStatus,
          valueB: p.value,
        })),
      });
    }
  }

  return diffs;
}

export function diffLines(linesA: string[], linesB: string[]): TextDiffLine[] {
  const result: TextDiffLine[] = [];

  // Simple LCS-based diff
  const m = linesA.length;
  const n = linesB.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (linesA[i - 1] === linesB[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to build diff
  const ops: TextDiffLine[] = [];
  let i = m,
    j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && linesA[i - 1] === linesB[j - 1]) {
      ops.push({ type: 'same', text: linesA[i - 1], lineA: i, lineB: j });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.push({ type: 'added', text: linesB[j - 1], lineB: j });
      j--;
    } else {
      ops.push({ type: 'removed', text: linesA[i - 1], lineA: i });
      i--;
    }
  }

  return ops.reverse();
}
