/**
 * HoloMesh Daemon Action Handlers
 *
 * BT action handlers for the holomesh-agent.hsplus composition.
 * Follows the createMoltbookDaemonActions() factory pattern.
 *
 * Each handler maps to a BT action node name and receives:
 * - params: BT node parameters
 * - blackboard: ephemeral per-cycle shared state
 * - context: runtime context with state access
 */

import { HoloMeshOrchestratorClient } from '../orchestrator-client';
import type { MeshConfig, MeshKnowledgeEntry, HoloMeshDaemonState } from '../types';
import { computeReputation, resolveReputationTier, INITIAL_MESH_STATE } from '../types';
import * as crypto from 'crypto';
import * as fs from 'fs';

export interface HoloMeshDaemonConfig {
  stateFile: string;
  verbose?: boolean;
  maxContributionsPerCycle?: number;
  maxQueriesPerCycle?: number;
  /** Local W/P/G entries to contribute (loaded from knowledge store) */
  localKnowledge?: MeshKnowledgeEntry[];
  /** Search topics to rotate through when querying the network */
  searchTopics?: string[];
}

type ActionHandler = (params: any, blackboard: Record<string, any>, context: any) => Promise<boolean>;

const DEFAULT_SEARCH_TOPICS = [
  'agent safety constraints',
  'memory architecture patterns',
  'compilation pipeline',
  'MCP tool design',
  'recursive self-improvement',
  'trust verification',
  'budget optimization',
  'rendering pipeline',
  'behavior tree orchestration',
];

export function createHoloMeshDaemonActions(
  client: HoloMeshOrchestratorClient,
  config: HoloMeshDaemonConfig,
): { actions: Record<string, ActionHandler>; wireTraitListeners: (runtime: any) => void } {

  // Persistent state
  let state: HoloMeshDaemonState = loadState(config.stateFile);
  let searchTopicIndex = 0;
  const searchTopics = config.searchTopics || DEFAULT_SEARCH_TOPICS;
  const maxContributions = config.maxContributionsPerCycle || 5;
  const maxQueries = config.maxQueriesPerCycle || 3;

  function log(msg: string) {
    if (config.verbose) console.log(`[holomesh] ${msg}`);
  }

  function saveCurrentState() {
    try {
      fs.writeFileSync(config.stateFile, JSON.stringify(state, null, 2), 'utf-8');
    } catch { /* state write failures are non-fatal */ }
  }

  // ── Action Handlers ──

  const mesh_register: ActionHandler = async (_params, blackboard) => {
    if (state.agentId) {
      client.setAgentId(state.agentId);
      log(`Already registered: ${state.agentId}`);
      return true;
    }

    try {
      const id = await client.registerAgent(['@knowledge-exchange', '@research', '@philosophy']);
      state.agentId = id;
      state.status = 'running';
      blackboard.agent_id = id;
      saveCurrentState();
      log(`Registered on mesh: ${id}`);
      return true;
    } catch (err: any) {
      log(`Registration failed: ${err.message}`);
      state.errors++;
      return false;
    }
  };

  const mesh_discover_peers: ActionHandler = async (_params, blackboard) => {
    try {
      const peers = await client.discoverPeers();
      state.peers = peers.map(p => p.id);
      state.knownPeerCount = peers.length;
      state.lastDiscoveryAt = new Date().toISOString();
      blackboard.discovered_peers = peers;
      saveCurrentState();
      log(`Discovered ${peers.length} peers`);
      return peers.length > 0;
    } catch (err: any) {
      log(`Discovery failed: ${err.message}`);
      return false;
    }
  };

  const mesh_check_inbox: ActionHandler = async (_params, blackboard) => {
    try {
      const messages = await client.readInbox();
      const unprocessed = messages.filter(
        (m: any) => !state.processedMessageIds.includes(m.id),
      );
      blackboard.inbox_messages = unprocessed;
      state.unreadMessages = unprocessed.length;
      log(`Inbox: ${unprocessed.length} unread messages`);
      return unprocessed.length > 0;
    } catch (err: any) {
      log(`Inbox check failed: ${err.message}`);
      return false;
    }
  };

  const mesh_reply_queries: ActionHandler = async (_params, blackboard) => {
    const messages = blackboard.inbox_messages || [];
    const queries = messages.filter(
      (m: any) => {
        try {
          const content = typeof m.content === 'string' ? JSON.parse(m.content) : m.content;
          return content?.type === 'query';
        } catch { return false; }
      },
    );

    if (queries.length === 0) return false;

    let answered = 0;
    for (const query of queries.slice(0, 3)) {
      try {
        const content = typeof query.content === 'string' ? JSON.parse(query.content) : query.content;
        const searchTerm = content?.payload?.search || '';

        if (!searchTerm) continue;

        // Search our own knowledge for relevant entries
        const results = await client.queryKnowledge(searchTerm, { limit: 3 });

        if (results.length > 0) {
          await client.sendMessage(query.from || query.from_agent_id, {
            type: 'response',
            payload: { results, query: searchTerm },
            timestamp: new Date().toISOString(),
          });
          answered++;
        }

        // Mark as processed
        if (query.id) state.processedMessageIds.push(query.id);
      } catch { /* skip failed responses */ }
    }

    state.totalQueriesAnswered += answered;
    saveCurrentState();
    log(`Answered ${answered}/${queries.length} queries`);
    return answered > 0;
  };

  const mesh_contribute_knowledge: ActionHandler = async (_params, blackboard) => {
    const localEntries = config.localKnowledge || [];
    const uncontributed = localEntries.filter(e => !state.contributedIds.includes(e.id));

    if (uncontributed.length === 0) {
      log('No new entries to contribute');
      return false;
    }

    const batch = uncontributed.slice(0, maxContributions);

    try {
      const synced = await client.contributeKnowledge(batch);
      state.contributedIds.push(...batch.map(e => e.id));
      state.totalContributions += batch.length;
      state.lastContributionAt = new Date().toISOString();
      blackboard.contributed_this_cycle = batch.length;
      saveCurrentState();
      log(`Contributed ${batch.length} entries (${synced} synced)`);
      return true;
    } catch (err: any) {
      log(`Contribution failed: ${err.message}`);
      return false;
    }
  };

  const mesh_query_network: ActionHandler = async (_params, blackboard) => {
    const topic = searchTopics[searchTopicIndex % searchTopics.length];
    searchTopicIndex++;

    try {
      const results = await client.queryKnowledge(topic, { limit: 5 });
      const newResults = results.filter(r => !state.receivedIds.includes(r.id));

      state.receivedIds.push(...newResults.map(r => r.id));
      state.totalQueries++;
      state.queryHistory.push(topic);
      // Cap history
      if (state.queryHistory.length > 50) state.queryHistory = state.queryHistory.slice(-50);
      if (state.receivedIds.length > 500) state.receivedIds = state.receivedIds.slice(-500);

      blackboard.query_results = newResults;
      blackboard.queries_this_cycle = (blackboard.queries_this_cycle || 0) + 1;
      saveCurrentState();
      log(`Queried "${topic}": ${newResults.length} new results`);
      return newResults.length > 0;
    } catch (err: any) {
      log(`Query failed: ${err.message}`);
      return false;
    }
  };

  const mesh_collect_premium: ActionHandler = async (_params, blackboard) => {
    // V1: Log interest in premium entries. V2: trigger Publishing Protocol.
    const results: MeshKnowledgeEntry[] = blackboard.query_results || [];
    const premium = results.filter(r => r.price > 0);

    if (premium.length === 0) return false;

    state.totalCollects += premium.length;
    saveCurrentState();
    log(`Found ${premium.length} premium entries (collection deferred to V2)`);
    return true;
  };

  const mesh_heartbeat: ActionHandler = async () => {
    try {
      // Update reputation before heartbeat
      const rep = computeReputation(
        state.totalContributions,
        state.totalQueriesAnswered,
        state.totalContributions > 0
          ? state.receivedIds.length / state.totalContributions
          : 0,
      );
      state.reputation = rep;
      state.reputationTier = resolveReputationTier(rep);

      const ok = await client.heartbeat({
        reputation: state.reputation,
        reputationTier: state.reputationTier,
        contributions: state.totalContributions,
        queries: state.totalQueries,
      });

      log(`Heartbeat: ${ok ? 'OK' : 'FAIL'} | Rep: ${state.reputation} (${state.reputationTier})`);
      return ok;
    } catch {
      return false;
    }
  };

  const mesh_follow_back: ActionHandler = async () => {
    // V1: No follow-back needed since there's no explicit follow system on orchestrator.
    // Just subscribe to common topics.
    const topics = ['knowledge-exchange', 'security', 'compilation'];
    let subscribed = 0;

    for (const topic of topics) {
      if (await client.subscribe(topic)) subscribed++;
    }

    log(`Subscribed to ${subscribed} topics`);
    return subscribed > 0;
  };

  // ── Factory Return ──

  const actions: Record<string, ActionHandler> = {
    mesh_register,
    mesh_discover_peers,
    mesh_check_inbox,
    mesh_reply_queries,
    mesh_contribute_knowledge,
    mesh_query_network,
    mesh_collect_premium,
    mesh_heartbeat,
    mesh_follow_back,
  };

  const wireTraitListeners = (runtime: any) => {
    if (runtime.on) {
      runtime.on('rate_limit_exceeded', () => {
        log('Rate limit hit — slowing down');
      });
      runtime.on('circuit_breaker_open', () => {
        log('Circuit breaker opened — pausing mesh operations');
        state.status = 'paused';
        saveCurrentState();
      });
      runtime.on('circuit_breaker_close', () => {
        state.status = 'running';
        saveCurrentState();
      });
      runtime.on('economy_spend', (event: any) => {
        state.spentUSD += event?.amount || 0;
        saveCurrentState();
      });
    }
  };

  return { actions, wireTraitListeners };
}

// ── State Persistence ──

function loadState(stateFile: string): HoloMeshDaemonState {
  try {
    if (fs.existsSync(stateFile)) {
      const raw = fs.readFileSync(stateFile, 'utf-8');
      const saved = JSON.parse(raw);
      return {
        ...INITIAL_MESH_STATE,
        ...saved,
        // Always fresh arrays to avoid shallow copy bugs (G.BRAIN.01)
        peers: saved.peers || [],
        following: saved.following || [],
        followers: saved.followers || [],
        contributedIds: saved.contributedIds || [],
        receivedIds: saved.receivedIds || [],
        queryHistory: saved.queryHistory || [],
        processedMessageIds: saved.processedMessageIds || [],
      };
    }
  } catch { /* fresh state on error */ }
  return { ...INITIAL_MESH_STATE, processedMessageIds: [] } as any;
}
