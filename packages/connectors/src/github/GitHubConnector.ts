import { ServiceConnector, McpRegistrar } from '../core.js';
import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { Octokit } from '@octokit/rest';
import { createTokenAuth } from '@octokit/auth-token';
import { githubTools } from './tools.js';

/**
 * GitHubConnector bridges HoloScript Studio to GitHub's REST API.
 *
 * Provides MCP tools for:
 * - Repository operations (create, list, get)
 * - Issue management (create, update, comment)
 * - Pull request workflows (create, merge, review, comment)
 * - GitHub Actions automation (list, trigger, monitor)
 * - Content operations (read, write files)
 * - HoloScript-specific CI/CD (compile previews, scene validation)
 *
 * Authentication via GITHUB_TOKEN environment variable.
 */
export class GitHubConnector extends ServiceConnector {
  private octokit: Octokit | null = null;
  private token: string | null = null;
  private registrar = new McpRegistrar();

  constructor() {
    super();
  }

  async connect(): Promise<void> {
    this.token = process.env.GITHUB_TOKEN || null;

    if (!this.token) {
      throw new Error('GITHUB_TOKEN environment variable is required');
    }

    const auth = createTokenAuth(this.token);
    const { token } = await auth();

    this.octokit = new Octokit({
      auth: token,
      userAgent: 'holoscript-connector-github/1.0.0',
    });

    // Verify authentication
    try {
      await this.octokit.rest.users.getAuthenticated();
      this.isConnected = true;

      // Register with MCP orchestrator
      await this.registrar.register({
        name: 'holoscript-github',
        url: 'http://localhost:0', // Local connector
        tools: githubTools.map((t) => t.name),
      });
    } catch (error) {
      this.isConnected = false;
      throw new Error(`GitHub authentication failed: ${error}`);
    }
  }

  async disconnect(): Promise<void> {
    this.octokit = null;
    this.token = null;
    this.isConnected = false;
  }

  async health(): Promise<boolean> {
    if (!this.isConnected || !this.octokit) {
      return false;
    }

    try {
      const { status } = await this.octokit.rest.meta.get();
      return status === 200;
    } catch {
      return false;
    }
  }

  async listTools(): Promise<Tool[]> {
    return githubTools;
  }

  async executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    if (!this.isConnected || !this.octokit) {
      throw new Error('GitHubConnector is not connected. Call connect() first.');
    }

    const { octokit } = this;

    switch (name) {
      // Repository Operations
      case 'github_repo_get':
        return octokit.rest.repos.get({
          owner: args.owner as string,
          repo: args.repo as string,
        });

      case 'github_repo_create':
        return octokit.rest.repos.createForAuthenticatedUser({
          name: args.name as string,
          description: args.description as string | undefined,
          private: args.private as boolean | undefined,
          auto_init: args.auto_init as boolean | undefined,
        });

      case 'github_repo_list':
        if (args.org) {
          return octokit.rest.repos.listForOrg({
            org: args.org as string,
            type: args.type as never,
            sort: args.sort as never,
            per_page: args.per_page as number | undefined,
          });
        } else {
          return octokit.rest.repos.listForAuthenticatedUser({
            type: args.type as never,
            sort: args.sort as never,
            per_page: args.per_page as number | undefined,
          });
        }

      // Issue Operations
      case 'github_issue_create':
        return octokit.rest.issues.create({
          owner: args.owner as string,
          repo: args.repo as string,
          title: args.title as string,
          body: args.body as string | undefined,
          labels: args.labels as string[] | undefined,
          assignees: args.assignees as string[] | undefined,
        });

      case 'github_issue_list':
        return octokit.rest.issues.listForRepo({
          owner: args.owner as string,
          repo: args.repo as string,
          state: args.state as never,
          labels: args.labels as string | undefined,
          per_page: args.per_page as number | undefined,
        });

      case 'github_issue_update':
        return octokit.rest.issues.update({
          owner: args.owner as string,
          repo: args.repo as string,
          issue_number: args.issue_number as number,
          title: args.title as string | undefined,
          body: args.body as string | undefined,
          state: args.state as never,
          labels: args.labels as string[] | undefined,
        });

      case 'github_issue_comment':
        return octokit.rest.issues.createComment({
          owner: args.owner as string,
          repo: args.repo as string,
          issue_number: args.issue_number as number,
          body: args.body as string,
        });

      // Pull Request Operations
      case 'github_pr_create':
        return octokit.rest.pulls.create({
          owner: args.owner as string,
          repo: args.repo as string,
          title: args.title as string,
          body: args.body as string | undefined,
          head: args.head as string,
          base: args.base as string,
          draft: args.draft as boolean | undefined,
        });

      case 'github_pr_list':
        return octokit.rest.pulls.list({
          owner: args.owner as string,
          repo: args.repo as string,
          state: args.state as never,
          per_page: args.per_page as number | undefined,
        });

      case 'github_pr_get':
        return octokit.rest.pulls.get({
          owner: args.owner as string,
          repo: args.repo as string,
          pull_number: args.pull_number as number,
        });

      case 'github_pr_merge':
        return octokit.rest.pulls.merge({
          owner: args.owner as string,
          repo: args.repo as string,
          pull_number: args.pull_number as number,
          commit_title: args.commit_title as string | undefined,
          commit_message: args.commit_message as string | undefined,
          merge_method: args.merge_method as never,
        });

      case 'github_pr_comment':
        return octokit.rest.issues.createComment({
          owner: args.owner as string,
          repo: args.repo as string,
          issue_number: args.pull_number as number,
          body: args.body as string,
        });

      case 'github_pr_review':
        return octokit.rest.pulls.createReview({
          owner: args.owner as string,
          repo: args.repo as string,
          pull_number: args.pull_number as number,
          body: args.body as string | undefined,
          event: args.event as never,
        });

      // Workflow Operations
      case 'github_workflow_list':
        return octokit.rest.actions.listRepoWorkflows({
          owner: args.owner as string,
          repo: args.repo as string,
        });

      case 'github_workflow_run':
        return octokit.rest.actions.createWorkflowDispatch({
          owner: args.owner as string,
          repo: args.repo as string,
          workflow_id: args.workflow_id as string,
          ref: args.ref as string,
          inputs: args.inputs as Record<string, unknown> | undefined,
        });

      case 'github_workflow_runs_list':
        if (args.workflow_id) {
          return octokit.rest.actions.listWorkflowRuns({
            owner: args.owner as string,
            repo: args.repo as string,
            workflow_id: args.workflow_id as string,
            status: args.status as never,
            per_page: args.per_page as number | undefined,
          });
        } else {
          return octokit.rest.actions.listWorkflowRunsForRepo({
            owner: args.owner as string,
            repo: args.repo as string,
            status: args.status as never,
            per_page: args.per_page as number | undefined,
          });
        }

      // Content Operations
      case 'github_content_get':
        return octokit.rest.repos.getContent({
          owner: args.owner as string,
          repo: args.repo as string,
          path: args.path as string,
          ref: args.ref as string | undefined,
        });

      case 'github_content_create_or_update':
        // Base64 encode content
        const content = Buffer.from(args.content as string).toString('base64');
        return octokit.rest.repos.createOrUpdateFileContents({
          owner: args.owner as string,
          repo: args.repo as string,
          path: args.path as string,
          message: args.message as string,
          content,
          branch: args.branch as string | undefined,
          sha: args.sha as string | undefined,
        });

      // HoloScript-Specific Operations
      case 'github_holoscript_compile_preview':
        return this.compileHoloScriptPreview(args);

      case 'github_holoscript_validate_scene':
        return this.validateHoloScriptScene(args);

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  /**
   * Compile HoloScript files from a repository and generate preview links.
   * Used by GitHub Actions CI/CD workflows.
   */
  private async compileHoloScriptPreview(args: Record<string, unknown>): Promise<unknown> {
    const { owner, repo, ref = 'main', files } = args;

    // If files not specified, auto-detect .holo/.hs/.hsplus files
    let filesToCompile = files as string[] | undefined;

    if (!filesToCompile) {
      const { data: tree } = await this.octokit!.rest.git.getTree({
        owner: owner as string,
        repo: repo as string,
        tree_sha: ref as string,
        recursive: 'true',
      });

      filesToCompile = tree.tree
        .filter((item) => item.type === 'blob' && /\.(holo|hs|hsplus)$/.test(item.path || ''))
        .map((item) => item.path!);
    }

    if (filesToCompile.length === 0) {
      return { success: false, message: 'No HoloScript files found' };
    }

    const results = [];

    for (const filePath of filesToCompile) {
      try {
        // Fetch file content
        const { data: fileData } = await this.octokit!.rest.repos.getContent({
          owner: owner as string,
          repo: repo as string,
          path: filePath,
          ref: ref as string,
        });

        if ('content' in fileData && fileData.content) {
          const content = Buffer.from(fileData.content, 'base64').toString('utf-8');

          // Call HoloScript MCP render endpoint
          const renderResponse = await fetch('https://mcp.holoscript.net/api/render', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              code: content,
              target: 'threejs',
              format: 'html',
            }),
          });

          const renderData = (await renderResponse.json()) as {
            success?: boolean;
            previewUrl?: string;
            errors?: string[];
          };

          results.push({
            file: filePath,
            success: renderData.success,
            previewUrl: renderData.previewUrl || null,
            errors: renderData.errors || [],
          });
        }
      } catch (error) {
        results.push({
          file: filePath,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return {
      ref: ref as string,
      files: results,
      summary: {
        total: results.length,
        successful: results.filter((r) => r.success).length,
        failed: results.filter((r) => !r.success).length,
      },
    };
  }

  /**
   * Validate HoloScript scene files using the HoloScript MCP validation tool.
   * Returns diagnostic errors, warnings, and trait suggestions.
   */
  private async validateHoloScriptScene(args: Record<string, unknown>): Promise<unknown> {
    const { owner, repo, ref = 'main', files } = args;

    let filesToValidate = files as string[] | undefined;

    if (!filesToValidate) {
      const { data: tree } = await this.octokit!.rest.git.getTree({
        owner: owner as string,
        repo: repo as string,
        tree_sha: ref as string,
        recursive: 'true',
      });

      filesToValidate = tree.tree
        .filter((item) => item.type === 'blob' && /\.(holo|hs|hsplus)$/.test(item.path || ''))
        .map((item) => item.path!);
    }

    if (filesToValidate.length === 0) {
      return { success: false, message: 'No HoloScript files found' };
    }

    const results = [];

    for (const filePath of filesToValidate) {
      try {
        const { data: fileData } = await this.octokit!.rest.repos.getContent({
          owner: owner as string,
          repo: repo as string,
          path: filePath,
          ref: ref as string,
        });

        if ('content' in fileData && fileData.content) {
          const content = Buffer.from(fileData.content, 'base64').toString('utf-8');

          // Call HoloScript MCP validation via orchestrator
          const orchestratorUrl =
            process.env.MCP_ORCHESTRATOR_URL ||
            'https://mcp-orchestrator-production-45f9.up.railway.app';
          const validationResponse = await fetch(`${orchestratorUrl}/tools/call`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-mcp-api-key': process.env.HOLOSCRIPT_API_KEY || '',
            },
            body: JSON.stringify({
              server: 'holoscript-remote',
              tool: 'validate_holoscript',
              args: { code: content },
            }),
          });

          const validationData = (await validationResponse.json()) as {
            valid?: boolean;
            errors?: string[];
            warnings?: string[];
            suggestions?: string[];
          };

          results.push({
            file: filePath,
            valid: validationData.valid || false,
            errors: validationData.errors || [],
            warnings: validationData.warnings || [],
            suggestions: validationData.suggestions || [],
          });
        }
      } catch (error) {
        results.push({
          file: filePath,
          valid: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return {
      ref: ref as string,
      files: results,
      summary: {
        total: results.length,
        valid: results.filter((r) => r.valid).length,
        invalid: results.filter((r) => !r.valid).length,
        totalErrors: results.reduce((sum, r) => sum + (r.errors?.length || 0), 0),
        totalWarnings: results.reduce((sum, r) => sum + (r.warnings?.length || 0), 0),
      },
    };
  }
}
