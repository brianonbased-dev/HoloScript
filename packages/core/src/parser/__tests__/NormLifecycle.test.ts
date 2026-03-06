/**
 * Tests for Norm Lifecycle DSL Extension (CRSEC Model)
 *
 * Tests cover:
 * - norm block parsing with all CRSEC lifecycle phases
 * - metanorm block parsing with governance rules and escalation
 * - norm blocks with traits and event handlers
 * - compiler mixin: compilation, validation, and code generation
 * - error handling and edge cases
 *
 * @version 4.5.0
 */

import { describe, it, expect } from 'vitest';
import { parseHolo } from '../HoloCompositionParser';
import type { HoloNormBlock, HoloMetanorm } from '../HoloCompositionTypes';
import {
  compileNormBlock,
  compileMetanormBlock,
  validateCompiledNorm,
  validateCompiledMetanorm,
  generateNormEnforcementCode,
  generateMetanormGovernanceCode,
} from '../../compiler/NormLifecycleCompilerMixin';

// =============================================================================
// PARSER TESTS — norm blocks
// =============================================================================

describe('Norm Lifecycle DSL — Parser', () => {
  describe('Basic norm block', () => {
    it('parses a minimal norm block', () => {
      const source = `
        composition "NormTest" {
          norm "NoSpamming" {
            description: "Agents must not send unsolicited messages"
            category: "communication"
            priority: 8
          }
        }
      `;
      const result = parseHolo(source);
      expect(result.success).toBe(true);
      expect(result.ast?.norms).toBeDefined();
      expect(result.ast!.norms!.length).toBe(1);

      const norm = result.ast!.norms![0];
      expect(norm.type).toBe('NormBlock');
      expect(norm.name).toBe('NoSpamming');
      expect(norm.properties.description).toBe('Agents must not send unsolicited messages');
      expect(norm.properties.category).toBe('communication');
      expect(norm.properties.priority).toBe(8);
    });

    it('parses norm with identifier name (no quotes)', () => {
      const source = `
        composition "Test" {
          norm NoLittering {
            description: "Keep the environment clean"
          }
        }
      `;
      const result = parseHolo(source);
      expect(result.success).toBe(true);
      expect(result.ast!.norms![0].name).toBe('NoLittering');
    });

    it('parses multiple norm blocks', () => {
      const source = `
        composition "MultiNorm" {
          norm "RuleA" {
            priority: 1
          }
          norm "RuleB" {
            priority: 2
          }
          norm "RuleC" {
            priority: 3
          }
        }
      `;
      const result = parseHolo(source);
      expect(result.success).toBe(true);
      expect(result.ast!.norms!.length).toBe(3);
      expect(result.ast!.norms![0].name).toBe('RuleA');
      expect(result.ast!.norms![1].name).toBe('RuleB');
      expect(result.ast!.norms![2].name).toBe('RuleC');
    });
  });

  describe('CRSEC lifecycle sub-blocks', () => {
    it('parses creation sub-block', () => {
      const source = `
        composition "Test" {
          norm "TestNorm" {
            creation {
              author: "system"
              rationale: "Prevent flooding"
              initial_status: "proposed"
            }
          }
        }
      `;
      const result = parseHolo(source);
      expect(result.success).toBe(true);

      const norm = result.ast!.norms![0];
      expect(norm.creation).toBeDefined();
      expect(norm.creation!.type).toBe('NormCreation');
      expect(norm.creation!.properties.author).toBe('system');
      expect(norm.creation!.properties.rationale).toBe('Prevent flooding');
      expect(norm.creation!.properties.initial_status).toBe('proposed');
    });

    it('parses representation sub-block', () => {
      const source = `
        composition "Test" {
          norm "TestNorm" {
            representation {
              condition: "message_count_per_minute < 10"
              scope: "all_agents"
              exceptions: ["system_announcements", "emergency_alerts"]
            }
          }
        }
      `;
      const result = parseHolo(source);
      expect(result.success).toBe(true);

      const norm = result.ast!.norms![0];
      expect(norm.representation).toBeDefined();
      expect(norm.representation!.type).toBe('NormRepresentation');
      expect(norm.representation!.properties.condition).toBe('message_count_per_minute < 10');
      expect(norm.representation!.properties.scope).toBe('all_agents');
      expect(norm.representation!.properties.exceptions).toEqual(['system_announcements', 'emergency_alerts']);
    });

    it('parses spreading sub-block', () => {
      const source = `
        composition "Test" {
          norm "TestNorm" {
            spreading {
              mechanism: "broadcast"
              visibility: "public"
              adoption_incentive: 5
            }
          }
        }
      `;
      const result = parseHolo(source);
      expect(result.success).toBe(true);

      const norm = result.ast!.norms![0];
      expect(norm.spreading).toBeDefined();
      expect(norm.spreading!.type).toBe('NormSpreading');
      expect(norm.spreading!.properties.mechanism).toBe('broadcast');
      expect(norm.spreading!.properties.visibility).toBe('public');
      expect(norm.spreading!.properties.adoption_incentive).toBe(5);
    });

    it('parses evaluation sub-block', () => {
      const source = `
        composition "Test" {
          norm "TestNorm" {
            evaluation {
              voting: "majority"
              quorum: 0.6
              approval_threshold: 0.5
              review_period: 86400
              auto_adopt: false
            }
          }
        }
      `;
      const result = parseHolo(source);
      expect(result.success).toBe(true);

      const norm = result.ast!.norms![0];
      expect(norm.evaluation).toBeDefined();
      expect(norm.evaluation!.type).toBe('NormEvaluation');
      expect(norm.evaluation!.properties.voting).toBe('majority');
      expect(norm.evaluation!.properties.quorum).toBe(0.6);
      expect(norm.evaluation!.properties.approval_threshold).toBe(0.5);
      expect(norm.evaluation!.properties.review_period).toBe(86400);
      expect(norm.evaluation!.properties.auto_adopt).toBe(false);
    });

    it('parses compliance sub-block', () => {
      const source = `
        composition "Test" {
          norm "TestNorm" {
            compliance {
              monitoring: "continuous"
              violation_threshold: 3
              severity: "moderate"
              sanctions: ["warn", "restrict", "suspend"]
              appeal_allowed: true
              grace_period: 3600
            }
          }
        }
      `;
      const result = parseHolo(source);
      expect(result.success).toBe(true);

      const norm = result.ast!.norms![0];
      expect(norm.compliance).toBeDefined();
      expect(norm.compliance!.type).toBe('NormCompliance');
      expect(norm.compliance!.properties.monitoring).toBe('continuous');
      expect(norm.compliance!.properties.violation_threshold).toBe(3);
      expect(norm.compliance!.properties.severity).toBe('moderate');
      expect(norm.compliance!.properties.sanctions).toEqual(['warn', 'restrict', 'suspend']);
      expect(norm.compliance!.properties.appeal_allowed).toBe(true);
      expect(norm.compliance!.properties.grace_period).toBe(3600);
    });

    it('parses full CRSEC lifecycle with all five phases', () => {
      const source = `
        composition "FullCRSEC" {
          norm "CompleteNorm" {
            description: "Full lifecycle norm"
            category: "governance"
            priority: 10

            creation {
              author: "governance_council"
              rationale: "Establish order"
              initial_status: "proposed"
            }

            representation {
              condition: "trust_score > 0.5"
              scope: "verified_agents"
            }

            spreading {
              mechanism: "broadcast"
              visibility: "public"
              adoption_incentive: 10
            }

            evaluation {
              voting: "supermajority"
              quorum: 0.75
              approval_threshold: 0.67
              review_period: 172800
              auto_adopt: false
            }

            compliance {
              monitoring: "continuous"
              violation_threshold: 2
              severity: "major"
              sanctions: ["warn", "restrict", "ban"]
              appeal_allowed: true
              grace_period: 7200
            }
          }
        }
      `;
      const result = parseHolo(source);
      expect(result.success).toBe(true);

      const norm = result.ast!.norms![0];
      expect(norm.name).toBe('CompleteNorm');
      expect(norm.creation).toBeDefined();
      expect(norm.representation).toBeDefined();
      expect(norm.spreading).toBeDefined();
      expect(norm.evaluation).toBeDefined();
      expect(norm.compliance).toBeDefined();

      // Verify cross-phase consistency
      expect(norm.creation!.properties.author).toBe('governance_council');
      expect(norm.evaluation!.properties.voting).toBe('supermajority');
      expect(norm.compliance!.properties.sanctions).toEqual(['warn', 'restrict', 'ban']);
    });
  });

  describe('Norm with traits', () => {
    it('parses norm with inline trait decorators', () => {
      const source = `
        composition "Test" {
          norm "EnforceableNorm" @enforceable @community_driven {
            description: "A norm with traits"
            priority: 5
          }
        }
      `;
      const result = parseHolo(source);
      expect(result.success).toBe(true);

      const norm = result.ast!.norms![0];
      expect(norm.traits).toContain('enforceable');
      expect(norm.traits).toContain('community_driven');
    });
  });

  describe('Norm alongside other blocks', () => {
    it('parses norms alongside objects and templates', () => {
      const source = `
        composition "MixedContent" {
          object "Player" {
            position: [0, 0, 0]
          }

          norm "NoGriefing" {
            description: "Players must not grief others"
            category: "behavior"
            priority: 9

            compliance {
              severity: "major"
              sanctions: ["warn", "ban"]
            }
          }

          template "Guardian" {
            model: "guardian.glb"
          }
        }
      `;
      const result = parseHolo(source);
      expect(result.success).toBe(true);
      expect(result.ast!.objects.length).toBe(1);
      expect(result.ast!.norms!.length).toBe(1);
      expect(result.ast!.templates.length).toBe(1);
    });
  });
});

// =============================================================================
// PARSER TESTS — metanorm blocks
// =============================================================================

describe('Norm Lifecycle DSL — Metanorm Parser', () => {
  it('parses a minimal metanorm block', () => {
    const source = `
      composition "MetanormTest" {
        metanorm "AmendmentProcess" {
          description: "Rules for norm amendments"
          applies_to: "all_norms"
        }
      }
    `;
    const result = parseHolo(source);
    expect(result.success).toBe(true);
    expect(result.ast?.metanorms).toBeDefined();
    expect(result.ast!.metanorms!.length).toBe(1);

    const mn = result.ast!.metanorms![0];
    expect(mn.type).toBe('Metanorm');
    expect(mn.name).toBe('AmendmentProcess');
    expect(mn.properties.description).toBe('Rules for norm amendments');
    expect(mn.properties.applies_to).toBe('all_norms');
  });

  it('parses metanorm with rules sub-block', () => {
    const source = `
      composition "Test" {
        metanorm "GovernanceRules" {
          rules {
            amendment_quorum: 0.75
            amendment_voting: "supermajority"
            cooldown_period: 604800
            max_amendments_per_cycle: 3
            retroactive_allowed: false
          }
        }
      }
    `;
    const result = parseHolo(source);
    expect(result.success).toBe(true);

    const mn = result.ast!.metanorms![0];
    expect(mn.rules).toBeDefined();
    expect(mn.rules!.type).toBe('MetanormRules');
    expect(mn.rules!.properties.amendment_quorum).toBe(0.75);
    expect(mn.rules!.properties.amendment_voting).toBe('supermajority');
    expect(mn.rules!.properties.cooldown_period).toBe(604800);
    expect(mn.rules!.properties.max_amendments_per_cycle).toBe(3);
    expect(mn.rules!.properties.retroactive_allowed).toBe(false);
  });

  it('parses metanorm with escalation sub-block', () => {
    const source = `
      composition "Test" {
        metanorm "EscalationPolicy" {
          escalation {
            authority: "governance_council"
            override_threshold: 0.9
            appeal_levels: 2
          }
        }
      }
    `;
    const result = parseHolo(source);
    expect(result.success).toBe(true);

    const mn = result.ast!.metanorms![0];
    expect(mn.escalation).toBeDefined();
    expect(mn.escalation!.type).toBe('MetanormEscalation');
    expect(mn.escalation!.properties.authority).toBe('governance_council');
    expect(mn.escalation!.properties.override_threshold).toBe(0.9);
    expect(mn.escalation!.properties.appeal_levels).toBe(2);
  });

  it('parses metanorm with both rules and escalation', () => {
    const source = `
      composition "FullGovernance" {
        metanorm "CompleteGovernance" {
          description: "Full governance metanorm"
          applies_to: "all_norms"

          rules {
            amendment_quorum: 0.75
            amendment_voting: "supermajority"
            cooldown_period: 604800
            max_amendments_per_cycle: 3
            retroactive_allowed: false
          }

          escalation {
            authority: "governance_council"
            override_threshold: 0.9
            appeal_levels: 2
          }
        }
      }
    `;
    const result = parseHolo(source);
    expect(result.success).toBe(true);

    const mn = result.ast!.metanorms![0];
    expect(mn.name).toBe('CompleteGovernance');
    expect(mn.rules).toBeDefined();
    expect(mn.escalation).toBeDefined();
    expect(mn.properties.applies_to).toBe('all_norms');
  });

  it('parses norms and metanorms together', () => {
    const source = `
      composition "GovernedSociety" {
        norm "NoSpamming" {
          description: "No spam"
          compliance {
            severity: "minor"
            sanctions: ["warn"]
          }
        }

        norm "Respectful" {
          description: "Be respectful"
          compliance {
            severity: "major"
            sanctions: ["warn", "suspend"]
          }
        }

        metanorm "ConflictResolution" {
          description: "How to resolve norm conflicts"
          applies_to: "all_norms"

          rules {
            amendment_voting: "consensus"
          }
        }
      }
    `;
    const result = parseHolo(source);
    expect(result.success).toBe(true);
    expect(result.ast!.norms!.length).toBe(2);
    expect(result.ast!.metanorms!.length).toBe(1);
  });
});

// =============================================================================
// COMPILER MIXIN TESTS
// =============================================================================

describe('Norm Lifecycle DSL — Compiler Mixin', () => {
  describe('compileNormBlock', () => {
    it('compiles a full norm block', () => {
      const normBlock: HoloNormBlock = {
        type: 'NormBlock',
        name: 'TestNorm',
        traits: ['enforceable'],
        properties: {
          description: 'Test norm',
          category: 'behavior',
          priority: 7,
        },
        creation: {
          type: 'NormCreation',
          properties: { author: 'system', rationale: 'Testing' },
        },
        representation: {
          type: 'NormRepresentation',
          properties: { condition: 'score > 0', scope: 'all_agents' },
        },
        spreading: {
          type: 'NormSpreading',
          properties: { mechanism: 'broadcast', visibility: 'public' },
        },
        evaluation: {
          type: 'NormEvaluation',
          properties: { voting: 'majority', quorum: 0.5, approval_threshold: 0.5 },
        },
        compliance: {
          type: 'NormCompliance',
          properties: {
            monitoring: 'continuous',
            violation_threshold: 3,
            severity: 'moderate',
            sanctions: ['warn', 'restrict'],
            appeal_allowed: true,
          },
        },
      };

      const compiled = compileNormBlock(normBlock);

      expect(compiled.name).toBe('TestNorm');
      expect(compiled.traits).toContain('enforceable');
      expect(compiled.description).toBe('Test norm');
      expect(compiled.category).toBe('behavior');
      expect(compiled.priority).toBe(7);
      expect(compiled.status).toBe('draft');

      expect(compiled.creation!.author).toBe('system');
      expect(compiled.representation!.condition).toBe('score > 0');
      expect(compiled.spreading!.mechanism).toBe('broadcast');
      expect(compiled.evaluation!.voting).toBe('majority');
      expect(compiled.evaluation!.quorum).toBe(0.5);
      expect(compiled.compliance!.monitoring).toBe('continuous');
      expect(compiled.compliance!.violationThreshold).toBe(3);
      expect(compiled.compliance!.sanctions).toEqual(['warn', 'restrict']);
      expect(compiled.compliance!.appealAllowed).toBe(true);
    });

    it('compiles norm with minimal properties', () => {
      const normBlock: HoloNormBlock = {
        type: 'NormBlock',
        name: 'Minimal',
        traits: [],
        properties: {},
      };

      const compiled = compileNormBlock(normBlock);
      expect(compiled.name).toBe('Minimal');
      expect(compiled.status).toBe('draft');
      expect(compiled.creation).toBeUndefined();
      expect(compiled.representation).toBeUndefined();
      expect(compiled.hasEventHandlers).toBe(false);
    });
  });

  describe('compileMetanormBlock', () => {
    it('compiles a full metanorm block', () => {
      const metanormBlock: HoloMetanorm = {
        type: 'Metanorm',
        name: 'GovernanceRules',
        traits: ['governance'],
        properties: {
          description: 'Governance metanorm',
          applies_to: 'all_norms',
        },
        rules: {
          type: 'MetanormRules',
          properties: {
            amendment_quorum: 0.75,
            amendment_voting: 'supermajority',
            cooldown_period: 604800,
            max_amendments_per_cycle: 3,
            retroactive_allowed: false,
          },
        },
        escalation: {
          type: 'MetanormEscalation',
          properties: {
            authority: 'council',
            override_threshold: 0.9,
            appeal_levels: 2,
          },
        },
      };

      const compiled = compileMetanormBlock(metanormBlock);

      expect(compiled.name).toBe('GovernanceRules');
      expect(compiled.description).toBe('Governance metanorm');
      expect(compiled.appliesTo).toBe('all_norms');
      expect(compiled.rules!.amendmentQuorum).toBe(0.75);
      expect(compiled.rules!.amendmentVoting).toBe('supermajority');
      expect(compiled.rules!.cooldownPeriod).toBe(604800);
      expect(compiled.rules!.maxAmendmentsPerCycle).toBe(3);
      expect(compiled.rules!.retroactiveAllowed).toBe(false);
      expect(compiled.escalation!.authority).toBe('council');
      expect(compiled.escalation!.overrideThreshold).toBe(0.9);
      expect(compiled.escalation!.appealLevels).toBe(2);
    });
  });

  describe('validateCompiledNorm', () => {
    it('validates a correct norm with no issues', () => {
      const normBlock: HoloNormBlock = {
        type: 'NormBlock',
        name: 'ValidNorm',
        traits: [],
        properties: { description: 'Valid' },
        evaluation: {
          type: 'NormEvaluation',
          properties: { quorum: 0.5, approval_threshold: 0.6 },
        },
        compliance: {
          type: 'NormCompliance',
          properties: {
            violation_threshold: 3,
            sanctions: ['warn', 'restrict', 'suspend'],
          },
        },
      };
      const compiled = compileNormBlock(normBlock);
      const issues = validateCompiledNorm(compiled);
      expect(issues).toHaveLength(0);
    });

    it('flags unnamed norm', () => {
      const compiled = compileNormBlock({
        type: 'NormBlock',
        name: 'unnamed',
        traits: [],
        properties: {},
      });
      const issues = validateCompiledNorm(compiled);
      expect(issues.some(i => i.includes('must have a name'))).toBe(true);
    });

    it('flags invalid quorum', () => {
      const compiled = compileNormBlock({
        type: 'NormBlock',
        name: 'BadQuorum',
        traits: [],
        properties: {},
        evaluation: {
          type: 'NormEvaluation',
          properties: { quorum: 1.5 },
        },
      });
      const issues = validateCompiledNorm(compiled);
      expect(issues.some(i => i.includes('quorum must be between 0 and 1'))).toBe(true);
    });

    it('flags out-of-order sanctions', () => {
      const compiled = compileNormBlock({
        type: 'NormBlock',
        name: 'BadSanctions',
        traits: [],
        properties: {},
        compliance: {
          type: 'NormCompliance',
          properties: {
            violation_threshold: 1,
            sanctions: ['ban', 'warn'], // ban before warn = wrong order
          },
        },
      });
      const issues = validateCompiledNorm(compiled);
      expect(issues.some(i => i.includes('ordered by severity'))).toBe(true);
    });

    it('flags violation threshold less than 1', () => {
      const compiled = compileNormBlock({
        type: 'NormBlock',
        name: 'BadThreshold',
        traits: [],
        properties: {},
        compliance: {
          type: 'NormCompliance',
          properties: { violation_threshold: 0 },
        },
      });
      const issues = validateCompiledNorm(compiled);
      expect(issues.some(i => i.includes('violation_threshold must be at least 1'))).toBe(true);
    });
  });

  describe('validateCompiledMetanorm', () => {
    it('validates a correct metanorm', () => {
      const compiled = compileMetanormBlock({
        type: 'Metanorm',
        name: 'ValidMeta',
        traits: [],
        properties: {},
        rules: {
          type: 'MetanormRules',
          properties: { amendment_quorum: 0.75, max_amendments_per_cycle: 3 },
        },
        escalation: {
          type: 'MetanormEscalation',
          properties: { override_threshold: 0.9 },
        },
      });
      const issues = validateCompiledMetanorm(compiled);
      expect(issues).toHaveLength(0);
    });

    it('flags invalid amendment quorum', () => {
      const compiled = compileMetanormBlock({
        type: 'Metanorm',
        name: 'BadMeta',
        traits: [],
        properties: {},
        rules: {
          type: 'MetanormRules',
          properties: { amendment_quorum: -0.5 },
        },
      });
      const issues = validateCompiledMetanorm(compiled);
      expect(issues.some(i => i.includes('amendment_quorum must be between 0 and 1'))).toBe(true);
    });
  });

  describe('Code generation', () => {
    it('generates norm enforcement code', () => {
      const compiled = compileNormBlock({
        type: 'NormBlock',
        name: 'NoSpamming',
        traits: [],
        properties: {
          description: 'No spam allowed',
          category: 'communication',
          priority: 8,
        },
        representation: {
          type: 'NormRepresentation',
          properties: {
            condition: 'message_count < 10',
            scope: 'all_agents',
          },
        },
        evaluation: {
          type: 'NormEvaluation',
          properties: { voting: 'majority', quorum: 0.6 },
        },
        compliance: {
          type: 'NormCompliance',
          properties: {
            monitoring: 'continuous',
            violation_threshold: 3,
            severity: 'moderate',
            sanctions: ['warn', 'restrict'],
            appeal_allowed: true,
            grace_period: 3600,
          },
        },
      });

      const code = generateNormEnforcementCode(compiled);
      expect(code).toContain('norm_NoSpamming');
      expect(code).toContain('"NoSpamming"');
      expect(code).toContain('"communication"');
      expect(code).toContain('priority: 8');
      expect(code).toContain('message_count < 10');
      expect(code).toContain('"majority"');
      expect(code).toContain('quorum: 0.6');
      expect(code).toContain('"continuous"');
      expect(code).toContain('"warn", "restrict"');
      expect(code).toContain('appealAllowed: true');
      expect(code).toContain('gracePeriod: 3600');
    });

    it('generates metanorm governance code', () => {
      const compiled = compileMetanormBlock({
        type: 'Metanorm',
        name: 'AmendmentRules',
        traits: [],
        properties: {
          description: 'Amendment governance',
          applies_to: 'all_norms',
        },
        rules: {
          type: 'MetanormRules',
          properties: {
            amendment_quorum: 0.75,
            amendment_voting: 'supermajority',
            cooldown_period: 604800,
          },
        },
        escalation: {
          type: 'MetanormEscalation',
          properties: {
            authority: 'council',
            override_threshold: 0.9,
            appeal_levels: 2,
          },
        },
      });

      const code = generateMetanormGovernanceCode(compiled);
      expect(code).toContain('metanorm_AmendmentRules');
      expect(code).toContain('"AmendmentRules"');
      expect(code).toContain('"all_norms"');
      expect(code).toContain('amendmentQuorum: 0.75');
      expect(code).toContain('"supermajority"');
      expect(code).toContain('cooldownPeriod: 604800');
      expect(code).toContain('"council"');
      expect(code).toContain('overrideThreshold: 0.9');
      expect(code).toContain('appealLevels: 2');
    });
  });
});

// =============================================================================
// INTEGRATION TESTS — end-to-end parse + compile
// =============================================================================

describe('Norm Lifecycle DSL — Integration', () => {
  it('parses and compiles a realistic community governance composition', () => {
    const source = `
      composition "VirtualCommunity" {
        norm "NoHarassment" {
          description: "Zero tolerance for harassment"
          category: "safety"
          priority: 10

          creation {
            author: "safety_team"
            rationale: "Protect community members from harassment"
          }

          representation {
            condition: "harassment_score < 0.1"
            scope: "all_agents"
          }

          spreading {
            mechanism: "broadcast"
            visibility: "public"
          }

          evaluation {
            voting: "lazy_consensus"
            quorum: 0.3
            approval_threshold: 0.5
            review_period: 86400
          }

          compliance {
            monitoring: "continuous"
            violation_threshold: 1
            severity: "critical"
            sanctions: ["warn", "suspend", "ban"]
            appeal_allowed: true
            grace_period: 0
          }
        }

        metanorm "SafetyGovernance" {
          description: "Governance rules for safety norms"
          applies_to: "safety"

          rules {
            amendment_quorum: 0.9
            amendment_voting: "consensus"
            cooldown_period: 2592000
            max_amendments_per_cycle: 1
            retroactive_allowed: false
          }

          escalation {
            authority: "safety_board"
            override_threshold: 0.95
            appeal_levels: 3
          }
        }
      }
    `;

    const result = parseHolo(source);
    expect(result.success).toBe(true);

    // Compile norm
    const norm = result.ast!.norms![0];
    const compiledNorm = compileNormBlock(norm);
    expect(compiledNorm.name).toBe('NoHarassment');
    expect(compiledNorm.priority).toBe(10);
    expect(compiledNorm.compliance!.severity).toBe('critical');
    expect(compiledNorm.compliance!.gracePeriod).toBe(0);

    // Validate norm
    const normIssues = validateCompiledNorm(compiledNorm);
    expect(normIssues).toHaveLength(0);

    // Compile metanorm
    const metanorm = result.ast!.metanorms![0];
    const compiledMetanorm = compileMetanormBlock(metanorm);
    expect(compiledMetanorm.name).toBe('SafetyGovernance');
    expect(compiledMetanorm.rules!.amendmentVoting).toBe('consensus');
    expect(compiledMetanorm.escalation!.authority).toBe('safety_board');

    // Validate metanorm
    const metanormIssues = validateCompiledMetanorm(compiledMetanorm);
    expect(metanormIssues).toHaveLength(0);

    // Generate code
    const normCode = generateNormEnforcementCode(compiledNorm);
    expect(normCode).toContain('NoHarassment');
    const metanormCode = generateMetanormGovernanceCode(compiledMetanorm);
    expect(metanormCode).toContain('SafetyGovernance');
  });
});
