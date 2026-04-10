export type BlueprintComplexity = 'low' | 'medium' | 'high' | 'experimental';

export interface PrototypeComponent {
  id: string;
  name: string;
  material: string;
  weightKg: number;
  cost: number;
}

export function calculateTotalCost(components: PrototypeComponent[]): number {
  return components.reduce((acc, c) => acc + c.cost, 0);
}

export function estimateBuildTimeDays(complexity: BlueprintComplexity, componentCount: number): number {
  const baseDays = componentCount * 0.5;
  switch (complexity) {
    case 'low': return baseDays;
    case 'medium': return baseDays * 1.5;
    case 'high': return baseDays * 2.5;
    case 'experimental': return baseDays * 4.0;
    default: return baseDays;
  }
}

export function simulatePhysicsStressTest(components: PrototypeComponent[], maxLoadKg: number): { passed: boolean; stressFactor: number } {
  const totalWeight = components.reduce((acc, c) => acc + c.weightKg, 0);
  if (totalWeight === 0) return { passed: false, stressFactor: 0 };
  
  // Fake stress test logic: load distribution
  const stressFactor = maxLoadKg / totalWeight;
  // If stress factor is > 10, the prototype fails
  return { passed: stressFactor <= 10, stressFactor };
}
