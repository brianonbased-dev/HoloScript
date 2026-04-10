/**
 * neuroscience-viz.scenario.ts — LIVING-SPEC: Neuroscience Visualizer
 *
 * Persona: Dr. Chen — neuroscientist who maps brain regions,
 * analyzes EEG brainwaves, and visualizes neural pathways.
 */

import { describe, it, expect } from 'vitest';
import {
  dominantBand,
  totalPower,
  relativePower,
  detectCognitiveState,
  getRegionById,
  regionsByFunction,
  regionsByHemisphere,
  pathwayStrength,
  fmriBoldResponse,
  connectomeMatrix,
  EEG_BANDS,
  BRAIN_REGIONS,
  type BandPower,
  type NeuralPathway,
} from '@/lib/neuroscienceViz';

describe('Scenario: Neuroscience — Brain Regions', () => {
  it('BRAIN_REGIONS has 9 areas', () => {
    expect(BRAIN_REGIONS).toHaveLength(9);
  });

  it("getRegionById('broca') returns Broca's Area", () => {
    const broca = getRegionById('broca');
    expect(broca).toBeDefined();
    expect(broca!.functions).toContain('speech production');
    expect(broca!.brodmannArea).toBe(44);
  });

  it('visual cortex is in occipital region', () => {
    const visual = getRegionById('visual')!;
    expect(visual.region).toBe('occipital');
  });

  it('regionsByFunction(memory) returns hippocampus', () => {
    const memory = regionsByFunction('memory');
    expect(memory.some((r) => r.id === 'hippocampus')).toBe(true);
  });

  it('regionsByHemisphere(left) includes Broca and Wernicke', () => {
    const left = regionsByHemisphere('left');
    expect(left.some((r) => r.id === 'broca')).toBe(true);
    expect(left.some((r) => r.id === 'wernicke')).toBe(true);
  });
});

describe('Scenario: Neuroscience — EEG Analysis', () => {
  it('EEG_BANDS covers 5 frequency ranges', () => {
    expect(Object.keys(EEG_BANDS)).toHaveLength(5);
  });

  it('alpha band = 8-13 Hz', () => {
    expect(EEG_BANDS.alpha.minHz).toBe(8);
    expect(EEG_BANDS.alpha.maxHz).toBe(13);
  });

  it('dominantBand() finds highest power band', () => {
    const power: BandPower = { delta: 5, theta: 10, alpha: 30, beta: 15, gamma: 8 };
    expect(dominantBand(power)).toBe('alpha');
  });

  it('totalPower() sums all bands', () => {
    const power: BandPower = { delta: 10, theta: 20, alpha: 30, beta: 20, gamma: 10 };
    expect(totalPower(power)).toBe(90);
  });

  it('relativePower() calculates fraction', () => {
    const power: BandPower = { delta: 10, theta: 20, alpha: 30, beta: 20, gamma: 20 };
    expect(relativePower(power, 'alpha')).toBeCloseTo(0.3, 2);
  });
});

describe('Scenario: Neuroscience — Cognitive States', () => {
  it('dominant delta = deep-sleep', () => {
    expect(detectCognitiveState({ delta: 80, theta: 5, alpha: 5, beta: 5, gamma: 5 })).toBe(
      'deep-sleep'
    );
  });

  it('high alpha = relaxed', () => {
    expect(detectCognitiveState({ delta: 5, theta: 5, alpha: 50, beta: 10, gamma: 5 })).toBe(
      'relaxed'
    );
  });

  it('dominant beta = focused', () => {
    expect(detectCognitiveState({ delta: 5, theta: 10, alpha: 15, beta: 35, gamma: 10 })).toBe(
      'focused'
    );
  });

  it('dominant gamma = flow', () => {
    expect(detectCognitiveState({ delta: 5, theta: 5, alpha: 5, beta: 10, gamma: 50 })).toBe(
      'flow'
    );
  });

  it('pathwayStrength() averages connectivity', () => {
    const pathways: NeuralPathway[] = [
      {
        id: 'p1',
        name: 'Arc Fascic',
        source: 'broca',
        target: 'wernicke',
        strength: 0.8,
        neurotransmitter: 'glutamate',
      },
      {
        id: 'p2',
        name: 'Nigrostriatal',
        source: 'brainstem',
        target: 'motor',
        strength: 0.6,
        neurotransmitter: 'dopamine',
      },
    ];
    expect(pathwayStrength(pathways)).toBeCloseTo(0.7, 1);
  });

  it('fMRI BOLD response — hemodynamic response to stimulus', () => {
    const bold = fmriBoldResponse(5, 10, 0.8, 1);
    expect(bold.length).toBeGreaterThan(20);
    // Before stimulus onset, activation should be 0
    const preStim = bold.filter((s) => s.timeSeconds < 5);
    expect(preStim.every((s) => s.activation === 0)).toBe(true);
    // During/after stimulus, some activation > 0
    const postStim = bold.filter((s) => s.timeSeconds >= 5 && s.timeSeconds <= 15);
    expect(postStim.some((s) => s.activation > 0)).toBe(true);
  });

  it('connectome matrix — neural connectivity mapping', () => {
    const pathways: NeuralPathway[] = [
      {
        id: 'p1',
        name: 'Arc',
        source: 'broca',
        target: 'wernicke',
        strength: 0.8,
        neurotransmitter: 'glutamate',
      },
      {
        id: 'p2',
        name: 'NS',
        source: 'broca',
        target: 'motor',
        strength: 0.5,
        neurotransmitter: 'dopamine',
      },
      {
        id: 'p3',
        name: 'Vis',
        source: 'visual',
        target: 'parietal',
        strength: 0.9,
        neurotransmitter: 'glutamate',
      },
    ];
    const matrix = connectomeMatrix(pathways);
    expect(matrix.get('broca')!.get('wernicke')).toBe(0.8);
    expect(matrix.get('broca')!.get('motor')).toBe(0.5);
    expect(matrix.get('visual')!.get('parietal')).toBe(0.9);
    expect(matrix.has('wernicke')).toBe(false); // no outgoing
  });
});
