// HoloScript Pipeline — Deployment Health Monitor
// Watches Railway services, alerts on failures, auto-restarts
// Compiles to: Node.js cron, Python watchdog, or Kubernetes CronJob

pipeline "DeployMonitor" {
  schedule: "*/2 * * * *"   // every 2 minutes
  timeout: 15s
  retry: { max: 1, backoff: "none" }

  source Services {
    type: "list"
    items: [
      { name: "mcp-server",     url: "https://mcp.holoscript.net/health" },
      { name: "absorb-service",  url: "https://absorb.holoscript.net/health" },
      { name: "orchestrator",    url: "https://mcp-orchestrator-production-45f9.up.railway.app/health" },
    ]
  }

  transform HealthCheck {
    type: "http"
    method: "GET"
    url: "${item.url}"
    timeout: 5s
    output: {
      service: "${item.name}"
      status: "${response.status}"
      ok: "${response.json.status == 'healthy' || response.json.status == 'ok'}"
      latency: "${response.duration_ms}"
      body: "${response.json}"
    }
  }

  filter Unhealthy {
    where: ok == false || latency > 5000
  }

  transform EnrichFailure {
    previous_failures -> consecutive : increment_if(service == previous.service)
    first_failure_at  -> duration : elapsed()
  }

  branch Severity {
    when consecutive >= 3 -> sink PagerDuty
    when consecutive >= 1 -> sink Slack
    default               -> sink Log
  }

  sink Slack {
    type: "webhook"
    endpoint: "${env.SLACK_WEBHOOK}"
    method: "POST"
    body: {
      text: "⚠️ ${service} unhealthy (${consecutive}x) — status ${status}, ${latency}ms"
    }
  }

  sink PagerDuty {
    type: "webhook"
    endpoint: "${env.PAGERDUTY_WEBHOOK}"
    method: "POST"
    body: {
      routing_key: "${env.PD_ROUTING_KEY}"
      event_action: "trigger"
      payload: {
        summary: "🔴 ${service} down for ${duration}"
        severity: "critical"
        source: "holoscript-deploy-monitor"
      }
    }
  }

  sink Log {
    type: "filesystem"
    path: "${env.WORKSPACE}/deploy-health.jsonl"
    format: "jsonl"
    append: true
  }
}
