import { Tool } from '@modelcontextprotocol/sdk/types.js';

export const githubTools: Tool[] = [
  // Repository Operations
  {
    name: 'github_repo_get',
    description: 'Get repository information',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner username or organization' },
        repo: { type: 'string', description: 'Repository name' },
      },
      required: ['owner', 'repo'],
    },
  },
  {
    name: 'github_repo_create',
    description: 'Create a new repository',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Repository name' },
        description: { type: 'string', description: 'Repository description' },
        private: {
          type: 'boolean',
          description: 'Whether the repository is private',
          default: false,
        },
        auto_init: { type: 'boolean', description: 'Create with README', default: true },
      },
      required: ['name'],
    },
  },
  {
    name: 'github_repo_list',
    description: 'List repositories for the authenticated user or an organization',
    inputSchema: {
      type: 'object',
      properties: {
        org: { type: 'string', description: 'Organization name (optional)' },
        type: {
          type: 'string',
          enum: ['all', 'owner', 'public', 'private', 'member'],
          description: 'Filter by repository type',
          default: 'all',
        },
        sort: {
          type: 'string',
          enum: ['created', 'updated', 'pushed', 'full_name'],
          description: 'Sort order',
          default: 'updated',
        },
        per_page: { type: 'number', description: 'Results per page', default: 30 },
      },
    },
  },

  // Issue Operations
  {
    name: 'github_issue_create',
    description: 'Create a new issue in a repository',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        title: { type: 'string', description: 'Issue title' },
        body: { type: 'string', description: 'Issue body/description' },
        labels: {
          type: 'array',
          items: { type: 'string' },
          description: 'Labels to apply',
        },
        assignees: {
          type: 'array',
          items: { type: 'string' },
          description: 'Usernames to assign',
        },
      },
      required: ['owner', 'repo', 'title'],
    },
  },
  {
    name: 'github_issue_list',
    description: 'List issues for a repository',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        state: {
          type: 'string',
          enum: ['open', 'closed', 'all'],
          default: 'open',
        },
        labels: { type: 'string', description: 'Comma-separated labels' },
        per_page: { type: 'number', default: 30 },
      },
      required: ['owner', 'repo'],
    },
  },
  {
    name: 'github_issue_update',
    description: 'Update an existing issue',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        issue_number: { type: 'number', description: 'Issue number' },
        title: { type: 'string', description: 'New title' },
        body: { type: 'string', description: 'New body' },
        state: { type: 'string', enum: ['open', 'closed'], description: 'New state' },
        labels: { type: 'array', items: { type: 'string' } },
      },
      required: ['owner', 'repo', 'issue_number'],
    },
  },
  {
    name: 'github_issue_comment',
    description: 'Add a comment to an issue',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        issue_number: { type: 'number', description: 'Issue number' },
        body: { type: 'string', description: 'Comment body' },
      },
      required: ['owner', 'repo', 'issue_number', 'body'],
    },
  },

  // Pull Request Operations
  {
    name: 'github_pr_create',
    description: 'Create a pull request',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        title: { type: 'string', description: 'PR title' },
        body: { type: 'string', description: 'PR description' },
        head: { type: 'string', description: 'The branch containing changes' },
        base: { type: 'string', description: 'The branch to merge into', default: 'main' },
        draft: { type: 'boolean', description: 'Create as draft PR', default: false },
      },
      required: ['owner', 'repo', 'title', 'head', 'base'],
    },
  },
  {
    name: 'github_pr_list',
    description: 'List pull requests',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        state: { type: 'string', enum: ['open', 'closed', 'all'], default: 'open' },
        per_page: { type: 'number', default: 30 },
      },
      required: ['owner', 'repo'],
    },
  },
  {
    name: 'github_pr_get',
    description: 'Get a specific pull request',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        pull_number: { type: 'number', description: 'PR number' },
      },
      required: ['owner', 'repo', 'pull_number'],
    },
  },
  {
    name: 'github_pr_merge',
    description: 'Merge a pull request',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        pull_number: { type: 'number', description: 'PR number' },
        commit_title: { type: 'string', description: 'Merge commit title' },
        commit_message: { type: 'string', description: 'Merge commit message' },
        merge_method: {
          type: 'string',
          enum: ['merge', 'squash', 'rebase'],
          default: 'merge',
        },
      },
      required: ['owner', 'repo', 'pull_number'],
    },
  },
  {
    name: 'github_pr_comment',
    description: 'Add a comment to a pull request',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        pull_number: { type: 'number', description: 'PR number' },
        body: { type: 'string', description: 'Comment body (supports markdown)' },
      },
      required: ['owner', 'repo', 'pull_number', 'body'],
    },
  },
  {
    name: 'github_pr_review',
    description: 'Create a review on a pull request',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        pull_number: { type: 'number', description: 'PR number' },
        body: { type: 'string', description: 'Review comment' },
        event: {
          type: 'string',
          enum: ['APPROVE', 'REQUEST_CHANGES', 'COMMENT'],
          description: 'Review action',
        },
      },
      required: ['owner', 'repo', 'pull_number', 'event'],
    },
  },

  // Workflow Operations
  {
    name: 'github_workflow_list',
    description: 'List GitHub Actions workflows',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
      },
      required: ['owner', 'repo'],
    },
  },
  {
    name: 'github_workflow_run',
    description: 'Trigger a workflow run',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        workflow_id: { type: 'string', description: 'Workflow file name or ID' },
        ref: { type: 'string', description: 'Git ref (branch/tag)', default: 'main' },
        inputs: {
          type: 'object',
          description: 'Workflow input parameters',
        },
      },
      required: ['owner', 'repo', 'workflow_id', 'ref'],
    },
  },
  {
    name: 'github_workflow_runs_list',
    description: 'List workflow runs',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        workflow_id: { type: 'string', description: 'Workflow file name or ID (optional)' },
        status: {
          type: 'string',
          enum: ['queued', 'in_progress', 'completed'],
          description: 'Filter by status',
        },
        per_page: { type: 'number', default: 30 },
      },
      required: ['owner', 'repo'],
    },
  },

  // Content Operations
  {
    name: 'github_content_get',
    description: 'Get file or directory contents from a repository',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        path: { type: 'string', description: 'File or directory path' },
        ref: { type: 'string', description: 'Git ref (branch/tag/commit)', default: 'main' },
      },
      required: ['owner', 'repo', 'path'],
    },
  },
  {
    name: 'github_content_create_or_update',
    description: 'Create or update a file in a repository',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        path: { type: 'string', description: 'File path' },
        message: { type: 'string', description: 'Commit message' },
        content: { type: 'string', description: 'File content (will be base64 encoded)' },
        branch: { type: 'string', description: 'Branch name', default: 'main' },
        sha: { type: 'string', description: 'Blob SHA of existing file (for updates)' },
      },
      required: ['owner', 'repo', 'path', 'message', 'content'],
    },
  },

  // HoloScript-Specific Operations
  {
    name: 'github_holoscript_compile_preview',
    description: 'Compile .holo files and generate preview link (used in CI/CD)',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        ref: { type: 'string', description: 'Git ref to compile from', default: 'main' },
        files: {
          type: 'array',
          items: { type: 'string' },
          description:
            'List of .holo/.hs/.hsplus files to compile (optional, auto-detects if not provided)',
        },
      },
      required: ['owner', 'repo'],
    },
  },
  {
    name: 'github_holoscript_validate_scene',
    description: 'Validate HoloScript scene files using HoloScript MCP validation',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        ref: { type: 'string', description: 'Git ref', default: 'main' },
        files: {
          type: 'array',
          items: { type: 'string' },
          description: 'Files to validate',
        },
      },
      required: ['owner', 'repo'],
    },
  },
];
