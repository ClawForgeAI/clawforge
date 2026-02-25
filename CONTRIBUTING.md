# Contributing to ClawForge

Thanks for your interest in improving ClawForge.

## Development Setup

### Prerequisites

- Node.js 20+
- pnpm
- Docker and Docker Compose

### Run Locally

```bash
git clone https://github.com/ClawForgeAI/clawforge.git
cd clawforge
docker compose up --build
```

Once running:

- Admin console: `http://localhost:4200`
- API: `http://localhost:4100`
- Default login: `admin@clawforge.local` / `clawforge`

## Workflow

1. Fork the repo and create a branch from `main`.
2. Keep your change focused on one bugfix or feature.
3. Add or update tests where relevant.
4. Run checks locally before opening a PR.
5. Open a pull request using the provided template.

## Local Checks

Run the checks relevant to your changes:

```bash
pnpm test
pnpm --filter @ClawForgeAI/clawforge-admin lint
pnpm --filter @ClawForgeAI/clawforge-server build
```

If your change affects runtime behavior, also validate end-to-end with:

```bash
docker compose up --build
```

## Pull Request Guidelines

- Explain the "why" and the user impact.
- Link related issues (`Closes #123`).
- Include screenshots for admin UI changes.
- Note any migration, configuration, or rollout concerns.

## Reporting Issues

- Bug reports: use the Bug Report issue template.
- Feature ideas: use the Feature Request issue template.
- Security vulnerabilities: follow `SECURITY.md` and do not open a public issue.

## Code of Conduct

This project follows `CODE_OF_CONDUCT.md`. By participating, you agree to uphold it.

## License

By contributing, you agree that contributions are licensed under the `MIT` license in `LICENSE`.
