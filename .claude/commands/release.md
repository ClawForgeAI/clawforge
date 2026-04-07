# Release Workflow

Guide through the changeset-based release process for the @clawforgeai/clawforge plugin.

Note: Only the `plugin/` package is published to npm. Server and admin are excluded (see `.changeset/config.json`).

## Instructions

Determine the release stage from: $ARGUMENTS

If no argument given, ask the user which step they need:

### Step 1: Create changeset (`create`)
1. Ask what changed and whether it's a patch, minor, or major bump
2. Run `pnpm changeset`
3. The user selects `@clawforgeai/clawforge` and bump type interactively
4. Review the generated `.changeset/*.md` file
5. Commit the changeset file

### Step 2: Check pending changesets (`check`)
1. List files in `.changeset/` directory (exclude config.json and README.md)
2. Read each changeset file and summarize pending version bumps
3. Report current plugin version from `plugin/package.json`

### Step 3: Version bump (`version`)
1. Run `pnpm version-packages` to apply changesets
2. Review changes to `plugin/package.json` version and `CHANGELOG.md`
3. Commit the version bump

### Step 4: Verify before publish (`verify`)
1. Run `pnpm --filter @clawforgeai/clawforge build`
2. Run `pnpm --filter @clawforgeai/clawforge test`
3. Report build and test results

Note: Actual npm publishing happens via the GitHub Actions release workflow (`.github/workflows/release.yml`) when the "Version Packages" PR is merged to main.
