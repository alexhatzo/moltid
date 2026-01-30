import { nanoid } from 'nanoid';
import type { Agent, AgentCreateInput, AgentPublic } from '../types';

// Timeout for Moltbook API requests (300 seconds to handle slow responses)
const MOLTBOOK_TIMEOUT_MS = 300000;

/**
 * Fetch with timeout using AbortController
 */
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs: number = MOLTBOOK_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * AgentService handles all CRUD operations and search for MoltID agents.
 * Uses D1 (Cloudflare's SQLite) as the backing store.
 */
export class AgentService {
  constructor(private db: D1Database) {}

  /**
   * Create a new agent with auto-generated ID and verification code.
   * @param input - Agent creation input (moltbook_username, public_key, capabilities)
   * @returns The created agent
   */
  async create(input: AgentCreateInput): Promise<Agent> {
    const id = `mlt_${nanoid(12)}`;
    const verification_code = `moltid-verify:${id}`;
    const capabilities = JSON.stringify(input.capabilities || []);
    
    await this.db.prepare(`
      INSERT INTO agents (id, moltbook_username, public_key, capabilities, verification_code)
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      id,
      input.moltbook_username || null,
      input.public_key || null,
      capabilities,
      verification_code
    ).run();
    
    return this.getById(id) as Promise<Agent>;
  }

  /**
   * Fetch an agent by their MoltID.
   * @param id - The agent's MoltID (e.g., "mlt_xxxxxxxxxxxx")
   * @returns The agent or null if not found
   */
  async getById(id: string): Promise<Agent | null> {
    const result = await this.db.prepare(
      'SELECT * FROM agents WHERE id = ?'
    ).bind(id).first();
    
    return result ? this.parseAgent(result) : null;
  }

  /**
   * Fetch an agent by their Moltbook username.
   * @param username - The Moltbook username
   * @returns The agent or null if not found
   */
  async getByMoltbook(username: string): Promise<Agent | null> {
    const result = await this.db.prepare(
      'SELECT * FROM agents WHERE moltbook_username = ?'
    ).bind(username).first();
    
    return result ? this.parseAgent(result) : null;
  }

  /**
   * Search and filter agents with pagination.
   * @param query - Search parameters (verified, min_trust, capability, limit, offset)
   * @returns Array of public agent representations
   */
  async search(query: {
    verified?: boolean;
    min_trust?: number;
    capability?: string;
    limit: number;
    offset: number;
  }): Promise<AgentPublic[]> {
    let sql = 'SELECT * FROM agents WHERE status = ?';
    const params: (string | number)[] = ['active'];
    
    if (query.verified !== undefined) {
      sql += ' AND moltbook_verified = ?';
      params.push(query.verified ? 1 : 0);
    }
    
    if (query.min_trust !== undefined) {
      sql += ' AND trust_score >= ?';
      params.push(query.min_trust);
    }
    
    if (query.capability) {
      sql += ' AND capabilities LIKE ?';
      params.push(`%"${query.capability}"%`);
    }
    
    sql += ' ORDER BY trust_score DESC LIMIT ? OFFSET ?';
    params.push(query.limit, query.offset);
    
    const results = await this.db.prepare(sql).bind(...params).all();
    return (results.results || []).map((r: unknown) => this.toPublic(this.parseAgent(r)));
  }

  /**
   * Update agent fields.
   * @param id - The agent's MoltID
   * @param updates - Partial agent object with fields to update
   */
  async update(id: string, updates: Partial<Agent>): Promise<void> {
    const fields: string[] = [];
    const values: (string | number | null)[] = [];
    
    if (updates.moltbook_verified !== undefined) {
      fields.push('moltbook_verified = ?');
      values.push(updates.moltbook_verified ? 1 : 0);
    }
    if (updates.moltbook_karma !== undefined) {
      fields.push('moltbook_karma = ?');
      values.push(updates.moltbook_karma);
    }
    if (updates.trust_score !== undefined) {
      fields.push('trust_score = ?');
      values.push(updates.trust_score);
    }
    if (updates.vouch_count !== undefined) {
      fields.push('vouch_count = ?');
      values.push(updates.vouch_count);
    }
    if (updates.status !== undefined) {
      fields.push('status = ?');
      values.push(updates.status);
    }
    if (updates.capabilities !== undefined) {
      fields.push('capabilities = ?');
      values.push(JSON.stringify(updates.capabilities));
    }
    if (updates.public_key !== undefined) {
      fields.push('public_key = ?');
      values.push(updates.public_key);
    }
    
    if (fields.length === 0) {
      return; // Nothing to update
    }
    
    fields.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(id);
    
    await this.db.prepare(
      `UPDATE agents SET ${fields.join(', ')} WHERE id = ?`
    ).bind(...values).run();
  }

  /**
   * Add a vouch relationship from one agent to another.
   * @param fromId - The vouching agent's MoltID
   * @param toId - The agent being vouched for's MoltID
   */
  async addVouch(fromId: string, toId: string): Promise<void> {
    const id = `vch_${nanoid(12)}`;
    
    await this.db.prepare(`
      INSERT INTO vouches (id, from_agent_id, to_agent_id)
      VALUES (?, ?, ?)
    `).bind(id, fromId, toId).run();
    
    // Update vouch count on the target agent
    await this.db.prepare(`
      UPDATE agents SET vouch_count = vouch_count + 1, updated_at = ? WHERE id = ?
    `).bind(new Date().toISOString(), toId).run();
  }

  /**
   * Get all agent IDs that have vouched for a given agent.
   * @param agentId - The agent's MoltID
   * @returns Array of voucher agent IDs
   */
  async getVouches(agentId: string): Promise<string[]> {
    const results = await this.db.prepare(
      'SELECT from_agent_id FROM vouches WHERE to_agent_id = ?'
    ).bind(agentId).all();
    
    return (results.results || []).map((r: unknown) => (r as { from_agent_id: string }).from_agent_id);
  }

  /**
   * Verify an agent's Moltbook profile by checking for the verification code in a post.
   * Uses Moltbook's public API: https://www.moltbook.com/skill.md
   * @param agent - The agent to verify
   * @returns Verification result with verified status and karma if successful
   */
  async verifyMoltbook(agent: Agent): Promise<{ verified: boolean; karma?: number }> {
    if (!agent.moltbook_username || !agent.verification_code) {
      return { verified: false };
    }
    
    // Use Moltbook's profile API which includes recent posts
    const url = `https://www.moltbook.com/api/v1/agents/profile?name=${encodeURIComponent(agent.moltbook_username)}`;
    
    try {
      console.log(`Verifying Moltbook user: ${agent.moltbook_username}`);
      console.log(`Looking for code: ${agent.verification_code}`);
      console.log(`Fetching: ${url}`);
      
      const response = await fetchWithTimeout(
        url,
        { headers: { 'User-Agent': 'MoltID/1.0' } }
      );
      
      if (!response.ok) {
        console.error(`Moltbook API failed with status: ${response.status}`);
        return { verified: false };
      }
      
      const data = await response.json() as {
        success: boolean;
        agent?: { karma?: number };
        recentPosts?: Array<{ content?: string; title?: string }>;
      };
      
      if (!data.success) {
        console.error('Moltbook API returned success: false');
        return { verified: false };
      }
      
      const karma = data.agent?.karma || 0;
      console.log(`Agent karma: ${karma}`);
      
      // Check recent posts for verification code
      const posts = data.recentPosts || [];
      console.log(`Checking ${posts.length} recent posts`);
      
      for (const post of posts) {
        if (post.content?.includes(agent.verification_code) || 
            post.title?.includes(agent.verification_code)) {
          console.log('Verification code found in post!');
          return { verified: true, karma };
        }
      }
      
      console.log('Verification code not found in recent posts');
      return { verified: false };
    } catch (error) {
      console.error('Moltbook verification error:', error);
      return { verified: false };
    }
  }

  /**
   * Parse a database row into an Agent object.
   * Handles type conversions (e.g., moltbook_verified from 0/1 to boolean).
   * @param row - Raw database row
   * @returns Typed Agent object
   */
  parseAgent(row: unknown): Agent {
    const r = row as Record<string, unknown>;
    return {
      id: r.id as string,
      moltbook_username: r.moltbook_username as string | null,
      moltbook_verified: !!(r.moltbook_verified),
      moltbook_karma: r.moltbook_karma as number | null,
      public_key: r.public_key as string | null,
      capabilities: r.capabilities ? JSON.parse(r.capabilities as string) : [],
      trust_score: (r.trust_score as number) || 0,
      vouch_count: (r.vouch_count as number) || 0,
      status: r.status as 'pending' | 'active' | 'suspended',
      verification_code: r.verification_code as string | null,
      created_at: r.created_at as string,
      updated_at: r.updated_at as string,
    };
  }

  /**
   * Convert an Agent to its public representation (hides sensitive fields).
   * @param agent - The full agent object
   * @returns Public agent representation
   */
  toPublic(agent: Agent): AgentPublic {
    return {
      id: agent.id,
      moltbook_username: agent.moltbook_username,
      moltbook_verified: agent.moltbook_verified,
      capabilities: agent.capabilities,
      trust_score: agent.trust_score,
      vouch_count: agent.vouch_count,
      status: agent.status,
      created_at: agent.created_at,
    };
  }
}
