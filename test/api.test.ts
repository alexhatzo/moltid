/**
 * API Integration Tests for MoltID
 *
 * Tests for all API routes including agent CRUD, trust endpoints, vouching, and health.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import {
  setupTestDb,
  cleanupTestDb,
  seedTestData,
  createTestAgent,
  createTestVouch,
} from './setup';
import {
  SAMPLE_AGENTS,
  VALID_AGENT_INPUTS,
} from './fixtures';
import type { ApiResponse, AgentPublic, TrustDetails } from '../src/types';

// Response types for API calls
interface ErrorResponse {
  success: false;
  error: { code: string; message: string };
}

interface VouchResponse {
  vouch_added: boolean;
  new_trust_score: number;
}

interface HealthResponse {
  status: string;
  timestamp: string;
  version: string;
}

interface RootResponse {
  name: string;
  version: string;
  docs: string;
}

/**
 * Helper to make HTTP requests to the Hono app
 */
async function request(
  method: string,
  path: string,
  body?: unknown
): Promise<Response> {
  const init: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) {
    init.body = JSON.stringify(body);
  }
  return app.fetch(
    new Request(`http://localhost${path}`, init),
    env
  );
}

/**
 * Helper to get typed JSON from response
 */
async function getJson<T = unknown>(res: Response): Promise<T> {
  return res.json() as Promise<T>;
}

describe('API Integration Tests', () => {
  beforeEach(async () => {
    await setupTestDb(env.DB);
    await cleanupTestDb(env.DB);
  });

  // ============================================================
  // POST /v1/agents - Create agent
  // ============================================================
  describe('POST /v1/agents', () => {
    it('creates agent successfully with minimal input (201)', async () => {
      const res = await request('POST', '/v1/agents', {});

      expect(res.status).toBe(201);
      const json = await res.json() as ApiResponse<AgentPublic>;
      expect(json.success).toBe(true);
      expect(json.data).toBeDefined();
      expect(json.data!.id).toMatch(/^mlt_/);
      expect(json.data!.status).toBe('pending');
      expect(json.data!.trust_score).toBe(0);
    });

    it('creates agent with moltbook username (201)', async () => {
      const res = await request('POST', '/v1/agents', VALID_AGENT_INPUTS.withMoltbook);

      expect(res.status).toBe(201);
      const json = await res.json() as ApiResponse<AgentPublic>;
      expect(json.success).toBe(true);
      expect(json.data!.moltbook_username).toBe('test_user');
    });

    it('creates agent with public key (201)', async () => {
      const res = await request('POST', '/v1/agents', VALID_AGENT_INPUTS.withPublicKey);

      expect(res.status).toBe(201);
      const json = await res.json() as ApiResponse<AgentPublic>;
      expect(json.success).toBe(true);
      // public_key is not exposed in public representation
      expect(json.data!.id).toBeDefined();
    });

    it('creates agent with capabilities (201)', async () => {
      const res = await request('POST', '/v1/agents', VALID_AGENT_INPUTS.withCapabilities);

      expect(res.status).toBe(201);
      const json = await res.json() as ApiResponse<AgentPublic>;
      expect(json.success).toBe(true);
      expect(json.data!.capabilities).toEqual(['testing', 'automation']);
    });

    it('creates agent with complete data (201)', async () => {
      const res = await request('POST', '/v1/agents', VALID_AGENT_INPUTS.complete);

      expect(res.status).toBe(201);
      const json = await res.json() as ApiResponse<AgentPublic>;
      expect(json.success).toBe(true);
      expect(json.data!.moltbook_username).toBe('complete_agent');
      expect(json.data!.capabilities).toEqual(['code_review', 'testing', 'deployment']);
    });

    it('returns agent with ID in response', async () => {
      const res = await request('POST', '/v1/agents', {});

      expect(res.status).toBe(201);
      const json = await res.json() as ApiResponse<AgentPublic>;
      expect(json.data!.id).toBeDefined();
      expect(typeof json.data!.id).toBe('string');
      expect(json.data!.id.startsWith('mlt_')).toBe(true);
    });

    it('handles duplicate moltbook username (409)', async () => {
      // First creation
      await request('POST', '/v1/agents', { moltbook_username: 'duplicate_user' });

      // Second creation with same username
      const res = await request('POST', '/v1/agents', { moltbook_username: 'duplicate_user' });

      expect(res.status).toBe(409);
      const json = await res.json() as ErrorResponse;
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('already_exists');
      expect(json.error.message).toContain('Moltbook username already registered');
    });

    it('allows multiple agents without moltbook username', async () => {
      // Create first agent without username
      const res1 = await request('POST', '/v1/agents', {});
      expect(res1.status).toBe(201);

      // Create second agent without username
      const res2 = await request('POST', '/v1/agents', {});
      expect(res2.status).toBe(201);

      // Should have different IDs
      const json1 = await res1.json() as ApiResponse<AgentPublic>;
      const json2 = await res2.json() as ApiResponse<AgentPublic>;
      expect(json1.data!.id).not.toBe(json2.data!.id);
    });
  });

  // ============================================================
  // GET /v1/agents/:id - Get agent by ID
  // ============================================================
  describe('GET /v1/agents/:id', () => {
    it('returns agent when found (200)', async () => {
      await seedTestData(env.DB, { agents: true, vouches: false });

      const res = await request('GET', '/v1/agents/mlt_verified_001');

      expect(res.status).toBe(200);
      const json = await res.json() as ApiResponse<AgentPublic>;
      expect(json.success).toBe(true);
      expect(json.data!.id).toBe('mlt_verified_001');
      expect(json.data!.moltbook_username).toBe('alice_agent');
      expect(json.data!.moltbook_verified).toBe(true);
    });

    it('returns 404 when agent not found', async () => {
      const res = await request('GET', '/v1/agents/mlt_nonexistent_999');

      expect(res.status).toBe(404);
      const json = await res.json() as ErrorResponse;
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('not_found');
      expect(json.error.message).toBe('Agent not found');
    });

    it('returns public representation only', async () => {
      await seedTestData(env.DB, { agents: true, vouches: false });

      const res = await request('GET', '/v1/agents/mlt_verified_001');

      expect(res.status).toBe(200);
      const json = await res.json() as ApiResponse<AgentPublic & Record<string, unknown>>;
      // Public fields should exist
      expect(json.data!.id).toBeDefined();
      expect(json.data!.moltbook_username).toBeDefined();
      expect(json.data!.moltbook_verified).toBeDefined();
      expect(json.data!.capabilities).toBeDefined();
      expect(json.data!.trust_score).toBeDefined();
      expect(json.data!.vouch_count).toBeDefined();
      expect(json.data!.status).toBeDefined();
      expect(json.data!.created_at).toBeDefined();
      // Private fields should not exist
      expect(json.data!.verification_code).toBeUndefined();
      expect(json.data!.public_key).toBeUndefined();
      expect(json.data!.moltbook_karma).toBeUndefined();
    });
  });

  // ============================================================
  // GET /v1/agents/moltbook/:username - Get agent by Moltbook username
  // ============================================================
  describe('GET /v1/agents/moltbook/:username', () => {
    it('returns agent when found (200)', async () => {
      await seedTestData(env.DB, { agents: true, vouches: false });

      const res = await request('GET', '/v1/agents/moltbook/alice_agent');

      expect(res.status).toBe(200);
      const json = await res.json() as ApiResponse<AgentPublic>;
      expect(json.success).toBe(true);
      expect(json.data!.moltbook_username).toBe('alice_agent');
      expect(json.data!.id).toBe('mlt_verified_001');
    });

    it('returns 404 when username not found', async () => {
      await seedTestData(env.DB, { agents: true, vouches: false });

      const res = await request('GET', '/v1/agents/moltbook/nonexistent_user');

      expect(res.status).toBe(404);
      const json = await res.json() as ErrorResponse;
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('not_found');
      expect(json.error.message).toBe('Agent not found');
    });

    it('returns correct agent for each username', async () => {
      await seedTestData(env.DB, { agents: true, vouches: false });

      const res1 = await request('GET', '/v1/agents/moltbook/alice_agent');
      const res2 = await request('GET', '/v1/agents/moltbook/bob_helper');

      const json1 = await res1.json() as ApiResponse<AgentPublic>;
      const json2 = await res2.json() as ApiResponse<AgentPublic>;

      expect(json1.data!.id).toBe('mlt_verified_001');
      expect(json2.data!.id).toBe('mlt_verified_002');
    });
  });

  // ============================================================
  // GET /v1/agents - List agents
  // ============================================================
  describe('GET /v1/agents', () => {
    it('lists agents', async () => {
      await seedTestData(env.DB, { agents: true, vouches: false });

      const res = await request('GET', '/v1/agents');

      expect(res.status).toBe(200);
      const json = await res.json() as ApiResponse<AgentPublic[]>;
      expect(json.success).toBe(true);
      expect(Array.isArray(json.data)).toBe(true);
      // Only active agents are returned by default
      expect(json.data!.length).toBeGreaterThan(0);
    });

    it('filters by verified status', async () => {
      await seedTestData(env.DB, { agents: true, vouches: false });

      const res = await request('GET', '/v1/agents?verified=true');

      expect(res.status).toBe(200);
      const json = await res.json() as ApiResponse<AgentPublic[]>;
      expect(json.success).toBe(true);
      // All returned agents should be verified
      for (const agent of json.data!) {
        expect(agent.moltbook_verified).toBe(true);
      }
    });

    it('filters by minimum trust score', async () => {
      await seedTestData(env.DB, { agents: true, vouches: false });

      const res = await request('GET', '/v1/agents?min_trust=50');

      expect(res.status).toBe(200);
      const json = await res.json() as ApiResponse<AgentPublic[]>;
      expect(json.success).toBe(true);
      // All returned agents should have trust_score >= 50
      for (const agent of json.data!) {
        expect(agent.trust_score).toBeGreaterThanOrEqual(50);
      }
    });

    it('filters by capability', async () => {
      await seedTestData(env.DB, { agents: true, vouches: false });

      const res = await request('GET', '/v1/agents?capability=code_review');

      expect(res.status).toBe(200);
      const json = await res.json() as ApiResponse<AgentPublic[]>;
      expect(json.success).toBe(true);
      // All returned agents should have code_review capability
      for (const agent of json.data!) {
        expect(agent.capabilities).toContain('code_review');
      }
    });

    it('respects limit parameter', async () => {
      await seedTestData(env.DB, { agents: true, vouches: false });

      const res = await request('GET', '/v1/agents?limit=2');

      expect(res.status).toBe(200);
      const json = await res.json() as ApiResponse<AgentPublic[]>;
      expect(json.success).toBe(true);
      expect(json.data!.length).toBeLessThanOrEqual(2);
    });

    it('respects offset parameter for pagination', async () => {
      await seedTestData(env.DB, { agents: true, vouches: false });

      // Get first page
      const res1 = await request('GET', '/v1/agents?limit=2&offset=0');
      const json1 = await res1.json() as ApiResponse<AgentPublic[]>;

      // Get second page
      const res2 = await request('GET', '/v1/agents?limit=2&offset=2');
      const json2 = await res2.json() as ApiResponse<AgentPublic[]>;

      // Pages should not overlap
      const ids1 = json1.data!.map((a) => a.id);
      const ids2 = json2.data!.map((a) => a.id);

      for (const id of ids1) {
        expect(ids2).not.toContain(id);
      }
    });

    it('combines multiple filters', async () => {
      await seedTestData(env.DB, { agents: true, vouches: false });

      const res = await request('GET', '/v1/agents?verified=true&min_trust=60');

      expect(res.status).toBe(200);
      const json = await res.json() as ApiResponse<AgentPublic[]>;
      expect(json.success).toBe(true);
      for (const agent of json.data!) {
        expect(agent.moltbook_verified).toBe(true);
        expect(agent.trust_score).toBeGreaterThanOrEqual(60);
      }
    });

    it('orders by trust score descending', async () => {
      await seedTestData(env.DB, { agents: true, vouches: false });

      const res = await request('GET', '/v1/agents');

      expect(res.status).toBe(200);
      const json = await res.json() as ApiResponse<AgentPublic[]>;
      expect(json.success).toBe(true);

      // Verify descending order
      for (let i = 1; i < json.data!.length; i++) {
        expect(json.data![i - 1].trust_score).toBeGreaterThanOrEqual(json.data![i].trust_score);
      }
    });

    it('caps limit at 100', async () => {
      await seedTestData(env.DB, { agents: true, vouches: false });

      const res = await request('GET', '/v1/agents?limit=200');

      expect(res.status).toBe(200);
      const json = await res.json() as ApiResponse<AgentPublic[]>;
      expect(json.success).toBe(true);
      // Even with limit=200, should be capped at 100
      expect(json.data!.length).toBeLessThanOrEqual(100);
    });

    it('only returns active agents by default', async () => {
      await seedTestData(env.DB, { agents: true, vouches: false });

      const res = await request('GET', '/v1/agents');

      expect(res.status).toBe(200);
      const json = await res.json() as ApiResponse<AgentPublic[]>;
      expect(json.success).toBe(true);

      // All returned agents should be active
      for (const agent of json.data!) {
        expect(agent.status).toBe('active');
      }

      // Specifically check that suspended/pending agents are not returned
      const ids = json.data!.map((a) => a.id);
      expect(ids).not.toContain('mlt_suspended_001');
      expect(ids).not.toContain('mlt_pending_001');
    });
  });

  // ============================================================
  // GET /v1/agents/:id/trust - Get trust details
  // ============================================================
  describe('GET /v1/agents/:id/trust', () => {
    it('returns trust details (200)', async () => {
      await seedTestData(env.DB, { agents: true, vouches: true });

      const res = await request('GET', '/v1/agents/mlt_verified_001/trust');

      expect(res.status).toBe(200);
      const json = await res.json() as ApiResponse<TrustDetails>;
      expect(json.success).toBe(true);
      expect(json.data).toBeDefined();
      expect(json.data!.score).toBeDefined();
      expect(json.data!.factors).toBeDefined();
      expect(json.data!.factors.moltbook_verified).toBeDefined();
      expect(json.data!.factors.karma).toBeDefined();
      expect(json.data!.factors.age).toBeDefined();
      expect(json.data!.factors.vouches).toBeDefined();
    });

    it('returns 404 for unknown agent', async () => {
      const res = await request('GET', '/v1/agents/mlt_nonexistent_999/trust');

      expect(res.status).toBe(404);
      const json = await res.json() as ErrorResponse;
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('not_found');
    });

    it('returns correct factors for verified agent', async () => {
      await seedTestData(env.DB, { agents: true, vouches: true });

      const res = await request('GET', '/v1/agents/mlt_verified_001/trust');

      expect(res.status).toBe(200);
      const json = await res.json() as ApiResponse<TrustDetails>;
      expect(json.data!.moltbook_verified).toBe(true);
      expect(json.data!.factors.moltbook_verified).toBe(20);
    });

    it('returns correct factors for unverified agent', async () => {
      await seedTestData(env.DB, { agents: true, vouches: true });

      const res = await request('GET', '/v1/agents/mlt_unverified_001/trust');

      expect(res.status).toBe(200);
      const json = await res.json() as ApiResponse<TrustDetails>;
      expect(json.data!.moltbook_verified).toBe(false);
      expect(json.data!.factors.moltbook_verified).toBe(0);
    });

    it('includes vouch count in response', async () => {
      await seedTestData(env.DB, { agents: true, vouches: true });

      const res = await request('GET', '/v1/agents/mlt_verified_004/trust');

      expect(res.status).toBe(200);
      const json = await res.json() as ApiResponse<TrustDetails>;
      expect(json.data!.vouch_count).toBeGreaterThan(0);
    });

    it('includes age in days', async () => {
      await seedTestData(env.DB, { agents: true, vouches: false });

      const res = await request('GET', '/v1/agents/mlt_verified_001/trust');

      expect(res.status).toBe(200);
      const json = await res.json() as ApiResponse<TrustDetails>;
      expect(typeof json.data!.age_days).toBe('number');
      expect(json.data!.age_days).toBeGreaterThanOrEqual(0);
    });
  });

  // ============================================================
  // POST /v1/agents/:id/vouch - Vouch for an agent
  // ============================================================
  describe('POST /v1/agents/:id/vouch', () => {
    it('vouch succeeds (200)', async () => {
      // Create verified voucher
      const voucherId = await createTestAgent(env.DB, {
        id: 'mlt_voucher_test',
        moltbook_username: 'voucher_user',
        moltbook_verified: true,
        status: 'active',
      });

      // Create target agent
      const targetId = await createTestAgent(env.DB, {
        id: 'mlt_target_test',
        moltbook_username: 'target_user',
        moltbook_verified: false,
        status: 'active',
      });

      const res = await request('POST', `/v1/agents/${targetId}/vouch`, {
        from_agent_id: voucherId,
      });

      expect(res.status).toBe(200);
      const json = await res.json() as ApiResponse<VouchResponse>;
      expect(json.success).toBe(true);
      expect(json.data!.vouch_added).toBe(true);
      expect(typeof json.data!.new_trust_score).toBe('number');
    });

    it('only verified agents can vouch (403)', async () => {
      // Create unverified voucher
      const unverifiedId = await createTestAgent(env.DB, {
        id: 'mlt_unverified_voucher',
        moltbook_verified: false,
        status: 'active',
      });

      // Create target agent
      const targetId = await createTestAgent(env.DB, {
        id: 'mlt_vouch_target',
        status: 'active',
      });

      const res = await request('POST', `/v1/agents/${targetId}/vouch`, {
        from_agent_id: unverifiedId,
      });

      expect(res.status).toBe(403);
      const json = await res.json() as ErrorResponse;
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('unauthorized');
      expect(json.error.message).toContain('Only verified agents can vouch');
    });

    it('cannot vouch for self (400)', async () => {
      // Create verified agent
      const agentId = await createTestAgent(env.DB, {
        id: 'mlt_self_voucher',
        moltbook_verified: true,
        status: 'active',
      });

      const res = await request('POST', `/v1/agents/${agentId}/vouch`, {
        from_agent_id: agentId,
      });

      expect(res.status).toBe(400);
      const json = await res.json() as ErrorResponse;
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('invalid_vouch');
      expect(json.error.message).toContain('Cannot vouch for yourself');
    });

    it('duplicate vouch returns 409', async () => {
      // Create verified voucher
      const voucherId = await createTestAgent(env.DB, {
        id: 'mlt_dup_voucher',
        moltbook_verified: true,
        status: 'active',
      });

      // Create target agent
      const targetId = await createTestAgent(env.DB, {
        id: 'mlt_dup_target',
        status: 'active',
      });

      // First vouch
      await request('POST', `/v1/agents/${targetId}/vouch`, {
        from_agent_id: voucherId,
      });

      // Second vouch (duplicate)
      const res = await request('POST', `/v1/agents/${targetId}/vouch`, {
        from_agent_id: voucherId,
      });

      expect(res.status).toBe(409);
      const json = await res.json() as ErrorResponse;
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('already_vouched');
    });

    it('returns 404 for nonexistent target agent', async () => {
      // Create verified voucher
      const voucherId = await createTestAgent(env.DB, {
        id: 'mlt_voucher_404',
        moltbook_verified: true,
        status: 'active',
      });

      const res = await request('POST', '/v1/agents/mlt_nonexistent_999/vouch', {
        from_agent_id: voucherId,
      });

      expect(res.status).toBe(404);
      const json = await res.json() as ErrorResponse;
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('not_found');
    });

    it('returns 403 for nonexistent voucher', async () => {
      // Create target agent
      const targetId = await createTestAgent(env.DB, {
        id: 'mlt_target_no_voucher',
        status: 'active',
      });

      const res = await request('POST', `/v1/agents/${targetId}/vouch`, {
        from_agent_id: 'mlt_nonexistent_voucher',
      });

      expect(res.status).toBe(403);
      const json = await res.json() as ErrorResponse;
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('unauthorized');
    });

    it('updates trust score after vouch', async () => {
      // Create verified voucher
      const voucherId = await createTestAgent(env.DB, {
        id: 'mlt_score_voucher',
        moltbook_verified: true,
        status: 'active',
      });

      // Create target agent
      const targetId = await createTestAgent(env.DB, {
        id: 'mlt_score_target',
        moltbook_verified: false,
        moltbook_karma: 0,
        status: 'active',
        created_at: new Date().toISOString(),
      });

      // Get initial trust score
      const beforeRes = await request('GET', `/v1/agents/${targetId}/trust`);
      const beforeJson = await beforeRes.json() as ApiResponse<TrustDetails>;
      const beforeScore = beforeJson.data!.score;

      // Add vouch
      const vouchRes = await request('POST', `/v1/agents/${targetId}/vouch`, {
        from_agent_id: voucherId,
      });
      const vouchJson = await vouchRes.json() as ApiResponse<VouchResponse>;

      // Score should have increased by 5 (1 verified vouch)
      expect(vouchJson.data!.new_trust_score).toBe(beforeScore + 5);
    });
  });

  // ============================================================
  // GET /v1/health - Health check
  // ============================================================
  describe('GET /v1/health', () => {
    it('returns healthy status (200)', async () => {
      await setupTestDb(env.DB);

      const res = await request('GET', '/v1/health');

      expect(res.status).toBe(200);
      const json = await res.json() as HealthResponse;
      expect(json.status).toBe('healthy');
      expect(json.timestamp).toBeDefined();
      expect(json.version).toBe('1.0.0');
    });

    it('returns timestamp in ISO format', async () => {
      await setupTestDb(env.DB);

      const res = await request('GET', '/v1/health');

      expect(res.status).toBe(200);
      const json = await res.json() as HealthResponse;
      expect(() => new Date(json.timestamp)).not.toThrow();
    });
  });

  // ============================================================
  // Error handling
  // ============================================================
  describe('Error handling', () => {
    it('returns 404 for unknown routes', async () => {
      const res = await request('GET', '/v1/unknown/route');

      expect(res.status).toBe(404);
      const json = await res.json() as ErrorResponse;
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('not_found');
      expect(json.error.message).toBe('Route not found');
    });

    it('returns 404 for completely unknown paths', async () => {
      const res = await request('GET', '/nonexistent');

      expect(res.status).toBe(404);
      const json = await res.json() as ErrorResponse;
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('not_found');
    });

    it('returns proper error format for all errors', async () => {
      const res = await request('GET', '/v1/agents/mlt_nonexistent');

      expect(res.status).toBe(404);
      const json = await res.json() as ErrorResponse;
      expect(json).toHaveProperty('success');
      expect(json).toHaveProperty('error');
      expect(json.error).toHaveProperty('code');
      expect(json.error).toHaveProperty('message');
    });

    it('handles invalid JSON in request body', async () => {
      const init: RequestInit = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid json',
      };
      const res = await app.fetch(
        new Request('http://localhost/v1/agents', init),
        env
      );

      // Zod validator should reject invalid JSON
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  // ============================================================
  // Root endpoint
  // ============================================================
  describe('GET /', () => {
    it('returns API info when accessed via api subdomain', async () => {
      // Root returns JSON only for api.* hosts
      const res = await app.fetch(
        new Request('http://localhost/', {
          method: 'GET',
          headers: { 'Host': 'api.moltid.dev' },
        }),
        env
      );

      expect(res.status).toBe(200);
      const json = await res.json() as RootResponse;
      expect(json.name).toBe('MoltID API');
      expect(json.version).toBe('1.0.0');
      expect(json.docs).toBeDefined();
    });

    it('returns HTML landing page for non-api hosts', async () => {
      const res = await app.fetch(
        new Request('http://localhost/', {
          method: 'GET',
          headers: { 'Host': 'moltid.dev' },
        }),
        env
      );

      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('MoltID');
    });
  });
});
