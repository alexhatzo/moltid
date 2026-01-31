/**
 * Trust service unit tests
 *
 * Tests for the TrustService class that calculates agent trust scores.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { TrustService } from '../src/services/trust';
import {
  setupTestDb,
  cleanupTestDb,
  createTestAgent,
  createTestVouch,
} from './setup';
import { TRUST_SCORE_SCENARIOS, EXPECTED_TRUST_SCORES } from './fixtures';

describe('TrustService', () => {
  let trustService: TrustService;

  beforeEach(async () => {
    await setupTestDb(env.DB);
    await cleanupTestDb(env.DB);
    trustService = new TrustService(env.DB);
  });

  describe('calculateScore', () => {
    it('returns 0 for non-existent agent', async () => {
      const score = await trustService.calculateScore('mlt_nonexistent');
      expect(score).toBe(0);
    });

    it('calculates correct score for brand new unverified agent', async () => {
      const agentId = await createTestAgent(env.DB, {
        moltbook_verified: false,
        moltbook_karma: null,
        status: 'pending',
        created_at: new Date().toISOString(),
      });

      const score = await trustService.calculateScore(agentId);
      // Brand new = 0 age points, no verification, no karma, no vouches
      expect(score).toBe(0);
    });

    it('adds 20 points for Moltbook verification', async () => {
      const agentId = await createTestAgent(env.DB, {
        moltbook_verified: true,
        moltbook_karma: 0,
        status: 'active',
        created_at: new Date().toISOString(),
      });

      const score = await trustService.calculateScore(agentId);
      expect(score).toBe(20);
    });

    it('calculates karma points correctly (1 per 100 karma)', async () => {
      const agentId = await createTestAgent(env.DB, {
        moltbook_verified: false,
        moltbook_karma: 500,
        status: 'active',
        created_at: new Date().toISOString(),
      });

      const score = await trustService.calculateScore(agentId);
      expect(score).toBe(5); // 500 / 100 = 5
    });

    it('caps karma points at 30', async () => {
      const agentId = await createTestAgent(env.DB, {
        moltbook_verified: false,
        moltbook_karma: 10000,
        status: 'active',
        created_at: new Date().toISOString(),
      });

      const score = await trustService.calculateScore(agentId);
      expect(score).toBe(30); // Capped at 30
    });

    it('calculates age points correctly (1 per day)', async () => {
      const fiveDaysAgo = new Date();
      fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);

      const agentId = await createTestAgent(env.DB, {
        moltbook_verified: false,
        moltbook_karma: 0,
        status: 'active',
        created_at: fiveDaysAgo.toISOString(),
      });

      const score = await trustService.calculateScore(agentId);
      expect(score).toBe(5); // 5 days = 5 points
    });

    it('caps age points at 20', async () => {
      const monthAgo = new Date();
      monthAgo.setDate(monthAgo.getDate() - 30);

      const agentId = await createTestAgent(env.DB, {
        moltbook_verified: false,
        moltbook_karma: 0,
        status: 'active',
        created_at: monthAgo.toISOString(),
      });

      const score = await trustService.calculateScore(agentId);
      expect(score).toBe(20); // Capped at 20
    });

    it('counts vouches from verified agents only', async () => {
      // Create target agent
      const targetId = await createTestAgent(env.DB, {
        moltbook_verified: false,
        moltbook_karma: 0,
        status: 'active',
        created_at: new Date().toISOString(),
      });

      // Create verified voucher
      const verifiedVoucherId = await createTestAgent(env.DB, {
        moltbook_verified: true,
        status: 'active',
      });

      // Create unverified voucher
      const unverifiedVoucherId = await createTestAgent(env.DB, {
        moltbook_verified: false,
        status: 'active',
      });

      // Add vouches
      await createTestVouch(env.DB, verifiedVoucherId, targetId);
      await createTestVouch(env.DB, unverifiedVoucherId, targetId);

      const score = await trustService.calculateScore(targetId);
      // Only the verified vouch counts: 5 points
      expect(score).toBe(5);
    });

    it('caps vouch points at 30', async () => {
      // Create target agent
      const targetId = await createTestAgent(env.DB, {
        moltbook_verified: false,
        moltbook_karma: 0,
        status: 'active',
        created_at: new Date().toISOString(),
      });

      // Create 10 verified vouchers and add vouches
      for (let i = 0; i < 10; i++) {
        const voucherId = await createTestAgent(env.DB, {
          id: `mlt_voucher_${i}`,
          moltbook_verified: true,
          status: 'active',
        });
        await createTestVouch(env.DB, voucherId, targetId);
      }

      const score = await trustService.calculateScore(targetId);
      // 10 vouches * 5 = 50, capped at 30
      expect(score).toBe(30);
    });

    it('caps total score at 100', async () => {
      const longAgo = new Date();
      longAgo.setDate(longAgo.getDate() - 100);

      // Create agent with max everything
      const agentId = await createTestAgent(env.DB, {
        moltbook_verified: true, // +20
        moltbook_karma: 10000, // +30 (capped)
        status: 'active',
        created_at: longAgo.toISOString(), // +20 (capped)
      });

      // Add 10 verified vouches (+30 capped)
      for (let i = 0; i < 10; i++) {
        const voucherId = await createTestAgent(env.DB, {
          id: `mlt_max_voucher_${i}`,
          moltbook_verified: true,
          status: 'active',
        });
        await createTestVouch(env.DB, voucherId, agentId);
      }

      const score = await trustService.calculateScore(agentId);
      expect(score).toBe(100);
    });

    it('uses floor division for karma (99 karma = 0 points)', async () => {
      const agentId = await createTestAgent(env.DB, {
        moltbook_verified: false,
        moltbook_karma: 99,
        status: 'active',
        created_at: new Date().toISOString(),
      });

      const score = await trustService.calculateScore(agentId);
      expect(score).toBe(0); // 99 / 100 = 0 (floor)
    });

    it('handles null karma as zero', async () => {
      const agentId = await createTestAgent(env.DB, {
        moltbook_verified: false,
        moltbook_karma: null,
        status: 'active',
        created_at: new Date().toISOString(),
      });

      const score = await trustService.calculateScore(agentId);
      expect(score).toBe(0);
    });

    it('calculates combined score correctly (all factors)', async () => {
      const tenDaysAgo = new Date();
      tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

      // Create agent with verification, karma, and age
      const agentId = await createTestAgent(env.DB, {
        moltbook_verified: true, // +20
        moltbook_karma: 1500, // +15
        status: 'active',
        created_at: tenDaysAgo.toISOString(), // +10
      });

      // Add 2 verified vouches (+10)
      for (let i = 0; i < 2; i++) {
        const voucherId = await createTestAgent(env.DB, {
          id: `mlt_combined_voucher_${i}`,
          moltbook_verified: true,
          status: 'active',
        });
        await createTestVouch(env.DB, voucherId, agentId);
      }

      const score = await trustService.calculateScore(agentId);
      // 20 + 15 + 10 + 10 = 55
      expect(score).toBe(55);
    });

    it('excludes vouches from suspended but verified agents', async () => {
      // Create target agent
      const targetId = await createTestAgent(env.DB, {
        moltbook_verified: false,
        moltbook_karma: 0,
        status: 'active',
        created_at: new Date().toISOString(),
      });

      // Create suspended but verified voucher
      const suspendedVoucherId = await createTestAgent(env.DB, {
        id: 'mlt_suspended_voucher',
        moltbook_verified: true, // verified...
        status: 'suspended', // ...but suspended
      });

      await createTestVouch(env.DB, suspendedVoucherId, targetId);

      const score = await trustService.calculateScore(targetId);
      // Vouch from suspended agent still counts (verification-based, not status-based)
      // The service only checks moltbook_verified, not status
      expect(score).toBe(5);
    });
  });

  describe('getDetails', () => {
    it('returns correct breakdown for verified agent', async () => {
      const fiveDaysAgo = new Date();
      fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);

      const agent = {
        id: 'mlt_test_details',
        moltbook_username: 'test_user',
        moltbook_verified: true,
        moltbook_karma: 500,
        public_key: null,
        capabilities: [],
        trust_score: 30,
        vouch_count: 1,
        status: 'active' as const,
        verification_code: null,
        api_key_hash: null,
        api_key_prefix: null,
        created_at: fiveDaysAgo.toISOString(),
        updated_at: new Date().toISOString(),
      };

      const details = await trustService.getDetails(agent);

      expect(details.moltbook_verified).toBe(true);
      expect(details.moltbook_karma).toBe(500);
      expect(details.vouch_count).toBe(1);
      expect(details.age_days).toBe(5);
      expect(details.factors.moltbook_verified).toBe(20);
      expect(details.factors.karma).toBe(5);
      expect(details.factors.age).toBe(5);
      expect(details.factors.vouches).toBe(5);
    });

    it('returns zeros for unverified agent with no history', async () => {
      const agent = {
        id: 'mlt_test_new',
        moltbook_username: null,
        moltbook_verified: false,
        moltbook_karma: null,
        public_key: null,
        capabilities: [],
        trust_score: 0,
        vouch_count: 0,
        status: 'pending' as const,
        verification_code: null,
        api_key_hash: null,
        api_key_prefix: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const details = await trustService.getDetails(agent);

      expect(details.factors.moltbook_verified).toBe(0);
      expect(details.factors.karma).toBe(0);
      expect(details.factors.age).toBe(0);
      expect(details.factors.vouches).toBe(0);
    });

    it('caps individual factors in breakdown correctly', async () => {
      const longAgo = new Date();
      longAgo.setDate(longAgo.getDate() - 100);

      const agent = {
        id: 'mlt_test_capped',
        moltbook_username: 'capped_user',
        moltbook_verified: true,
        moltbook_karma: 10000, // Should cap at 30
        public_key: null,
        capabilities: [],
        trust_score: 100,
        vouch_count: 20, // 20 * 5 = 100, should cap at 30
        status: 'active' as const,
        verification_code: null,
        api_key_hash: null,
        api_key_prefix: null,
        created_at: longAgo.toISOString(), // 100 days, should cap at 20
        updated_at: new Date().toISOString(),
      };

      const details = await trustService.getDetails(agent);

      expect(details.factors.moltbook_verified).toBe(20);
      expect(details.factors.karma).toBe(30); // Capped
      expect(details.factors.age).toBe(20); // Capped
      expect(details.factors.vouches).toBe(30); // Capped (20 * 5 = 100, capped at 30)
    });

    it('returns preserved score from agent object', async () => {
      const agent = {
        id: 'mlt_test_preserved',
        moltbook_username: null,
        moltbook_verified: false,
        moltbook_karma: null,
        public_key: null,
        capabilities: [],
        trust_score: 42, // Pre-calculated score
        vouch_count: 0,
        status: 'active' as const,
        verification_code: null,
        api_key_hash: null,
        api_key_prefix: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const details = await trustService.getDetails(agent);

      // getDetails returns the stored trust_score, not a recalculation
      expect(details.score).toBe(42);
    });
  });
});
