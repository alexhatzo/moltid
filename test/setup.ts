/**
 * Test setup and D1 mocking helpers for MoltID
 *
 * Provides utilities for setting up test databases, seeding data,
 * and cleaning up after tests.
 */

import { nanoid } from 'nanoid';
import { SAMPLE_AGENTS, SAMPLE_VOUCHES } from './fixtures';

/**
 * Schema SQL for creating tables in the test database.
 * Matches the production schema from src/db/schema.sql
 */
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    moltbook_username TEXT UNIQUE,
    moltbook_verified INTEGER DEFAULT 0,
    moltbook_karma INTEGER,
    public_key TEXT,
    capabilities TEXT,
    trust_score INTEGER DEFAULT 0,
    vouch_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'suspended')),
    verification_code TEXT,
    api_key_hash TEXT,
    api_key_prefix TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_agents_moltbook ON agents(moltbook_username);
CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
CREATE INDEX IF NOT EXISTS idx_agents_trust ON agents(trust_score DESC);

CREATE TABLE IF NOT EXISTS vouches (
    id TEXT PRIMARY KEY,
    from_agent_id TEXT NOT NULL,
    to_agent_id TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (from_agent_id) REFERENCES agents(id),
    FOREIGN KEY (to_agent_id) REFERENCES agents(id),
    UNIQUE(from_agent_id, to_agent_id)
);

CREATE INDEX IF NOT EXISTS idx_vouches_to ON vouches(to_agent_id);
CREATE INDEX IF NOT EXISTS idx_vouches_from ON vouches(from_agent_id);
`;

/**
 * Sets up the test database with the schema.
 * Call this at the beginning of each test or test suite.
 *
 * @param db - The D1 database instance from the test environment
 */
export async function setupTestDb(db: D1Database): Promise<void> {
  // Split schema into individual statements and execute
  const statements = SCHEMA_SQL
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const statement of statements) {
    await db.prepare(statement).run();
  }
}

/**
 * Seeds the test database with sample agent data.
 * Use this when you need pre-populated data for tests.
 *
 * @param db - The D1 database instance from the test environment
 * @param options - Options for seeding (which agents/vouches to include)
 */
export async function seedTestData(
  db: D1Database,
  options: {
    agents?: boolean;
    vouches?: boolean;
  } = { agents: true, vouches: true }
): Promise<void> {
  if (options.agents) {
    for (const agent of SAMPLE_AGENTS) {
      await db
        .prepare(
          `INSERT INTO agents (
            id, moltbook_username, moltbook_verified, moltbook_karma,
            public_key, capabilities, trust_score, vouch_count, status,
            verification_code, api_key_hash, api_key_prefix, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          agent.id,
          agent.moltbook_username,
          agent.moltbook_verified ? 1 : 0,
          agent.moltbook_karma,
          agent.public_key,
          JSON.stringify(agent.capabilities),
          agent.trust_score,
          agent.vouch_count,
          agent.status,
          agent.verification_code,
          null, // api_key_hash - not set for seeded test data
          null, // api_key_prefix - not set for seeded test data
          agent.created_at,
          agent.updated_at
        )
        .run();
    }
  }

  if (options.vouches) {
    for (const vouch of SAMPLE_VOUCHES) {
      await db
        .prepare(
          `INSERT INTO vouches (id, from_agent_id, to_agent_id, created_at)
           VALUES (?, ?, ?, ?)`
        )
        .bind(vouch.id, vouch.from_agent_id, vouch.to_agent_id, vouch.created_at)
        .run();
    }
  }
}

/**
 * Clears all data from the test database.
 * Call this between tests to ensure isolation.
 *
 * @param db - The D1 database instance from the test environment
 */
export async function cleanupTestDb(db: D1Database): Promise<void> {
  // Delete in order to respect foreign key constraints
  await db.prepare('DELETE FROM vouches').run();
  await db.prepare('DELETE FROM agents').run();
}

/**
 * Completely resets the test database by dropping and recreating tables.
 * Use this for full isolation between test suites.
 *
 * @param db - The D1 database instance from the test environment
 */
export async function resetTestDb(db: D1Database): Promise<void> {
  await db.prepare('DROP TABLE IF EXISTS vouches').run();
  await db.prepare('DROP TABLE IF EXISTS agents').run();
  await setupTestDb(db);
}

/**
 * Helper to create a custom agent for specific test scenarios.
 *
 * @param db - The D1 database instance
 * @param overrides - Partial agent fields to override defaults
 * @returns The created agent's ID
 */
export async function createTestAgent(
  db: D1Database,
  overrides: Partial<{
    id: string;
    moltbook_username: string | null;
    moltbook_verified: boolean;
    moltbook_karma: number | null;
    public_key: string | null;
    capabilities: string[];
    trust_score: number;
    vouch_count: number;
    status: 'pending' | 'active' | 'suspended';
    verification_code: string | null;
    api_key_hash: string | null;
    api_key_prefix: string | null;
    created_at: string;
  }> = {}
): Promise<string> {
  const id = overrides.id || `mlt_test_${Date.now()}`;
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO agents (
        id, moltbook_username, moltbook_verified, moltbook_karma,
        public_key, capabilities, trust_score, vouch_count, status,
        verification_code, api_key_hash, api_key_prefix, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      overrides.moltbook_username ?? null,
      overrides.moltbook_verified ? 1 : 0,
      overrides.moltbook_karma ?? null,
      overrides.public_key ?? null,
      JSON.stringify(overrides.capabilities || []),
      overrides.trust_score ?? 0,
      overrides.vouch_count ?? 0,
      overrides.status ?? 'pending',
      overrides.verification_code ?? `moltid-verify:${id}`,
      overrides.api_key_hash ?? null,
      overrides.api_key_prefix ?? null,
      overrides.created_at ?? now,
      now
    )
    .run();

  return id;
}

/**
 * Helper to create a vouch relationship for testing.
 *
 * @param db - The D1 database instance
 * @param fromId - The vouching agent's ID
 * @param toId - The agent being vouched for
 * @returns The created vouch ID
 */
export async function createTestVouch(
  db: D1Database,
  fromId: string,
  toId: string
): Promise<string> {
  const id = `vch_test_${nanoid(12)}`;

  await db
    .prepare(
      `INSERT INTO vouches (id, from_agent_id, to_agent_id, created_at)
       VALUES (?, ?, ?, ?)`
    )
    .bind(id, fromId, toId, new Date().toISOString())
    .run();

  // Update vouch count on target agent
  await db
    .prepare(`UPDATE agents SET vouch_count = vouch_count + 1 WHERE id = ?`)
    .bind(toId)
    .run();

  return id;
}

/**
 * Helper to get an agent by ID for assertions.
 *
 * @param db - The D1 database instance
 * @param id - The agent's ID
 * @returns The agent record or null
 */
export async function getTestAgent(
  db: D1Database,
  id: string
): Promise<Record<string, unknown> | null> {
  return db.prepare('SELECT * FROM agents WHERE id = ?').bind(id).first();
}

/**
 * Helper to count agents matching criteria.
 *
 * @param db - The D1 database instance
 * @param where - Optional WHERE clause (without WHERE keyword)
 * @returns Count of matching agents
 */
export async function countTestAgents(
  db: D1Database,
  where?: string
): Promise<number> {
  const sql = where
    ? `SELECT COUNT(*) as count FROM agents WHERE ${where}`
    : 'SELECT COUNT(*) as count FROM agents';
  const result = (await db.prepare(sql).first()) as { count: number } | null;
  return result?.count ?? 0;
}
