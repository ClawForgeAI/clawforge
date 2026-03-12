# Contributing to ClawForge

Thank you for your interest in contributing to ClawForge! This guide covers the development setup and standards.

## Prerequisites

- Node.js 22+
- pnpm 9+
- PostgreSQL 15+ (for server development)
- pre-commit (optional, for git hooks)

## Getting Started

```bash
# Clone the repository
git clone https://github.com/ClawForgeAI/clawforge.git
cd clawforge

# Install dependencies
pnpm install

# Set up pre-commit hooks (optional but recommended)
pre-commit install
```

## Project Structure

```
clawforge/
├── plugin/    # @clawforgeai/clawforge — OpenClaw plugin
├── server/    # @ClawForgeAI/clawforge-server — Control plane API
├── admin/     # @ClawForgeAI/clawforge-admin — Admin dashboard (Next.js)
```

## Development

```bash
# Start the server in dev mode
pnpm dev:server

# Start the admin dashboard in dev mode
pnpm dev:admin

# Run tests
pnpm test                                              # Plugin tests
pnpm --filter @ClawForgeAI/clawforge-server test       # Server tests
pnpm --filter @ClawForgeAI/clawforge-admin build       # Admin build check
```

## Code Quality

### Linting

We use ESLint with TypeScript support across all packages.

```bash
# Check for lint errors
pnpm lint

# Auto-fix lint errors
pnpm lint:fix
```

### Formatting

We use Prettier for consistent code formatting.

```bash
# Format all files
pnpm format

# Check formatting without making changes
pnpm format:check
```

### Pre-commit Hooks

If you have [pre-commit](https://pre-commit.com/) installed, hooks will automatically check for:

- Trailing whitespace
- Missing end-of-file newlines
- Valid YAML and JSON
- Merge conflict markers
- Accidental secrets

## Pull Requests

1. Create a feature branch from `main`
2. Make your changes
3. Run `pnpm lint` and `pnpm format` before committing
4. Ensure tests pass
5. Open a PR against `main`

## Commit Messages

Use clear, descriptive commit messages. Prefix with the area of change when helpful:

- `feat: add new feature`
- `fix: resolve bug in policy service`
- `docs: update contributing guide`
