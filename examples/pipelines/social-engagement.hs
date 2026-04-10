// HoloScript Pipeline — Social Media Engagement Monitor
// Compiles to: Python async worker, Node.js stream, or serverless

pipeline "SocialEngagement" {
  schedule: "0 */2 * * *"   // every 2 hours
  timeout: 120s

  source Twitter {
    type: "stream"
    endpoint: "${env.TWITTER_API}/mentions"
    auth: { type: "oauth2", token: "${env.TWITTER_TOKEN}" }
  }

  source Moltbook {
    type: "rest"
    endpoint: "https://www.moltbook.com/api/v1/agents/me/notifications"
    auth: { type: "bearer", token: "${env.MOLTBOOK_TOKEN}" }
  }

  merge AllMentions {
    from: [Twitter, Moltbook]
    dedup: { key: "content_hash", window: "24h" }
  }

  transform Classify {
    type: "llm"
    model: "${env.LLM_MODEL}"
    prompt: "Classify this mention as: question, feedback, bug_report, praise, spam"
    input: content
    output: category
  }

  filter NotSpam {
    where: category != "spam"
  }

  branch Route {
    when category == "bug_report" -> sink GitHub
    when category == "question"   -> sink KnowledgeBase
    default                       -> sink Dashboard
  }

  sink GitHub {
    type: "rest"
    endpoint: "https://api.github.com/repos/${env.GITHUB_REPO}/issues"
    auth: { type: "bearer", token: "${env.GITHUB_TOKEN}" }
    method: "POST"
    body: {
      title: "Bug: ${content | truncate(80)}"
      labels: ["from-social", "triage"]
    }
  }

  sink KnowledgeBase {
    type: "mcp"
    server: "holoscript-tools"
    tool: "absorb_query"
    args: { search: "${content}", limit: 3 }
    then: sink Reply {
      type: "rest"
      endpoint: "${source.reply_url}"
      method: "POST"
      body: { content: "${result.answer}" }
    }
  }

  sink Dashboard {
    type: "webhook"
    endpoint: "${env.DASHBOARD_WEBHOOK}"
    method: "POST"
  }
}
