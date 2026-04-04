import { describe, it, expect } from 'vitest';
import {
  scaffoldProjectWorkspace,
  ScaffoldValidationError,
} from '../scaffolder';
import type { ProjectDNA, ScaffoldResult } from '../scaffolder';

// ─── Test fixtures ──────────────────────────────────────────────────────────

const typescriptReactDNA: ProjectDNA = {
  name: 'acme-dashboard',
  repoUrl: 'https://github.com/acme/dashboard',
  techStack: ['typescript', 'pnpm', 'eslint', 'vitest', 'prisma', 'docker'],
  frameworks: ['next.js', 'react'],
  languages: ['ts', 'tsx'],
  packageCount: 1,
  testCoverage: 45,
  codeHealthScore: 7,
  compilationTargets: ['web', 'react-native'],
  traits: ['responsive-layout', 'dark-mode', 'auth-flow'],
};

const pythonDjangoDNA: ProjectDNA = {
  name: 'inventory-api',
  repoUrl: 'https://github.com/warehouse/inventory-api',
  techStack: ['python', 'postgres', 'redis', 'docker'],
  frameworks: ['django'],
  languages: ['py'],
  packageCount: 1,
  testCoverage: 22,
  codeHealthScore: 5,
  compilationTargets: [],
  traits: ['rest-api', 'caching'],
};

const goMicroserviceDNA: ProjectDNA = {
  name: 'payment-gateway',
  repoUrl: 'https://github.com/fintech/payment-gateway',
  techStack: ['docker', 'kubernetes', 'grpc'],
  frameworks: [],
  languages: ['go'],
  packageCount: 3,
  testCoverage: 72,
  codeHealthScore: 8,
  compilationTargets: ['grpc', 'openapi'],
  traits: ['circuit-breaker', 'retry-policy'],
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('scaffoldProjectWorkspace', () => {
  describe('TypeScript/React project', () => {
    let result: ScaffoldResult;

    it('should scaffold without errors', () => {
      result = scaffoldProjectWorkspace(typescriptReactDNA);
      expect(result).toBeDefined();
    });

    it('should generate CLAUDE.md with project name', () => {
      expect(result.claudeMd).toContain('acme-dashboard');
    });

    it('should include TypeScript conventions in CLAUDE.md', () => {
      expect(result.claudeMd).toContain('TypeScript');
      expect(result.claudeMd).toContain('No `any`');
    });

    it('should include React conventions in CLAUDE.md', () => {
      expect(result.claudeMd).toContain('React');
      expect(result.claudeMd).toContain('Functional components');
    });

    it('should include Next.js conventions in CLAUDE.md', () => {
      expect(result.claudeMd).toContain('Next.js');
      expect(result.claudeMd).toContain('App Router');
    });

    it('should include pnpm build commands', () => {
      expect(result.claudeMd).toContain('pnpm install');
      expect(result.claudeMd).toContain('pnpm build');
      expect(result.claudeMd).toContain('pnpm test');
    });

    it('should generate NORTH_STAR.md with decision trees', () => {
      expect(result.northStar).toContain('DT-1');
      expect(result.northStar).toContain('DT-2');
      expect(result.northStar).toContain('DT-3');
      expect(result.northStar).toContain('DT-4');
      expect(result.northStar).toContain('DT-5');
    });

    it('should include vitest in test triage decision tree', () => {
      expect(result.northStar).toContain('vitest');
    });

    it('should generate MEMORY.md with architecture summary', () => {
      expect(result.memoryIndex).toContain('Architecture Summary');
      expect(result.memoryIndex).toContain('acme-dashboard');
    });

    it('should include framework info in MEMORY.md', () => {
      expect(result.memoryIndex).toContain('Next.js');
      expect(result.memoryIndex).toContain('Prisma');
    });

    it('should generate 4 skills', () => {
      expect(result.skills).toHaveLength(4);
      const names = result.skills.map(s => s.name);
      expect(names).toContain('scan');
      expect(names).toContain('dev');
      expect(names).toContain('documenter');
      expect(names).toContain('review');
    });

    it('should generate skills with valid YAML frontmatter', () => {
      for (const skill of result.skills) {
        expect(skill.content).toMatch(/^---\n/);
        expect(skill.content).toMatch(/\nname: /);
        expect(skill.content).toMatch(/\ndescription: /);
        expect(skill.content).toMatch(/\nargument-hint: /);
        expect(skill.content).toMatch(/\nallowed-tools: /);
        expect(skill.content).toMatch(/\ncontext: fork/);
        expect(skill.content).toMatch(/\nagent: general-purpose/);
      }
    });

    it('should generate 3 hooks', () => {
      expect(result.hooks).toHaveLength(3);
      const names = result.hooks.map(h => h.name);
      expect(names).toContain('validate-edit');
      expect(names).toContain('operation-counter');
      expect(names).toContain('session-report');
    });

    it('should set correct hook types', () => {
      const validateEdit = result.hooks.find(h => h.name === 'validate-edit');
      expect(validateEdit?.type).toBe('PostToolUse');

      const opCounter = result.hooks.find(h => h.name === 'operation-counter');
      expect(opCounter?.type).toBe('PostToolUse');

      const sessionReport = result.hooks.find(h => h.name === 'session-report');
      expect(sessionReport?.type).toBe('Stop');
    });

    it('should include eslint in validate-edit hook', () => {
      const hook = result.hooks.find(h => h.name === 'validate-edit');
      expect(hook?.content).toContain('eslint');
    });

    it('should generate daemon config with providers', () => {
      expect(result.daemonConfig.providers).toHaveLength(3);
      const names = result.daemonConfig.providers.map(p => p.name);
      expect(names).toContain('claude');
      expect(names).toContain('openai');
      expect(names).toContain('grok');
    });

    it('should generate daemon focus areas', () => {
      expect(result.daemonConfig.focusAreas.length).toBeGreaterThan(0);
    });

    it('should generate team room config', () => {
      expect(result.teamRoomConfig.roomId).toMatch(/^room-/);
      expect(result.teamRoomConfig.projectName).toBe('acme-dashboard');
    });

    it('should have 4 agent slots in team room', () => {
      expect(result.teamRoomConfig.agents).toHaveLength(4);
      const roles = result.teamRoomConfig.agents.map(a => a.role);
      expect(roles).toContain('orchestrator');
      expect(roles).toContain('daemon');
      expect(roles).toContain('knowledge');
      expect(roles).toContain('oracle');
    });

    it('should seed board with initial items', () => {
      expect(result.teamRoomConfig.board.length).toBeGreaterThan(0);
      // Should always have initial scan task
      const scanTask = result.teamRoomConfig.board.find(
        item => item.title.includes('initial Absorb scan'),
      );
      expect(scanTask).toBeDefined();
    });
  });

  describe('Python/Django project', () => {
    let result: ScaffoldResult;

    it('should scaffold without errors', () => {
      result = scaffoldProjectWorkspace(pythonDjangoDNA);
      expect(result).toBeDefined();
    });

    it('should include Python conventions in CLAUDE.md', () => {
      expect(result.claudeMd).toContain('Python');
      expect(result.claudeMd).toContain('Type hints');
    });

    it('should include Django conventions in CLAUDE.md', () => {
      expect(result.claudeMd).toContain('Django');
      expect(result.claudeMd).toContain('app-based structure');
    });

    it('should include pytest commands', () => {
      expect(result.claudeMd).toContain('pytest');
    });

    it('should include ruff/black for Python linting', () => {
      expect(result.claudeMd).toContain('ruff');
      expect(result.claudeMd).toContain('black');
    });

    it('should detect low test coverage in MEMORY.md', () => {
      expect(result.memoryIndex).toContain('coverage below');
    });

    it('should include pytest in test triage decision tree', () => {
      expect(result.northStar).toContain('pytest');
    });

    it('should have test-coverage as high-priority daemon focus', () => {
      const testFocus = result.daemonConfig.focusAreas.find(
        f => f.area === 'test-coverage',
      );
      expect(testFocus).toBeDefined();
      expect(testFocus?.priority).toBe(1);
    });

    it('should include ruff in validate-edit hook for Python', () => {
      const hook = result.hooks.find(h => h.name === 'validate-edit');
      expect(hook?.content).toContain('ruff');
      expect(hook?.content).toContain('.py');
    });

    it('should seed board with coverage task for low coverage', () => {
      const coverageTask = result.teamRoomConfig.board.find(
        item => item.title.includes('coverage'),
      );
      expect(coverageTask).toBeDefined();
      // 22% is below 50 but above 20 — priority is medium
      expect(['critical', 'medium']).toContain(coverageTask?.priority);
    });
  });

  describe('Go microservice project', () => {
    let result: ScaffoldResult;

    it('should scaffold without errors', () => {
      result = scaffoldProjectWorkspace(goMicroserviceDNA);
      expect(result).toBeDefined();
    });

    it('should include Go conventions in CLAUDE.md', () => {
      expect(result.claudeMd).toContain('Go');
      expect(result.claudeMd).toContain('cmd/');
      expect(result.claudeMd).toContain('internal/');
    });

    it('should include go build commands', () => {
      expect(result.claudeMd).toContain('go build');
      expect(result.claudeMd).toContain('go test');
    });

    it('should include Go error handling conventions', () => {
      expect(result.claudeMd).toContain('Error handling');
      expect(result.claudeMd).toContain('context.Context');
    });

    it('should detect monorepo structure in MEMORY.md', () => {
      expect(result.memoryIndex).toContain('Monorepo');
      expect(result.memoryIndex).toContain('3 packages');
    });

    it('should include go test in decision trees', () => {
      expect(result.northStar).toContain('go test');
    });

    it('should include go build in error recovery decision tree', () => {
      expect(result.northStar).toContain('go build');
    });

    it('should include Go conventions in review skill', () => {
      const reviewSkill = result.skills.find(s => s.name === 'review');
      expect(reviewSkill?.content).toContain('errors must be checked');
    });

    it('should include compilation targets in NORTH_STAR', () => {
      expect(result.northStar).toContain('grpc');
      expect(result.northStar).toContain('openapi');
    });

    it('should include traits on the board', () => {
      const traitTask = result.teamRoomConfig.board.find(
        item => item.title.includes('traits'),
      );
      expect(traitTask).toBeDefined();
    });

    it('should use gofmt in validate-edit hook', () => {
      const hook = result.hooks.find(h => h.name === 'validate-edit');
      expect(hook?.content).toContain('gofmt');
      expect(hook?.content).toContain('.go');
    });

    it('should have good coverage reflected in daemon config', () => {
      // 72% coverage — should not be priority 1
      const testFocus = result.daemonConfig.focusAreas.find(
        f => f.area === 'test-coverage',
      );
      // Either not present (good) or low priority
      if (testFocus) {
        expect(testFocus.priority).toBeGreaterThan(1);
      }
    });
  });

  describe('all required files are generated', () => {
    it('should produce all fields in ScaffoldResult', () => {
      const result = scaffoldProjectWorkspace(typescriptReactDNA);

      expect(typeof result.claudeMd).toBe('string');
      expect(result.claudeMd.length).toBeGreaterThan(100);

      expect(typeof result.northStar).toBe('string');
      expect(result.northStar.length).toBeGreaterThan(100);

      expect(typeof result.memoryIndex).toBe('string');
      expect(result.memoryIndex.length).toBeGreaterThan(100);

      expect(Array.isArray(result.skills)).toBe(true);
      expect(result.skills.length).toBe(4);

      expect(Array.isArray(result.hooks)).toBe(true);
      expect(result.hooks.length).toBe(3);

      expect(result.daemonConfig).toBeDefined();
      expect(result.daemonConfig.enabled).toBe(true);
      expect(result.daemonConfig.providers.length).toBeGreaterThan(0);

      expect(result.teamRoomConfig).toBeDefined();
      expect(result.teamRoomConfig.roomId).toBeTruthy();
      expect(result.teamRoomConfig.agents.length).toBe(4);
    });

    it('should produce valid markdown in all md outputs', () => {
      const result = scaffoldProjectWorkspace(typescriptReactDNA);

      // All markdown should start with a heading
      expect(result.claudeMd).toMatch(/^# /);
      expect(result.northStar).toMatch(/^# /);
      expect(result.memoryIndex).toMatch(/^# /);
    });
  });

  describe('tech-stack-specific conventions', () => {
    it('should not include Python conventions for TypeScript project', () => {
      const result = scaffoldProjectWorkspace(typescriptReactDNA);
      expect(result.claudeMd).not.toContain('Python Conventions');
      expect(result.claudeMd).not.toContain('pytest');
    });

    it('should not include TypeScript conventions for Python project', () => {
      const result = scaffoldProjectWorkspace(pythonDjangoDNA);
      expect(result.claudeMd).not.toContain('TypeScript Conventions');
    });

    it('should not include Go conventions for TypeScript project', () => {
      const result = scaffoldProjectWorkspace(typescriptReactDNA);
      expect(result.claudeMd).not.toContain('Go Conventions');
    });

    it('should not include React conventions for Go project', () => {
      const result = scaffoldProjectWorkspace(goMicroserviceDNA);
      expect(result.claudeMd).not.toContain('React Conventions');
    });
  });

  describe('validation', () => {
    it('should reject empty name', () => {
      const dna = { ...typescriptReactDNA, name: '' };
      expect(() => scaffoldProjectWorkspace(dna)).toThrow(ScaffoldValidationError);
    });

    it('should reject empty repoUrl', () => {
      const dna = { ...typescriptReactDNA, repoUrl: '' };
      expect(() => scaffoldProjectWorkspace(dna)).toThrow(ScaffoldValidationError);
    });

    it('should reject invalid repoUrl', () => {
      const dna = { ...typescriptReactDNA, repoUrl: 'not-a-url' };
      expect(() => scaffoldProjectWorkspace(dna)).toThrow(ScaffoldValidationError);
    });

    it('should reject negative testCoverage', () => {
      const dna = { ...typescriptReactDNA, testCoverage: -5 };
      expect(() => scaffoldProjectWorkspace(dna)).toThrow(ScaffoldValidationError);
    });

    it('should reject testCoverage over 100', () => {
      const dna = { ...typescriptReactDNA, testCoverage: 150 };
      expect(() => scaffoldProjectWorkspace(dna)).toThrow(ScaffoldValidationError);
    });

    it('should reject codeHealthScore over 10', () => {
      const dna = { ...typescriptReactDNA, codeHealthScore: 15 };
      expect(() => scaffoldProjectWorkspace(dna)).toThrow(ScaffoldValidationError);
    });

    it('should reject negative packageCount', () => {
      const dna = { ...typescriptReactDNA, packageCount: -1 };
      expect(() => scaffoldProjectWorkspace(dna)).toThrow(ScaffoldValidationError);
    });

    it('should accept git@ SSH URLs', () => {
      const dna = { ...typescriptReactDNA, repoUrl: 'git@github.com:acme/dashboard.git' };
      const result = scaffoldProjectWorkspace(dna);
      expect(result.claudeMd).toContain('git@github.com');
    });
  });
});
