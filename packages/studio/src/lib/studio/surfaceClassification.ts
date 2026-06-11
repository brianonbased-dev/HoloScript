export type StudioSurfaceClass =
  | 'core-workbench'
  | 'account-workspace'
  | 'holomesh-public'
  | 'lab'
  | 'archive'
  | 'deprecated';

export type StudioNavigationLane = 'primary' | 'lab' | 'direct';

export type StudioNavigationId =
  | 'home'
  | 'create'
  | 'projects'
  | 'network'
  | 'earn'
  | 'operations'
  | 'settings'
  // parked — kept in union so STUDIO_ROUTE_SURFACES and labs flag can reference
  | 'start'
  | 'workspace'
  | 'vibe'
  | 'integrations'
  | 'agents'
  | 'teams'
  | 'holomesh'
  | 'absorb'
  | 'playground';

export interface StudioRouteSurface {
  route: string;
  surfaceClass: StudioSurfaceClass;
  navigationLane: StudioNavigationLane;
  rationale: string;
}

export interface StudioNavigationItemDefinition {
  id: StudioNavigationId;
  label: string;
  href: string;
  exact: boolean;
  description: string;
  surfaceClass: StudioSurfaceClass;
  navigationLane: StudioNavigationLane;
}

export const STUDIO_LAB_NAV_FLAG = 'NEXT_PUBLIC_STUDIO_SHOW_LABS';

export const STUDIO_PRIMARY_NAVIGATION_ITEMS: StudioNavigationItemDefinition[] = [
  {
    id: 'home',
    label: 'Home',
    href: '/',
    exact: true,
    description: 'Brittney full-screen home and assistant entry',
    surfaceClass: 'core-workbench',
    navigationLane: 'primary',
  },
  {
    id: 'create',
    label: 'Create',
    href: '/create',
    exact: false,
    description: 'Spatial IDE workbench',
    surfaceClass: 'core-workbench',
    navigationLane: 'primary',
  },
  {
    id: 'projects',
    label: 'Projects',
    href: '/projects',
    exact: false,
    description: 'Saved work and project inventory',
    surfaceClass: 'account-workspace',
    navigationLane: 'primary',
  },
  {
    id: 'network',
    label: 'Network',
    href: '/holomesh',
    exact: false,
    description: 'HoloMesh knowledge network public surface',
    surfaceClass: 'holomesh-public',
    navigationLane: 'primary',
  },
  {
    id: 'earn',
    label: 'Earn',
    href: '/earn',
    exact: false,
    description: 'Creator earnings, wallet, and Stripe Connect',
    surfaceClass: 'account-workspace',
    navigationLane: 'primary',
  },
  {
    id: 'operations',
    label: 'Operations',
    href: '/operations',
    exact: false,
    description: 'Live fleet, CI, Lotus gate, and board state (D.081 operate surface)',
    surfaceClass: 'lab',
    navigationLane: 'primary',
  },
];

export const STUDIO_SETTINGS_NAVIGATION_ITEM: StudioNavigationItemDefinition = {
  id: 'settings',
  label: 'Settings',
  href: '/settings',
  exact: false,
  description: 'Account and security settings',
  surfaceClass: 'account-workspace',
  navigationLane: 'primary',
};

/**
 * STUDIO_LAB_NAVIGATION_ITEMS — parked items no longer in the visible nav.
 *
 * These stay in the enum so STUDIO_ROUTE_SURFACES classification and the
 * labs-flag feature-flag path remain structurally valid. They are NOT rendered
 * in GlobalNavigation (the Labs section block was removed as part of the A4
 * IA consolidation). Direct URLs still work for all of these.
 */
export const STUDIO_LAB_NAVIGATION_ITEMS: StudioNavigationItemDefinition[] = [
  {
    id: 'workspace',
    label: 'Workspace',
    href: '/workspace',
    exact: false,
    description: 'Account repo workbench (merged into /projects workbench tab)',
    surfaceClass: 'account-workspace',
    navigationLane: 'lab',
  },
  {
    id: 'vibe',
    label: 'Vibe',
    href: '/vibe',
    exact: true,
    description: 'Standalone creation experiment (deprecated → /create)',
    surfaceClass: 'lab',
    navigationLane: 'lab',
  },
  {
    id: 'integrations',
    label: 'Integrations',
    href: '/integrations',
    exact: false,
    description: 'Connector and service integration (merged into /settings Integrations tab)',
    surfaceClass: 'account-workspace',
    navigationLane: 'lab',
  },
  {
    id: 'agents',
    label: 'Agents',
    href: '/agents',
    exact: false,
    description: 'Agent network public surface',
    surfaceClass: 'holomesh-public',
    navigationLane: 'lab',
  },
  {
    id: 'teams',
    label: 'Teams',
    href: '/teams',
    exact: false,
    description: 'Team and board public surface',
    surfaceClass: 'holomesh-public',
    navigationLane: 'lab',
  },
  {
    id: 'holomesh',
    label: 'HoloMesh',
    href: '/holomesh',
    exact: false,
    description: 'Knowledge network public surface',
    surfaceClass: 'holomesh-public',
    navigationLane: 'lab',
  },
  {
    id: 'absorb',
    label: 'Absorb',
    href: '/absorb',
    exact: false,
    description: 'Codebase intelligence lab',
    surfaceClass: 'lab',
    navigationLane: 'lab',
  },
  {
    id: 'playground',
    label: 'Playground',
    href: '/playground',
    exact: false,
    description: 'Experimental interaction playgrounds',
    surfaceClass: 'lab',
    navigationLane: 'lab',
  },
];

export const STUDIO_ROUTE_SURFACES: StudioRouteSurface[] = [
  route('/', 'core-workbench', 'primary', 'Brittney full-screen home — primary nav destination (A4 IA consolidation).'),
  route('/[vertical]', 'archive', 'direct', 'Legacy industry landing route.'),
  route('/absorb', 'lab', 'lab', 'Codebase intelligence product lane outside primary IDE.'),
  route('/absorb/admin', 'lab', 'direct', 'Operational Absorb admin surface.'),
  route('/admin', 'lab', 'direct', 'Internal administrative surface.'),
  route('/agents', 'holomesh-public', 'lab', 'Public agent network surface.'),
  route('/agents/[id]', 'holomesh-public', 'direct', 'Public agent profile.'),
  route('/agents/[id]/storefront', 'holomesh-public', 'direct', 'Public agent storefront.'),
  route('/agents/me', 'account-workspace', 'direct', 'Signed-in agent account surface.'),
  route('/auth/signin', 'account-workspace', 'direct', 'Authentication entry.'),
  route('/avatar', 'lab', 'direct', 'Avatar authoring experiment.'),
  route('/build', 'deprecated', 'direct', 'Redirects to /create (creation surfaces consolidated).'),
  route('/character', 'lab', 'direct', 'Character authoring experiment.'),
  route('/conjecture/receipts', 'lab', 'direct', 'Conjecture gate receipts viewer.'),
  route('/coordinator', 'lab', 'direct', 'Coordinator panel integration route.'),
  route('/create', 'core-workbench', 'primary', 'Spatial IDE workbench.'),
  route('/creator', 'archive', 'direct', 'Superseded creator dashboard route.'),
  route('/demo/emergent-spacetime', 'archive', 'direct', 'Demo route outside product spine.'),
  route('/dev/ui-graph', 'lab', 'direct', 'Developer-only UI graph route.'),
  route('/earn', 'account-workspace', 'primary', 'Creator economics: revenue, transactions, storefront management.'),
  route('/examples/no-app-webxr', 'archive', 'direct', 'Legacy WebXR example.'),
  route('/g/[hash]', 'holomesh-public', 'direct', 'Public hologram share.'),
  route('/gram/[hash]', 'deprecated', 'direct', 'Redirecting legacy share alias.'),
  route('/holoclaw', 'deprecated', 'direct', 'Redirecting legacy team route.'),
  route('/holodaemon', 'deprecated', 'direct', 'Redirecting legacy team route.'),
  route('/holomesh', 'holomesh-public', 'primary', 'HoloMesh public network home — Network nav destination (A4 IA consolidation).'),
  route('/holomesh/agent/[id]', 'holomesh-public', 'direct', 'HoloMesh agent profile.'),
  route('/holomesh/contribute', 'holomesh-public', 'direct', 'HoloMesh contribution flow.'),
  route('/holomesh/dashboard', 'holomesh-public', 'direct', 'HoloMesh user dashboard.'),
  route(
    '/holomesh/discover',
    'holomesh-public',
    'direct',
    'HoloMesh public cold-entry discovery surface (crawlable, no auth).'
  ),
  route('/holomesh/entry/[id]', 'holomesh-public', 'direct', 'HoloMesh knowledge entry.'),
  route('/holomesh/leaderboard', 'holomesh-public', 'direct', 'HoloMesh ranking surface.'),
  route('/holomesh/marketplace', 'holomesh-public', 'direct', 'HoloMesh marketplace.'),
  route('/holomesh/onboard', 'holomesh-public', 'direct', 'HoloMesh onboarding.'),
  route('/holomesh/profile', 'holomesh-public', 'direct', 'HoloMesh profile redirect.'),
  route('/holomesh/team/[id]', 'holomesh-public', 'direct', 'HoloMesh team room.'),
  route('/holomesh/team/[id]/board', 'holomesh-public', 'direct', 'HoloMesh team board.'),
  route('/holomesh/teams', 'holomesh-public', 'direct', 'HoloMesh teams redirect.'),
  route('/holomesh/transactions', 'holomesh-public', 'direct', 'HoloMesh wallet activity.'),
  route(
    '/operations',
    'lab',
    'primary',
    'Operate surface: live fleet/CI/Lotus/board telemetry (D.081).'
  ),
  route(
    '/integrations',
    'deprecated',
    'direct',
    'Redirects to /settings (Integrations tab) — A4 IA consolidation.'
  ),
  route('/learn', 'archive', 'direct', 'Redirects to academy content.'),
  route(
    '/lotus-slice',
    'lab',
    'direct',
    'I.007 lotus render proof — botanical_lotus compiled from .holo to R3F pixels.'
  ),
  route(
    '/p043-quest-capture',
    'lab',
    'direct',
    'P043 Quest 3 capture surface for SKU matrix artifacts.'
  ),
  route('/pipeline', 'lab', 'direct', 'Pipeline playground route.'),
  route('/pipeline/chaining', 'lab', 'direct', 'Pipeline chaining playground route.'),
  route('/pipeline/choreography', 'lab', 'direct', 'Pipeline choreography playground route.'),
  route('/playground', 'lab', 'lab', 'General playground surface.'),
  route('/playground/locomotion', 'lab', 'direct', 'Locomotion playground route.'),
  route('/projects', 'account-workspace', 'primary', 'Saved project inventory.'),
  route('/quest-probe', 'archive', 'direct', 'Probe route from an experiment.'),
  route('/quest-proof', 'lab', 'direct', 'Quest headset proof / format-stress receipt dashboard.'),
  route('/quest-proof/unavailable', 'lab', 'direct', 'Quest proof unavailable fallback surface.'),
  route('/registry', 'lab', 'direct', 'Trait/package registry route.'),
  route('/remote/[token]', 'lab', 'direct', 'Remote mobile companion route.'),
  route('/scan-room', 'lab', 'direct', 'Room scanning workflow.'),
  route('/scan-room/mobile/[token]', 'lab', 'direct', 'Mobile room scanning companion.'),
  route('/settings', 'account-workspace', 'primary', 'Account settings.'),
  route(
    '/settings/security/self-custody',
    'account-workspace',
    'direct',
    'Self-custody migration flow.'
  ),
  route('/shared/[id]', 'holomesh-public', 'direct', 'Shared immersive scene.'),
  route('/spectator/training', 'lab', 'direct', 'Real-time training progress spectator.'),
  route('/start', 'deprecated', 'direct', 'Redirects to / (BrittneyFullScreen entry consolidated into home).'),
  route('/store', 'holomesh-public', 'direct', 'Public store surface outside IDE chrome.'),
  route('/teams', 'holomesh-public', 'lab', 'Team discovery and workspace surface.'),
  route('/teams/[id]', 'holomesh-public', 'direct', 'Team workspace.'),
  route('/teams/[id]/board', 'holomesh-public', 'direct', 'Team board.'),
  route('/templates', 'deprecated', 'direct', 'Redirecting legacy templates alias.'),
  route('/u/[username]', 'holomesh-public', 'direct', 'Public user profile.'),
  route('/verify', 'account-workspace', 'direct', 'Secrets broker device-flow approval surface.'),
  route('/vibe', 'deprecated', 'direct', 'Redirects to /create (vibe chassis merged into create).'),
  route('/view/[id]', 'holomesh-public', 'direct', 'Public viewer route.'),
  route('/webcam-gaze-demo', 'lab', 'direct', 'Webcam gaze foveal-center input demo.'),
  route('/workspace', 'deprecated', 'direct', 'Workbench content merging into /projects — double-nav removed (A4 IA consolidation).'),
  route('/workspace/agents/new', 'account-workspace', 'direct', 'Workspace agent creation.'),
  route('/workspace/knowledge', 'account-workspace', 'direct', 'Workspace knowledge filing.'),
  route('/workspace/templates/new', 'account-workspace', 'direct', 'Workspace template creation.'),
];

export const STUDIO_ROUTE_SURFACE_BY_ROUTE = Object.fromEntries(
  STUDIO_ROUTE_SURFACES.map((surface) => [surface.route, surface])
) as Record<string, StudioRouteSurface>;

export function isStudioLabNavigationEnabled(): boolean {
  return process.env.NEXT_PUBLIC_STUDIO_SHOW_LABS === '1';
}

/**
 * Returns the visible navigation items for the given context.
 *
 * Since the A4 IA consolidation the primary nav is always the 7-destination
 * set (Home, Create, Projects, Network, Earn, Operations, Settings). The labs
 * flag no longer appends STUDIO_LAB_NAVIGATION_ITEMS to the rendered nav —
 * those items are parked (direct URLs still work). The flag is preserved for
 * feature-flag infrastructure that may re-expose items in future.
 */
export function getVisibleStudioNavigationItems(
  _labsEnabled = isStudioLabNavigationEnabled()
): StudioNavigationItemDefinition[] {
  return STUDIO_PRIMARY_NAVIGATION_ITEMS;
}

export function getStudioRouteSurface(routePath: string): StudioRouteSurface | undefined {
  return STUDIO_ROUTE_SURFACE_BY_ROUTE[routePath];
}

function route(
  routePath: string,
  surfaceClass: StudioSurfaceClass,
  navigationLane: StudioNavigationLane,
  rationale: string
): StudioRouteSurface {
  return { route: routePath, surfaceClass, navigationLane, rationale };
}
