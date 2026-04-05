/**
 * @deprecated A.011.03d — Intended destination: @holoscript/platform.
 *
 * Multi-Tenant Isolation Module
 *
 * Provides tenant management, context isolation, namespace management,
 * and cross-tenant access prevention for HoloScript deployments.
 *
 * @version 3.9.0
 * @sprint Sprint 9: Multi-Tenant Isolation
 */

// Tenant Manager - core CRUD and types
export {
  TenantManager,
  type Tenant,
  type TenantPlan,
  type TenantContext,
  type TenantSettings,
  type TenantFilter,
  type TenantStore,
  type QuotaConfig,
  type Permission,
  type CreateTenantConfig,
} from './TenantManager';

// Tenant Context - request-scoped context via AsyncLocalStorage
export {
  createContext,
  validateAccess,
  withTenantContext,
  getCurrentContext,
  requireContext,
  type ResourceDescriptor,
} from './TenantContext';

// Isolation Enforcer - cross-tenant access prevention
export {
  validateResourceAccess,
  isolateExecution,
  validateNamespace,
  getIsolatedNamespace,
  TenantIsolationError,
} from './IsolationEnforcer';

// Namespace Manager - tenant-scoped namespace management
export { NamespaceManager, type Namespace, type NamespaceInfo } from './NamespaceManager';
