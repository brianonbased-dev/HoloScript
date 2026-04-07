export type AbsorbPhase = 'idle' | 'graph_rag_query' | 'compress_knowledge' | 'board_claim' | 'execute' | 'contribute';

export interface AbsorbTask {
  id: string;
  objective: string;
  phase: AbsorbPhase;
  knowledgeTokensProcessed: number;
  progressPercent: number;
}

export function advanceAbsorbFunnel(tasks: AbsorbTask[]): AbsorbTask[] {
  return tasks.map(t => {
    switch (t.phase) {
      case 'idle':
        return { ...t, phase: 'graph_rag_query', progressPercent: 10 };
      case 'graph_rag_query':
        return { ...t, phase: 'compress_knowledge', knowledgeTokensProcessed: t.knowledgeTokensProcessed + 500, progressPercent: 30 };
      case 'compress_knowledge':
        return { ...t, phase: 'board_claim', progressPercent: 50 };
      case 'board_claim':
        return { ...t, phase: 'execute', progressPercent: 70 };
      case 'execute':
        return { ...t, phase: 'contribute', progressPercent: 90 };
      case 'contribute':
        return { ...t, phase: 'idle', progressPercent: 100, knowledgeTokensProcessed: 0 };
      default:
        return t;
    }
  });
}

export function calculateFunnelEfficiency(tasks: AbsorbTask[]): number {
  const activeTasks = tasks.filter(t => t.phase !== 'idle' && t.phase !== 'contribute');
  if (activeTasks.length === 0) return 100;
  
  // Simulated metric: More knowledge tokens processing = slightly lower tick efficiency
  const totalTokens = activeTasks.reduce((acc, t) => acc + t.knowledgeTokensProcessed, 0);
  const efficiencyLoss = Math.min(totalTokens / 5000, 30); // Max 30% penalty
  
  return 100 - efficiencyLoss;
}
