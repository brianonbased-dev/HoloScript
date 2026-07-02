/**
 * HoloScript Partner SDK - generated Registry API surface.
 */

import type { SDKErrorPayload, SDKRateLimitSnapshot } from './sdk-runtime.js';

export {
  RegistryClient,
  createRegistryClient,
  SDKAuthenticationError,
  SDKAuthenticationError as AuthenticationError,
  SDKError,
  SDKRateLimitError,
  SDKRateLimitError as RateLimitError,
  SDKRuntime,
  type ApiError,
  type CheckNameAvailabilityParams,
  type CredentialStatus,
  type DeprecateVersionParams,
  type DeprecateVersionRequest,
  type DownloadPoint,
  type GetDownloadStatsParams,
  type GetMyPackagesParams,
  type GetPackageParams,
  type GetVersionParams,
  type ListVersionsParams,
  type MyPackages,
  type NameAvailability,
  type PackageInfo,
  type RateLimit,
  type RegistryClientConfig,
  type SDKRateLimitSnapshot,
  type SDKRequestOptions,
  type SDKRuntimeConfig,
  type SearchPackage,
  type SearchParams,
  type SearchResult,
  type TransferOwnershipParams,
  type TransferOwnershipRequest,
  type TransferToken,
  type UpdateKeywordsParams,
  type UpdateKeywordsRequest,
  type VersionInfo,
} from './RegistryClient.js';

export type {
  SDKCredentials,
  SDKCredentials as PartnerCredentials,
  SDKErrorPayload,
  SDKFetch,
  SDKQueryPrimitive,
  SDKQueryValue,
} from './sdk-runtime.js';

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: SDKErrorPayload;
  rateLimit?: SDKRateLimitSnapshot;
}
