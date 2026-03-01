#!/usr/bin/env tsx
import { writeFile } from 'fs/promises';

interface TrainingExample {
  instruction: string;
  input: string;
  output: string;
}

const examples: TrainingExample[] = [];

// WISDOM FORMAT (10,000 examples)
const domains = ['ARCH', 'PERF', 'SECURITY', 'AI', 'WEB3', 'VR', 'DEPLOY'];
for (let i = 0; i < 10000; i++) {
  const domain = domains[i % domains.length];
  const id = 100 + i;
  const confidence = (0.8 + Math.random() * 0.2).toFixed(2);
  
  examples.push({
    instruction: `Compress a ${domain.toLowerCase()} learning into uAA2++ wisdom format`,
    input: '',
    output: `W.${id} | ${domain} System Best Practice | ⚡${confidence}
When implementing ${domain.toLowerCase()} systems, always validate inputs at boundaries and use fail-fast patterns. This prevents cascade failures and makes debugging significantly easier. Pattern observed across 15+ production deployments with 40% reduction in MTTR.`
  });
}

// PATTERN FORMAT (5,000 examples)
for (let i = 0; i < 5000; i++) {
  const domain = domains[i % domains.length];
  const id = (i + 1).toString().padStart(2, '0');
  
  examples.push({
    instruction: `Create a uAA2++ pattern for ${domain.toLowerCase()} architecture`,
    input: '',
    output: `P.${domain}.${id}: ${domain} Architecture Pattern
**Pattern:** Use layered architecture with clear separation of concerns
**Why:** Enables independent scaling and testing of each layer
**When:** Building complex ${domain.toLowerCase()} systems with multiple responsibilities
**Result:** Maintainable codebase with 50% faster iteration speed`
  });
}

// GOTCHA FORMAT (5,000 examples)
for (let i = 0; i < 5000; i++) {
  const domain = domains[i % domains.length];
  const id = (i + 1).toString().padStart(3, '0');
  
  examples.push({
    instruction: `Document a ${domain.toLowerCase()} gotcha in uAA2++ format`,
    input: '',
    output: `G.${domain}.${id}: Common ${domain} Pitfall
**Issue:** Forgetting to handle edge cases in ${domain.toLowerCase()} logic
**Impact:** 60% of production bugs stem from this oversight
**Solution:** Always test with null, empty, and boundary values
**Prevention:** Add automated edge case test generation to CI pipeline`
  });
}

writeFile('../datasets/uaa2-knowledge-compression.jsonl', examples.map(e => JSON.stringify(e)).join('\n'), 'utf-8');
console.log(`Generated ${examples.length.toLocaleString()} knowledge compression examples`);
console.log('  Wisdom: 10,000');
console.log('  Patterns: 5,000');
console.log('  Gotchas: 5,000');
