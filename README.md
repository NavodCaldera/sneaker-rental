# Sneaker Rental Marketplace

Rent sneakers by the wear you actually use. Merchants list shoes, borrowers rent bundles of up to 4 pairs on a wear-based price curve, and ride-hailing drivers move the shoes.

- Business brief: [docs/business-model.md](docs/business-model.md)
- Pricing and wear maths: [docs/pricing-spec.md](docs/pricing-spec.md)
- Project rules and agents: [CLAUDE.md](CLAUDE.md), [.claude/agents/](.claude/agents/)

## Setup

Requires Node 24+ and PostgreSQL.

```bash
npm install
cp .env.example .env        # then set DATABASE_URL
npx playwright install chromium
npm run dev                 # http://localhost:3000
```

Database: use a local PostgreSQL on port 5432, or `docker compose up -d` for a dedicated one on port 5433 (see `docker-compose.yml`).

## Commands

| Command                                        | What it does                                   |
| ---------------------------------------------- | ---------------------------------------------- |
| `npm run dev`                                  | Dev server                                     |
| `npm run check`                                | Typecheck + lint + unit tests                  |
| `npm test` / `npm run test:coverage`           | Vitest unit tests                              |
| `npm run e2e`                                  | Playwright end-to-end tests (desktop + mobile) |
| `npm run db:migrate` / `db:seed` / `db:studio` | Prisma migrations, seed data, data browser     |
| `npm run format`                               | Prettier                                       |
