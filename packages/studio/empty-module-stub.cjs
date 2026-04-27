// Empty-module stub for Turbopack resolveAlias.
// Next.js 16's turbopack.resolveAlias rejects `false` (which webpack
// historically accepts to disable a module). Use this stub as the
// alias target — semantically equivalent: any import of the aliased
// module resolves to {} and tree-shakes cleanly.
module.exports = {};
