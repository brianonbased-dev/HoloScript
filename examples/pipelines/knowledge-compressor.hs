// HoloScript Pipeline — Knowledge Compression & Promotion
// The uAA2++ COMPRESS/GROW/EVOLVE cycle as a pipeline
// Compiles to: Python batch job or Node.js worker

pipeline "KnowledgeCompressor" {
  schedule: "0 6 * * *"   // daily at 6am
  timeout: 300s

  source ResearchFiles {
    type: "filesystem"
    path: "${env.WORKSPACE}/research/"
    pattern: "*.md"
    since: "24h"
  }

  source SessionReports {
    type: "filesystem"
    path: "${env.WORKSPACE}/.claude/sessions/"
    pattern: "*.jsonl"
    since: "24h"
  }

  merge DailyInput {
    from: [ResearchFiles, SessionReports]
  }

  transform ExtractInsights {
    type: "llm"
    model: "claude-sonnet-4-6"
    prompt: |
      Extract wisdom (W), patterns (P), and gotchas (G) from this content.
      Return JSON array: [{type, id, content, confidence, domain, tags}]
      Only extract insights with confidence > 0.7.
    input: content
    output: entries
  }

  transform Flatten {
    entries[] -> entry   // unwrap array to individual records
  }

  filter HighConfidence {
    where: entry.confidence >= 0.8
  }

  transform Dedup {
    type: "mcp"
    server: "mcp-orchestrator"
    tool: "knowledge_query"
    args: { search: "${entry.content}", limit: 3 }
    output: existing
    where: existing.results[0].similarity < 0.85  // only keep novel entries
  }

  sink KnowledgeStore {
    type: "mcp"
    server: "mcp-orchestrator"
    tool: "knowledge_sync"
    args: {
      workspace_id: "ai-ecosystem"
      entries: "${batch}"
    }
    batch: { size: 20 }
  }

  sink AuditLog {
    type: "filesystem"
    path: "${env.WORKSPACE}/knowledge-audit.jsonl"
    format: "jsonl"
    append: true
  }
}
