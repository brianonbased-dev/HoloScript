# Changesets

This directory is used by [Changesets](https://github.com/changesets/changesets) to manage versioning and changelogs for the HoloScript monorepo.

## Adding a changeset

```bash
pnpm changeset
```

Follow the prompts to select the packages that changed and describe the changes.

## Version lanes

Which packages share a release line is defined in two files. Read them; a copy of the lists here goes stale (this section once named lanes and packages that no longer exist):

- `scripts/version-policy.json`: the lanes, each with its packages and target major.
- `.changeset/config.json`: the `fixed` and `linked` groups, which decide what bumps together.

Fixed groups always bump together. Linked groups bump together only when one has a major/minor change.
