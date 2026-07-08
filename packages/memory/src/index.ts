/**
 * @holoscript/memory — consumable client for the shared sovereign agent-memory
 * substrate. Every family installs this and reads/writes the SAME identity-keyed
 * memory on the sovereign SoT (the de-silo as a package, not a bespoke service).
 */
export {
  SovereignMemoryStore,
  type MemoryEntryInput,
  type MemoryEntry,
  type MemorySection,
  type MemoryType,
  type RecallOptions,
  type SovereignMemoryConfig,
} from './sovereign-memory-store.js';

export {
  AGENT_MEMORY_PROFILE_SCHEMA,
  HOLOSCRIPT_AGENT_RUNTIME_PACKAGE,
  buildAgentMemoryProfile,
  memoryEntryFromAgentProfile,
  type AgentMemoryFamily,
  type AgentMemoryProfile,
  type AgentMemoryProfileInput,
} from './agent-memory-profile.js';
