/**
 * Studio coordinator-panels barrel — downstream consumers of the 4
 * Pattern E consumer-buses landed in @holoscript/core/coordinators
 * (task_1777281302813_eezs). Each panel proves W.081 wire-through-real-
 * consumer at the Studio surface for one bus.
 *
 * Wiring:
 *   <TraitRuntimeProvider runtime={traitRuntime}>
 *     <AssetLoadingScreen />          // AssetLoadCoordinator
 *     <AdminDashboard />              // SecurityEventBus
 *     <LocomotionDemoPanel />         // GenerativeJobMonitor
 *     <LobbyPeerRoster />             // SessionPresenceCoordinator
 *   </TraitRuntimeProvider>
 *
 * Each panel also accepts an explicit `runtime` prop for cases where
 * the embedder doesn't want to use the Provider.
 */
export {
  TraitRuntimeProvider,
  useTraitRuntime,
  useAssetLoadStates,
  useSecurityPresence,
  useGenerativeJobs,
  useSessionPresence,
} from './TraitRuntimeContext';
export type {
  TraitRuntimeProviderProps,
  SecurityViewState,
  GenerativeJobsView,
  SessionPresenceView,
} from './TraitRuntimeContext';

export { AssetLoadingScreen } from './AssetLoadingScreen';
export type { AssetLoadingScreenProps } from './AssetLoadingScreen';

export { AdminDashboard } from './AdminDashboard';
export type { AdminDashboardProps } from './AdminDashboard';

export { LobbyPeerRoster } from './LobbyPeerRoster';
export type { LobbyPeerRosterProps } from './LobbyPeerRoster';

export { LocomotionDemoPanel } from './LocomotionDemoPanel';
export type { LocomotionDemoPanelProps } from './LocomotionDemoPanel';
