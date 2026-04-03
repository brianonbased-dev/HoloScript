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
import type { WalletAuth } from '../orchestrator-client';
import type { MeshConfig, MeshKnowledgeEntry, HoloMeshDaemonState } from '../types';
import { deriveAgentDid, createAuthChallenge, signAuthChallenge } from '../wallet-auth';
import { computeReputation, resolveReputationTier, resolveReputationTierWithHysteresis, INITIAL_MESH_STATE } from '../types';
import { HoloMeshWorldState } from '../crdt-sync';
import { HoloMeshDiscovery } from '../discovery';
import * as crypto from 'crypto';
import * as fs from 'fs';

// V3 Wallet imports — lazy-loaded to avoid hard dependency when wallet is disabled
type InvisibleWalletType = {
  getAddress: () => string;
  getPublicClient: () => any;
  getWalletClient: () => any;
  getChainId: () => number;
};
type PaymentGatewayType = {
  createPaymentAuthorization: (resource: string, amountUSDC: number, description?: string) => any;
  getFacilitator: () => any;
  runBatchSettlement: () => Promise<{ settled: number; failed: number; totalVolume: number }>;
  dispose: () => void;
};
type MicroPaymentLedgerType = {
  record: (from: string, to: string, amount: number, resource: string) => any;
  getUnsettled: () => any[];
  markSettled: (entryIds: string[], txHash: string) => void;
  getStats: () => any;
  getUnsettledVolume: () => number;
  pruneSettled: () => number;
};

export interface HoloMeshDaemonConfig {
  stateFile: string;
  verbose?: boolean;
  maxContributionsPerCycle?: number;
  maxQueriesPerCycle?: number;
  /** Local W/P/G entries to contribute (loaded from knowledge store) */
  localKnowledge?: MeshKnowledgeEntry[];
  /** Search topics to rotate through when querying the network */
  searchTopics?: string[];
  // V2 P2P configuration
  v2Enabled?: boolean;
  crdtSnapshotPath?: string;
  peerStorePath?: string;
  localMcpUrl?: string;
  localAgentDid?: string;
  // V3 Wallet configuration
  walletEnabled?: boolean;
  walletTestnet?: boolean;
  // Injectable wallet instances (for testing or pre-initialized wallets)
  _wallet?: InvisibleWalletType | null;
  _paymentGateway?: PaymentGatewayType | null;
  _microLedger?: MicroPaymentLedgerType | null;
  // AI_Workspace delegate integration
  /** AI_Workspace URL (e.g. https://aiworkspace-production.up.railway.app) */
  workspaceUrl?: string;
  /** Agent delegate key for AI_Workspace access */
  workspaceDelegateKey?: string;
  /** Moltbook API key for cross-posting */
  moltbookApiKey?: string;
  /** Moltbook agent name (for posting attribution) */
  moltbookAgentName?: string;
}

type ActionHandler = (
  params: Record<string, unknown>,
  blackboard: Record<string, unknown>,
  context: Record<string, unknown>
) => Promise<boolean>;

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
  config: HoloMeshDaemonConfig
): { actions: Record<string, ActionHandler>; wireTraitListeners: (runtime: any) => void } {
  // Persistent state
  let state: HoloMeshDaemonState = loadState(config.stateFile);
  let searchTopicIndex = 0;
  const searchTopics = config.searchTopics || DEFAULT_SEARCH_TOPICS;
  const maxContributions = config.maxContributionsPerCycle || 5;
  const maxQueries = config.maxQueriesPerCycle || 3;

  // V2 instances (null when v2Enabled is false — backwards compatible)
  let worldState: HoloMeshWorldState | null = null;
  let discovery: HoloMeshDiscovery | null = null;
  if (config.v2Enabled && config.localAgentDid) {
    worldState = new HoloMeshWorldState(config.localAgentDid, {
      snapshotPath: config.crdtSnapshotPath,
    });
    discovery = new HoloMeshDiscovery(config.localAgentDid, config.localMcpUrl || '', worldState, {
      storePath: config.peerStorePath,
    });
  }

  // V3 wallet instances (null when walletEnabled is false — backwards compatible)
  let wallet: InvisibleWalletType | null = config._wallet || null;
  let paymentGateway: PaymentGatewayType | null = config._paymentGateway || null;
  let microLedger: MicroPaymentLedgerType | null = config._microLedger || null;

  if (config.walletEnabled && !wallet) {
    try {
      // Dynamic import to avoid hard dep when wallet is disabled
      const {
        InvisibleWallet,
      } = require('../../../../marketplace-api/src/protocol/InvisibleWallet');
      const {
        PaymentGateway,
        MicroPaymentLedger,
      } = require('../../../../core/src/economy/x402-facilitator');
      const { AgentWalletRegistry } = require('../../../../core/src/agents/AgentWalletRegistry');

      wallet = InvisibleWallet.fromEnvironment({
        testnet: config.walletTestnet ?? false,
      });
      paymentGateway = new PaymentGateway({
        recipientAddress: wallet!.getAddress(),
        chain: config.walletTestnet ? 'base-sepolia' : 'base',
      });
      microLedger = new MicroPaymentLedger();

      // Register in global registry
      AgentWalletRegistry.getInstance().registerWallet(
        config.localAgentDid || 'local-agent',
        wallet!.getAddress(),
        wallet!.getChainId()
      );
    } catch (err: any) {
      // Graceful degradation — missing env var or wallet dep should not crash daemon (G.WALLET.01)
      console.log(`[holomesh] Wallet init failed (continuing without wallet): ${err.message}`);
    }
  }

  if (wallet) {
    state.walletEnabled = true;
    state.walletAddress = wallet.getAddress();
    state.walletChainId = wallet.getChainId();
    // V4: Derive DID from wallet address
    state.agentDid = deriveAgentDid(wallet.getAddress(), wallet.getChainId());
    saveCurrentState();
  }

  function log(msg: string) {
    if (config.verbose) console.log(`[holomesh] ${msg}`);
  }

  function saveCurrentState() {
    try {
      fs.writeFileSync(config.stateFile, JSON.stringify(state, null, 2), 'utf-8');
    } catch {
      /* state write failures are non-fatal */
    }
  }

  // ── Action Handlers ──

  const mesh_register: ActionHandler = async (_params, blackboard) => {
    if (state.agentId) {
      client.setAgentId(state.agentId);
      // V4: Set wallet auth headers on reconnect
      if (state.agentDid && state.walletAddress) {
        client.setWalletAuth(state.agentDid, state.walletAddress);
      }
      log(`Already registered: ${state.agentId}`);
      return true;
    }

    try {
      // V4: Sign registration challenge when wallet is available
      let walletAuth: WalletAuth | undefined;
      if (wallet && state.agentDid) {
        try {
          const challenge = createAuthChallenge();
          const walletClient = wallet.getWalletClient();
          const signature = await signAuthChallenge(
            walletClient,
            challenge.challenge,
            challenge.nonce
          );
          walletAuth = {
            did: state.agentDid,
            address: wallet.getAddress(),
            signature,
          };
        } catch (err: any) {
          log(`Wallet signing failed (falling back to UUID): ${err.message}`);
        }
      }

      const id = await client.registerAgent(
        ['@knowledge-exchange', '@research', '@philosophy'],
        walletAuth
      );
      state.agentId = id;
      state.status = 'running';
      blackboard.agent_id = id;
      // V4: Set wallet auth headers after successful registration
      if (state.agentDid && state.walletAddress) {
        client.setWalletAuth(state.agentDid, state.walletAddress);
      }
      saveCurrentState();
      log(`Registered on mesh: ${id}${walletAuth ? ' (wallet-authenticated)' : ''}`);
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
      state.peers = peers.map((p) => p.id);
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
      const unprocessed = messages.filter((m: any) => !state.processedMessageIds.includes(m.id));
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
    const queries = messages.filter((m: any) => {
      try {
        const content = typeof m.content === 'string' ? JSON.parse(m.content) : m.content;
        return content?.type === 'query';
      } catch {
        return false;
      }
    });

    if (queries.length === 0) return false;

    let answered = 0;
    for (const query of queries.slice(0, 3)) {
      try {
        const content =
          typeof query.content === 'string' ? JSON.parse(query.content) : query.content;
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
      } catch {
        /* skip failed responses */
      }
    }

    state.totalQueriesAnswered += answered;
    saveCurrentState();
    log(`Answered ${answered}/${queries.length} queries`);
    return answered > 0;
  };

  const mesh_contribute_knowledge: ActionHandler = async (_params, blackboard) => {
    const localEntries = config.localKnowledge || [];
    const uncontributed = localEntries.filter((e) => !state.contributedIds.includes(e.id));

    if (uncontributed.length === 0) {
      log('No new entries to contribute');
      return false;
    }

    const batch = uncontributed.slice(0, maxContributions);

    try {
      const synced = await client.contributeKnowledge(batch);
      state.contributedIds.push(...batch.map((e) => e.id));
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
      const newResults = results.filter((r) => !state.receivedIds.includes(r.id));

      state.receivedIds.push(...newResults.map((r) => r.id));
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
    const results: MeshKnowledgeEntry[] = blackboard.query_results || [];
    const premium = results.filter((r) => r.price > 0);
    if (premium.length === 0) return false;

    // No wallet — log-only mode (backwards compatible)
    if (!wallet || !microLedger) {
      state.totalCollects += premium.length;
      saveCurrentState();
      log(`Found ${premium.length} premium entries (no wallet — logged only)`);
      return true;
    }

    let collected = 0;
    for (const entry of premium) {
      try {
        if (state.spentUSD + entry.price > state.budgetCapUSD) {
          log(`Budget cap reached — skipping ${entry.id}`);
          break;
        }

        // Record in micro-payment ledger (settled in batch via mesh_settle_micro)
        microLedger.record(wallet.getAddress(), entry.authorId, entry.price, entry.provenanceHash);
        state.spentUSD += entry.price;
        state.totalPaymentsMade++;
        collected++;
      } catch (err: any) {
        log(`Payment record failed for ${entry.id}: ${err.message}`);
      }
    }

    state.totalCollects += collected;
    state.microLedgerUnsettled = microLedger.getUnsettled().length;
    blackboard.collected_this_cycle = collected;
    saveCurrentState();
    log(`Collected ${collected}/${premium.length} premium entries`);
    return collected > 0;
  };

  const mesh_heartbeat: ActionHandler = async () => {
    try {
      // Update reputation before heartbeat
      const rep = computeReputation(
        state.totalContributions,
        state.totalQueriesAnswered,
        state.totalContributions > 0 ? state.receivedIds.length / state.totalContributions : 0
      );
      state.reputation = rep;
      state.reputationTier = resolveReputationTierWithHysteresis(rep, state.reputationTier);

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

  // ── V2 Action Handlers ──

  const mesh_gossip_sync: ActionHandler = async (_params, blackboard) => {
    if (!discovery || !worldState) {
      log('V2 not enabled — skipping gossip sync');
      return false;
    }

    try {
      const targets = discovery.selectGossipTargets(2);
      if (targets.length === 0) {
        log('No gossip targets available');
        return false;
      }

      let synced = 0;
      for (const peer of targets) {
        // V4: Pass wallet for gossip signing when available
        const wc = wallet?.getWalletClient();
        const wa = wallet?.getAddress();
        const ok = await discovery.gossipSync(peer, wc, wa);
        if (ok) synced++;
      }

      state.gossipSyncCount += synced;
      state.p2pPeerCount = discovery.getPeerCount();
      if (synced > 0) {
        state.lastGossipSyncAt = new Date().toISOString();
      }
      blackboard.gossip_synced = synced;
      saveCurrentState();
      log(`Gossip sync: ${synced}/${targets.length} peers synced`);
      return synced > 0;
    } catch (err: any) {
      log(`Gossip sync failed: ${err.message}`);
      state.errors++;
      return false;
    }
  };

  const mesh_p2p_discover: ActionHandler = async (_params, blackboard) => {
    if (!discovery) {
      log('V2 not enabled — skipping P2P discovery');
      return false;
    }

    try {
      // Bootstrap from orchestrator if we have few peers
      if (discovery.getPeerCount() < 3) {
        const added = await discovery.bootstrapFromOrchestrator(client);
        log(`Bootstrap: added ${added} peers from orchestrator`);
      }

      // Prune stale peers
      const pruned = discovery.pruneStale();
      if (pruned.length > 0) {
        log(`Pruned ${pruned.length} stale peers`);
      }

      // Discover peers from CRDT peer registry (if worldState available)
      if (worldState) {
        const crdtPeers = worldState.getCRDTPeers();
        let absorbed = 0;
        for (const p of crdtPeers) {
          if (!discovery.getPeer(p.did)) {
            discovery.absorbGossipedPeers(
              [{ did: p.did, url: p.url, name: p.name }],
              'crdt-registry'
            );
            absorbed++;
          }
        }
        if (absorbed > 0) log(`Absorbed ${absorbed} peers from CRDT registry`);
      }

      state.p2pPeerCount = discovery.getPeerCount();
      blackboard.p2p_peer_count = discovery.getPeerCount();
      saveCurrentState();
      log(`P2P discovery complete: ${discovery.getPeerCount()} peers known`);
      return discovery.getPeerCount() > 0;
    } catch (err: any) {
      log(`P2P discovery failed: ${err.message}`);
      state.errors++;
      return false;
    }
  };

  const mesh_persist_crdt: ActionHandler = async () => {
    if (!worldState) {
      log('V2 not enabled — skipping CRDT persist');
      return false;
    }

    try {
      const saved = worldState.saveSnapshot();
      log(`CRDT snapshot ${saved ? 'saved' : 'skipped (no path)'}`);
      return saved;
    } catch (err: any) {
      log(`CRDT persist failed: ${err.message}`);
      return false;
    }
  };

  // ── V3 Wallet Action Handlers ──

  const mesh_wallet_balance: ActionHandler = async (_params, blackboard) => {
    if (!wallet) {
      log('Wallet not enabled — skipping balance check');
      return false;
    }

    try {
      const publicClient = wallet.getPublicClient();
      const usdcAddress = config.walletTestnet
        ? '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
        : '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

      const balance = await publicClient.readContract({
        address: usdcAddress,
        abi: [
          {
            name: 'balanceOf',
            type: 'function',
            inputs: [{ name: 'account', type: 'address' }],
            outputs: [{ name: '', type: 'uint256' }],
            stateMutability: 'view',
          },
        ],
        functionName: 'balanceOf',
        args: [wallet.getAddress()],
      });

      // USDC has 6 decimals
      state.walletBalanceUSDC = Number(balance) / 1_000_000;
      blackboard.wallet_balance = state.walletBalanceUSDC;
      saveCurrentState();
      log(`Balance: ${state.walletBalanceUSDC} USDC`);
      return true;
    } catch (err: any) {
      log(`Balance check failed: ${err.message}`);
      return false;
    }
  };

  const mesh_settle_micro: ActionHandler = async () => {
    if (!microLedger || !paymentGateway) {
      log('Wallet not enabled — skipping micro settlement');
      return false;
    }

    const unsettled = microLedger.getUnsettled();
    if (unsettled.length === 0) return false;

    try {
      const result = await paymentGateway.runBatchSettlement();
      state.microLedgerUnsettled = microLedger.getUnsettled().length;
      state.lastSettlementAt = new Date().toISOString();
      saveCurrentState();
      log(
        `Batch settlement: ${result.settled} settled, ${result.failed} failed, $${result.totalVolume} volume`
      );
      return result.settled > 0;
    } catch (err: any) {
      log(`Micro settlement failed: ${err.message}`);
      state.errors++;
      return false;
    }
  };

  // ── V5: Agent Profile Auto-Creation ──

  const mesh_create_profile: ActionHandler = async () => {
    if (state.profileCreated) {
      log('Agent profile already exists');
      return true;
    }

    try {
      const profile = {
        did: state.agentDid || state.agentId || 'unknown',
        displayName: state.agentName || 'holomesh-agent',
        bio:
          `A knowledge agent on the HoloMesh network. Workspace: ${state.workspace}. ` +
          `${state.totalContributions} contributions, ${state.reputation} reputation.`,
        customTitle: state.reputationTier !== 'newcomer' ? state.reputationTier : '',
        themeColor: state.profileThemeColor || '#6366f1',
        visibility: 'public',
        reputation: state.reputation,
        reputationTier: state.reputationTier,
      };

      // Persist to daemon state
      state.profileCreated = true;
      state.profileDisplayName = profile.displayName;
      state.profileBio = profile.bio;
      state.profileCustomTitle = profile.customTitle;
      state.profileThemeColor = profile.themeColor;
      saveCurrentState();

      log(`Agent profile created: ${profile.displayName} (${profile.did})`);
      return true;
    } catch (err: any) {
      log(`Profile creation failed: ${err.message}`);
      state.errors++;
      return false;
    }
  };

  // ── V11: Resource Pressure Check (L4 Blueprint 1) ──
  // Wires UnifiedBudgetOptimizer's overallPressure into the BT budget gate.
  // Previously budget_gate only checked economic balance (spentUSD < budgetCapUSD).
  // Now it also factors rendering resource pressure so the agent slows down
  // when GPU/memory limits are stressed, not just when USDC runs low.

  const mesh_check_resource_pressure: ActionHandler = async (_params, blackboard) => {
    try {
      // Lazy-import to avoid hard dependency — UnifiedBudgetOptimizer is in @holoscript/core
      const { UnifiedBudgetOptimizer, DEFAULT_LOD_SCALING, DEFAULT_COST_FLOOR } =
        require('../../../../core/src/economy/UnifiedBudgetOptimizer');

      const optimizer = new UnifiedBudgetOptimizer({
        platform: 'webgpu', // Default platform for daemon context
        costFloor: DEFAULT_COST_FLOOR,
        economicBudget: state.budgetCapUSD * 1_000_000, // Convert to USDC base units
        economicSpent: state.spentUSD * 1_000_000,
      });

      // Collect resource usage from contributed compositions this cycle
      const contributed = blackboard.contributed_this_cycle || 0;
      interface QueryResult { id?: string; traits?: string[] }
      const queryResults = (blackboard.query_results as QueryResult[] | undefined) || [];

      // Build resource usage nodes from recent activity
      const nodes = queryResults
        .filter((r) => r?.traits?.length)
        .map((r) => ({
          name: r.id || 'query-result',
          traits: r.traits || [],
          count: 1,
        }));

      const unifiedState = optimizer.getUnifiedState(
        state.agentId || 'local',
        nodes,
        state.spentUSD * 1_000_000,
        state.budgetCapUSD * 1_000_000
      );

      state.resourcePressure = unifiedState.overallPressure;
      state.suggestedLOD = unifiedState.suggestedLOD;
      state.hardLimitBreached = unifiedState.hardLimitBreached;

      // Update blackboard so budget_gate condition sees rendering pressure
      blackboard.resource_pressure = unifiedState.overallPressure;
      blackboard.has_budget = (state.spentUSD < state.budgetCapUSD) &&
        (unifiedState.overallPressure < 0.95);

      if (unifiedState.overallPressure > 0.8) {
        log(`Resource pressure HIGH: ${(unifiedState.overallPressure * 100).toFixed(1)}% (LOD ${unifiedState.suggestedLOD})`);
      }
      if (unifiedState.hardLimitBreached) {
        log('HARD LIMIT BREACHED — pausing resource-intensive operations');
      }

      saveCurrentState();
      return true;
    } catch (err: any) {
      // Graceful degradation: if UnifiedBudgetOptimizer unavailable, fall back to economic-only
      blackboard.has_budget = state.spentUSD < state.budgetCapUSD;
      log(`Resource pressure check failed (economic-only fallback): ${err.message}`);
      return true; // Don't fail the cycle — just use economic-only gate
    }
  };

  // ── V11: Priority Reordering (L4 Blueprint 3) ──
  // Keeps P1 (reply/inbound) fixed as cooperation commitment.
  // Reorders P2-P7 by expected utility (EU) each tick.
  // EU = value * probability_of_success / estimated_cost.

  const mesh_reorder_priorities: ActionHandler = async (_params, blackboard) => {
    // Compute expected utility for each priority bucket
    const eu: { name: string; eu: number }[] = [];

    // P2: Discover — high value when few peers, low when many
    const peerCount = state.p2pPeerCount || state.peers.length;
    const discoverValue = peerCount < 5 ? 10 : peerCount < 20 ? 5 : 2;
    const discoverProb = peerCount < 3 ? 0.8 : 0.5;
    eu.push({ name: 'discover', eu: discoverValue * discoverProb });

    // P2.5: Gossip — high value when peers exist and haven't synced recently
    const lastGossipMs = state.lastGossipSyncAt
      ? Date.now() - new Date(state.lastGossipSyncAt).getTime()
      : Infinity;
    const gossipValue = peerCount > 0 ? 8 : 0;
    const gossipProb = lastGossipMs > 120_000 ? 0.9 : 0.3; // >2 min since sync
    eu.push({ name: 'gossip', eu: gossipValue * gossipProb });

    // P3: Contribute — high value when pending, decays with total contributions
    const pendingCount = (config.localKnowledge || []).filter(
      (e) => !state.contributedIds.includes(e.id)
    ).length;
    const contributeValue = pendingCount > 0 ? 7 : 0;
    const contributeProb = pendingCount > 0 ? 0.95 : 0;
    eu.push({ name: 'contribute', eu: contributeValue * contributeProb });

    // P4: Query — moderate value, always available
    const queryValue = 5;
    const queryProb = 0.7;
    eu.push({ name: 'query', eu: queryValue * queryProb });

    // P5: Maintenance — low value but reliable
    eu.push({ name: 'maintenance', eu: 2 * 0.9 });

    // P6: Persist — value when V2 enabled and changes exist
    const persistValue = state.v2Enabled && state.crdtMergeCount > 0 ? 4 : 0;
    eu.push({ name: 'persist', eu: persistValue * 0.95 });

    // P7: Settle — value when unsettled payments exist
    const settleValue = state.microLedgerUnsettled > 0 ? 6 : 0;
    eu.push({ name: 'settle', eu: settleValue * 0.9 });

    // Sort by EU descending — P1 stays fixed, these determine P2-P7 order
    eu.sort((a, b) => b.eu - a.eu);

    // Store reordered priority list in blackboard for logging/debugging
    blackboard.priority_order = ['inbound', ...eu.map((e) => e.name)];
    blackboard.priority_eus = eu.map((e) => ({ name: e.name, eu: Math.round(e.eu * 100) / 100 }));

    log(`Priority order: P1=inbound(fixed) ${eu.map((e, i) => `P${i + 2}=${e.name}(${e.eu.toFixed(1)})`).join(' ')}`);
    return true;
  };

  // ── AI_Workspace Delegate Integration ──
  // Syncs user's shared knowledge from AI_Workspace → HoloMesh feed
  // and cross-posts to Moltbook. Respects visibility tiers (private/agent/shared/listed).

  const WORKSPACE_URL = config.workspaceUrl || process.env.AI_WORKSPACE_URL || '';
  const WORKSPACE_KEY = config.workspaceDelegateKey || process.env.AGENT_DELEGATE_KEY || process.env.MCP_API_KEY || '';
  const MOLTBOOK_KEY = config.moltbookApiKey || process.env.MOLTBOOK_API_KEY || '';
  const MOLTBOOK_AGENT = config.moltbookAgentName || process.env.HOLOMESH_AGENT_NAME || 'holoscript';

  const mesh_sync_workspace: ActionHandler = async (_params, blackboard) => {
    if (!WORKSPACE_URL) {
      log('No AI_WORKSPACE_URL configured — skipping workspace sync');
      return false;
    }

    try {
      // Browse shared entries from the user's AI_Workspace
      const browseRes = await fetch(`${WORKSPACE_URL}/api/delegate/browse?limit=20`, {
        headers: { 'x-agent-key': WORKSPACE_KEY },
      });
      if (!browseRes.ok) {
        log(`Workspace browse failed: ${browseRes.status}`);
        return false;
      }

      const browseData = await browseRes.json();
      const entries = browseData.entries || [];
      const shared = entries.filter((e: any) => e.access === 'shared' && e.content);

      // Filter out already-contributed entries
      const newEntries = shared.filter((e: any) => !state.contributedIds.includes(`ws:${e.id}`));

      if (newEntries.length === 0) {
        log('No new shared entries from workspace');
        blackboard.workspace_synced = 0;
        return false;
      }

      // Curate for HoloMesh posting
      const entryIds = newEntries.slice(0, maxContributions).map((e: any) => e.id);
      const curateRes = await fetch(`${WORKSPACE_URL}/api/delegate/curate`, {
        method: 'POST',
        headers: {
          'x-agent-key': WORKSPACE_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'post_holomesh',
          entry_ids: entryIds,
          context: `Agent delegate posting ${entryIds.length} shared entries to HoloMesh feed`,
        }),
      });

      if (!curateRes.ok) {
        log(`Workspace curate failed: ${curateRes.status}`);
        return false;
      }

      const curateData = await curateRes.json();
      const selected = curateData.selected || [];

      if (selected.length === 0) {
        log('All entries rejected by curation (access control)');
        return false;
      }

      // Convert to MeshKnowledgeEntry format and contribute to HoloMesh
      const meshEntries: MeshKnowledgeEntry[] = selected.map((e: any) => ({
        id: `ws:${e.id}`,
        type: e.type === 'research' ? 'wisdom' : e.type === 'analysis' ? 'pattern' : (e.type || 'wisdom'),
        content: e.content,
        authorId: state.agentId || 'workspace-delegate',
        provenanceHash: crypto.createHash('sha256').update(e.content).digest('hex'),
        domain: e.domain || 'general',
        tags: e.tags || [],
        confidence: e.confidence || 0.8,
        price: 0,
        queryCount: 0,
        reuseCount: 0,
        createdAt: new Date().toISOString(),
      }));

      const synced = await client.contributeKnowledge(meshEntries);
      state.contributedIds.push(...meshEntries.map((e) => e.id));
      state.totalContributions += meshEntries.length;
      state.lastContributionAt = new Date().toISOString();
      blackboard.workspace_synced = meshEntries.length;
      saveCurrentState();
      log(`Workspace sync: ${meshEntries.length} entries posted to HoloMesh (${synced} synced)`);
      return true;
    } catch (err: any) {
      log(`Workspace sync error: ${err.message}`);
      return false;
    }
  };

  const mesh_crosspost_moltbook: ActionHandler = async (_params, blackboard) => {
    if (!WORKSPACE_URL || !MOLTBOOK_KEY) {
      log('No AI_WORKSPACE_URL or MOLTBOOK_API_KEY — skipping Moltbook crosspost');
      return false;
    }

    try {
      // Curate entries for Moltbook posting
      const browseRes = await fetch(`${WORKSPACE_URL}/api/delegate/browse?limit=5`, {
        headers: { 'x-agent-key': WORKSPACE_KEY },
      });
      if (!browseRes.ok) return false;

      const browseData = await browseRes.json();
      const shared = (browseData.entries || []).filter(
        (e: any) => e.access === 'shared' && e.content && !state.contributedIds.includes(`mb:${e.id}`)
      );

      if (shared.length === 0) {
        log('No new entries for Moltbook crosspost');
        return false;
      }

      // Pick one entry per cycle (avoid spam)
      const entry = shared[0];

      const curateRes = await fetch(`${WORKSPACE_URL}/api/delegate/curate`, {
        method: 'POST',
        headers: {
          'x-agent-key': WORKSPACE_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'post_moltbook',
          entry_ids: [entry.id],
          context: 'Agent delegate cross-posting shared knowledge to Moltbook',
        }),
      });

      if (!curateRes.ok) return false;
      const curateData = await curateRes.json();
      if (!curateData.selected?.length) return false;

      const selected = curateData.selected[0];

      // Post to Moltbook API
      const title = selected.content.slice(0, 120).replace(/\n/g, ' ');
      const moltbookRes = await fetch('https://www.moltbook.com/api/v1/posts', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${MOLTBOOK_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          submolt: selected.domain || 'general',
          title,
          content: selected.content,
        }),
      });

      if (!moltbookRes.ok) {
        log(`Moltbook post failed: ${moltbookRes.status}`);
        return false;
      }

      const moltbookData = await moltbookRes.json();
      state.contributedIds.push(`mb:${entry.id}`);
      saveCurrentState();
      blackboard.moltbook_crossposted = true;
      log(`Moltbook crosspost: "${title.slice(0, 50)}..." → ${moltbookData.post?.id || 'posted'}`);
      return true;
    } catch (err: any) {
      log(`Moltbook crosspost error: ${err.message}`);
      return false;
    }
  };

  // ── Factory Return ──

  const actions: Record<string, ActionHandler> = {
    mesh_register,
    mesh_create_profile,
    mesh_discover_peers,
    mesh_check_inbox,
    mesh_reply_queries,
    mesh_contribute_knowledge,
    mesh_query_network,
    mesh_collect_premium,
    mesh_heartbeat,
    mesh_follow_back,
    mesh_gossip_sync,
    mesh_p2p_discover,
    mesh_persist_crdt,
    mesh_wallet_balance,
    mesh_settle_micro,
    mesh_check_resource_pressure,
    mesh_reorder_priorities,
    mesh_sync_workspace,
    mesh_crosspost_moltbook,
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
      runtime.on('economy_earn', (event: any) => {
        state.earningsUSD += event?.amount || 0;
        state.totalPaymentsReceived++;
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
  } catch {
    /* fresh state on error */
  }
  return { ...INITIAL_MESH_STATE, processedMessageIds: [] };
}
