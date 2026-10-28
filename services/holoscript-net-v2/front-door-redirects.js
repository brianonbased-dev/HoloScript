// TEMPORARY front-door redirects (Growth & Compliance decision). These are
// 307 (temporary) redirects on purpose (permanent: false) so browsers and
// crawlers do not cache them; remove once holoscript.net serves its own
// getting-started and docs. Kept out of next.config.js so that file exports
// only a valid Next config.
// '/docs/:path*' also matches bare '/docs' (the :path* segment is optional).
const README_URL = 'https://github.com/brianonbased-dev/HoloScript#readme';

const FRONT_DOOR_REDIRECTS = [
  { source: '/getting-started', destination: 'https://holoscript.studio/install', permanent: false },
  { source: '/docs/:path*', destination: README_URL, permanent: false },
];

module.exports = { FRONT_DOOR_REDIRECTS, README_URL };
