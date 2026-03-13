#!/usr/bin/env npx tsx
/**
 * Novel Use Cases Training Dataset Generator
 *
 * Reads .holo, .hsplus, and .hs files from examples/novel-use-cases/
 * and generates Alpaca-format JSONL instruction-response pairs for
 * TrainingMonkey fine-tuning.
 *
 * Instruction types generated per file:
 *   1. "Explain" — summarize what the composition does
 *   2. "Traits"  — identify v5 traits used
 *   3. "Format"  — explain why this format (.holo/.hsplus/.hs) is used
 *   4. "Economy" — analyze economy/feedback patterns
 *
 * Usage:
 *   npx tsx packages/core/src/training/scripts/generate-novel-use-cases-dataset.ts
 *
 * Output:
 *   packages/core/src/training/data/novel-use-cases.jsonl
 */

import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXAMPLES_DIR = join(__dirname, '..', '..', '..', '..', '..', 'examples', 'novel-use-cases');
const OUTPUT_PATH = join(__dirname, '..', 'data', 'novel-use-cases.jsonl');

// =============================================================================
// USE CASE METADATA
// =============================================================================

const USE_CASE_META: Record<string, { domain: string; summary: string; v5Traits: string[] }> = {
  '01-quantum-materials-arena':  { domain: 'Materials Science', summary: 'Quantum circuit simulation arena for materials discovery using VQE/QAOA algorithms', v5Traits: ['agent_portal', 'economy', 'feedback_loop', 'post_quantum_audit'] },
  '02-scifi-future-vision':      { domain: 'Entertainment/Creative', summary: 'Collaborative sci-fi worldbuilding with multi-faction lore voting and plot branching', v5Traits: ['agent_portal', 'economy', 'cultural_profile', 'norm_compliant'] },
  '03-water-scarcity-swarm':     { domain: 'Environmental/Climate', summary: 'Autonomous water monitoring swarm with IoT sensor fusion and mitigation planning', v5Traits: ['agent_portal', 'economy', 'feedback_loop', 'norm_compliant', 'post_quantum_audit'] },
  '04-ethical-ai-sandbox':       { domain: 'AI Safety', summary: 'Embodied AI alignment sandbox with norm enforcement, dilemma generation, and self-reporting', v5Traits: ['agent_portal', 'cultural_profile', 'norm_compliant'] },
  '05-robot-training-metaverse': { domain: 'Robotics', summary: 'Sim-to-real robot training with curriculum learning and transfer validation', v5Traits: ['agent_portal', 'economy', 'feedback_loop', 'digital_twin'] },
  '06-neurodiverse-therapy':     { domain: 'Healthcare/Therapy', summary: 'Adaptive sensory therapy for neurodiverse users with biometric-driven environment adjustment', v5Traits: ['agent_portal', 'economy', 'feedback_loop', 'tenant'] },
  '07-wildfire-response-swarm':  { domain: 'Emergency Response', summary: 'Wildfire detection and containment coordination with incident command and resource allocation', v5Traits: ['agent_portal', 'economy', 'feedback_loop', 'norm_compliant', 'post_quantum_audit'] },
  '08-healthspan-twin':          { domain: 'Healthcare/Longevity', summary: 'Personal digital twin for biomarker tracking, trend detection, and intervention simulation', v5Traits: ['agent_portal', 'economy', 'feedback_loop', 'tenant'] },
  '09-scifi-cocreation-metaverse': { domain: 'Entertainment/Creative', summary: 'Multi-faction co-creation metaverse with cultural memory and faction balance feedback', v5Traits: ['agent_portal', 'economy', 'cultural_profile', 'cultural_memory'] },
  '10-urban-planning-governance': { domain: 'Civic/Governance', summary: 'Democratic urban planning simulator with referendum engine and one-vote-per-citizen norms', v5Traits: ['agent_portal', 'economy', 'norm_compliant', 'tenant'] },
  '11-sensory-therapy-worlds':   { domain: 'Healthcare/Therapy', summary: 'Persistent sensory therapy worlds with progressive milestones and emergency overwhelm handling', v5Traits: ['agent_portal', 'economy', 'feedback_loop', 'tenant'] },
  '12-heritage-revival-museum':  { domain: 'Cultural Heritage', summary: 'Digital heritage museum with provenance verification, restoration bounties, and cultural memory', v5Traits: ['agent_portal', 'economy', 'cultural_profile', 'cultural_memory', 'post_quantum_audit'] },
  '13-disaster-robotics-swarm':  { domain: 'Robotics/Emergency', summary: 'Disaster rescue robot swarm training with curriculum evolution and skill market', v5Traits: ['agent_portal', 'economy', 'feedback_loop', 'digital_twin'] },
};

// =============================================================================
// FORMAT DESCRIPTIONS
// =============================================================================

const FORMAT_DESC: Record<string, string> = {
  '.holo':   'Declarative scene composition — defines WHAT exists (entities, templates, panels, environment). Uses `composition`, `entity`, `template`, `panel` blocks.',
  '.hsplus': 'Behavioral contracts — defines HOW things behave. Uses `module` with `exports`, `@state_machine` with guarded transitions, `@on_event` reactive handlers.',
  '.hs':     'Procedural pipelines — defines sequential PROCESS flow. Uses `object` stages with `function`, `connect A.event -> B.fn` wiring, `execute fn() every Nms`.',
};

// =============================================================================
// INSTRUCTION GENERATORS
// =============================================================================

interface AlpacaEntry {
  instruction: string;
  input: string;
  output: string;
}

function generateExplainPair(filename: string, source: string, meta: typeof USE_CASE_META[string]): AlpacaEntry {
  return {
    instruction: `Explain what this HoloScript ${extname(filename)} composition does and what domain it targets.`,
    input: source.substring(0, 800),
    output: `This is a ${meta.domain} application. ${meta.summary}. It uses HoloScript v5 Autonomous Ecosystems traits including ${meta.v5Traits.join(', ')}. The composition is written in ${extname(filename)} format, which is ${FORMAT_DESC[extname(filename)]?.split(' — ')[0] || 'a HoloScript format'}.`,
  };
}

function generateTraitsPair(filename: string, source: string, meta: typeof USE_CASE_META[string]): AlpacaEntry {
  const traits = meta.v5Traits;
  const traitDescs: Record<string, string> = {
    agent_portal: 'enables agent migration and cross-world communication',
    economy: 'provides credit-based resource management and bounty systems',
    feedback_loop: 'self-optimization through metric tracking and adjustment signals',
    post_quantum_audit: 'cryptographic audit trail using ML-KEM-768 algorithm',
    cultural_profile: 'cooperation norms, dialect, and cultural family settings',
    cultural_memory: 'episodic memory with consolidation and trace detection',
    norm_compliant: 'hard/soft norm enforcement with violation tracking',
    tenant: 'multi-tenant RBAC isolation (e.g., HIPAA compliance)',
    digital_twin: 'ROS2Bridge for sim-to-real synchronization',
  };

  const details = traits.map(t => `- **${t}**: ${traitDescs[t] || 'v5 trait'}`).join('\n');
  return {
    instruction: `What v5 Autonomous Ecosystems traits does this HoloScript composition use, and what does each one do?`,
    input: source.substring(0, 600),
    output: `This ${meta.domain} composition uses ${traits.length} v5 traits:\n${details}`,
  };
}

function generateFormatPair(filename: string, source: string, meta: typeof USE_CASE_META[string]): AlpacaEntry {
  const ext = extname(filename);
  return {
    instruction: `Why is the ${ext} format used for this HoloScript composition instead of other formats?`,
    input: source.substring(0, 500),
    output: `The ${ext} format is used because: ${FORMAT_DESC[ext] || 'it is appropriate for this use case'}. For this ${meta.domain} application (${meta.summary}), the ${ext} format is ideal because it ${ext === '.holo' ? 'declares the full scene hierarchy with entities, templates, and panels' : ext === '.hsplus' ? 'encapsulates reactive behavior in modules with state machines and event handlers' : 'expresses the sequential processing pipeline with connect wiring between stages'}.`,
  };
}

function generateEconomyPair(filename: string, source: string, meta: typeof USE_CASE_META[string]): AlpacaEntry | null {
  if (!meta.v5Traits.includes('economy')) return null;

  const hasEarn = source.includes('economy:earn') || source.includes('earn');
  const hasSpend = source.includes('economy:spend') || source.includes('spend');
  const hasBounty = source.includes('bounty');
  const hasTransfer = source.includes('economy:transfer') || source.includes('transfer');
  const hasFeedback = source.includes('feedback:') || source.includes('feedback_loop');

  const patterns: string[] = [];
  if (hasEarn) patterns.push('credit earning for completed tasks');
  if (hasSpend) patterns.push('credit spending for resource consumption');
  if (hasBounty) patterns.push('bounty posting and claiming for task delegation');
  if (hasTransfer) patterns.push('credit transfers between agents');
  if (hasFeedback) patterns.push('feedback loop optimization signals');

  return {
    instruction: `What economy and feedback patterns does this HoloScript composition implement?`,
    input: source.substring(0, 600),
    output: `This ${meta.domain} composition implements the following economy/feedback patterns:\n${patterns.map(p => `- ${p}`).join('\n')}\n\nThe economy trait provides a credit-based resource management system where agents earn credits for valuable work and spend them on computational resources. ${hasFeedback ? 'The feedback_loop trait enables self-optimization: metrics are tracked continuously and optimization signals are emitted when trends change, allowing agents to auto-adjust their behavior.' : ''}`,
  };
}

// =============================================================================
// MAIN
// =============================================================================

function main(): void {
  console.log('='.repeat(60));
  console.log('  Novel Use Cases Training Dataset Generator');
  console.log('='.repeat(60));

  const files = readdirSync(EXAMPLES_DIR)
    .filter(f => ['.holo', '.hsplus', '.hs'].includes(extname(f)))
    .sort();

  console.log(`\nFound ${files.length} source files in ${EXAMPLES_DIR}`);

  const entries: AlpacaEntry[] = [];

  for (const file of files) {
    const source = readFileSync(join(EXAMPLES_DIR, file), 'utf-8');
    const key = basename(file, extname(file));
    const meta = USE_CASE_META[key];

    if (!meta) {
      console.log(`  SKIP ${file} — no metadata`);
      continue;
    }

    // Generate instruction-response pairs
    entries.push(generateExplainPair(file, source, meta));
    entries.push(generateTraitsPair(file, source, meta));
    entries.push(generateFormatPair(file, source, meta));

    const economyPair = generateEconomyPair(file, source, meta);
    if (economyPair) entries.push(economyPair);

    console.log(`  ✓ ${file} — ${economyPair ? 4 : 3} pairs`);
  }

  // Write JSONL
  const outputDir = dirname(OUTPUT_PATH);
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

  const jsonl = entries.map(e => JSON.stringify(e)).join('\n') + '\n';
  writeFileSync(OUTPUT_PATH, jsonl, 'utf-8');

  const sizeMB = (Buffer.byteLength(jsonl, 'utf-8') / (1024 * 1024)).toFixed(3);

  console.log(`\n--- Results ---`);
  console.log(`  Files processed: ${files.length}`);
  console.log(`  Entries generated: ${entries.length}`);
  console.log(`  Output: ${OUTPUT_PATH}`);
  console.log(`  Size: ${sizeMB} MB`);
  console.log('Done.');
}

main();
