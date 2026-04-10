/**
 * Agent Communication Example (v3.1)
 * 
 * Demonstrates HoloScript's secure messaging system:
 * - Direct agent-to-agent messaging
 * - Pub/Sub topic communication
 * - Channel-based group messaging
 * - Message routing and delivery guarantees
 * 
 * @version 3.1.0
 */

composition "AgentCommunicationDemo" {
  // Configuration
  config {
    communication: {
      encryption: "aes-256-gcm"
      signing: true
      persistence: "memory"
      max_message_size: "1MB"
    }
    pubsub: {
      max_topics: 100
      retention: 3600000  // 1 hour
    }
  }

  // ==========================================================================
  // COMMUNICATION CHANNELS
  // ==========================================================================

  // Define topics for pub/sub messaging
  topic "system.alerts" {
    retention: "until-acknowledged"
    max_subscribers: 50
    priority: "high"
  }

  topic "task.updates" {
    retention: "time-based"
    retention_time: 300000  // 5 minutes
    max_subscribers: 100
  }

  topic "metrics.performance" {
    retention: "latest-only"
    max_subscribers: 20
  }

  // Define channels for group communication
  channel "dev-team" {
    access: "invite-only"
    max_members: 10
    history: 100
    encryption: true
  }

  channel "all-agents" {
    access: "public"
    max_members: 100
    history: 50
  }

  // ==========================================================================
  // AGENT DEFINITIONS
  // ==========================================================================

  // Team lead agent - coordinates and broadcasts
  template "TeamLeadAgent" {
    @agent {
      type: "coordinator"
      capabilities: ["delegation", "monitoring", "reporting"]
    }
    
    @messaging {
      direct_messaging: true
      channels: ["dev-team", "all-agents"]
      topics: ["system.alerts", "task.updates"]
    }
    
    state {
      team_members: []
      active_tasks: []
    }

    // Delegate a task to a specific agent
    action delegateTask(agentId, task) {
      await send(agentId, {
        type: "task-assignment",
        priority: task.priority,
        payload: task,
        requiresAck: true
      })
      
      // Notify team
      channel("dev-team").broadcast({
        type: "task-delegated",
        payload: {
          assignee: agentId,
          task: task.summary
        }
      })
    }

    // Broadcast team update
    action announceUpdate(update) {
      channel("all-agents").broadcast({
        type: "team-announcement",
        payload: update
      })
    }

    // Publish alert
    action raiseAlert(level, message) {
      topic("system.alerts").publish({
        level: level,
        message: message,
        source: this.id,
        timestamp: Date.now()
      })
    }

    // Handle task completion reports
    on message(msg) {
      if (msg.type == "task-completed") {
        updateTaskStatus(msg.payload.taskId, "completed")
        
        topic("task.updates").publish({
          type: "task-completed",
          taskId: msg.payload.taskId,
          completedBy: msg.from,
          result: msg.payload.result
        })
      }
    }
  }

  // Worker agent - receives and processes tasks
  template "WorkerAgent" {
    @agent {
      type: "worker"
      capabilities: ["execution", "reporting"]
    }
    
    @messaging {
      direct_messaging: true
      channels: ["dev-team"]
      topics: ["task.updates"]
    }
    
    state {
      current_task: null
      tasks_completed: 0
    }

    // Handle incoming task assignments
    on message(msg) {
      if (msg.type == "task-assignment") {
        this.state.current_task = msg.payload
        
        // Execute the task
        const result = await executeTask(msg.payload)
        
        this.state.tasks_completed += 1
        this.state.current_task = null
        
        // Report completion
        reply(msg, {
          type: "task-completed",
          payload: {
            taskId: msg.payload.id,
            result: result
          }
        })
      }
    }

    // Report progress
    action reportProgress(taskId, progress) {
      send("TeamLead", {
        type: "progress-update",
        payload: { taskId, progress }
      })
    }
  }

  // Monitor agent - watches for alerts
  template "MonitorAgent" {
    @agent {
      type: "monitor"
      capabilities: ["alerting", "logging"]
    }
    
    @messaging {
      topics: ["system.alerts", "metrics.performance"]
    }
    
    state {
      alerts_received: 0
      critical_count: 0
    }

    // Handle system alerts
    on topic.message("system.alerts", alert) {
      this.state.alerts_received += 1
      
      log(`[${alert.level}] ${alert.message} from ${alert.source}`)
      
      if (alert.level == "critical") {
        this.state.critical_count += 1
        escalate(alert)
      }
    }

    // Handle performance metrics
    on topic.message("metrics.performance", metrics) {
      if (metrics.cpu > 90 || metrics.memory > 85) {
        topic("system.alerts").publish({
          level: "warning",
          message: `High resource usage: CPU=${metrics.cpu}%, Memory=${metrics.memory}%`,
          source: this.id
        })
      }
    }
  }

  // Router agent - handles message routing
  template "RouterAgent" {
    @agent {
      type: "router"
      capabilities: ["routing", "transformation"]
    }
    
    @messaging {
      router: true
      routes: [
        {
          match: { type: "code-review" },
          route: { to: "dev-team" }
        },
        {
          match: { priority: "critical" },
          route: { 
            to: ["TeamLead", "Monitor"],
            strategy: "broadcast"
          }
        },
        {
          match: { type: "raw-data" },
          transform: "processData",
          route: { to: "data-processor" }
        }
      ]
    }

    action processData(msg) {
      return {
        ...msg,
        type: "processed-data",
        payload: transform(msg.payload)
      }
    }
  }

  // ==========================================================================
  // INSTANTIATE AGENTS
  // ==========================================================================

  object "TeamLead" using "TeamLeadAgent" {}
  object "Worker1" using "WorkerAgent" {}
  object "Worker2" using "WorkerAgent" {}
  object "Worker3" using "WorkerAgent" {}
  object "Monitor" using "MonitorAgent" {}
  object "Router" using "RouterAgent" {}
}
