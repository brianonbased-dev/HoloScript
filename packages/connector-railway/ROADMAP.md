# @holoscript/connector-railway — Roadmap

## Current State
- 16 tools: deploy, redeploy, restart, logs, build_logs, latest_deployment, vars, volumes, tcp_proxy, domain, project/service CRUD
- Covers full deploy lifecycle for Railway services
- Uses Railway GraphQL API (`https://backboard.railway.app/graphql/v2`)
- Auth via `RAILWAY_TOKEN` (project-scoped, `whoami` fails by design)

## Next (v1.1)
- [ ] Streaming build logs — subscribe to `deploymentLogs` GraphQL subscription, emit SSE events to caller
- [ ] Log tailing — continuous `deploymentLogs` with `filter` param (severity, timestamp range)
- [ ] Environment cloning — `railway_clone_env` copies all variables + volume mounts from one env to another
- [ ] Service templates — `railway_create_from_template` with predefined configs (Node, Rust, Docker, static)
- [ ] Deployment rollback — `railway_rollback` targeting a specific `deploymentId` from history
- [ ] Build cancel — `railway_cancel_build` for stuck or unwanted deployments

## Future (v2.0)
- [ ] Webhook management — `railway_webhook_create/list/delete` for deploy success/fail notifications
- [ ] Multi-project dashboard — `railway_projects_status` returning health of all 5 registered projects at once
- [ ] Cost estimation — `railway_estimate_cost` using Railway usage API before scaling resources
- [ ] Cron job management — `railway_cron_create/update/delete` for scheduled Railway services
- [ ] Private networking — `railway_private_network` for service-to-service internal DNS setup
- [ ] Deployment diff — `railway_diff_deployments` comparing env vars and config between two deploys

## Integration Goals
- [ ] Migrate from `process.env.RAILWAY_TOKEN` to `CredentialVault` from connector-core
- [ ] Streaming logs feed into connector-vscode terminal for live deploy monitoring
- [ ] Deploy events push notifications to connector-moltbook (optional cross-post on ship)
- [ ] Health check results from all Railway services aggregated into orchestrator `/health`
