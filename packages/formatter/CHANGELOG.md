# @holoscript/formatter

## 6.0.4

### Patch Changes

- Rebuild and republish the formatter package with the CommonJS entry files
  declared by its manifest (`dist/index.js` and `dist/cli.js`) so downstream
  registry consumers such as `@holoscript/cli` can cold-start without the
  monorepo.
