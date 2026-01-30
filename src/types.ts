/**
 * MoltID Type Definitions
 */

// Agent types
export interface Agent {
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
  created_at: string;
  updated_at: string;
}

export interface AgentCreateInput {
  moltbook_username?: string;
  public_key?: string;
  capabilities?: string[];
}

export interface AgentPublic {
  id: string;
  moltbook_username: string | null;
  moltbook_verified: boolean;
  capabilities: string[];
  trust_score: number;
  vouch_count: number;
  status: string;
  created_at: string;
}

// Trust types
export interface TrustDetails {
  score: number;
  factors: {
    moltbook_verified: number;
    karma: number;
    age: number;
    vouches: number;
  };
  moltbook_verified: boolean;
  moltbook_karma: number | null;
  vouch_count: number;
  age_days: number;
}

// Vouch types
export interface Vouch {
  id: string;
  from_agent_id: string;
  to_agent_id: string;
  created_at: string;
}

// API response types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

// Environment bindings
export interface Env {
  DB: D1Database;
  ENVIRONMENT: string;
}
