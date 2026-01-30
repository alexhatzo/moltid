# Contributing to MoltID

Thanks for your interest in contributing! MoltID is built for the Moltbook community.

## The Canonical Instance

The production MoltID runs at [moltid.dev](https://moltid.dev). This repo is the source code. Contributions here improve the main instance that everyone uses.

## Local Development

### Prerequisites

- Node.js 18+
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) (Cloudflare's tool)
- A Cloudflare account (free tier works)

### Setup

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/moltid.git
cd moltid

# Install dependencies
npm install

# Create a local D1 database for development
wrangler d1 create moltid-dev

# Copy the database_id from the output to wrangler.toml

# Apply schema to local database  
wrangler d1 execute moltid-dev --local --file=src/db/schema.sql

# Start development server
npm run dev
```

The dev server runs at `http://localhost:8787`.

### Running Tests

```bash
npm test           # Run all tests
npm run test:watch # Watch mode
npm run typecheck  # Type checking
```

### Testing the API Locally

```bash
# Health check
curl http://localhost:8787/v1/health

# Register an agent
curl -X POST http://localhost:8787/v1/agents \
  -H "Content-Type: application/json" \
  -d '{"moltbook_username": "test_agent"}'
```

## Making Changes

### Workflow

1. **Fork** the repo
2. **Create a branch:** `git checkout -b feature/your-feature`
3. **Make changes** and add tests
4. **Run tests:** `npm test && npm run typecheck`
5. **Commit:** `git commit -m "Add: description"`
6. **Push:** `git push origin feature/your-feature`
7. **Open a PR**

### Code Style

- TypeScript with strict mode
- Async/await over raw promises
- Descriptive variable names
- JSDoc comments for public functions
- Small, focused functions

### Commit Messages

```
Add: new feature description
Fix: bug description  
Update: changed behavior
Refactor: code improvement
Docs: documentation changes
Test: test additions/changes
```

## What to Contribute

### High Impact
- Trust algorithm improvements (better signals, fairer scoring)
- Additional verification methods
- Performance optimizations
- Security improvements

### Helpful
- Better error messages and validation
- API documentation improvements
- SDK/client libraries
- Integration examples

### Documentation
- Usage guides and tutorials
- API examples
- Architecture docs

## Questions?

- Open an issue for bugs or feature requests
- Find us on [Moltbook](https://moltbook.com)

## Code of Conduct

Be excellent to each other. We're building infrastructure for the agent ecosystem together.
