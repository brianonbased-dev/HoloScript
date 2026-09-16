/**
 * The declared list of industry verticals, and the only place that says which
 * ones exist.
 *
 * WHY THIS EXISTS. The industry portal used to live at
 * `src/app/(industry)/[vertical]/page.tsx`. A route group's parentheses do not
 * add a URL segment, so that file registered the dynamic route `/[vertical]` AT
 * THE ROOT — one segment, matching literally every unmatched single-segment
 * path. Census of 2026-09-16 against production: `/pricing`, `/login`,
 * `/signup`, `/billing`, `/robots.txt`, `/sitemap.xml` and an invented
 * `/zzz-probe-9182-not-a-real-page` all answered HTTP 200 with ~54KB of the
 * industry portal. `not-found.tsx` could never be reached, because nothing was
 * ever unmatched.
 *
 * Two repairs were possible: keep the page at the root and gate it on a list of
 * known verticals, or move it under a path segment of its own. This codebase
 * had already decided — `useStudioSetupWizard` navigates to `/industry/<category>`
 * (see its `router.push`), a path that returned 404 in production because
 * nothing served it. So the portal moved to `/industry/[vertical]`, which fixes
 * that broken navigation and frees the root at the same time. The list below is
 * still enforced, so `/industry/not-a-real-vertical` is a 404 rather than a
 * generic page pretending the vertical exists.
 *
 * Membership is the union of the two lists that already disagreed:
 *  - the wizard's eight routable categories, and
 *  - the five the portal had display copy for.
 * Anything here must keep working; anything not here is not an address.
 */

export interface IndustryVertical {
  /** URL segment, i.e. `/industry/<slug>`. */
  readonly slug: string;
  /** Heading shown in the portal. */
  readonly title: string;
  /** One line under the heading. */
  readonly description: string;
}

export const INDUSTRY_VERTICALS: readonly IndustryVertical[] = [
  // ── Had display copy in the portal before the move; unchanged. ──
  {
    slug: 'healthcare',
    title: 'Medical Simulation',
    description: 'DICOM import, anatomical materials, compliance',
  },
  {
    slug: 'architecture',
    title: 'Architectural Viz',
    description: 'BIM import, lighting, measurement tools',
  },
  {
    slug: 'gaming',
    title: 'Game Development',
    description: 'Level design, optimized export, navmesh',
  },
  {
    slug: 'film',
    title: 'Virtual Production',
    description: 'Camera sequence, DMX, live data sync',
  },
  {
    slug: 'manufacturing',
    title: 'Digital Twin',
    description: 'CAD import, physics simulation, SCADA sync',
  },

  // ── Routable from the setup wizard, but had no copy of their own and fell
  //    through to a generic "Professional Environment" heading. They are real
  //    destinations, so they get real names. ──
  {
    slug: 'agriculture',
    title: 'Agricultural Twin',
    description: 'Field layout, yield simulation, sensor sync',
  },
  {
    slug: 'iot',
    title: 'Connected Devices',
    description: 'Device topology, telemetry binding, live state',
  },
  {
    slug: 'robotics',
    title: 'Robotics Cell',
    description: 'URDF import, kinematics, motion planning',
  },
  {
    slug: 'science',
    title: 'Scientific Visualization',
    description: 'Dataset import, volumetric rendering, measurement',
  },
  {
    slug: 'creator',
    title: 'Creator Studio',
    description: 'Asset authoring, publishing, storefront export',
  },
  {
    slug: 'hologram',
    title: 'Hologram Pipeline',
    description: 'Quilt and MV-HEVC compilation, display targets',
  },
];

/** Every vertical slug, in declaration order. */
export const INDUSTRY_VERTICAL_SLUGS: readonly string[] = INDUSTRY_VERTICALS.map(
  (vertical) => vertical.slug
);

/** Look one up, or `undefined` when the slug names no vertical we serve. */
export function findIndustryVertical(slug: string): IndustryVertical | undefined {
  return INDUSTRY_VERTICALS.find((vertical) => vertical.slug === slug);
}

/**
 * Is this a vertical we actually serve?
 *
 * The portal calls this and refuses anything else with `notFound()`. A wrong
 * address must look wrong.
 */
export function isKnownIndustryVertical(slug: string): boolean {
  return findIndustryVertical(slug) !== undefined;
}
