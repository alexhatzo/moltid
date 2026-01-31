/**
 * Test fixtures for MoltID
 *
 * Sample data for testing agent registration, trust scoring, and vouching.
 * All dates are set relative to a fixed point for predictable trust calculations.
 */

import type { Agent, Vouch } from '../src/types';

// Fixed reference date for predictable age calculations in tests
// Tests assume "today" is 30 days after this date
export const TEST_REFERENCE_DATE = '2025-12-01T00:00:00Z';

/**
 * Sample agents covering various verification states and trust levels.
 *
 * Trust score breakdown for reference:
 * - Moltbook verification: +20 points
 * - Karma: 1 point per 100 karma, capped at 30 points
 * - Age: 1 point per day since registration, capped at 20 points
 * - Vouches: 5 points per vouch from verified agents, capped at 30 points
 */
export const SAMPLE_AGENTS: Agent[] = [
  // Fully verified, high-trust agent (20 days old, 2500 karma, 3 vouches)
  // Expected score: 20 (verified) + 25 (karma) + 20 (age) + 15 (vouches) = 80
  {
    id: 'mlt_verified_001',
    moltbook_username: 'alice_agent',
    moltbook_verified: true,
    moltbook_karma: 2500,
    public_key: 'pk_alice_test_key_001',
    capabilities: ['code_review', 'testing', 'deployment'],
    trust_score: 80,
    vouch_count: 3,
    status: 'active',
    verification_code: 'moltid-verify:mlt_verified_001',
    api_key_hash: null,
    api_key_prefix: null,
    created_at: '2025-12-10T00:00:00Z', // 20 days before reference + 30
    updated_at: '2025-12-30T00:00:00Z',
  },

  // Verified agent with lower karma (15 days old, 500 karma, 1 vouch)
  // Expected score: 20 (verified) + 5 (karma) + 15 (age) + 5 (vouches) = 45
  {
    id: 'mlt_verified_002',
    moltbook_username: 'bob_helper',
    moltbook_verified: true,
    moltbook_karma: 500,
    public_key: 'pk_bob_test_key_002',
    capabilities: ['documentation', 'support'],
    trust_score: 45,
    vouch_count: 1,
    status: 'active',
    verification_code: 'moltid-verify:mlt_verified_002',
    api_key_hash: null,
    api_key_prefix: null,
    created_at: '2025-12-15T00:00:00Z', // 15 days before reference + 30
    updated_at: '2025-12-30T00:00:00Z',
  },

  // Unverified agent (10 days old, no karma, 2 vouches from unverified agents)
  // Expected score: 0 (not verified) + 0 (karma) + 10 (age) + 0 (vouches don't count) = 10
  {
    id: 'mlt_unverified_001',
    moltbook_username: 'charlie_new',
    moltbook_verified: false,
    moltbook_karma: null,
    public_key: 'pk_charlie_test_key_003',
    capabilities: ['general'],
    trust_score: 10,
    vouch_count: 2,
    status: 'active',
    verification_code: 'moltid-verify:mlt_unverified_001',
    api_key_hash: null,
    api_key_prefix: null,
    created_at: '2025-12-20T00:00:00Z', // 10 days before reference + 30
    updated_at: '2025-12-30T00:00:00Z',
  },

  // Pending agent (just registered, awaiting verification)
  // Expected score: 0 (pending status, not calculated yet)
  {
    id: 'mlt_pending_001',
    moltbook_username: 'dave_pending',
    moltbook_verified: false,
    moltbook_karma: null,
    public_key: null,
    capabilities: [],
    trust_score: 0,
    vouch_count: 0,
    status: 'pending',
    verification_code: 'moltid-verify:mlt_pending_001',
    api_key_hash: null,
    api_key_prefix: null,
    created_at: '2025-12-29T00:00:00Z', // 1 day old
    updated_at: '2025-12-29T00:00:00Z',
  },

  // Suspended agent (was verified, now suspended)
  // Trust score preserved but status prevents participation
  {
    id: 'mlt_suspended_001',
    moltbook_username: 'eve_suspended',
    moltbook_verified: true,
    moltbook_karma: 1000,
    public_key: 'pk_eve_test_key_005',
    capabilities: ['code_review'],
    trust_score: 55,
    vouch_count: 2,
    status: 'suspended',
    verification_code: 'moltid-verify:mlt_suspended_001',
    api_key_hash: null,
    api_key_prefix: null,
    created_at: '2025-11-15T00:00:00Z', // 45 days old
    updated_at: '2025-12-28T00:00:00Z',
  },

  // High karma agent without vouches (25 days old, 5000 karma, 0 vouches)
  // Expected score: 20 (verified) + 30 (karma max) + 20 (age max) + 0 (vouches) = 70
  {
    id: 'mlt_verified_003',
    moltbook_username: 'frank_veteran',
    moltbook_verified: true,
    moltbook_karma: 5000,
    public_key: 'pk_frank_test_key_006',
    capabilities: ['architecture', 'security', 'code_review'],
    trust_score: 70,
    vouch_count: 0,
    status: 'active',
    verification_code: 'moltid-verify:mlt_verified_003',
    api_key_hash: null,
    api_key_prefix: null,
    created_at: '2025-12-05T00:00:00Z', // 25 days old
    updated_at: '2025-12-30T00:00:00Z',
  },

  // Agent with many vouches (10 days old, verified, 1500 karma, 6 vouches)
  // Expected score: 20 (verified) + 15 (karma) + 10 (age) + 30 (vouches max) = 75
  {
    id: 'mlt_verified_004',
    moltbook_username: 'grace_vouched',
    moltbook_verified: true,
    moltbook_karma: 1500,
    public_key: 'pk_grace_test_key_007',
    capabilities: ['testing', 'automation'],
    trust_score: 75,
    vouch_count: 6,
    status: 'active',
    verification_code: 'moltid-verify:mlt_verified_004',
    api_key_hash: null,
    api_key_prefix: null,
    created_at: '2025-12-20T00:00:00Z', // 10 days old
    updated_at: '2025-12-30T00:00:00Z',
  },

  // Perfect score agent (max everything)
  // Expected score: 20 (verified) + 30 (karma max) + 20 (age max) + 30 (vouches max) = 100
  {
    id: 'mlt_perfect_001',
    moltbook_username: 'helen_perfect',
    moltbook_verified: true,
    moltbook_karma: 10000,
    public_key: 'pk_helen_test_key_008',
    capabilities: ['architecture', 'security', 'code_review', 'testing', 'deployment'],
    trust_score: 100,
    vouch_count: 10,
    status: 'active',
    verification_code: 'moltid-verify:mlt_perfect_001',
    api_key_hash: null,
    api_key_prefix: null,
    created_at: '2025-10-01T00:00:00Z', // 90 days old
    updated_at: '2025-12-30T00:00:00Z',
  },
];

/**
 * Sample vouches demonstrating various trust relationships.
 * Only vouches from verified agents count toward trust scores.
 */
export const SAMPLE_VOUCHES: Vouch[] = [
  // Verified -> Verified vouches (these count)
  {
    id: 'vch_001',
    from_agent_id: 'mlt_verified_001', // alice (verified)
    to_agent_id: 'mlt_verified_002', // bob (verified)
    created_at: '2025-12-20T00:00:00Z',
  },
  {
    id: 'vch_002',
    from_agent_id: 'mlt_verified_001', // alice (verified)
    to_agent_id: 'mlt_verified_004', // grace (verified)
    created_at: '2025-12-21T00:00:00Z',
  },
  {
    id: 'vch_003',
    from_agent_id: 'mlt_verified_002', // bob (verified)
    to_agent_id: 'mlt_verified_004', // grace (verified)
    created_at: '2025-12-22T00:00:00Z',
  },
  {
    id: 'vch_004',
    from_agent_id: 'mlt_verified_003', // frank (verified)
    to_agent_id: 'mlt_verified_004', // grace (verified)
    created_at: '2025-12-23T00:00:00Z',
  },
  // More vouches to grace
  {
    id: 'vch_005',
    from_agent_id: 'mlt_perfect_001', // helen (verified)
    to_agent_id: 'mlt_verified_004', // grace (verified)
    created_at: '2025-12-24T00:00:00Z',
  },
  {
    id: 'vch_006',
    from_agent_id: 'mlt_suspended_001', // eve (verified but suspended)
    to_agent_id: 'mlt_verified_004', // grace (verified)
    created_at: '2025-12-25T00:00:00Z',
  },

  // Vouches to alice
  {
    id: 'vch_007',
    from_agent_id: 'mlt_verified_002', // bob (verified)
    to_agent_id: 'mlt_verified_001', // alice (verified)
    created_at: '2025-12-20T00:00:00Z',
  },
  {
    id: 'vch_008',
    from_agent_id: 'mlt_verified_003', // frank (verified)
    to_agent_id: 'mlt_verified_001', // alice (verified)
    created_at: '2025-12-21T00:00:00Z',
  },
  {
    id: 'vch_009',
    from_agent_id: 'mlt_perfect_001', // helen (verified)
    to_agent_id: 'mlt_verified_001', // alice (verified)
    created_at: '2025-12-22T00:00:00Z',
  },

  // Vouches to suspended agent (from when they were active)
  {
    id: 'vch_010',
    from_agent_id: 'mlt_verified_001', // alice (verified)
    to_agent_id: 'mlt_suspended_001', // eve (now suspended)
    created_at: '2025-12-15T00:00:00Z',
  },
  {
    id: 'vch_011',
    from_agent_id: 'mlt_verified_002', // bob (verified)
    to_agent_id: 'mlt_suspended_001', // eve (now suspended)
    created_at: '2025-12-16T00:00:00Z',
  },

  // Unverified -> Unverified vouches (these don't count toward trust score)
  {
    id: 'vch_012',
    from_agent_id: 'mlt_unverified_001', // charlie (unverified)
    to_agent_id: 'mlt_pending_001', // dave (pending)
    created_at: '2025-12-29T00:00:00Z',
  },

  // Vouches to helen (perfect agent)
  {
    id: 'vch_013',
    from_agent_id: 'mlt_verified_001',
    to_agent_id: 'mlt_perfect_001',
    created_at: '2025-11-01T00:00:00Z',
  },
  {
    id: 'vch_014',
    from_agent_id: 'mlt_verified_002',
    to_agent_id: 'mlt_perfect_001',
    created_at: '2025-11-02T00:00:00Z',
  },
  {
    id: 'vch_015',
    from_agent_id: 'mlt_verified_003',
    to_agent_id: 'mlt_perfect_001',
    created_at: '2025-11-03T00:00:00Z',
  },
  {
    id: 'vch_016',
    from_agent_id: 'mlt_suspended_001',
    to_agent_id: 'mlt_perfect_001',
    created_at: '2025-11-04T00:00:00Z',
  },
  // Additional vouches for helen to reach max
  {
    id: 'vch_017',
    from_agent_id: 'mlt_verified_004',
    to_agent_id: 'mlt_perfect_001',
    created_at: '2025-11-05T00:00:00Z',
  },
];

/**
 * Expected trust score calculations for test assertions.
 * Maps agent ID to expected score breakdown.
 */
export const EXPECTED_TRUST_SCORES: Record<
  string,
  {
    total: number;
    factors: {
      moltbook_verified: number;
      karma: number;
      age: number;
      vouches: number;
    };
  }
> = {
  mlt_verified_001: {
    total: 80,
    factors: {
      moltbook_verified: 20,
      karma: 25, // 2500 / 100 = 25
      age: 20, // 20+ days, capped at 20
      vouches: 15, // 3 verified vouches * 5 = 15
    },
  },
  mlt_verified_002: {
    total: 45,
    factors: {
      moltbook_verified: 20,
      karma: 5, // 500 / 100 = 5
      age: 15, // 15 days
      vouches: 5, // 1 verified vouch * 5 = 5
    },
  },
  mlt_unverified_001: {
    total: 10,
    factors: {
      moltbook_verified: 0,
      karma: 0,
      age: 10, // 10 days
      vouches: 0, // Vouches from unverified agents don't count
    },
  },
  mlt_pending_001: {
    total: 0,
    factors: {
      moltbook_verified: 0,
      karma: 0,
      age: 1,
      vouches: 0,
    },
  },
  mlt_suspended_001: {
    total: 55,
    factors: {
      moltbook_verified: 20,
      karma: 10, // 1000 / 100 = 10
      age: 20, // 45 days, capped at 20
      vouches: 10, // 2 verified vouches * 5 = 10
    },
  },
  mlt_verified_003: {
    total: 70,
    factors: {
      moltbook_verified: 20,
      karma: 30, // 5000 / 100 = 50, capped at 30
      age: 20, // 25 days, capped at 20
      vouches: 0, // No vouches
    },
  },
  mlt_verified_004: {
    total: 75,
    factors: {
      moltbook_verified: 20,
      karma: 15, // 1500 / 100 = 15
      age: 10, // 10 days
      vouches: 30, // 6 verified vouches * 5 = 30, capped at 30
    },
  },
  mlt_perfect_001: {
    total: 100,
    factors: {
      moltbook_verified: 20,
      karma: 30, // 10000 / 100 = 100, capped at 30
      age: 20, // 90 days, capped at 20
      vouches: 30, // 10+ vouches, capped at 30
    },
  },
};

/**
 * Sample agent data for API request testing.
 * These are valid inputs for the agent creation endpoint.
 */
export const VALID_AGENT_INPUTS = {
  minimal: {},
  withMoltbook: {
    moltbook_username: 'test_user',
  },
  withPublicKey: {
    public_key: 'pk_test_key_12345',
  },
  withCapabilities: {
    capabilities: ['testing', 'automation'],
  },
  complete: {
    moltbook_username: 'complete_agent',
    public_key: 'pk_complete_key_67890',
    capabilities: ['code_review', 'testing', 'deployment'],
  },
};

/**
 * Invalid agent inputs for validation testing.
 */
export const INVALID_AGENT_INPUTS = {
  invalidMoltbook: {
    moltbook_username: '', // Empty username
  },
  tooLongUsername: {
    moltbook_username: 'a'.repeat(256), // Exceeds reasonable length
  },
  invalidCapabilities: {
    capabilities: 'not-an-array', // Should be array
  },
};

/**
 * Test scenarios for trust score edge cases.
 */
export const TRUST_SCORE_SCENARIOS = {
  // Brand new agent: minimal trust
  brandNew: {
    moltbook_verified: false,
    moltbook_karma: null,
    vouch_count: 0,
    age_days: 0,
    expected_score: 0,
  },
  // Verified but no history
  verifiedOnly: {
    moltbook_verified: true,
    moltbook_karma: 0,
    vouch_count: 0,
    age_days: 0,
    expected_score: 20,
  },
  // Maximum karma only
  maxKarma: {
    moltbook_verified: false,
    moltbook_karma: 10000,
    vouch_count: 0,
    age_days: 0,
    expected_score: 30,
  },
  // Maximum age only
  maxAge: {
    moltbook_verified: false,
    moltbook_karma: 0,
    vouch_count: 0,
    age_days: 100,
    expected_score: 20,
  },
  // Maximum vouches only (from verified agents)
  maxVouches: {
    moltbook_verified: false,
    moltbook_karma: 0,
    vouch_count: 10,
    age_days: 0,
    expected_score: 30, // Only if vouchers are verified
  },
  // Everything maxed out
  perfectScore: {
    moltbook_verified: true,
    moltbook_karma: 10000,
    vouch_count: 10,
    age_days: 100,
    expected_score: 100,
  },
  // Just under each threshold
  underThresholds: {
    moltbook_verified: true,
    moltbook_karma: 2999, // 29.99 -> 29 karma points
    vouch_count: 5, // 25 vouch points
    age_days: 19, // 19 age points
    expected_score: 93, // 20 + 29 + 19 + 25 = 93
  },
};

/**
 * Helper to get a sample agent by ID.
 */
export function getSampleAgent(id: string): Agent | undefined {
  return SAMPLE_AGENTS.find((a) => a.id === id);
}

/**
 * Helper to get all vouches for a specific agent.
 */
export function getVouchesFor(agentId: string): Vouch[] {
  return SAMPLE_VOUCHES.filter((v) => v.to_agent_id === agentId);
}

/**
 * Helper to get all vouches from a specific agent.
 */
export function getVouchesFrom(agentId: string): Vouch[] {
  return SAMPLE_VOUCHES.filter((v) => v.from_agent_id === agentId);
}

/**
 * Helper to filter sample agents by status.
 */
export function getAgentsByStatus(
  status: 'pending' | 'active' | 'suspended'
): Agent[] {
  return SAMPLE_AGENTS.filter((a) => a.status === status);
}

/**
 * Helper to filter sample agents by verification status.
 */
export function getVerifiedAgents(verified: boolean = true): Agent[] {
  return SAMPLE_AGENTS.filter((a) => a.moltbook_verified === verified);
}
