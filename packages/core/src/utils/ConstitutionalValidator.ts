/**
 * Constitutional Validator for HoloScript
 *
 * Validates agentic actions against a defined set of natural language and rule-based
 * constraints (The Constitution).
 */

export interface constitutionalRule {
  id: string;
  description: string;
  severity: 'soft' | 'hard' | 'critical';
  pattern?: RegExp;
  category?: string;
  action?: string;
}

export interface ValidationResult {
  allowed: boolean;
  violations: constitutionalRule[];
  escalationLevel: 'none' | 'notify' | 'soft_block' | 'hard_block' | 'emergency_stop';
}

export class ConstitutionalValidator {
  /**
   * Default safety rules for HoloScript spatial agents
   */
  private static DEFAULT_RULES: constitutionalRule[] = [
    {
      id: 'NO_GLOBAL_DELETE',
      description: 'Agents cannot perform bulk deletion of world-locked anchors.',
      severity: 'critical',
      category: 'delete',
      action: 'delete_all',
    },
    {
      id: 'NO_UNAUTHORIZED_MINT',
      description: 'Agents cannot initiate minting without explicit financial category clearance.',
      severity: 'hard',
      category: 'financial',
    },
  ];

  /**
   * Validate an action against a constitution
   */
  public static validate(
    action: { name: string; category: string; description: string },
    constitution: constitutionalRule[] = []
  ): ValidationResult {
    const activeRules = [...this.DEFAULT_RULES, ...constitution];
    const violations: constitutionalRule[] = [];

    for (const rule of activeRules) {
      let isViolation = false;

      // Check category match
      if (rule.category && action.category === rule.category) {
        if (!rule.action || action.name === rule.action) {
          isViolation = true;
        }
      }

      // Check pattern match in description or name
      if (
        rule.pattern &&
        (rule.pattern.test(action.name) || rule.pattern.test(action.description))
      ) {
        isViolation = true;
      }

      if (isViolation) {
        violations.push(rule);
      }
    }

    if (violations.length === 0) {
      return { allowed: true, violations: [], escalationLevel: 'none' };
    }

    // Determine highest escalation level
    const severities = violations.map((v) => v.severity);
    let escalationLevel: ValidationResult['escalationLevel'] = 'notify';

    if (severities.includes('critical')) {
      escalationLevel = 'emergency_stop';
    } else if (severities.includes('hard')) {
      escalationLevel = 'hard_block';
    } else if (severities.includes('soft')) {
      escalationLevel = 'soft_block';
    }

    return {
      allowed: false,
      violations,
      escalationLevel,
    };
  }
}
