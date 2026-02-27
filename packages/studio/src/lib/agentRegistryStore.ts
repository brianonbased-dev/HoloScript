import { create } from 'zustand';

export interface AgentConfig {
  id: string;
  name: string;
  type: string;
  status: 'idle' | 'running' | 'error';
  config: Record<string, any>;
}

export interface AgentRegistryState {
  agents: AgentConfig[];
  registerAgent: (agent: AgentConfig) => void;
  unregisterAgent: (id: string) => void;
  setAgentStatus: (id: string, status: AgentConfig['status']) => void;
}

export const useAgentRegistryStore = create<AgentRegistryState>((set) => ({
  agents: [],
  registerAgent: (agent) => set((state) => ({ agents: [...state.agents, agent] })),
  unregisterAgent: (id) => set((state) => ({ agents: state.agents.filter(a => a.id !== id) })),
  setAgentStatus: (id, status) => set((state) => ({
    agents: state.agents.map(a => a.id === id ? { ...a, status } : a)
  })),
}));
