/**
 * TrustService - Calculate and manage trust scores for agents
 *
 * Trust score calculation (max 100 points):
 * - Moltbook verification: +20 points
 * - Karma: 1 point per 100 karma, capped at 30 points
 * - Age: 1 point per day since registration, capped at 20 points
 * - Vouches: 5 points per vouch from verified agents, capped at 30 points
 */

import type { Agent, TrustDetails } from '../types';

// Score caps
const MOLTBOOK_VERIFIED_POINTS = 20;
const KARMA_MAX_POINTS = 30;
const KARMA_DIVISOR = 100;
const AGE_MAX_POINTS = 20;
const VOUCH_POINTS_EACH = 5;
const VOUCH_MAX_POINTS = 30;
const MAX_TOTAL_SCORE = 100;

export class TrustService {
  constructor(private db: D1Database) {}

  /**
   * Calculate trust score for an agent (0-100)
   */
  async calculateScore(agentId: string): Promise<number> {
    const agent = (await this.db
      .prepare('SELECT * FROM agents WHERE id = ?')
      .bind(agentId)
      .first()) as any;

    if (!agent) return 0;

    let score = 0;

    // Moltbook verification: +20 points
    if (agent.moltbook_verified) {
      score += MOLTBOOK_VERIFIED_POINTS;
    }

    // Karma: up to 30 points (1 point per 100 karma, capped)
    const karma = agent.moltbook_karma || 0;
    score += Math.min(Math.floor(karma / KARMA_DIVISOR), KARMA_MAX_POINTS);

    // Age: up to 20 points (1 point per day, capped)
    const createdAt = new Date(agent.created_at);
    const ageDays = Math.floor(
      (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24)
    );
    score += Math.min(ageDays, AGE_MAX_POINTS);

    // Vouches: 5 points each, up to 30
    // Only count vouches from verified agents
    const verifiedVouches = (await this.db
      .prepare(
        `
      SELECT COUNT(*) as count FROM vouches v
      JOIN agents a ON v.from_agent_id = a.id
      WHERE v.to_agent_id = ? AND a.moltbook_verified = 1
    `
      )
      .bind(agentId)
      .first()) as any;

    const vouchCount = verifiedVouches?.count || 0;
    score += Math.min(vouchCount * VOUCH_POINTS_EACH, VOUCH_MAX_POINTS);

    return Math.min(score, MAX_TOTAL_SCORE);
  }

  /**
   * Get detailed trust breakdown for an agent
   */
  async getDetails(agent: Agent): Promise<TrustDetails> {
    const createdAt = new Date(agent.created_at);
    const ageDays = Math.floor(
      (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Calculate individual factors
    const moltbookFactor = agent.moltbook_verified ? MOLTBOOK_VERIFIED_POINTS : 0;
    const karmaFactor = Math.min(
      Math.floor((agent.moltbook_karma || 0) / KARMA_DIVISOR),
      KARMA_MAX_POINTS
    );
    const ageFactor = Math.min(ageDays, AGE_MAX_POINTS);
    const vouchFactor = Math.min(
      agent.vouch_count * VOUCH_POINTS_EACH,
      VOUCH_MAX_POINTS
    );

    return {
      score: agent.trust_score,
      factors: {
        moltbook_verified: moltbookFactor,
        karma: karmaFactor,
        age: ageFactor,
        vouches: vouchFactor,
      },
      moltbook_verified: agent.moltbook_verified,
      moltbook_karma: agent.moltbook_karma,
      vouch_count: agent.vouch_count,
      age_days: ageDays,
    };
  }
}
