/**
 * HoloScript Edge Deployment Pipeline
 *
 * Barrel export and factory function for deployers.
 */

// Re-export all types and classes
export {
  BaseDeployer,
  DeployConfig,
  DeployResult,
  DeploymentInfo,
  BuildOutput,
  DeployerEvent,
  DeployerEvents,
} from './BaseDeployer';

export { CloudflareDeployer, CloudflareConfig, KVNamespaceBinding } from './CloudflareDeployer';

export {
  VercelDeployer,
  VercelConfig,
  VercelEnvironmentVariable,
  VercelServerlessConfig,
} from './VercelDeployer';

export { NginxDeployer, NginxConfig, NginxSiteConfig, NginxLocationBlock } from './NginxDeployer';

// Direct imports for factory
import { BaseDeployer } from './BaseDeployer';
import { CloudflareDeployer } from './CloudflareDeployer';
import { VercelDeployer } from './VercelDeployer';
import { NginxDeployer } from './NginxDeployer';

/**
 * Factory function to create a deployer instance by target name.
 *
 * @param target - The deployment target: 'cloudflare', 'vercel', 'nginx', or 'custom'.
 * @param config - Target-specific configuration object. Shape depends on the target:
 *   - cloudflare: { apiToken: string, accountId: string, kvNamespaces?: [...] }
 *   - vercel: { apiToken: string, teamId?: string, orgId?: string }
 *   - nginx/custom: { host: string, username: string, keyPath?: string, ... }
 * @returns A BaseDeployer instance for the specified target.
 * @throws Error if the target is not recognized.
 */
export function createDeployer(target: string, config?: Record<string, unknown>): BaseDeployer {
  switch (target) {
    case 'cloudflare':
      return new CloudflareDeployer({
        apiToken: (config?.apiToken as string) || '',
        accountId: (config?.accountId as string) || '',
        kvNamespaces:
          (config?.kvNamespaces as Array<{ binding: string; namespaceId: string }>) || [],
      });

    case 'vercel':
      return new VercelDeployer({
        apiToken: (config?.apiToken as string) || '',
        teamId: config?.teamId as string | undefined,
        orgId: config?.orgId as string | undefined,
      });

    case 'nginx':
    case 'custom':
      return new NginxDeployer({
        host: (config?.host as string) || 'localhost',
        port: (config?.port as number) || 22,
        username: (config?.username as string) || 'deploy',
        keyPath: config?.keyPath as string | undefined,
        password: config?.password as string | undefined,
        remotePath: config?.remotePath as string | undefined,
        nginxConfigPath: config?.nginxConfigPath as string | undefined,
        nginxSitesPath: config?.nginxSitesPath as string | undefined,
      });

    default:
      throw new Error(
        `Unknown deployment target: "${target}". Supported targets: cloudflare, vercel, nginx, custom`
      );
  }
}
