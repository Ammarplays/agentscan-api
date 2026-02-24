<![CDATA[# Contributing to AgentsCan Cloud API

Thank you for your interest in contributing! This guide will help you get started.

## Development Setup

```bash
# Clone the repo
git clone https://github.com/Ammarplays/agentscan-api.git
cd agentscan-api

# Install dependencies
npm install

# Start PostgreSQL
brew services start postgresql@17  # macOS
# or: docker compose up -d db

# Create database
createdb agentscan

# Copy environment config
cp .env.example .env

# Push schema
npx drizzle-kit push

# Seed test data
npm run seed

# Start dev server (with hot reload)
npm run dev
```

## Code Style

- **TypeScript** — Strict mode enabled
- **Fastify** — Use route schemas for validation
- **Drizzle ORM** — Use the query builder, avoid raw SQL
- **Naming:** camelCase for variables/functions, snake_case for API response fields
- **Error format:** `{ error: string, code: string, status: number }`

## Running Tests

```bash
# Run all tests
npm test

# Run with watch mode
npx vitest

# Run a specific test file
npx vitest run src/__tests__/requests.test.ts
```

## Pull Request Process

1. **Fork** the repo and create a feature branch from `main`
2. **Write tests** for any new functionality
3. **Run the test suite** — all 32 tests must pass
4. **Run type checking:** `npm run typecheck`
5. **Submit a PR** with a clear description of the changes

### PR Title Format

```
feat: add support for batch scan requests
fix: handle expired requests in device API
docs: update webhook examples
test: add edge case tests for cleanup service
```

## Issue Templates

### Bug Report

```
**Describe the bug:** A clear description of what the bug is.
**To Reproduce:** Steps to reproduce the behavior.
**Expected behavior:** What you expected to happen.
**Environment:** Node.js version, OS, PostgreSQL version.
**Logs:** Any relevant error logs.
```

### Feature Request

```
**Is your feature request related to a problem?** A clear description.
**Describe the solution you'd like:** What you want to happen.
**Describe alternatives you've considered:** Other approaches.
**Additional context:** Any other context.
```

## Project Structure

```
src/
├── __tests__/          # Test files
├── db/
│   ├── schema.ts       # Drizzle schema definitions
│   └── index.ts        # Database connection
├── plugins/
│   └── auth.ts         # Authentication middleware
├── routes/
│   ├── health.ts       # Health check endpoint
│   ├── keys.ts         # API key management
│   ├── devices.ts      # Device pairing
│   ├── requests.ts     # Scan request management
│   ├── results.ts      # Scan result retrieval
│   └── device-api.ts   # Device-side API
├── services/
│   ├── cleanup.ts      # Auto-cleanup job
│   ├── push.ts         # Push notification delivery
│   ├── storage.ts      # File storage
│   └── webhook.ts      # Webhook delivery
├── utils/
│   └── crypto.ts       # Hashing & key generation
├── app.ts              # Fastify app setup
├── config.ts           # Configuration
├── index.ts            # Entry point
└── seed.ts             # Database seeder
```

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
]]>