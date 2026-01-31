/**
 * Agent service unit tests
 *
 * Tests for the AgentService class that handles agent CRUD operations,
 * search, and vouch relationships.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { AgentService } from '../src/services/agent';
import {
  setupTestDb,
  cleanupTestDb,
  seedTestData,
  createTestAgent,
  createTestVouch,
  getTestAgent,
} from './setup';
import {
  SAMPLE_AGENTS,
  VALID_AGENT_INPUTS,
  getSampleAgent,
} from './fixtures';

describe('AgentService', () => {
  let agentService: AgentService;

  beforeEach(async () => {
    await setupTestDb(env.DB);
    await cleanupTestDb(env.DB);
    agentService = new AgentService(env.DB);
  });

  // ============================================================
  // create() tests
  // ============================================================
  describe('create', () => {
    it('creates agent with valid input', async () => {
      const input = {
        moltbook_username: 'test_user',
        public_key: 'pk_test_key_123',
        capabilities: ['testing', 'code_review'],
      };

      const { agent, apiKey } = await agentService.create(input);

      expect(agent).toBeDefined();
      expect(agent.moltbook_username).toBe('test_user');
      expect(agent.public_key).toBe('pk_test_key_123');
      expect(agent.capabilities).toEqual(['testing', 'code_review']);
      expect(agent.status).toBe('pending');
      expect(agent.moltbook_verified).toBe(false);
      expect(agent.trust_score).toBe(0);
      expect(agent.vouch_count).toBe(0);
      // Verify API key format
      expect(apiKey).toMatch(/^moltid_key_[a-zA-Z0-9_-]{32}$/);
    });

    it('generates correct ID format (mlt_xxx)', async () => {
      const { agent } = await agentService.create({});

      expect(agent.id).toMatch(/^mlt_[a-zA-Z0-9_-]{12}$/);
    });

    it('generates verification code (moltid-verify:xxx)', async () => {
      const { agent } = await agentService.create({});

      expect(agent.verification_code).toBe(`moltid-verify:${agent.id}`);
    });

    it('generates API key and stores hash', async () => {
      const { agent, apiKey } = await agentService.create({});

      // API key should have correct format
      expect(apiKey).toMatch(/^moltid_key_[a-zA-Z0-9_-]{32}$/);
      // Hash should be stored (64 char hex for SHA-256)
      expect(agent.api_key_hash).toMatch(/^[a-f0-9]{64}$/);
      // Prefix should be first 16 chars of API key
      expect(agent.api_key_prefix).toBe(apiKey.substring(0, 16));
    });

    it('handles optional fields - minimal input', async () => {
      const { agent } = await agentService.create({});

      expect(agent.moltbook_username).toBeNull();
      expect(agent.public_key).toBeNull();
      expect(agent.capabilities).toEqual([]);
    });

    it('handles optional fields - only moltbook_username', async () => {
      const { agent } = await agentService.create(VALID_AGENT_INPUTS.withMoltbook);

      expect(agent.moltbook_username).toBe('test_user');
      expect(agent.public_key).toBeNull();
      expect(agent.capabilities).toEqual([]);
    });

    it('handles optional fields - only public_key', async () => {
      const { agent } = await agentService.create(VALID_AGENT_INPUTS.withPublicKey);

      expect(agent.moltbook_username).toBeNull();
      expect(agent.public_key).toBe('pk_test_key_12345');
      expect(agent.capabilities).toEqual([]);
    });

    it('handles optional fields - only capabilities', async () => {
      const { agent } = await agentService.create(VALID_AGENT_INPUTS.withCapabilities);

      expect(agent.moltbook_username).toBeNull();
      expect(agent.public_key).toBeNull();
      expect(agent.capabilities).toEqual(['testing', 'automation']);
    });

    it('handles complete input with all fields', async () => {
      const { agent } = await agentService.create(VALID_AGENT_INPUTS.complete);

      expect(agent.moltbook_username).toBe('complete_agent');
      expect(agent.public_key).toBe('pk_complete_key_67890');
      expect(agent.capabilities).toEqual(['code_review', 'testing', 'deployment']);
    });

    it('sets created_at and updated_at timestamps', async () => {
      const { agent } = await agentService.create({});

      expect(agent.created_at).toBeDefined();
      expect(agent.updated_at).toBeDefined();

      // Verify timestamps are valid date strings (SQLite format: "YYYY-MM-DD HH:MM:SS")
      const createdDate = new Date(agent.created_at);
      const updatedDate = new Date(agent.updated_at);

      // Timestamps should be valid parseable dates
      expect(createdDate.getTime()).not.toBeNaN();
      expect(updatedDate.getTime()).not.toBeNaN();

      // Timestamps should match expected format from SQLite datetime()
      expect(agent.created_at).toMatch(/^\d{4}-\d{2}-\d{2}/);
      expect(agent.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}/);
    });
  });

  // ============================================================
  // getById() tests
  // ============================================================
  describe('getById', () => {
    it('returns agent when found', async () => {
      // Create a test agent first
      const { agent: createdAgent } = await agentService.create({
        moltbook_username: 'findme_user',
        capabilities: ['testing'],
      });

      const foundAgent = await agentService.getById(createdAgent.id);

      expect(foundAgent).not.toBeNull();
      expect(foundAgent!.id).toBe(createdAgent.id);
      expect(foundAgent!.moltbook_username).toBe('findme_user');
      expect(foundAgent!.capabilities).toEqual(['testing']);
    });

    it('returns null when not found', async () => {
      const agent = await agentService.getById('mlt_nonexistent123');

      expect(agent).toBeNull();
    });

    it('returns correct parsed types', async () => {
      const agentId = await createTestAgent(env.DB, {
        moltbook_verified: true,
        moltbook_karma: 500,
        trust_score: 25,
        vouch_count: 2,
        status: 'active',
      });

      const agent = await agentService.getById(agentId);

      expect(agent).not.toBeNull();
      expect(typeof agent!.moltbook_verified).toBe('boolean');
      expect(agent!.moltbook_verified).toBe(true);
      expect(typeof agent!.moltbook_karma).toBe('number');
      expect(agent!.moltbook_karma).toBe(500);
      expect(typeof agent!.trust_score).toBe('number');
      expect(typeof agent!.vouch_count).toBe('number');
    });
  });

  // ============================================================
  // getByMoltbook() tests
  // ============================================================
  describe('getByMoltbook', () => {
    it('returns agent when found', async () => {
      await agentService.create({
        moltbook_username: 'unique_moltbook_user',
        public_key: 'pk_test',
      });

      const foundAgent = await agentService.getByMoltbook('unique_moltbook_user');

      expect(foundAgent).not.toBeNull();
      expect(foundAgent!.moltbook_username).toBe('unique_moltbook_user');
    });

    it('returns null when not found', async () => {
      const agent = await agentService.getByMoltbook('nonexistent_user');

      expect(agent).toBeNull();
    });

    it('is case-sensitive for username lookup', async () => {
      await agentService.create({
        moltbook_username: 'CaseSensitiveUser',
      });

      // Exact match should work
      const exactMatch = await agentService.getByMoltbook('CaseSensitiveUser');
      expect(exactMatch).not.toBeNull();

      // Different case should not match (SQLite default is case-sensitive for text comparisons)
      const differentCase = await agentService.getByMoltbook('casesensitiveuser');
      expect(differentCase).toBeNull();
    });
  });

  // ============================================================
  // search() tests
  // ============================================================
  describe('search', () => {
    beforeEach(async () => {
      // Seed with sample data for search tests
      await seedTestData(env.DB, { agents: true, vouches: false });
    });

    it('returns all active agents with default query', async () => {
      const results = await agentService.search({
        limit: 100,
        offset: 0,
      });

      // Should return all active agents from fixtures
      const activeAgents = SAMPLE_AGENTS.filter((a) => a.status === 'active');
      expect(results.length).toBe(activeAgents.length);
    });

    it('filters by verified status - verified only', async () => {
      const results = await agentService.search({
        verified: true,
        limit: 100,
        offset: 0,
      });

      // All returned agents should be verified
      expect(results.every((a) => a.moltbook_verified === true)).toBe(true);

      // Should match count of verified active agents in fixtures
      const verifiedActive = SAMPLE_AGENTS.filter(
        (a) => a.status === 'active' && a.moltbook_verified
      );
      expect(results.length).toBe(verifiedActive.length);
    });

    it('filters by verified status - unverified only', async () => {
      const results = await agentService.search({
        verified: false,
        limit: 100,
        offset: 0,
      });

      // All returned agents should be unverified
      expect(results.every((a) => a.moltbook_verified === false)).toBe(true);
    });

    it('filters by min_trust', async () => {
      const minTrust = 50;
      const results = await agentService.search({
        min_trust: minTrust,
        limit: 100,
        offset: 0,
      });

      // All returned agents should have trust_score >= minTrust
      expect(results.every((a) => a.trust_score >= minTrust)).toBe(true);

      // Count should match fixtures
      const highTrustActive = SAMPLE_AGENTS.filter(
        (a) => a.status === 'active' && a.trust_score >= minTrust
      );
      expect(results.length).toBe(highTrustActive.length);
    });

    it('filters by capability', async () => {
      const results = await agentService.search({
        capability: 'code_review',
        limit: 100,
        offset: 0,
      });

      // All returned agents should have 'code_review' capability
      expect(
        results.every((a) => a.capabilities.includes('code_review'))
      ).toBe(true);
    });

    it('applies multiple filters together', async () => {
      const results = await agentService.search({
        verified: true,
        min_trust: 70,
        capability: 'code_review',
        limit: 100,
        offset: 0,
      });

      // All results should satisfy all filters
      for (const agent of results) {
        expect(agent.moltbook_verified).toBe(true);
        expect(agent.trust_score).toBeGreaterThanOrEqual(70);
        expect(agent.capabilities).toContain('code_review');
      }
    });

    it('applies pagination with limit', async () => {
      const results = await agentService.search({
        limit: 2,
        offset: 0,
      });

      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('applies pagination with offset', async () => {
      const firstPage = await agentService.search({
        limit: 2,
        offset: 0,
      });

      const secondPage = await agentService.search({
        limit: 2,
        offset: 2,
      });

      // Pages should not overlap (assuming enough data)
      if (firstPage.length > 0 && secondPage.length > 0) {
        const firstPageIds = firstPage.map((a) => a.id);
        const secondPageIds = secondPage.map((a) => a.id);
        const overlap = firstPageIds.filter((id) => secondPageIds.includes(id));
        expect(overlap.length).toBe(0);
      }
    });

    it('orders by trust_score DESC', async () => {
      const results = await agentService.search({
        limit: 100,
        offset: 0,
      });

      // Verify descending order
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].trust_score).toBeGreaterThanOrEqual(
          results[i].trust_score
        );
      }
    });

    it('returns public representation without sensitive fields', async () => {
      const results = await agentService.search({
        limit: 1,
        offset: 0,
      });

      if (results.length > 0) {
        const agent = results[0];
        // Should have public fields
        expect(agent).toHaveProperty('id');
        expect(agent).toHaveProperty('moltbook_username');
        expect(agent).toHaveProperty('moltbook_verified');
        expect(agent).toHaveProperty('capabilities');
        expect(agent).toHaveProperty('trust_score');
        expect(agent).toHaveProperty('vouch_count');
        expect(agent).toHaveProperty('status');
        expect(agent).toHaveProperty('created_at');

        // Should NOT have sensitive fields
        expect(agent).not.toHaveProperty('verification_code');
        expect(agent).not.toHaveProperty('public_key');
        expect(agent).not.toHaveProperty('moltbook_karma');
        expect(agent).not.toHaveProperty('updated_at');
      }
    });

    it('excludes suspended and pending agents', async () => {
      const results = await agentService.search({
        limit: 100,
        offset: 0,
      });

      // No suspended or pending agents should be returned
      expect(results.every((a) => a.status === 'active')).toBe(true);
    });
  });

  // ============================================================
  // update() tests
  // ============================================================
  describe('update', () => {
    it('updates moltbook_verified field', async () => {
      const { agent } = await agentService.create({});

      await agentService.update(agent.id, { moltbook_verified: true });

      const updated = await agentService.getById(agent.id);
      expect(updated!.moltbook_verified).toBe(true);
    });

    it('updates moltbook_karma field', async () => {
      const { agent } = await agentService.create({});

      await agentService.update(agent.id, { moltbook_karma: 1500 });

      const updated = await agentService.getById(agent.id);
      expect(updated!.moltbook_karma).toBe(1500);
    });

    it('updates trust_score field', async () => {
      const { agent } = await agentService.create({});

      await agentService.update(agent.id, { trust_score: 75 });

      const updated = await agentService.getById(agent.id);
      expect(updated!.trust_score).toBe(75);
    });

    it('updates vouch_count field', async () => {
      const { agent } = await agentService.create({});

      await agentService.update(agent.id, { vouch_count: 5 });

      const updated = await agentService.getById(agent.id);
      expect(updated!.vouch_count).toBe(5);
    });

    it('updates status field', async () => {
      const { agent } = await agentService.create({});

      await agentService.update(agent.id, { status: 'active' });

      const updated = await agentService.getById(agent.id);
      expect(updated!.status).toBe('active');
    });

    it('updates capabilities field', async () => {
      const { agent } = await agentService.create({});

      await agentService.update(agent.id, {
        capabilities: ['new_capability', 'another'],
      });

      const updated = await agentService.getById(agent.id);
      expect(updated!.capabilities).toEqual(['new_capability', 'another']);
    });

    it('updates public_key field', async () => {
      const { agent } = await agentService.create({});

      await agentService.update(agent.id, { public_key: 'pk_new_key_456' });

      const updated = await agentService.getById(agent.id);
      expect(updated!.public_key).toBe('pk_new_key_456');
    });

    it('updates multiple fields at once', async () => {
      const { agent } = await agentService.create({});

      await agentService.update(agent.id, {
        moltbook_verified: true,
        trust_score: 50,
        status: 'active',
      });

      const updated = await agentService.getById(agent.id);
      expect(updated!.moltbook_verified).toBe(true);
      expect(updated!.trust_score).toBe(50);
      expect(updated!.status).toBe('active');
    });

    it('updates updated_at timestamp', async () => {
      const { agent } = await agentService.create({});
      const originalUpdatedAt = agent.updated_at;

      // Small delay to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 10));

      await agentService.update(agent.id, { trust_score: 10 });

      const updated = await agentService.getById(agent.id);
      expect(updated!.updated_at).not.toBe(originalUpdatedAt);
    });

    it('does nothing when no fields provided', async () => {
      const { agent } = await agentService.create({
        moltbook_username: 'unchanged_user',
      });

      await agentService.update(agent.id, {});

      const unchanged = await agentService.getById(agent.id);
      expect(unchanged!.moltbook_username).toBe('unchanged_user');
    });
  });

  // ============================================================
  // Vouch tests: addVouch() and getVouches()
  // ============================================================
  describe('vouch operations', () => {
    let agentA: string;
    let agentB: string;
    let agentC: string;

    beforeEach(async () => {
      // Create three test agents
      agentA = await createTestAgent(env.DB, {
        id: 'mlt_voucher_a',
        moltbook_username: 'voucher_a',
        status: 'active',
      });
      agentB = await createTestAgent(env.DB, {
        id: 'mlt_vouchee_b',
        moltbook_username: 'vouchee_b',
        status: 'active',
        vouch_count: 0,
      });
      agentC = await createTestAgent(env.DB, {
        id: 'mlt_voucher_c',
        moltbook_username: 'voucher_c',
        status: 'active',
      });
    });

    describe('addVouch', () => {
      it('creates vouch relationship', async () => {
        await agentService.addVouch(agentA, agentB);

        const vouches = await agentService.getVouches(agentB);
        expect(vouches).toContain(agentA);
      });

      it('increments vouch_count on target agent', async () => {
        const beforeVouch = await agentService.getById(agentB);
        expect(beforeVouch!.vouch_count).toBe(0);

        await agentService.addVouch(agentA, agentB);

        const afterVouch = await agentService.getById(agentB);
        expect(afterVouch!.vouch_count).toBe(1);
      });

      it('allows multiple vouches to same agent', async () => {
        await agentService.addVouch(agentA, agentB);
        await agentService.addVouch(agentC, agentB);

        const vouches = await agentService.getVouches(agentB);
        expect(vouches.length).toBe(2);
        expect(vouches).toContain(agentA);
        expect(vouches).toContain(agentC);

        const agent = await agentService.getById(agentB);
        expect(agent!.vouch_count).toBe(2);
      });

      it('generates vouch ID with correct format', async () => {
        await agentService.addVouch(agentA, agentB);

        // Check the vouch was created in the database
        const result = await env.DB.prepare(
          'SELECT id FROM vouches WHERE from_agent_id = ? AND to_agent_id = ?'
        )
          .bind(agentA, agentB)
          .first<{ id: string }>();

        expect(result).not.toBeNull();
        expect(result!.id).toMatch(/^vch_[a-zA-Z0-9_-]{12}$/);
      });
    });

    describe('getVouches', () => {
      it('returns voucher IDs for agent', async () => {
        await agentService.addVouch(agentA, agentB);
        await agentService.addVouch(agentC, agentB);

        const vouches = await agentService.getVouches(agentB);

        expect(vouches).toHaveLength(2);
        expect(vouches).toContain(agentA);
        expect(vouches).toContain(agentC);
      });

      it('returns empty array when no vouches', async () => {
        const vouches = await agentService.getVouches(agentA);

        expect(vouches).toEqual([]);
      });

      it('returns empty array for non-existent agent', async () => {
        const vouches = await agentService.getVouches('mlt_nonexistent');

        expect(vouches).toEqual([]);
      });
    });
  });

  // ============================================================
  // parseAgent() and toPublic() tests
  // ============================================================
  describe('parseAgent', () => {
    it('correctly parses DB row to Agent object', () => {
      const dbRow = {
        id: 'mlt_test123',
        moltbook_username: 'test_user',
        moltbook_verified: 1, // SQLite stores as integer
        moltbook_karma: 500,
        public_key: 'pk_test',
        capabilities: '["testing","review"]',
        trust_score: 45,
        vouch_count: 3,
        status: 'active',
        verification_code: 'moltid-verify:mlt_test123',
        api_key_hash: 'abc123def456',
        api_key_prefix: 'moltid_key_abcd',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-15T00:00:00Z',
      };

      const agent = agentService.parseAgent(dbRow);

      expect(agent.id).toBe('mlt_test123');
      expect(agent.moltbook_username).toBe('test_user');
      expect(agent.moltbook_verified).toBe(true); // Converted to boolean
      expect(agent.moltbook_karma).toBe(500);
      expect(agent.public_key).toBe('pk_test');
      expect(agent.capabilities).toEqual(['testing', 'review']); // Parsed JSON
      expect(agent.trust_score).toBe(45);
      expect(agent.vouch_count).toBe(3);
      expect(agent.status).toBe('active');
      expect(agent.verification_code).toBe('moltid-verify:mlt_test123');
      expect(agent.api_key_hash).toBe('abc123def456');
      expect(agent.api_key_prefix).toBe('moltid_key_abcd');
      expect(agent.created_at).toBe('2025-01-01T00:00:00Z');
      expect(agent.updated_at).toBe('2025-01-15T00:00:00Z');
    });

    it('converts moltbook_verified from 0 to false', () => {
      const dbRow = {
        id: 'mlt_unverified',
        moltbook_username: null,
        moltbook_verified: 0,
        moltbook_karma: null,
        public_key: null,
        capabilities: '[]',
        trust_score: 0,
        vouch_count: 0,
        status: 'pending',
        verification_code: null,
        api_key_hash: null,
        api_key_prefix: null,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      };

      const agent = agentService.parseAgent(dbRow);

      expect(agent.moltbook_verified).toBe(false);
    });

    it('handles null values correctly', () => {
      const dbRow = {
        id: 'mlt_minimal',
        moltbook_username: null,
        moltbook_verified: 0,
        moltbook_karma: null,
        public_key: null,
        capabilities: null, // null capabilities
        trust_score: 0,
        vouch_count: 0,
        status: 'pending',
        verification_code: null,
        api_key_hash: null,
        api_key_prefix: null,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      };

      const agent = agentService.parseAgent(dbRow);

      expect(agent.moltbook_username).toBeNull();
      expect(agent.moltbook_karma).toBeNull();
      expect(agent.public_key).toBeNull();
      expect(agent.capabilities).toEqual([]); // Defaults to empty array
      expect(agent.verification_code).toBeNull();
      expect(agent.api_key_hash).toBeNull();
      expect(agent.api_key_prefix).toBeNull();
    });

    it('handles empty capabilities string', () => {
      const dbRow = {
        id: 'mlt_empty_caps',
        moltbook_username: null,
        moltbook_verified: 0,
        moltbook_karma: null,
        public_key: null,
        capabilities: '[]',
        trust_score: 0,
        vouch_count: 0,
        status: 'pending',
        verification_code: null,
        api_key_hash: null,
        api_key_prefix: null,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      };

      const agent = agentService.parseAgent(dbRow);

      expect(agent.capabilities).toEqual([]);
    });

    it('defaults trust_score and vouch_count to 0 when null/undefined', () => {
      const dbRow = {
        id: 'mlt_defaults',
        moltbook_username: null,
        moltbook_verified: 0,
        moltbook_karma: null,
        public_key: null,
        capabilities: '[]',
        trust_score: null,
        vouch_count: null,
        status: 'pending',
        verification_code: null,
        api_key_hash: null,
        api_key_prefix: null,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      };

      const agent = agentService.parseAgent(dbRow);

      expect(agent.trust_score).toBe(0);
      expect(agent.vouch_count).toBe(0);
    });
  });

  // ============================================================
  // validateApiKey() tests
  // ============================================================
  describe('validateApiKey', () => {
    it('returns true for valid API key', async () => {
      const { agent, apiKey } = await agentService.create({});

      const isValid = await agentService.validateApiKey(agent.id, apiKey);

      expect(isValid).toBe(true);
    });

    it('returns false for invalid API key', async () => {
      const { agent } = await agentService.create({});

      const isValid = await agentService.validateApiKey(agent.id, 'moltid_key_wrongkey000000000000000');

      expect(isValid).toBe(false);
    });

    it('returns false for non-existent agent', async () => {
      const isValid = await agentService.validateApiKey('mlt_nonexistent123', 'moltid_key_anykey00000000000000000');

      expect(isValid).toBe(false);
    });

    it('returns false when agent has no API key hash', async () => {
      // Create agent directly in DB without API key
      const agentId = await createTestAgent(env.DB, {
        api_key_hash: null,
        api_key_prefix: null,
      });

      const isValid = await agentService.validateApiKey(agentId, 'moltid_key_anykey00000000000000000');

      expect(isValid).toBe(false);
    });

    it('is timing-safe (validates hash correctly)', async () => {
      const { agent, apiKey } = await agentService.create({});

      // Valid key should work
      expect(await agentService.validateApiKey(agent.id, apiKey)).toBe(true);

      // Similar but different key should fail
      const wrongKey = apiKey.slice(0, -1) + 'X';
      expect(await agentService.validateApiKey(agent.id, wrongKey)).toBe(false);

      // Completely different key should fail
      expect(await agentService.validateApiKey(agent.id, 'completely_different_key')).toBe(false);
    });
  });

  // ============================================================
  // updateCapabilities() tests
  // ============================================================
  describe('updateCapabilities', () => {
    it('updates capabilities with valid input', async () => {
      const { agent } = await agentService.create({});

      const updated = await agentService.updateCapabilities(agent.id, ['testing', 'code_review']);

      expect(updated).not.toBeNull();
      expect(updated!.capabilities).toEqual(['testing', 'code_review']);
    });

    it('returns null for non-existent agent', async () => {
      const result = await agentService.updateCapabilities('mlt_nonexistent123', ['testing']);

      expect(result).toBeNull();
    });

    it('accepts empty capabilities array', async () => {
      const { agent } = await agentService.create({ capabilities: ['old_capability'] });

      const updated = await agentService.updateCapabilities(agent.id, []);

      expect(updated).not.toBeNull();
      expect(updated!.capabilities).toEqual([]);
    });

    it('rejects more than 20 capabilities', async () => {
      const { agent } = await agentService.create({});
      const tooManyCapabilities = Array.from({ length: 21 }, (_, i) => `cap_${i}`);

      await expect(
        agentService.updateCapabilities(agent.id, tooManyCapabilities)
      ).rejects.toThrow('Capabilities array cannot exceed 20 items');
    });

    it('rejects capabilities longer than 50 characters', async () => {
      const { agent } = await agentService.create({});
      const longCapability = 'a'.repeat(51);

      await expect(
        agentService.updateCapabilities(agent.id, [longCapability])
      ).rejects.toThrow('exceeds maximum length of 50 characters');
    });

    it('rejects capabilities with invalid characters (uppercase)', async () => {
      const { agent } = await agentService.create({});

      await expect(
        agentService.updateCapabilities(agent.id, ['Invalid_Capability'])
      ).rejects.toThrow('contains invalid characters');
    });

    it('rejects capabilities with invalid characters (spaces)', async () => {
      const { agent } = await agentService.create({});

      await expect(
        agentService.updateCapabilities(agent.id, ['invalid capability'])
      ).rejects.toThrow('contains invalid characters');
    });

    it('rejects capabilities with invalid characters (special chars)', async () => {
      const { agent } = await agentService.create({});

      await expect(
        agentService.updateCapabilities(agent.id, ['invalid-capability'])
      ).rejects.toThrow('contains invalid characters');
    });

    it('rejects duplicate capabilities', async () => {
      const { agent } = await agentService.create({});

      await expect(
        agentService.updateCapabilities(agent.id, ['testing', 'testing'])
      ).rejects.toThrow('contains duplicates');
    });

    it('accepts valid capabilities (lowercase, digits, underscore)', async () => {
      const { agent } = await agentService.create({});

      const updated = await agentService.updateCapabilities(agent.id, [
        'code_review',
        'testing123',
        'ml_model_v2',
      ]);

      expect(updated).not.toBeNull();
      expect(updated!.capabilities).toEqual(['code_review', 'testing123', 'ml_model_v2']);
    });

    it('accepts exactly 20 capabilities', async () => {
      const { agent } = await agentService.create({});
      const validCapabilities = Array.from({ length: 20 }, (_, i) => `capability_${i}`);

      const updated = await agentService.updateCapabilities(agent.id, validCapabilities);

      expect(updated).not.toBeNull();
      expect(updated!.capabilities.length).toBe(20);
    });

    it('accepts capability with exactly 50 characters', async () => {
      const { agent } = await agentService.create({});
      const fiftyCharCapability = 'a'.repeat(50);

      const updated = await agentService.updateCapabilities(agent.id, [fiftyCharCapability]);

      expect(updated).not.toBeNull();
      expect(updated!.capabilities).toEqual([fiftyCharCapability]);
    });
  });

  describe('toPublic', () => {
    it('hides sensitive fields', () => {
      const agent = {
        id: 'mlt_public_test',
        moltbook_username: 'public_user',
        moltbook_verified: true,
        moltbook_karma: 1000, // Sensitive - should be hidden
        public_key: 'pk_sensitive_key', // Sensitive - should be hidden
        capabilities: ['testing'],
        trust_score: 50,
        vouch_count: 5,
        status: 'active' as const,
        verification_code: 'moltid-verify:mlt_public_test', // Sensitive
        api_key_hash: 'abc123def456', // Sensitive - should be hidden
        api_key_prefix: 'moltid_key_abcd', // Sensitive - should be hidden
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-15T00:00:00Z', // Sensitive
      };

      const publicAgent = agentService.toPublic(agent);

      // Should include public fields
      expect(publicAgent.id).toBe('mlt_public_test');
      expect(publicAgent.moltbook_username).toBe('public_user');
      expect(publicAgent.moltbook_verified).toBe(true);
      expect(publicAgent.capabilities).toEqual(['testing']);
      expect(publicAgent.trust_score).toBe(50);
      expect(publicAgent.vouch_count).toBe(5);
      expect(publicAgent.status).toBe('active');
      expect(publicAgent.created_at).toBe('2025-01-01T00:00:00Z');

      // Should NOT include sensitive fields
      expect(publicAgent).not.toHaveProperty('moltbook_karma');
      expect(publicAgent).not.toHaveProperty('public_key');
      expect(publicAgent).not.toHaveProperty('verification_code');
      expect(publicAgent).not.toHaveProperty('api_key_hash');
      expect(publicAgent).not.toHaveProperty('api_key_prefix');
      expect(publicAgent).not.toHaveProperty('updated_at');
    });

    it('preserves all public fields correctly', () => {
      const agent = {
        id: 'mlt_preserve_test',
        moltbook_username: null, // null values preserved
        moltbook_verified: false,
        moltbook_karma: null,
        public_key: null,
        capabilities: [],
        trust_score: 0,
        vouch_count: 0,
        status: 'pending' as const,
        verification_code: 'moltid-verify:mlt_preserve_test',
        api_key_hash: null,
        api_key_prefix: null,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      };

      const publicAgent = agentService.toPublic(agent);

      expect(publicAgent.moltbook_username).toBeNull();
      expect(publicAgent.moltbook_verified).toBe(false);
      expect(publicAgent.capabilities).toEqual([]);
      expect(publicAgent.trust_score).toBe(0);
      expect(publicAgent.vouch_count).toBe(0);
      expect(publicAgent.status).toBe('pending');
    });
  });
});
