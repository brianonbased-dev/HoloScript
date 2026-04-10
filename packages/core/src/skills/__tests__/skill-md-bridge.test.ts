/**
 * Skill-MD Bridge Tests
 *
 * Tests bidirectional conversion between .hsplus and SKILL.md formats.
 * Covers: forward bridge, reverse bridge, round-trip fidelity, ClawHub integration.
 *
 * @version 1.0.0
 */

import { describe, it, expect } from 'vitest';
import {
  parseHsplus,
  toSkillMd,
  hsplusToSkillMd,
  parseSkillMd,
  toHsplus,
  skillMdToHsplus,
  generateClawHubManifest,
  generateClawHubPackage,
  getPublishCommand,
  getInstallCommand,
  getHsInstallCommand,
  toHoloClawSkill,
  fromHoloClawSkill,
} from '../skill-md-bridge.js';
import type {
  ParsedSkill,
  SkillMetadata,
  SchemaField,
  SkillStateVar,
  SkillTraitDecl,
  SkillActionStep,
  SkillTest,
  HoloClawSkill,
  HoloClawSkillInput,
  HoloClawSkillOutput,
} from '../skill-md-bridge.js';

// =============================================================================
// TEST FIXTURES
// =============================================================================

const CODE_HEALTH_HSPLUS = `// Code Health Monitor -- repo diagnostics skill
// Runs type checker, counts lint candidates, reports test pass rate.
// Installed via HoloClaw Shelf. Hot-reloads into running daemon.

composition "code-health" {
  @rate_limiter
  @economy (default_spend_limit: 0.10)
  @timeout_guard

  state phase: string = "idle"
  state typeErrors: number = 0
  state lintCandidates: number = 0
  state testsPassed: number = 0
  state testsTotal: number = 0
  state healthScore: number = 1.0
  state lastRunAt: string = ""

  sequence "health-check" {
    action "shell_exec" {
      command: "npx"
      args: ["tsc", "--noEmit", "--pretty", "false"]
    }

    action "diagnose" {
      // Reuses daemon's diagnose action -- counts lint candidates
    }

    action "shell_exec" {
      command: "npx"
      args: ["vitest", "run", "--reporter=json", "--silent"]
    }

    action "channel_send" {
      channel: "health"
      // Message populated by BT blackboard: typeErrors, testsPassed, healthScore
    }
  }

  // -- Tests --

  @test {
    name: "phase starts idle"
    assert: { $phase == "idle" }
  }

  @test {
    name: "type errors start at zero"
    assert: { $typeErrors == 0 }
  }

  @test {
    name: "health score defaults to 1.0"
    assert: { $healthScore == 1.0 }
  }

  @test {
    name: "tests passed starts at zero"
    assert: { $testsPassed == 0 }
  }
}
`;

const PHOTO_HOLOGRAM_HSPLUS = `// Photo-to-Hologram -- Convert any image into a 3D holographic panel
// Installed via HoloClaw Shelf. Uses depth estimation + displacement.
//
// Pipeline: @image -> @segment -> @depth_estimation -> @displacement -> @billboard
// Progressive: instant flat image -> depth-displaced 3D in <1s
//
// @see W.148: Browser-native depth estimation is production-ready
// @see P.148.01: Progressive Hologram Enhancement

composition "photo-to-hologram" {
  @rate_limiter
  @economy (default_spend_limit: 0.05)
  @timeout_guard

  state phase: string = "idle"
  state imageSrc: string = ""
  state depthScale: number = 0.3
  state segments: number = 128
  state depthReady: boolean = false

  environment {
    skybox: "studio"
    ambient_light: 0.7
  }

  object "HologramPanel" {
    @image { src: $imageSrc }
    @segment { model: "rembg", remove_background: true }
    position: [0, 1.5, -2]
    scale: [2, 2, 1]
  }

  sequence "process-image" {
    action "detect_backend" {
      // Auto-detect WebGPU > WASM > CPU
    }

    action "load_image" {
      path: $imageSrc
      into: "image"
    }

    action "estimate_depth" {
      model: "depth-anything-v2-small"
      into: "depth"
    }
  }

  @test {
    name: "phase starts idle"
    assert: { $phase == "idle" }
  }

  @test {
    name: "default depth scale is 0.3"
    assert: { $depthScale == 0.3 }
  }
}
`;

const SIMPLE_SKILL_MD = `---
name: hello-world
description: >
  A simple hello world skill that demonstrates
  the SKILL.md format for ClawHub compatibility.
version: 1.2.0
author: Test Author
category: demo
tags: [hello, demo, test]
license: MIT
---

# Hello World

A simple hello world skill that demonstrates the SKILL.md format for ClawHub compatibility.

## Traits

- \`@rate_limiter\`
- \`@economy\` (default_spend_limit: 0.05)
- \`@timeout_guard\`

## State Schema

| Variable | Type | Default |
|----------|------|---------|
| \`greeting\` | string | \`"hello"\` |
| \`count\` | number | \`0\` |
| \`active\` | boolean | \`false\` |

## Workflow

### greet-cycle

1. **prepare_greeting** (message: "hello world")
   Prepare the greeting message
2. **send_greeting**
   Send the greeting to the channel
3. **increment_counter**
   Increment the greeting counter

## Tests

3 built-in assertions:

- **greeting defaults to hello**: \`$greeting == "hello"\`
- **count starts at zero**: \`$count == 0\`
- **not active initially**: \`$active == false\`

## Installation

\`\`\`bash
hs claw install hello-world
\`\`\`
`;

const SKILL_MD_WITH_SCHEMAS = `---
name: web-fetcher
description: >
  Fetches content from a URL and returns
  the response body with metadata.
version: 2.0.0
author: HoloScript Team
tags: [fetch, http, networking]
license: Apache-2.0
repository: https://github.com/holoscript/skills
input_schema:
  - name: url
    type: string
    required: true
    description: URL to fetch
  - name: format
    type: string
    required: false
    description: Response format
    default: "text"
output_schema:
  - name: content
    type: string
    description: Response body content
  - name: status
    type: number
    description: HTTP status code
---

# Web Fetcher

Fetches content from a URL and returns the response body with metadata.

## Traits

- \`@rate_limiter\` (max_tokens: 10)
- \`@economy\` (default_spend_limit: 0.02)
- \`@timeout_guard\`

## Input Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| \`url\` | string | yes | URL to fetch |
| \`format\` | string | no | Response format (default: \`"text"\`) |

## Output Schema

| Field | Type | Description |
|-------|------|-------------|
| \`content\` | string | Response body content |
| \`status\` | number | HTTP status code |

## Workflow

### fetch-cycle

1. **validate_url** (pattern: "https?://")
   Validate the URL format
2. **web_fetch** (timeout: 5000)
   Fetch the URL content
3. **format_response**
   Format the response based on format parameter

## Tests

2 built-in assertions:

- **url is required**: \`$url != ""\`
- **default format is text**: \`$format == "text"\`
`;

const HSPLUS_WITH_SCHEMAS = `// Web Fetcher -- Fetches content from a URL
// Installed via HoloClaw Shelf. Hot-reloads into running daemon.

composition "web-fetcher" {
  @rate_limiter
  @economy (default_spend_limit: 0.02)
  @timeout_guard

  @input_schema {
    url: string (required) "URL to fetch"
    format: string = text "Response format"
  }

  @output_schema {
    content: string "Response body content"
    status: number "HTTP status code"
  }

  state phase: string = "idle"

  sequence "fetch-cycle" {
    action "validate_url" {
      pattern: "https?://"
    }

    action "web_fetch" {
      timeout: 5000
    }
  }

  @test {
    name: "phase starts idle"
    assert: { $phase == "idle" }
  }
}
`;

// =============================================================================
// FORWARD BRIDGE: .hsplus -> ParsedSkill
// =============================================================================

describe('parseHsplus', () => {
  it('should parse code-health composition successfully', () => {
    const result = parseHsplus(CODE_HEALTH_HSPLUS);
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data!.metadata.name).toBe('code-health');
  });

  it('should extract composition name', () => {
    const result = parseHsplus(CODE_HEALTH_HSPLUS);
    expect(result.data!.metadata.name).toBe('code-health');
  });

  it('should extract description from leading comments', () => {
    const result = parseHsplus(CODE_HEALTH_HSPLUS);
    const desc = result.data!.metadata.description;
    expect(desc).toContain('Code Health Monitor');
    expect(desc).toContain('type checker');
  });

  it('should extract traits with config', () => {
    const result = parseHsplus(CODE_HEALTH_HSPLUS);
    const traits = result.data!.traits;
    expect(traits).toHaveLength(3);

    const rateLimiter = traits.find((t) => t.name === 'rate_limiter');
    expect(rateLimiter).toBeDefined();
    expect(Object.keys(rateLimiter!.config)).toHaveLength(0);

    const economy = traits.find((t) => t.name === 'economy');
    expect(economy).toBeDefined();
    expect(economy!.config.default_spend_limit).toBe(0.1);
  });

  it('should extract state variables', () => {
    const result = parseHsplus(CODE_HEALTH_HSPLUS);
    const state = result.data!.state;
    expect(state.length).toBeGreaterThanOrEqual(5);

    const phase = state.find((s) => s.name === 'phase');
    expect(phase).toBeDefined();
    expect(phase!.type).toBe('string');
    expect(phase!.defaultValue).toBe('idle');

    const healthScore = state.find((s) => s.name === 'healthScore');
    expect(healthScore).toBeDefined();
    expect(healthScore!.type).toBe('number');
    expect(healthScore!.defaultValue).toBe(1.0);
  });

  it('should extract behavior tree steps', () => {
    const result = parseHsplus(CODE_HEALTH_HSPLUS);
    const steps = result.data!.steps;
    expect(steps.length).toBeGreaterThanOrEqual(1);

    const healthCheck = steps.find((s) => s.action === 'health-check');
    expect(healthCheck).toBeDefined();
    expect(healthCheck!.nodeType).toBe('sequence');
  });

  it('should extract test assertions', () => {
    const result = parseHsplus(CODE_HEALTH_HSPLUS);
    const tests = result.data!.tests;
    expect(tests).toHaveLength(4);

    expect(tests[0].name).toBe('phase starts idle');
    expect(tests[0].assert).toContain('$phase == "idle"');
  });

  it('should extract environment block', () => {
    const result = parseHsplus(PHOTO_HOLOGRAM_HSPLUS);
    expect(result.data!.environment).toBeDefined();
    expect(result.data!.environment!.skybox).toBe('studio');
    expect(result.data!.environment!.ambient_light).toBe(0.7);
  });

  it('should extract object names', () => {
    const result = parseHsplus(PHOTO_HOLOGRAM_HSPLUS);
    expect(result.data!.objects).toBeDefined();
    expect(result.data!.objects).toContain('HologramPanel');
  });

  it('should extract spend limit from economy trait', () => {
    const result = parseHsplus(CODE_HEALTH_HSPLUS);
    expect(result.data!.metadata.spendLimit).toBe(0.1);
  });

  it('should fail on invalid input', () => {
    const result = parseHsplus('this is not valid hsplus');
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should handle boolean state variables', () => {
    const result = parseHsplus(PHOTO_HOLOGRAM_HSPLUS);
    const depthReady = result.data!.state.find((s) => s.name === 'depthReady');
    expect(depthReady).toBeDefined();
    expect(depthReady!.type).toBe('boolean');
    expect(depthReady!.defaultValue).toBe(false);
  });
});

// =============================================================================
// FORWARD BRIDGE: ParsedSkill -> SKILL.md
// =============================================================================

describe('toSkillMd', () => {
  it('should generate valid SKILL.md from parsed skill', () => {
    const parsed = parseHsplus(CODE_HEALTH_HSPLUS);
    const result = toSkillMd(parsed.data!);
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
  });

  it('should include YAML frontmatter', () => {
    const parsed = parseHsplus(CODE_HEALTH_HSPLUS);
    const md = toSkillMd(parsed.data!).data!;
    expect(md).toMatch(/^---\n/);
    expect(md).toContain('name: code-health');
    expect(md).toContain('description: >');
  });

  it('should include runtime requirements section', () => {
    const parsed = parseHsplus(CODE_HEALTH_HSPLUS);
    const md = toSkillMd(parsed.data!).data!;
    expect(md).toContain('## Runtime Requirements');
    expect(md).toContain('holoscript-cli');
    expect(md).toContain('Node.js');
  });

  it('should include traits section', () => {
    const parsed = parseHsplus(CODE_HEALTH_HSPLUS);
    const md = toSkillMd(parsed.data!).data!;
    expect(md).toContain('## Traits');
    expect(md).toContain('`@rate_limiter`');
    expect(md).toContain('`@economy`');
  });

  it('should include state schema table', () => {
    const parsed = parseHsplus(CODE_HEALTH_HSPLUS);
    const md = toSkillMd(parsed.data!).data!;
    expect(md).toContain('## State Schema');
    expect(md).toContain('| Variable | Type | Default |');
    expect(md).toContain('`phase`');
    expect(md).toContain('`healthScore`');
  });

  it('should include workflow steps', () => {
    const parsed = parseHsplus(CODE_HEALTH_HSPLUS);
    const md = toSkillMd(parsed.data!).data!;
    expect(md).toContain('## Workflow');
  });

  it('should include tests section', () => {
    const parsed = parseHsplus(CODE_HEALTH_HSPLUS);
    const md = toSkillMd(parsed.data!).data!;
    expect(md).toContain('## Tests');
    expect(md).toContain('phase starts idle');
    expect(md).toContain('4 built-in assertions');
  });

  it('should include installation instructions', () => {
    const parsed = parseHsplus(CODE_HEALTH_HSPLUS);
    const md = toSkillMd(parsed.data!).data!;
    expect(md).toContain('## Installation');
    expect(md).toContain('hs claw install code-health');
    expect(md).toContain('clawhub install @holoscript/code-health');
  });

  it('should include environment section for skills with environments', () => {
    const parsed = parseHsplus(PHOTO_HOLOGRAM_HSPLUS);
    const md = toSkillMd(parsed.data!).data!;
    expect(md).toContain('## Environment');
    expect(md).toContain('skybox');
  });

  it('should include scene objects section', () => {
    const parsed = parseHsplus(PHOTO_HOLOGRAM_HSPLUS);
    const md = toSkillMd(parsed.data!).data!;
    expect(md).toContain('## Scene Objects');
    expect(md).toContain('HologramPanel');
  });

  it('should include economy budget in requirements', () => {
    const parsed = parseHsplus(CODE_HEALTH_HSPLUS);
    const md = toSkillMd(parsed.data!).data!;
    expect(md).toContain('Economy budget');
    expect(md).toContain('$0.10');
  });
});

// =============================================================================
// CONVENIENCE: hsplusToSkillMd
// =============================================================================

describe('hsplusToSkillMd', () => {
  it('should convert code-health in one call', () => {
    const result = hsplusToSkillMd(CODE_HEALTH_HSPLUS);
    expect(result.success).toBe(true);
    expect(result.data).toContain('name: code-health');
  });

  it('should fail on invalid input', () => {
    const result = hsplusToSkillMd('not valid');
    expect(result.success).toBe(false);
  });
});

// =============================================================================
// REVERSE BRIDGE: SKILL.md -> ParsedSkill
// =============================================================================

describe('parseSkillMd', () => {
  it('should parse SKILL.md frontmatter', () => {
    const result = parseSkillMd(SIMPLE_SKILL_MD);
    expect(result.success).toBe(true);
    expect(result.data!.metadata.name).toBe('hello-world');
    expect(result.data!.metadata.version).toBe('1.2.0');
    expect(result.data!.metadata.author).toBe('Test Author');
  });

  it('should parse multi-line description', () => {
    const result = parseSkillMd(SIMPLE_SKILL_MD);
    const desc = result.data!.metadata.description;
    expect(desc).toContain('hello world skill');
    expect(desc).toContain('ClawHub compatibility');
  });

  it('should parse traits from markdown', () => {
    const result = parseSkillMd(SIMPLE_SKILL_MD);
    const traits = result.data!.traits;
    expect(traits).toHaveLength(3);
    expect(traits[0].name).toBe('rate_limiter');
    expect(traits[1].name).toBe('economy');
    expect(traits[1].config.default_spend_limit).toBe(0.05);
  });

  it('should parse state schema from markdown table', () => {
    const result = parseSkillMd(SIMPLE_SKILL_MD);
    const state = result.data!.state;
    expect(state).toHaveLength(3);

    const greeting = state.find((s) => s.name === 'greeting');
    expect(greeting).toBeDefined();
    expect(greeting!.type).toBe('string');
    expect(greeting!.defaultValue).toBe('hello');

    const count = state.find((s) => s.name === 'count');
    expect(count).toBeDefined();
    expect(count!.type).toBe('number');
    expect(count!.defaultValue).toBe(0);

    const active = state.find((s) => s.name === 'active');
    expect(active).toBeDefined();
    expect(active!.type).toBe('boolean');
    expect(active!.defaultValue).toBe(false);
  });

  it('should parse workflow steps from markdown', () => {
    const result = parseSkillMd(SIMPLE_SKILL_MD);
    const steps = result.data!.steps;
    expect(steps.length).toBeGreaterThan(0);

    const actions = steps.filter((s) => s.nodeType === 'action');
    expect(actions.length).toBeGreaterThanOrEqual(3);
  });

  it('should parse tests from markdown', () => {
    const result = parseSkillMd(SIMPLE_SKILL_MD);
    const tests = result.data!.tests;
    expect(tests).toHaveLength(3);
    expect(tests[0].name).toBe('greeting defaults to hello');
    expect(tests[0].assert).toContain('$greeting == "hello"');
  });

  it('should parse tags array', () => {
    const result = parseSkillMd(SIMPLE_SKILL_MD);
    expect(result.data!.metadata.tags).toEqual(['hello', 'demo', 'test']);
  });

  it('should parse license', () => {
    const result = parseSkillMd(SIMPLE_SKILL_MD);
    expect(result.data!.metadata.license).toBe('MIT');
  });

  it('should fail without frontmatter', () => {
    const result = parseSkillMd('# No Frontmatter\nJust content.');
    expect(result.success).toBe(false);
    expect(result.errors[0]).toContain('frontmatter');
  });

  it('should fail without name in frontmatter', () => {
    const result = parseSkillMd('---\ndescription: no name\n---\n# Test');
    expect(result.success).toBe(false);
    expect(result.errors[0]).toContain('name');
  });

  it('should add default traits when none specified', () => {
    const mdNoTraits = `---
name: bare-skill
description: >
  A skill with no traits section.
---

# Bare Skill

A minimal skill.
`;
    const result = parseSkillMd(mdNoTraits);
    expect(result.success).toBe(true);
    expect(result.data!.traits).toHaveLength(3); // default: rate_limiter, economy, timeout_guard
    expect(result.data!.traits.map((t) => t.name)).toContain('rate_limiter');
  });
});

// =============================================================================
// REVERSE BRIDGE: ParsedSkill -> .hsplus
// =============================================================================

describe('toHsplus', () => {
  it('should generate valid .hsplus from parsed SKILL.md', () => {
    const parsed = parseSkillMd(SIMPLE_SKILL_MD);
    const result = toHsplus(parsed.data!);
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
  });

  it('should include composition declaration', () => {
    const parsed = parseSkillMd(SIMPLE_SKILL_MD);
    const hsplus = toHsplus(parsed.data!).data!;
    expect(hsplus).toContain('composition "hello-world" {');
  });

  it('should include trait declarations', () => {
    const parsed = parseSkillMd(SIMPLE_SKILL_MD);
    const hsplus = toHsplus(parsed.data!).data!;
    expect(hsplus).toContain('@rate_limiter');
    expect(hsplus).toContain('@economy');
    expect(hsplus).toContain('@timeout_guard');
  });

  it('should include state variables', () => {
    const parsed = parseSkillMd(SIMPLE_SKILL_MD);
    const hsplus = toHsplus(parsed.data!).data!;
    expect(hsplus).toContain('state greeting: string = "hello"');
    expect(hsplus).toContain('state count: number = 0');
    expect(hsplus).toContain('state active: boolean = false');
  });

  it('should include behavior tree sequence', () => {
    const parsed = parseSkillMd(SIMPLE_SKILL_MD);
    const hsplus = toHsplus(parsed.data!).data!;
    expect(hsplus).toContain('sequence');
    expect(hsplus).toContain('action');
  });

  it('should include test blocks', () => {
    const parsed = parseSkillMd(SIMPLE_SKILL_MD);
    const hsplus = toHsplus(parsed.data!).data!;
    expect(hsplus).toContain('@test {');
    expect(hsplus).toContain('name: "greeting defaults to hello"');
    expect(hsplus).toContain('assert: { $greeting == "hello" }');
  });

  it('should include leading comment', () => {
    const parsed = parseSkillMd(SIMPLE_SKILL_MD);
    const hsplus = toHsplus(parsed.data!).data!;
    expect(hsplus).toMatch(/^\/\/ Hello World/);
  });

  it('should include version annotation for non-default versions', () => {
    const parsed = parseSkillMd(SIMPLE_SKILL_MD);
    const hsplus = toHsplus(parsed.data!).data!;
    expect(hsplus).toContain('@version 1.2.0');
  });
});

// =============================================================================
// CONVENIENCE: skillMdToHsplus
// =============================================================================

describe('skillMdToHsplus', () => {
  it('should convert SKILL.md to .hsplus in one call', () => {
    const result = skillMdToHsplus(SIMPLE_SKILL_MD);
    expect(result.success).toBe(true);
    expect(result.data).toContain('composition "hello-world"');
  });

  it('should fail on invalid SKILL.md', () => {
    const result = skillMdToHsplus('no frontmatter');
    expect(result.success).toBe(false);
  });
});

// =============================================================================
// ROUND-TRIP FIDELITY
// =============================================================================

describe('round-trip: .hsplus -> SKILL.md -> .hsplus', () => {
  it('should preserve composition name through round-trip', () => {
    const parsed1 = parseHsplus(CODE_HEALTH_HSPLUS);
    const md = toSkillMd(parsed1.data!).data!;
    const parsed2 = parseSkillMd(md);
    expect(parsed2.data!.metadata.name).toBe(parsed1.data!.metadata.name);
  });

  it('should preserve state variable count through round-trip', () => {
    const parsed1 = parseHsplus(CODE_HEALTH_HSPLUS);
    const md = toSkillMd(parsed1.data!).data!;
    const parsed2 = parseSkillMd(md);
    expect(parsed2.data!.state.length).toBe(parsed1.data!.state.length);
  });

  it('should preserve state variable names through round-trip', () => {
    const parsed1 = parseHsplus(CODE_HEALTH_HSPLUS);
    const md = toSkillMd(parsed1.data!).data!;
    const parsed2 = parseSkillMd(md);
    const names1 = parsed1.data!.state.map((s) => s.name).sort();
    const names2 = parsed2.data!.state.map((s) => s.name).sort();
    expect(names2).toEqual(names1);
  });

  it('should preserve test count through round-trip', () => {
    const parsed1 = parseHsplus(CODE_HEALTH_HSPLUS);
    const md = toSkillMd(parsed1.data!).data!;
    const parsed2 = parseSkillMd(md);
    expect(parsed2.data!.tests.length).toBe(parsed1.data!.tests.length);
  });

  it('should preserve trait count through round-trip', () => {
    const parsed1 = parseHsplus(CODE_HEALTH_HSPLUS);
    const md = toSkillMd(parsed1.data!).data!;
    const parsed2 = parseSkillMd(md);
    expect(parsed2.data!.traits.length).toBe(parsed1.data!.traits.length);
  });
});

describe('round-trip: SKILL.md -> .hsplus -> SKILL.md', () => {
  it('should preserve name through reverse round-trip', () => {
    const parsed1 = parseSkillMd(SIMPLE_SKILL_MD);
    const hsplus = toHsplus(parsed1.data!).data!;
    const parsed2 = parseHsplus(hsplus);
    expect(parsed2.data!.metadata.name).toBe('hello-world');
  });

  it('should preserve state count through reverse round-trip', () => {
    const parsed1 = parseSkillMd(SIMPLE_SKILL_MD);
    const hsplus = toHsplus(parsed1.data!).data!;
    const parsed2 = parseHsplus(hsplus);
    expect(parsed2.data!.state.length).toBe(parsed1.data!.state.length);
  });
});

// =============================================================================
// CLAWHUB CLI INTEGRATION
// =============================================================================

describe('ClawHub integration', () => {
  it('should generate valid ClawHub manifest', () => {
    const parsed = parseHsplus(CODE_HEALTH_HSPLUS);
    const manifest = generateClawHubManifest(parsed.data!);
    expect(manifest.name).toBe('@holoscript/code-health');
    expect(manifest.version).toBe('1.0.0');
    expect(manifest.registryUrl).toBe('https://registry.clawhub.com');
    expect(manifest.holoScript.format).toBe('hsplus');
    expect(manifest.holoScript.traits).toContain('rate_limiter');
    expect(manifest.holoScript.testCount).toBe(4);
    expect(manifest.holoScript.inputFields).toEqual([]);
    expect(manifest.holoScript.outputFields).toEqual([]);
    expect(manifest.files).toContain('code-health.hsplus');
    expect(manifest.files).toContain('SKILL.md');
    expect(manifest.files).toContain('clawhub.json');
  });

  it('should generate manifest with custom registry URL', () => {
    const parsed = parseHsplus(CODE_HEALTH_HSPLUS);
    const manifest = generateClawHubManifest(parsed.data!, 'https://my-registry.example.com');
    expect(manifest.registryUrl).toBe('https://my-registry.example.com');
  });

  it('should include input/output field names in manifest', () => {
    const parsed = parseHsplus(HSPLUS_WITH_SCHEMAS);
    const manifest = generateClawHubManifest(parsed.data!);
    expect(manifest.holoScript.inputFields).toContain('url');
    expect(manifest.holoScript.inputFields).toContain('format');
    expect(manifest.holoScript.outputFields).toContain('content');
    expect(manifest.holoScript.outputFields).toContain('status');
  });

  it('should generate complete ClawHub package', () => {
    const result = generateClawHubPackage(CODE_HEALTH_HSPLUS);
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();

    const files = result.data!;
    expect(files.has('code-health.hsplus')).toBe(true);
    expect(files.has('SKILL.md')).toBe(true);
    expect(files.has('clawhub.json')).toBe(true);

    // Verify manifest is valid JSON
    const manifest = JSON.parse(files.get('clawhub.json')!);
    expect(manifest.name).toBe('@holoscript/code-health');
  });

  it('should generate publish command', () => {
    const cmd = getPublishCommand('code-health');
    expect(cmd).toBe(
      'clawhub publish @holoscript/code-health --registry https://registry.clawhub.com'
    );
  });

  it('should generate publish command with custom registry', () => {
    const cmd = getPublishCommand('code-health', 'https://my-registry.example.com');
    expect(cmd).toContain('https://my-registry.example.com');
  });

  it('should generate install command', () => {
    const cmd = getInstallCommand('code-health');
    expect(cmd).toBe(
      'clawhub install @holoscript/code-health --target compositions/skills --registry https://registry.clawhub.com'
    );
  });

  it('should generate hs install command', () => {
    const cmd = getHsInstallCommand('code-health');
    expect(cmd).toBe('hs claw install code-health');
  });
});

// =============================================================================
// EDGE CASES & ERROR HANDLING
// =============================================================================

describe('edge cases', () => {
  it('should handle composition with no tests', () => {
    const source = `composition "no-tests" {
  @rate_limiter
  state phase: string = "idle"

  sequence "main" {
    action "noop" {
    }
  }
}
`;
    const result = parseHsplus(source);
    expect(result.success).toBe(true);
    expect(result.data!.tests).toHaveLength(0);
  });

  it('should handle composition with no state', () => {
    const source = `composition "stateless" {
  @rate_limiter

  sequence "main" {
    action "noop" {
    }
  }
}
`;
    const result = parseHsplus(source);
    expect(result.success).toBe(true);
    expect(result.data!.state).toHaveLength(0);
  });

  it('should handle composition with multi-param trait', () => {
    const source = `composition "multi-trait" {
  @rate_limiter (max_tokens: 5, refill_rate: 1, window_ms: 3600000)

  state phase: string = "idle"
}
`;
    const result = parseHsplus(source);
    expect(result.success).toBe(true);
    const rl = result.data!.traits.find((t) => t.name === 'rate_limiter');
    expect(rl).toBeDefined();
    expect(rl!.config.max_tokens).toBe(5);
    expect(rl!.config.refill_rate).toBe(1);
    expect(rl!.config.window_ms).toBe(3600000);
  });

  it('should handle empty SKILL.md body', () => {
    const md = `---
name: empty-body
description: >
  An empty skill
---
`;
    const result = parseSkillMd(md);
    expect(result.success).toBe(true);
    expect(result.data!.state).toHaveLength(0);
    expect(result.data!.steps).toHaveLength(0);
    expect(result.data!.tests).toHaveLength(0);
  });

  it('should generate valid .hsplus from minimal SKILL.md', () => {
    const md = `---
name: minimal
description: >
  Minimal skill
---
`;
    const result = skillMdToHsplus(md);
    expect(result.success).toBe(true);
    expect(result.data).toContain('composition "minimal"');
    expect(result.data).toContain('@rate_limiter');
  });

  it('should handle photo-to-hologram skill (complex)', () => {
    const result = hsplusToSkillMd(PHOTO_HOLOGRAM_HSPLUS);
    expect(result.success).toBe(true);
    expect(result.data).toContain('photo-to-hologram');
    expect(result.data).toContain('Environment');
    expect(result.data).toContain('Scene Objects');
  });
});

// =============================================================================
// TYPE EXPORTS (compile-time verification)
// =============================================================================

describe('type exports', () => {
  it('should export SkillMetadata type', () => {
    const meta: SkillMetadata = {
      name: 'test',
      description: 'test desc',
      version: '1.0.0',
      author: 'tester',
    };
    expect(meta.name).toBe('test');
  });

  it('should export SkillStateVar type', () => {
    const sv: SkillStateVar = { name: 'x', type: 'number', defaultValue: 0 };
    expect(sv.type).toBe('number');
  });

  it('should export SkillTraitDecl type', () => {
    const trait: SkillTraitDecl = { name: 'economy', config: {} };
    expect(trait.name).toBe('economy');
  });

  it('should export SkillActionStep type', () => {
    const step: SkillActionStep = {
      action: 'test',
      description: 'test',
      params: {},
      nodeType: 'action',
    };
    expect(step.nodeType).toBe('action');
  });

  it('should export SkillTest type', () => {
    const test: SkillTest = { name: 'test', assert: '$x == 1' };
    expect(test.assert).toBe('$x == 1');
  });

  it('should export ParsedSkill type', () => {
    const skill: ParsedSkill = {
      metadata: { name: 't', description: 'd', version: '1.0.0', author: 'a' },
      traits: [],
      state: [],
      steps: [],
      tests: [],
      sourceComments: [],
    };
    expect(skill.metadata.name).toBe('t');
  });

  it('should export SchemaField type', () => {
    const field: SchemaField = {
      name: 'url',
      type: 'string',
      required: true,
      description: 'URL to fetch',
      default: 'https://example.com',
    };
    expect(field.type).toBe('string');
    expect(field.required).toBe(true);
  });

  it('should export HoloClawSkill type', () => {
    const skill: HoloClawSkill = {
      id: 'test',
      name: 'Test',
      description: 'test',
      version: '1.0.0',
      author: 'tester',
      inputs: [],
      outputs: [],
      sandbox: true,
    };
    expect(skill.id).toBe('test');
  });

  it('should export HoloClawSkillInput type', () => {
    const input: HoloClawSkillInput = {
      name: 'url',
      type: 'string',
      required: true,
      description: 'URL to fetch',
    };
    expect(input.required).toBe(true);
  });

  it('should export HoloClawSkillOutput type', () => {
    const output: HoloClawSkillOutput = {
      name: 'content',
      type: 'string',
      description: 'Response content',
    };
    expect(output.type).toBe('string');
  });
});

// =============================================================================
// INPUT/OUTPUT SCHEMA: .hsplus -> ParsedSkill
// =============================================================================

describe('input/output schema from .hsplus', () => {
  it('should extract input_schema fields from .hsplus', () => {
    const result = parseHsplus(HSPLUS_WITH_SCHEMAS);
    expect(result.success).toBe(true);
    expect(result.data!.metadata.inputSchema).toBeDefined();
    expect(result.data!.metadata.inputSchema).toHaveLength(2);

    const urlField = result.data!.metadata.inputSchema!.find((f) => f.name === 'url');
    expect(urlField).toBeDefined();
    expect(urlField!.type).toBe('string');
    expect(urlField!.required).toBe(true);
    expect(urlField!.description).toBe('URL to fetch');

    const formatField = result.data!.metadata.inputSchema!.find((f) => f.name === 'format');
    expect(formatField).toBeDefined();
    expect(formatField!.type).toBe('string');
    expect(formatField!.description).toBe('Response format');
  });

  it('should extract output_schema fields from .hsplus', () => {
    const result = parseHsplus(HSPLUS_WITH_SCHEMAS);
    expect(result.success).toBe(true);
    expect(result.data!.metadata.outputSchema).toBeDefined();
    expect(result.data!.metadata.outputSchema).toHaveLength(2);

    const contentField = result.data!.metadata.outputSchema!.find((f) => f.name === 'content');
    expect(contentField).toBeDefined();
    expect(contentField!.type).toBe('string');

    const statusField = result.data!.metadata.outputSchema!.find((f) => f.name === 'status');
    expect(statusField).toBeDefined();
    expect(statusField!.type).toBe('number');
  });

  it('should have no schemas for skills without @input_schema/@output_schema', () => {
    const result = parseHsplus(CODE_HEALTH_HSPLUS);
    expect(result.success).toBe(true);
    expect(result.data!.metadata.inputSchema).toBeUndefined();
    expect(result.data!.metadata.outputSchema).toBeUndefined();
  });
});

// =============================================================================
// INPUT/OUTPUT SCHEMA: SKILL.md -> ParsedSkill
// =============================================================================

describe('input/output schema from SKILL.md', () => {
  it('should parse input_schema from SKILL.md frontmatter', () => {
    const result = parseSkillMd(SKILL_MD_WITH_SCHEMAS);
    expect(result.success).toBe(true);
    expect(result.data!.metadata.inputSchema).toBeDefined();
    expect(result.data!.metadata.inputSchema).toHaveLength(2);

    const urlField = result.data!.metadata.inputSchema!.find((f) => f.name === 'url');
    expect(urlField).toBeDefined();
    expect(urlField!.type).toBe('string');
    expect(urlField!.required).toBe(true);
    expect(urlField!.description).toBe('URL to fetch');

    const formatField = result.data!.metadata.inputSchema!.find((f) => f.name === 'format');
    expect(formatField).toBeDefined();
    expect(formatField!.type).toBe('string');
    expect(formatField!.default).toBe('text');
  });

  it('should parse output_schema from SKILL.md frontmatter', () => {
    const result = parseSkillMd(SKILL_MD_WITH_SCHEMAS);
    expect(result.success).toBe(true);
    expect(result.data!.metadata.outputSchema).toBeDefined();
    expect(result.data!.metadata.outputSchema).toHaveLength(2);

    const contentField = result.data!.metadata.outputSchema!.find((f) => f.name === 'content');
    expect(contentField).toBeDefined();
    expect(contentField!.type).toBe('string');
    expect(contentField!.description).toBe('Response body content');
  });

  it('should parse repository field from SKILL.md frontmatter', () => {
    const result = parseSkillMd(SKILL_MD_WITH_SCHEMAS);
    expect(result.success).toBe(true);
    expect(result.data!.metadata.repository).toBe('https://github.com/holoscript/skills');
  });

  it('should include Input Schema section in SKILL.md output', () => {
    const result = parseSkillMd(SKILL_MD_WITH_SCHEMAS);
    const md = toSkillMd(result.data!).data!;
    expect(md).toContain('## Input Schema');
    expect(md).toContain('`url`');
    expect(md).toContain('`format`');
    expect(md).toContain('yes'); // required
  });

  it('should include Output Schema section in SKILL.md output', () => {
    const result = parseSkillMd(SKILL_MD_WITH_SCHEMAS);
    const md = toSkillMd(result.data!).data!;
    expect(md).toContain('## Output Schema');
    expect(md).toContain('`content`');
    expect(md).toContain('`status`');
  });

  it('should include input/output_schema in SKILL.md frontmatter', () => {
    const result = parseSkillMd(SKILL_MD_WITH_SCHEMAS);
    const md = toSkillMd(result.data!).data!;
    expect(md).toContain('input_schema:');
    expect(md).toContain('output_schema:');
    expect(md).toContain('  - name: url');
    expect(md).toContain('    type: string');
    expect(md).toContain('    required: true');
  });
});

// =============================================================================
// HOLOCLAW SKILL INTEROP
// =============================================================================

describe('toHoloClawSkill', () => {
  it('should convert ParsedSkill to HoloClawSkill', () => {
    const result = parseSkillMd(SKILL_MD_WITH_SCHEMAS);
    const holoClaw = toHoloClawSkill(result.data!);

    expect(holoClaw.id).toBe('web-fetcher');
    expect(holoClaw.name).toBe('Web Fetcher');
    expect(holoClaw.version).toBe('2.0.0');
    expect(holoClaw.author).toBe('HoloScript Team');
    expect(holoClaw.sandbox).toBe(true);
  });

  it('should map input schema to HoloClaw inputs', () => {
    const result = parseSkillMd(SKILL_MD_WITH_SCHEMAS);
    const holoClaw = toHoloClawSkill(result.data!);

    expect(holoClaw.inputs).toHaveLength(2);
    const urlInput = holoClaw.inputs.find((i) => i.name === 'url');
    expect(urlInput).toBeDefined();
    expect(urlInput!.type).toBe('string');
    expect(urlInput!.required).toBe(true);
    expect(urlInput!.description).toBe('URL to fetch');

    const formatInput = holoClaw.inputs.find((i) => i.name === 'format');
    expect(formatInput).toBeDefined();
    expect(formatInput!.required).toBe(false);
    expect(formatInput!.default).toBe('text');
  });

  it('should map output schema to HoloClaw outputs', () => {
    const result = parseSkillMd(SKILL_MD_WITH_SCHEMAS);
    const holoClaw = toHoloClawSkill(result.data!);

    expect(holoClaw.outputs).toHaveLength(2);
    const contentOutput = holoClaw.outputs.find((o) => o.name === 'content');
    expect(contentOutput).toBeDefined();
    expect(contentOutput!.type).toBe('string');
  });

  it('should handle skills with no schemas', () => {
    const result = parseHsplus(CODE_HEALTH_HSPLUS);
    const holoClaw = toHoloClawSkill(result.data!);

    expect(holoClaw.inputs).toHaveLength(0);
    expect(holoClaw.outputs).toHaveLength(0);
  });
});

describe('fromHoloClawSkill', () => {
  it('should convert HoloClawSkill to ParsedSkill', () => {
    const holoClaw: HoloClawSkill = {
      id: 'json-transform',
      name: 'JSON Transform',
      description: 'Parse, filter, or transform JSON data',
      version: '1.0.0',
      author: 'holoscript',
      inputs: [
        { name: 'json', type: 'string', required: true, description: 'JSON string to transform' },
        {
          name: 'path',
          type: 'string',
          required: false,
          description: 'Dot-notation path to extract',
        },
      ],
      outputs: [{ name: 'result', type: 'object', description: 'Transformed result' }],
      sandbox: false,
    };

    const parsed = fromHoloClawSkill(holoClaw);

    expect(parsed.metadata.name).toBe('json-transform');
    expect(parsed.metadata.description).toBe('Parse, filter, or transform JSON data');
    expect(parsed.metadata.version).toBe('1.0.0');
    expect(parsed.metadata.author).toBe('holoscript');
  });

  it('should map HoloClaw inputs to inputSchema', () => {
    const holoClaw: HoloClawSkill = {
      id: 'test-skill',
      name: 'Test',
      description: 'test',
      version: '1.0.0',
      author: 'test',
      inputs: [{ name: 'data', type: 'string', required: true, description: 'Input data' }],
      outputs: [{ name: 'result', type: 'string', description: 'Output result' }],
      sandbox: true,
    };

    const parsed = fromHoloClawSkill(holoClaw);

    expect(parsed.metadata.inputSchema).toBeDefined();
    expect(parsed.metadata.inputSchema).toHaveLength(1);
    expect(parsed.metadata.inputSchema![0].name).toBe('data');
    expect(parsed.metadata.inputSchema![0].required).toBe(true);

    expect(parsed.metadata.outputSchema).toBeDefined();
    expect(parsed.metadata.outputSchema).toHaveLength(1);
    expect(parsed.metadata.outputSchema![0].name).toBe('result');
  });

  it('should include default traits', () => {
    const holoClaw: HoloClawSkill = {
      id: 'minimal',
      name: 'Minimal',
      description: 'minimal',
      version: '1.0.0',
      author: 'test',
      inputs: [],
      outputs: [],
      sandbox: true,
    };

    const parsed = fromHoloClawSkill(holoClaw);

    expect(parsed.traits).toHaveLength(3);
    expect(parsed.traits.map((t) => t.name)).toContain('rate_limiter');
    expect(parsed.traits.map((t) => t.name)).toContain('economy');
    expect(parsed.traits.map((t) => t.name)).toContain('timeout_guard');
  });

  it('should produce valid SKILL.md when serialized', () => {
    const holoClaw: HoloClawSkill = {
      id: 'web-fetch',
      name: 'Web Fetch',
      description: 'Fetch content from a URL',
      version: '1.0.0',
      author: 'holoscript',
      inputs: [{ name: 'url', type: 'string', required: true, description: 'URL to fetch' }],
      outputs: [{ name: 'content', type: 'string', description: 'Response content' }],
      sandbox: false,
    };

    const parsed = fromHoloClawSkill(holoClaw);
    const md = toSkillMd(parsed);

    expect(md.success).toBe(true);
    expect(md.data).toContain('name: web-fetch');
    expect(md.data).toContain('input_schema:');
    expect(md.data).toContain('output_schema:');
    expect(md.data).toContain('## Input Schema');
    expect(md.data).toContain('## Output Schema');
  });

  it('should produce valid .hsplus when serialized', () => {
    const holoClaw: HoloClawSkill = {
      id: 'web-fetch',
      name: 'Web Fetch',
      description: 'Fetch content from a URL',
      version: '1.0.0',
      author: 'holoscript',
      inputs: [{ name: 'url', type: 'string', required: true, description: 'URL to fetch' }],
      outputs: [{ name: 'content', type: 'string', description: 'Response content' }],
      sandbox: false,
    };

    const parsed = fromHoloClawSkill(holoClaw);
    const hsplus = toHsplus(parsed);

    expect(hsplus.success).toBe(true);
    expect(hsplus.data).toContain('composition "web-fetch"');
    expect(hsplus.data).toContain('@rate_limiter');
  });
});

// =============================================================================
// ROUND-TRIP: schemas through .hsplus -> SKILL.md -> .hsplus
// =============================================================================

describe('round-trip with schemas', () => {
  it('should preserve input schema names through .hsplus -> SKILL.md -> ParsedSkill', () => {
    const parsed1 = parseHsplus(HSPLUS_WITH_SCHEMAS);
    const md = toSkillMd(parsed1.data!).data!;
    const parsed2 = parseSkillMd(md);

    expect(parsed2.data!.metadata.inputSchema).toBeDefined();
    const names1 = parsed1.data!.metadata.inputSchema!.map((f) => f.name).sort();
    const names2 = parsed2.data!.metadata.inputSchema!.map((f) => f.name).sort();
    expect(names2).toEqual(names1);
  });

  it('should preserve output schema names through .hsplus -> SKILL.md -> ParsedSkill', () => {
    const parsed1 = parseHsplus(HSPLUS_WITH_SCHEMAS);
    const md = toSkillMd(parsed1.data!).data!;
    const parsed2 = parseSkillMd(md);

    expect(parsed2.data!.metadata.outputSchema).toBeDefined();
    const names1 = parsed1.data!.metadata.outputSchema!.map((f) => f.name).sort();
    const names2 = parsed2.data!.metadata.outputSchema!.map((f) => f.name).sort();
    expect(names2).toEqual(names1);
  });

  it('should preserve schema through SKILL.md -> HoloClaw -> ParsedSkill -> SKILL.md', () => {
    const parsed1 = parseSkillMd(SKILL_MD_WITH_SCHEMAS);
    const holoClaw = toHoloClawSkill(parsed1.data!);
    const parsed2 = fromHoloClawSkill(holoClaw);
    const md = toSkillMd(parsed2).data!;

    expect(md).toContain('input_schema:');
    expect(md).toContain('output_schema:');
    expect(md).toContain('  - name: url');
    expect(md).toContain('  - name: content');
  });
});
