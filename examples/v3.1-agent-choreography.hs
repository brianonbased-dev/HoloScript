/**
 * Multi-Agent Choreography Example (v3.1)
 * 
 * Demonstrates HoloScript's agent orchestration system with:
 * - Agent registration and discovery
 * - Task-to-agent matching
 * - Multi-agent negotiation
 * - Conflict resolution
 * 
 * @version 3.1.0
 */

composition "AgentChoreographyDemo" {
  // Configuration
  config {
    agent_registry: {
      max_agents: 50
      discovery: "automatic"
      heartbeat_interval: 5000
    }
    choreography: {
      matching_strategy: "capability-based"
      load_balancing: "least-busy"
      timeout: 30000
    }
  }

  // ==========================================================================
  // AGENT DEFINITIONS
  // ==========================================================================

  // Code analysis agent - handles static analysis tasks
  template "CodeAnalyzerAgent" {
    @agent {
      type: "analyzer"
      capabilities: ["static-analysis", "complexity-check", "code-smell-detection"]
      max_concurrent_tasks: 3
    }
    
    state {
      status: "idle"
      analyzed_files: 0
      current_task: null
    }

    action analyzeFile(file) {
      this.state.status = "analyzing"
      this.state.current_task = file.path
      
      // Perform analysis
      const issues = detectIssues(file)
      const complexity = calculateComplexity(file)
      
      this.state.analyzed_files += 1
      this.state.status = "idle"
      
      return {
        file: file.path,
        issues: issues,
        complexity: complexity,
        suggestions: generateSuggestions(issues)
      }
    }

    on task_assigned(task) {
      if (task.type == "analyze") {
        return this.analyzeFile(task.payload.file)
      }
    }
  }

  // Security scanner agent - handles vulnerability detection
  template "SecurityScannerAgent" {
    @agent {
      type: "security"
      capabilities: ["vulnerability-scan", "dependency-audit", "secret-detection"]
      max_concurrent_tasks: 2
    }
    
    state {
      status: "idle"
      scans_completed: 0
      vulnerabilities_found: 0
    }

    action scanForVulnerabilities(files) {
      this.state.status = "scanning"
      
      let totalVulns = []
      for (const file of files) {
        const vulns = checkVulnerabilities(file)
        totalVulns = totalVulns.concat(vulns)
      }
      
      this.state.scans_completed += 1
      this.state.vulnerabilities_found += totalVulns.length
      this.state.status = "idle"
      
      return {
        vulnerabilities: totalVulns,
        severity: calculateSeverity(totalVulns),
        recommendations: generateSecurityRecommendations(totalVulns)
      }
    }

    action auditDependencies(packageJson) {
      return checkDependencies(packageJson)
    }
  }

  // Test runner agent - handles test execution
  template "TestRunnerAgent" {
    @agent {
      type: "tester"
      capabilities: ["unit-test", "integration-test", "coverage-analysis"]
      max_concurrent_tasks: 1
    }
    
    state {
      status: "idle"
      tests_run: 0
      tests_passed: 0
      tests_failed: 0
    }

    action runTests(testFiles) {
      this.state.status = "testing"
      
      const results = executeTests(testFiles)
      
      this.state.tests_run += results.total
      this.state.tests_passed += results.passed
      this.state.tests_failed += results.failed
      this.state.status = "idle"
      
      return {
        passed: results.passed,
        failed: results.failed,
        coverage: results.coverage,
        duration: results.duration
      }
    }
  }

  // ==========================================================================
  // CHOREOGRAPHER
  // ==========================================================================

  // Pipeline coordinator - orchestrates all agents
  template "PipelineCoordinator" {
    @choreographer {
      agents: ["analyzer", "security", "tester"]
      negotiation: {
        strategy: "auction"
        max_rounds: 3
        timeout: 5000
      }
      conflict_resolution: {
        strategy: "priority-based"
        priorities: {
          "security-scan": 100
          "code-analysis": 80
          "test-execution": 60
        }
      }
    }
    
    state {
      active_pipelines: []
      completed_reviews: 0
    }

    // Run a complete code review pipeline
    action runCodeReview(pullRequest) {
      const pipelineId = generateId()
      this.state.active_pipelines.push(pipelineId)
      
      // Stage 1: Parallel analysis
      const [analysisResults, securityResults] = await parallel([
        dispatch({
          type: "analyze",
          capabilities: ["static-analysis"],
          payload: { files: pullRequest.files }
        }),
        dispatch({
          type: "security-scan",
          capabilities: ["vulnerability-scan"],
          payload: { files: pullRequest.files }
        })
      ])
      
      // Stage 2: Run tests
      const testResults = await dispatch({
        type: "test-execution",
        capabilities: ["unit-test"],
        payload: { testFiles: pullRequest.testFiles }
      })
      
      // Stage 3: Generate report
      const report = generateReport({
        analysis: analysisResults,
        security: securityResults,
        tests: testResults
      })
      
      this.state.completed_reviews += 1
      this.state.active_pipelines = this.state.active_pipelines
        .filter(id => id != pipelineId)
      
      return report
    }

    // Monitor agent health
    action getAgentStatus() {
      const agents = registry.getAgents()
      return agents.map(agent => ({
        id: agent.id,
        type: agent.type,
        status: agent.state.status,
        tasks_completed: agent.metrics.tasks_completed,
        avg_latency: agent.metrics.avg_latency
      }))
    }
  }

  // ==========================================================================
  // INSTANTIATE AGENTS
  // ==========================================================================

  object "Analyzer1" using "CodeAnalyzerAgent" {}
  object "Analyzer2" using "CodeAnalyzerAgent" {}
  object "SecurityScanner" using "SecurityScannerAgent" {}
  object "TestRunner" using "TestRunnerAgent" {}
  object "Pipeline" using "PipelineCoordinator" {}
}
