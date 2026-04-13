# @holoscript/connector-github — Roadmap

## Current State
- 20 tools: repo CRUD, PR CRUD, issue CRUD, workflow management, content read/write, HoloScript validation/preview
- Uses GitHub REST API v3 + Octokit
- Auth via `GITHUB_TOKEN` (personal access token)
- HoloScript-specific: validates `.hs`/`.holo` files on push, generates preview links

## Next (v1.1)
- [ ] Release management — `github_create_release` with tag, changelog body, and asset upload
- [ ] Code search — `github_search_code` wrapping `GET /search/code` with repo/org/language filters
- [ ] Commit status checks — `github_create_status` and `github_list_statuses` for CI integration
- [ ] Branch protection — `github_set_branch_protection` (required reviews, status checks, force push rules)
- [ ] Actions secrets — `github_set_secret` and `github_list_secrets` for encrypted repository secrets
- [ ] Discussion support — `github_create_discussion` and `github_list_discussions` via GraphQL API

## Future (v2.0)
- [ ] Webhook management — `github_create_webhook` for repo events (push, PR, release) with payload URLs
- [ ] GitHub Apps auth — support app installation tokens alongside PATs for org-level access
- [ ] Dependency graph — `github_list_dependencies` and `github_dependency_alerts` via `GET /repos/:owner/:repo/dependency-graph`
- [ ] Pull request auto-merge — `github_enable_auto_merge` with merge method and required checks
- [ ] Repository rulesets — `github_create_ruleset` (newer API replacing branch protection)
- [ ] Copilot metrics — `github_copilot_usage` for org-level Copilot adoption stats

## Integration Goals
- [ ] Migrate from `process.env.GITHUB_TOKEN` to `CredentialVault` from connector-core
- [ ] Release creation triggers connector-railway redeploy for linked services
- [ ] PR validation runs HoloScript parse/compile via connector-core's MCP dispatch
- [ ] Issue labels sync with HoloMesh board tasks for cross-platform task tracking
