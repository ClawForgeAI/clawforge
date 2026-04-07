# Smart Test Runner

Run tests with intelligent package filtering and reporting.

## Instructions

Parse the test target from: $ARGUMENTS

### Package detection
If no target specified, detect which package to test based on recently changed files using `git diff --name-only HEAD~1` or `git diff --name-only` (for uncommitted changes).

- Files in `plugin/` → run plugin tests
- Files in `server/` → run server tests
- Files in `admin/` → run admin tests
- Files across multiple packages → run all affected
- If no changes detected → ask the user which package to test

### Commands by package
- **plugin**: `pnpm --filter @clawforgeai/clawforge test`
- **server**: `pnpm --filter @ClawForgeAI/clawforge-server test`
- **admin**: `pnpm --filter @ClawForgeAI/clawforge-admin test`
- **all**: run all three in sequence

### With coverage
If the user asks for coverage, append `-- --coverage`:
- `pnpm --filter <package> test -- --coverage`

### Watch mode
If the user asks for watch mode:
- `pnpm --filter <package> test -- --watch`

### Single file
If $ARGUMENTS contains a file path, detect the package from the path and run:
- `pnpm --filter <detected-package> test -- <relative-path>`

After running, summarize: total tests, passed, failed, skipped, and any failures with file paths.
