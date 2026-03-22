# @holoscript/connector-github Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-03-21

### Added

#### Core Connector
- `GitHubConnector` class extending `ServiceConnector` base
- 23 MCP tools for comprehensive GitHub integration
- Automatic registration with HoloScript MCP orchestrator
- Health checking and connection management
- TypeScript type safety with full type definitions

#### Repository Operations
- `github_repo_get` - Get repository information
- `github_repo_create` - Create new repositories
- `github_repo_list` - List repositories (user or organization)

#### Issue Management
- `github_issue_create` - Create issues with labels and assignees
- `github_issue_list` - List issues with filtering
- `github_issue_update` - Update issue state, labels, etc.
- `github_issue_comment` - Add comments to issues

#### Pull Request Workflows
- `github_pr_create` - Create pull requests with draft support
- `github_pr_list` - List pull requests with filtering
- `github_pr_get` - Get specific pull request details
- `github_pr_merge` - Merge PRs with configurable merge method
- `github_pr_comment` - Add comments to pull requests
- `github_pr_review` - Create reviews (APPROVE, REQUEST_CHANGES, COMMENT)

#### GitHub Actions
- `github_workflow_list` - List available workflows
- `github_workflow_run` - Trigger workflow runs with custom inputs
- `github_workflow_runs_list` - Monitor workflow run status

#### Content Operations
- `github_content_get` - Read files and directories from repositories
- `github_content_create_or_update` - Create or update files with commits

#### HoloScript-Specific Features
- `github_holoscript_compile_preview` - Compile .holo files and generate preview links
- `github_holoscript_validate_scene` - Validate HoloScript scenes with AI analysis
- Integration with HoloScript MCP server at mcp.holoscript.net
- Auto-detection of .holo, .hs, and .hsplus files

#### GitHub Actions Workflow Templates
- `holoscript-ci.yml` - Comprehensive CI/CD workflow with:
  - Syntax validation for all HoloScript files
  - Embedded @test execution
  - Automatic compilation to Three.js
  - Preview link generation via MCP
  - Preview deployment to Railway/custom environments
  - AI-powered scene validation using Claude
  - Quality analysis and trait suggestions
  - Automated PR comments with previews and validation results

- `holoscript-agentic.yml` - Agentic workflow automation with:
  - Weekly scheduled optimization runs
  - AI-powered scene analysis and refactoring
  - Trait suggestion engine
  - Cross-reality compatibility testing (6 targets)
  - Semantic scene understanding via Claude
  - Automated optimization PRs
  - Analysis report issues

#### Testing
- 30 comprehensive unit tests with Vitest
- Mock implementations for @octokit/rest
- Mock fetch for HoloScript MCP calls
- 100% test coverage for core connector functionality
- Test categories:
  - Connection management (5 tests)
  - Tool listing (1 test)
  - Repository operations (4 tests)
  - Issue operations (4 tests)
  - Pull request operations (6 tests)
  - Workflow operations (3 tests)
  - Content operations (2 tests)
  - HoloScript-specific operations (3 tests)
  - Error handling (2 tests)

#### Documentation
- Comprehensive README.md with API reference
- EXAMPLES.md with 6 real-world usage scenarios
- CHANGELOG.md (this file)
- Inline JSDoc comments for all public APIs
- GitHub Actions workflow documentation
- Environment variable reference

#### Dependencies
- `@holoscript/connector-core@workspace:*` - Base connector interfaces
- `@modelcontextprotocol/sdk@^0.6.0` - MCP protocol support
- `@octokit/rest@^21.0.0` - GitHub REST API client
- `@octokit/auth-token@^5.1.1` - GitHub authentication

### Security
- Token-based authentication via GITHUB_TOKEN environment variable
- No tokens stored in code or logs
- Integration with HoloScript security sandbox
- Rate limiting protection with exponential backoff (Railway connector pattern)

### Performance
- Lazy connection initialization
- Efficient JSON streaming for large responses
- Base64 encoding for file content operations
- Auto-detection of changed files to minimize API calls

### Developer Experience
- TypeScript-first with full type definitions
- ESM module support
- Vitest for fast test execution
- Clear error messages
- Extensive examples and documentation

### Integration
- Seamless integration with HoloScript ecosystem
- MCP orchestrator registration
- Compatible with HoloScript CLI tools
- Works with HoloScript Studio workflows
- HoloClaw agent framework support

### Known Limitations
- GitHub API rate limits apply (5000 requests/hour for authenticated users)
- Large file operations may be slow due to base64 encoding
- Webhook integration not yet implemented (polling-based in examples)

### Future Roadmap
- GitHub Webhooks integration for real-time event handling
- GitHub Copilot integration for scene generation
- GitHub Codespaces template for HoloScript development
- GitHub Discussions integration for community feedback
- Enhanced error recovery and retry logic
- Batch operations support
- GraphQL API integration for complex queries

---

## Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for development guidelines.

## License

MIT - See [LICENSE](../../LICENSE) for details.
