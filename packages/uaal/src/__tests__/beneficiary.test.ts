import { describe, expect, it } from 'vitest';
import {
  recoverBeneficiary,
  resolveBeneficiary,
  UAAL_BENEFICIARY_HOLARCHY,
  type UAALBeneficiaryIR,
} from '../beneficiary';

// The beneficiary holarchy as native uAAL: WHO an action serves {self ⊂ agents ⊂ humans} and
// whether the HARD human floor holds. resolveBeneficiary carries the three-body discipline —
// unknown human impact is a GAP (unresolvable), never a floor pass.

describe('recoverBeneficiary — distribution + floor + served', () => {
  it('sums signed impacts and coerces absent levels to 0', () => {
    const ir: UAALBeneficiaryIR = {
      impacts: [
        { beneficiary: 'self', value: 0.9 },
        { beneficiary: 'agents', value: 0.4 },
        // humans absent → 0
      ],
    };
    const r = recoverBeneficiary(ir);
    expect(r.distribution).toEqual({ self: 0.9, agents: 0.4, humans: 0 });
    expect(r.humanFloorHeld).toBe(true); // humans not net-harmed
  });

  it('harmful forces a negative magnitude and breaches the floor when humans are harmed', () => {
    const ir: UAALBeneficiaryIR = {
      impacts: [
        { beneficiary: 'self', value: 1 },
        { beneficiary: 'humans', harmful: true },
      ],
    };
    const r = recoverBeneficiary(ir);
    expect(r.distribution.humans).toBeLessThan(0);
    expect(r.humanFloorHeld).toBe(false);
  });

  it('records the human-floor Forbiddance norm id when declared', () => {
    const ir: UAALBeneficiaryIR = {
      impacts: [{ beneficiary: 'humans', value: 0.5 }],
      norms: [{ id: 'no-human-harm', force: 'F', protects: 'humans' }],
    };
    expect(recoverBeneficiary(ir).floorNormId).toBe('no-human-harm');
  });

  it('served is the greatest contribution; an all-tie favours the outer whole (humans)', () => {
    const tie = recoverBeneficiary({
      impacts: [
        { beneficiary: 'self', value: 0.5 },
        { beneficiary: 'agents', value: 0.5 },
        { beneficiary: 'humans', value: 0.5 },
      ],
    });
    expect(tie.served).toBe('humans');

    const selfWins = recoverBeneficiary({
      impacts: [
        { beneficiary: 'self', value: 0.9 },
        { beneficiary: 'humans', value: 0.2 },
      ],
    });
    expect(selfWins.served).toBe('self');
  });

  it('holarchy order is self → agents → humans (innermost to outermost)', () => {
    expect(UAAL_BENEFICIARY_HOLARCHY).toEqual(['self', 'agents', 'humans']);
  });
});

describe('resolveBeneficiary — three-body honesty about the human floor', () => {
  it('ABSTAINS when the human impact is unstated (missing_precondition)', () => {
    const ir: UAALBeneficiaryIR = {
      impacts: [
        { beneficiary: 'self', value: 1 },
        { beneficiary: 'agents', value: 0.8 },
        // no human impact, not declared unaffected
      ],
    };
    const res = resolveBeneficiary(ir);
    expect(res.status).toBe('unresolvable');
    expect(res.reason).toBe('missing_precondition');
  });

  it('resolves when the action explicitly declares humans unaffected (floor held at 0)', () => {
    const res = resolveBeneficiary({
      impacts: [{ beneficiary: 'self', value: 1 }],
      unaffected: ['humans'],
    });
    expect(res.status).toBe('resolved');
    expect(res.answer?.humanFloorHeld).toBe(true);
    expect(res.answer?.distribution.humans).toBe(0);
  });

  it('resolves with the floor held when humans are stated to benefit', () => {
    const res = resolveBeneficiary({
      impacts: [
        { beneficiary: 'self', value: 0.6 },
        { beneficiary: 'humans', value: 0.9 },
      ],
    });
    expect(res.status).toBe('resolved');
    expect(res.answer?.humanFloorHeld).toBe(true);
    expect(res.answer?.served).toBe('humans');
  });

  it('resolves with the floor BREACHED when humans are stated to be harmed', () => {
    const res = resolveBeneficiary({
      impacts: [
        { beneficiary: 'self', value: 1 },
        { beneficiary: 'humans', value: -0.7 },
      ],
    });
    expect(res.status).toBe('resolved');
    expect(res.answer?.humanFloorHeld).toBe(false);
  });

  it('ABSTAINS on a genuine benefit-and-harm conflict (unprioritized_conflict)', () => {
    const res = resolveBeneficiary({
      impacts: [
        { beneficiary: 'humans', value: 0.8 },
        { beneficiary: 'humans', harmful: true },
      ],
    });
    expect(res.status).toBe('unresolvable');
    expect(res.reason).toBe('unprioritized_conflict');
  });

  it('no false gaps: a fully determinate IR resolves', () => {
    const res = resolveBeneficiary({
      impacts: [
        { beneficiary: 'self', value: 0.5 },
        { beneficiary: 'agents', value: 0.5 },
        { beneficiary: 'humans', value: 0.5 },
      ],
    });
    expect(res.status).toBe('resolved');
    expect(res.reason).toBeUndefined();
  });
});
