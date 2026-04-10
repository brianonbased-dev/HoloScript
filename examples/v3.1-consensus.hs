/**
 * Consensus Mechanisms Example (v3.1)
 * 
 * Demonstrates HoloScript's distributed consensus system:
 * - Simple majority voting
 * - Raft consensus for leader election
 * - Distributed state coordination
 * - Cluster health management
 * 
 * @version 3.1.0
 */

composition "ConsensusDemo" {
  // Cluster configuration
  config {
    cluster: {
      min_nodes: 3
      max_nodes: 7
      replication_factor: 3
      heartbeat_interval: 1000
      election_timeout: [5000, 10000]  // Random range
    }
  }

  // ==========================================================================
  // SIMPLE MAJORITY VOTING
  // ==========================================================================

  // Voting pool for feature flags
  template "VotingPool" {
    @consensus {
      type: "majority"
      quorum: 0.5
      timeout: 10000
    }
    
    state {
      active_votes: {}
      completed_votes: []
    }

    // Propose a new vote
    action propose(topic, options) {
      const voteId = generateId()
      
      const vote = {
        id: voteId,
        topic: topic,
        options: options,
        votes: {},
        status: "open",
        created_at: Date.now(),
        expires_at: Date.now() + 30000
      }
      
      this.state.active_votes[voteId] = vote
      
      // Broadcast to all voting members
      broadcast("voting_channel", {
        type: "vote_proposed",
        payload: vote
      })
      
      return voteId
    }

    // Cast a vote
    action castVote(voteId, voter, choice) {
      const vote = this.state.active_votes[voteId]
      
      if (!vote) {
        throw new Error("Vote not found")
      }
      
      if (vote.status != "open") {
        throw new Error("Vote already closed")
      }
      
      if (!vote.options.includes(choice)) {
        throw new Error("Invalid choice")
      }
      
      vote.votes[voter] = {
        choice: choice,
        timestamp: Date.now()
      }
      
      // Check if we have enough votes
      this.checkQuorum(voteId)
      
      return {
        success: true,
        current_tally: this.getTally(voteId)
      }
    }

    // Check if quorum reached
    action checkQuorum(voteId) {
      const vote = this.state.active_votes[voteId]
      const totalVoters = getVoterCount()
      const votesReceived = Object.keys(vote.votes).length
      
      if (votesReceived >= Math.ceil(totalVoters * 0.5)) {
        this.closeVote(voteId)
      }
    }

    // Close and tally votes
    action closeVote(voteId) {
      const vote = this.state.active_votes[voteId]
      const tally = {}
      
      for (const [voter, ballot] of Object.entries(vote.votes)) {
        tally[ballot.choice] = (tally[ballot.choice] || 0) + 1
      }
      
      // Find winner
      const winner = Object.entries(tally)
        .sort((a, b) => b[1] - a[1])[0]
      
      vote.status = "closed"
      vote.result = {
        winner: winner[0],
        votes: winner[1],
        tally: tally
      }
      
      this.state.completed_votes.push(vote)
      delete this.state.active_votes[voteId]
      
      // Announce result
      broadcast("voting_channel", {
        type: "vote_result",
        payload: vote
      })
      
      return vote.result
    }
  }

  // ==========================================================================
  // RAFT CONSENSUS FOR LEADER ELECTION
  // ==========================================================================

  // Node participating in Raft consensus
  template "RaftNode" {
    @consensus {
      type: "raft"
      role: "follower"  // Initial role
      cluster_id: "cluster-1"
    }
    
    @networking {
      port: auto
      discovery: "multicast"
    }
    
    state {
      // Persistent state
      current_term: 0
      voted_for: null
      log: []
      
      // Volatile state
      commit_index: 0
      last_applied: 0
      
      // Leader state
      next_index: {}
      match_index: {}
      
      // Current role
      role: "follower"
      leader_id: null
      
      // Timers
      election_timeout: null
      heartbeat_timer: null
    }

    // Election timeout fired
    on electionTimeout() {
      this.startElection()
    }

    // Start leader election
    action startElection() {
      this.state.current_term += 1
      this.state.role = "candidate"
      this.state.voted_for = this.id
      
      let votesReceived = 1  // Vote for self
      const peers = getPeers()
      const majority = Math.floor(peers.length / 2) + 1
      
      // Request votes from all peers
      for (const peer of peers) {
        const response = await send(peer, {
          type: "request_vote",
          payload: {
            term: this.state.current_term,
            candidate_id: this.id,
            last_log_index: this.state.log.length - 1,
            last_log_term: this.state.log[this.state.log.length - 1]?.term || 0
          }
        })
        
        if (response.vote_granted) {
          votesReceived += 1
        }
        
        // Check if won election
        if (votesReceived >= majority) {
          this.becomeLeader()
          return
        }
      }
      
      // Election failed, return to follower
      this.state.role = "follower"
      resetElectionTimeout()
    }

    // Handle vote request
    on message.request_vote(msg) {
      const grant = (
        msg.payload.term >= this.state.current_term &&
        (this.state.voted_for == null || this.state.voted_for == msg.payload.candidate_id) &&
        msg.payload.last_log_index >= this.state.log.length - 1
      )
      
      if (grant) {
        this.state.voted_for = msg.payload.candidate_id
        this.state.current_term = msg.payload.term
        resetElectionTimeout()
      }
      
      return {
        term: this.state.current_term,
        vote_granted: grant
      }
    }

    // Become the leader
    action becomeLeader() {
      this.state.role = "leader"
      this.state.leader_id = this.id
      
      // Initialize leader state
      const peers = getPeers()
      for (const peer of peers) {
        this.state.next_index[peer] = this.state.log.length
        this.state.match_index[peer] = 0
      }
      
      // Start sending heartbeats
      this.startHeartbeats()
      
      // Announce leadership
      broadcast("cluster_channel", {
        type: "leader_elected",
        payload: {
          leader_id: this.id,
          term: this.state.current_term
        }
      })
    }

    // Send heartbeats to maintain leadership
    action startHeartbeats() {
      setInterval(() => {
        if (this.state.role != "leader") return
        
        for (const peer of getPeers()) {
          send(peer, {
            type: "append_entries",
            payload: {
              term: this.state.current_term,
              leader_id: this.id,
              entries: [],  // Heartbeat has no entries
              leader_commit: this.state.commit_index
            }
          })
        }
      }, 100)
    }

    // Handle append entries (log replication + heartbeat)
    on message.append_entries(msg) {
      if (msg.payload.term < this.state.current_term) {
        return { success: false, term: this.state.current_term }
      }
      
      // Reset election timeout (valid leader)
      resetElectionTimeout()
      
      this.state.role = "follower"
      this.state.leader_id = msg.payload.leader_id
      this.state.current_term = msg.payload.term
      
      // Append new entries to log
      for (const entry of msg.payload.entries) {
        this.state.log.push(entry)
      }
      
      // Update commit index
      if (msg.payload.leader_commit > this.state.commit_index) {
        this.state.commit_index = Math.min(
          msg.payload.leader_commit,
          this.state.log.length - 1
        )
        this.applyCommitted()
      }
      
      return { success: true, term: this.state.current_term }
    }

    // Apply committed entries to state machine
    action applyCommitted() {
      while (this.state.last_applied < this.state.commit_index) {
        this.state.last_applied += 1
        const entry = this.state.log[this.state.last_applied]
        applyToStateMachine(entry)
      }
    }

    // Client request - append to log (leader only)
    action appendEntry(command) {
      if (this.state.role != "leader") {
        // Redirect to leader
        return { redirect: this.state.leader_id }
      }
      
      const entry = {
        term: this.state.current_term,
        command: command,
        index: this.state.log.length
      }
      
      this.state.log.push(entry)
      
      // Replicate to followers
      await this.replicateEntry(entry)
      
      return { success: true, index: entry.index }
    }
  }

  // ==========================================================================
  // DISTRIBUTED STATE COORDINATION
  // ==========================================================================

  // Distributed key-value store using consensus
  template "DistributedStore" {
    @consensus {
      type: "raft"
      cluster_id: "kv-cluster"
    }
    
    state {
      data: {}
      version: 0
    }

    // Set a value (goes through consensus)
    action set(key, value) {
      const result = await consensus.propose({
        type: "set",
        key: key,
        value: value
      })
      
      return result
    }

    // Get a value (local read)
    action get(key) {
      return this.state.data[key]
    }

    // Delete a value (goes through consensus)
    action delete(key) {
      const result = await consensus.propose({
        type: "delete",
        key: key
      })
      
      return result
    }

    // Apply committed operations
    on consensus.commit(operation) {
      switch (operation.type) {
        case "set":
          this.state.data[operation.key] = operation.value
          this.state.version += 1
          break
        case "delete":
          delete this.state.data[operation.key]
          this.state.version += 1
          break
      }
    }

    // Compare and swap (atomic)
    action compareAndSwap(key, expected, newValue) {
      const result = await consensus.propose({
        type: "cas",
        key: key,
        expected: expected,
        new_value: newValue
      })
      
      return result
    }

    on consensus.commit.cas(op) {
      if (this.state.data[op.key] === op.expected) {
        this.state.data[op.key] = op.new_value
        this.state.version += 1
        return { success: true }
      }
      return { success: false, actual: this.state.data[op.key] }
    }
  }

  // ==========================================================================
  // CLUSTER HEALTH MANAGEMENT
  // ==========================================================================

  template "ClusterManager" {
    @agent {
      type: "cluster-manager"
      capabilities: ["monitoring", "recovery", "scaling"]
    }
    
    @consensus {
      type: "raft"
      role: "observer"  // Doesn't participate in voting
    }
    
    state {
      nodes: {}
      healthy_nodes: []
      unhealthy_nodes: []
      cluster_status: "unknown"
    }

    // Monitor cluster health
    action monitorCluster() {
      const nodes = getClusterNodes()
      
      for (const node of nodes) {
        const health = await ping(node.id)
        
        this.state.nodes[node.id] = {
          ...node,
          healthy: health.success,
          latency: health.latency,
          last_check: Date.now()
        }
      }
      
      this.state.healthy_nodes = Object.values(this.state.nodes)
        .filter(n => n.healthy)
        .map(n => n.id)
      
      this.state.unhealthy_nodes = Object.values(this.state.nodes)
        .filter(n => !n.healthy)
        .map(n => n.id)
      
      // Calculate cluster status
      const healthyPct = this.state.healthy_nodes.length / nodes.length
      
      if (healthyPct >= 1.0) {
        this.state.cluster_status = "healthy"
      } else if (healthyPct >= 0.5) {
        this.state.cluster_status = "degraded"
      } else {
        this.state.cluster_status = "critical"
        this.alertClusterCritical()
      }
    }

    // Handle node failure
    on nodeFailure(nodeId) {
      log(`Node ${nodeId} failed`)
      
      // Check if we still have quorum
      if (this.state.healthy_nodes.length < Math.ceil(getClusterNodes().length / 2)) {
        log("CRITICAL: Lost quorum!")
        this.initiateEmergencyRecovery()
      } else {
        // Trigger data re-replication
        this.rebalanceData(nodeId)
      }
    }

    // Scale cluster
    action addNode(nodeConfig) {
      const newNode = await spawnNode(nodeConfig)
      
      // Wait for node to sync
      await waitForSync(newNode.id)
      
      // Add to cluster
      await consensus.propose({
        type: "add_node",
        node: newNode
      })
      
      return newNode
    }

    action removeNode(nodeId) {
      // Migrate data off node first
      await migrateDataFrom(nodeId)
      
      // Remove from cluster
      await consensus.propose({
        type: "remove_node",
        node_id: nodeId
      })
      
      // Shutdown node
      await shutdownNode(nodeId)
    }
  }

  // ==========================================================================
  // INSTANTIATE CLUSTER
  // ==========================================================================

  object "VotingPool" using "VotingPool" {}

  // Raft cluster (need odd number for consensus)
  object "Node1" using "RaftNode" { node_id: 1 }
  object "Node2" using "RaftNode" { node_id: 2 }
  object "Node3" using "RaftNode" { node_id: 3 }
  object "Node4" using "RaftNode" { node_id: 4 }
  object "Node5" using "RaftNode" { node_id: 5 }

  // Distributed KV store replicas
  object "KVStore1" using "DistributedStore" { replica: 1 }
  object "KVStore2" using "DistributedStore" { replica: 2 }
  object "KVStore3" using "DistributedStore" { replica: 3 }

  // Cluster management
  object "ClusterManager" using "ClusterManager" {}
}
