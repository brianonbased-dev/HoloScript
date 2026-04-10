/**
 * scaffolder.ts — Core scaffolding engine for project workspaces.
 *
 * When a user signs up and connects their GitHub repo, this module generates
 * a complete Claude-compatible project structure based on their Absorb scan
 * results: CLAUDE.md, NORTH_STAR.md, MEMORY.md, skills, hooks, daemon config,
 * and a HoloMesh team room.
 */

import {
  generateClaudeMd,
  generateNorthStarMd,
  generateMemoryMd,
  generateSkills,
  generateHooks,
  generateDaemonConfig,
  generateTeamRoomConfig,
} from './templates';
import type { SkillDefinition } from './templates/skills';
import type { HookDefinition } from './templates/hooks';
import type { DaemonConfig } from './templates/daemon-config';
import type { TeamRoomConfig } from './templates/team-room-config';

// ─── Input types ────────────────────────────────────────────────────────────

/**
 * ProjectDNA — everything we know about a user's repo from Absorb scanning.
 * This is the input to the scaffolder. The ScaffoldDNA alias is used internally
 * by templates for clarity.
 */
export interface ProjectDNA {
  /** Project display name (e.g. "my-awesome-app") */
  name: string;
  /** GitHub repo URL */
  repoUrl: string;
  /** Tech stack detected by Absorb (e.g. ['typescript', 'react', 'postgres']) */
  techStack: string[];
  /** Frameworks detected (e.g. ['next.js', 'express', 'prisma']) */
  frameworks: string[];
  /** Languages detected (e.g. ['ts', 'py', 'go']) */
  languages: string[];
  /** Number of packages (1 for single-package, >1 for monorepo) */
  packageCount: number;
  /** Test coverage percentage (0-100) */
  testCoverage: number;
  /** Code health score from Absorb (0-10) */
  codeHealthScore: number;
  /** Compilation targets suggested by Brittney */
  compilationTargets: string[];
  /** Suggested HoloScript traits */
  traits: string[];
}

/**
 * Alias used by template modules — identical to ProjectDNA.
 * Exported so templates can reference it without circular deps.
 */
export type ScaffoldDNA = ProjectDNA;

// ─── Output types ───────────────────────────────────────────────────────────

export interface ScaffoldResult {
  /** Generated CLAUDE.md content */
  claudeMd: string;
  /** Generated NORTH_STAR.md content */
  northStar: string;
  /** Generated MEMORY.md content */
  memoryIndex: string;
  /** Generated skill definitions (name + content) */
  skills: SkillDefinition[];
  /** Generated hook definitions (name + type + content) */
  hooks: HookDefinition[];
  /** Self-improvement daemon configuration */
  daemonConfig: DaemonConfig;
  /** HoloMesh team room configuration */
  teamRoomConfig: TeamRoomConfig;
}

// ─── Validation ─────────────────────────────────────────────────────────────

export class ScaffoldValidationError extends Error {
  constructor(
    message: string,
    public readonly field: string,
  ) {
    super(message);
    this.name = 'ScaffoldValidationError';
  }
}

function validateDNA(dna: ProjectDNA): void {
  if (!dna.name || dna.name.trim().length === 0) {
    throw new ScaffoldValidationError('Project name is required', 'name');
  }

  if (!dna.repoUrl || dna.repoUrl.trim().length === 0) {
    throw new ScaffoldValidationError('Repository URL is required', 'repoUrl');
  }

  // Basic URL validation
  if (!dna.repoUrl.startsWith('https://') && !dna.repoUrl.startsWith('git@')) {
    throw new ScaffoldValidationError(
      'Repository URL must start with https:// or git@',
      'repoUrl',
    );
  }

  if (!Array.isArray(dna.techStack)) {
    throw new ScaffoldValidationError('techStack must be an array', 'techStack');
  }

  if (!Array.isArray(dna.frameworks)) {
    throw new ScaffoldValidationError('frameworks must be an array', 'frameworks');
  }

  if (!Array.isArray(dna.languages)) {
    throw new ScaffoldValidationError('languages must be an array', 'languages');
  }

  if (typeof dna.packageCount !== 'number' || dna.packageCount < 0) {
    throw new ScaffoldValidationError(
      'packageCount must be a non-negative number',
      'packageCount',
    );
  }

  if (typeof dna.testCoverage !== 'number' || dna.testCoverage < 0 || dna.testCoverage > 100) {
    throw new ScaffoldValidationError(
      'testCoverage must be between 0 and 100',
      'testCoverage',
    );
  }

  if (typeof dna.codeHealthScore !== 'number' || dna.codeHealthScore < 0 || dna.codeHealthScore > 10) {
    throw new ScaffoldValidationError(
      'codeHealthScore must be between 0 and 10',
      'codeHealthScore',
    );
  }

  if (!Array.isArray(dna.compilationTargets)) {
    throw new ScaffoldValidationError(
      'compilationTargets must be an array',
      'compilationTargets',
    );
  }

  if (!Array.isArray(dna.traits)) {
    throw new ScaffoldValidationError('traits must be an array', 'traits');
  }
}

// ─── Scaffold engine ────────────────────────────────────────────────────────

/**
 * Generate a complete Claude-compatible project workspace from a ProjectDNA.
 *
 * @param dna - Project DNA from Absorb scan + Brittney suggestions
 * @returns ScaffoldResult with all generated files and configs
 * @throws ScaffoldValidationError if the DNA is invalid
 */
export function scaffoldProjectWorkspace(dna: ProjectDNA): ScaffoldResult {
  validateDNA(dna);

  // Normalize inputs
  const normalized: ProjectDNA = {
    ...dna,
    name: dna.name.trim(),
    repoUrl: dna.repoUrl.trim(),
    techStack: [...dna.techStack],
    frameworks: [...dna.frameworks],
    languages: [...dna.languages],
    compilationTargets: [...dna.compilationTargets],
    traits: [...dna.traits],
  };

  // Generate all artifacts
  const claudeMd = generateClaudeMd(normalized);
  const northStar = generateNorthStarMd(normalized);
  const memoryIndex = generateMemoryMd(normalized);
  const skills = generateSkills(normalized);
  const hooks = generateHooks(normalized);
  const daemonConfig = generateDaemonConfig(normalized);
  const teamRoomConfig = generateTeamRoomConfig(normalized);

  return {
    claudeMd,
    northStar,
    memoryIndex,
    skills,
    hooks,
    daemonConfig,
    teamRoomConfig,
  };
}
