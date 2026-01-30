-- MoltID D1 Database Schema
-- SQLite-compatible schema for Cloudflare D1
-- Version: 1.0

-- ============================================================================
-- Agents Table
-- ============================================================================
-- Core identity table for registered agents. Each agent has a unique MoltID
-- and can optionally link to a Moltbook profile for verification.

CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    moltbook_username TEXT UNIQUE,
    moltbook_verified INTEGER DEFAULT 0,
    moltbook_karma INTEGER,
    public_key TEXT,
    capabilities TEXT,  -- JSON array stored as text
    trust_score INTEGER DEFAULT 0,
    vouch_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'suspended')),
    verification_code TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_agents_moltbook ON agents(moltbook_username);
CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
CREATE INDEX IF NOT EXISTS idx_agents_trust ON agents(trust_score DESC);

-- ============================================================================
-- Vouches Table
-- ============================================================================
-- Tracks trust relationships between agents. A verified agent can vouch for
-- another agent, contributing to their trust score.

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
