/**
 * Agent Routes - API endpoints for MoltID agent management
 * 
 * All routes are prefixed with /v1/agents (set in index.ts)
 */

import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { AgentService } from '../services/agent';
import { TrustService } from '../services/trust';
import type { Env } from '../types';

// Extended environment type with context variables for authenticated routes
type AgentRouteEnv = {
  Bindings: Env;
  Variables: {
    authenticatedAgentId: string;
  };
};

const agentRoutes = new Hono<AgentRouteEnv>();

/**
 * Authentication middleware for agent routes.
 * Validates API key from Authorization header against the agent ID in the route.
 * 
 * Requires:
 * - Authorization header with format: "Bearer <api_key>"
 * - Route parameter :id matching the agent the key belongs to
 * 
 * On success, sets `authenticatedAgentId` in context.
 */
const requireAgentAuth = createMiddleware<AgentRouteEnv>(async (c, next) => {
  const authHeader = c.req.header('Authorization');
  
  // Check for missing Authorization header
  if (!authHeader) {
    return c.json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Missing Authorization header',
      },
    }, 401);
  }
  
  // Check for valid Bearer token format
  if (!authHeader.startsWith('Bearer ')) {
    return c.json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid Authorization header format. Expected: Bearer <token>',
      },
    }, 401);
  }
  
  const token = authHeader.slice(7); // Remove "Bearer " prefix
  const agentId = c.req.param('id');
  
  // Validate the API key against the agent
  const agentService = new AgentService(c.env.DB);
  const isValid = await agentService.validateApiKey(agentId, token);
  
  if (!isValid) {
    return c.json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid or expired API key',
      },
    }, 401);
  }
  
  // Store authenticated agent ID in context for downstream handlers
  c.set('authenticatedAgentId', agentId);
  await next();
});

/**
 * Flexible authentication middleware that looks up the agent by API key.
 * Unlike requireAgentAuth, this doesn't require the agent ID in the route.
 * Used for endpoints where the caller authenticates as any agent (e.g., vouch).
 * 
 * Requires:
 * - Authorization header with format: "Bearer <api_key>"
 * 
 * On success, sets `authenticatedAgentId` in context to the agent owning the key.
 */
const requireApiKeyAuth = createMiddleware<AgentRouteEnv>(async (c, next) => {
  const authHeader = c.req.header('Authorization');
  
  // Check for missing Authorization header
  if (!authHeader) {
    return c.json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Missing Authorization header',
      },
    }, 401);
  }
  
  // Check for valid Bearer token format
  if (!authHeader.startsWith('Bearer ')) {
    return c.json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid Authorization header format. Expected: Bearer <token>',
      },
    }, 401);
  }
  
  const token = authHeader.slice(7); // Remove "Bearer " prefix
  
  // Look up the agent by API key
  const agentService = new AgentService(c.env.DB);
  const agent = await agentService.getByApiKey(token);
  
  if (!agent) {
    return c.json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid or expired API key',
      },
    }, 401);
  }
  
  // Store authenticated agent ID in context for downstream handlers
  c.set('authenticatedAgentId', agent.id);
  await next();
});

// Validation schemas
const createAgentSchema = z.object({
  moltbook_username: z.string().min(1).max(64).optional(),
  public_key: z.string().optional(),
  capabilities: z.array(z.string()).optional(),
});

// Schema for vouch endpoint - from_agent_id now comes from authenticated context
// BREAKING CHANGE: from_agent_id removed from body, now derived from auth
const vouchSchema = z.object({
  signature: z.string().optional(), // For future key-based auth
});

// Schema for PATCH capabilities endpoint
const updateCapabilitiesSchema = z.object({
  capabilities: z.array(z.string()).min(0),
});

// POST /v1/agents - Register new agent
agentRoutes.post('/', zValidator('json', createAgentSchema), async (c) => {
  const input = c.req.valid('json');
  const agentService = new AgentService(c.env.DB);
  
  try {
    const { agent, apiKey } = await agentService.create(input);
    return c.json({ 
      success: true, 
      data: agentService.toPublic(agent),
      api_key: apiKey,
      api_key_warning: 'Store this key securely. It will not be shown again.',
    }, 201);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('UNIQUE constraint')) {
      return c.json({ 
        success: false, 
        error: { code: 'already_exists', message: 'Moltbook username already registered' } 
      }, 409);
    }
    throw error;
  }
});

// GET /v1/agents/:id - Get agent by ID
// NOTE: This must come after /moltbook/:username to avoid route conflicts
agentRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');
  
  // Skip if this looks like a moltbook route (handled by specific route)
  if (id === 'moltbook') {
    return c.notFound();
  }
  
  const agentService = new AgentService(c.env.DB);
  
  const agent = await agentService.getById(id);
  if (!agent) {
    return c.json({ 
      success: false, 
      error: { code: 'not_found', message: 'Agent not found' } 
    }, 404);
  }
  
  return c.json({ success: true, data: agentService.toPublic(agent) });
});

// PATCH /v1/agents/:id - Update agent capabilities (requires auth)
agentRoutes.patch('/:id', requireAgentAuth, zValidator('json', updateCapabilitiesSchema), async (c) => {
  const id = c.req.param('id');
  const { capabilities } = c.req.valid('json');
  const agentService = new AgentService(c.env.DB);
  
  try {
    const updated = await agentService.updateCapabilities(id, capabilities);
    
    if (!updated) {
      return c.json({ 
        success: false, 
        error: { code: 'not_found', message: 'Agent not found' } 
      }, 404);
    }
    
    return c.json({ success: true, data: agentService.toPublic(updated) });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    // updateCapabilities throws validation errors - return as 400
    return c.json({ 
      success: false, 
      error: { code: 'validation_error', message: errorMessage } 
    }, 400);
  }
});

// GET /v1/agents/moltbook/:username - Get by Moltbook username
agentRoutes.get('/moltbook/:username', async (c) => {
  const username = c.req.param('username');
  const agentService = new AgentService(c.env.DB);
  
  const agent = await agentService.getByMoltbook(username);
  if (!agent) {
    return c.json({ 
      success: false, 
      error: { code: 'not_found', message: 'Agent not found' } 
    }, 404);
  }
  
  return c.json({ success: true, data: agentService.toPublic(agent) });
});

// GET /v1/agents - List/search agents
agentRoutes.get('/', async (c) => {
  const agentService = new AgentService(c.env.DB);
  
  const query = {
    verified: c.req.query('verified') === 'true' ? true : undefined,
    min_trust: c.req.query('min_trust') ? parseInt(c.req.query('min_trust')!) : undefined,
    capability: c.req.query('capability'),
    limit: Math.min(parseInt(c.req.query('limit') || '20'), 100),
    offset: parseInt(c.req.query('offset') || '0'),
  };
  
  const agents = await agentService.search(query);
  return c.json({ success: true, data: agents });
});

// POST /v1/agents/:id/verify/moltbook - Verify Moltbook profile
agentRoutes.post('/:id/verify/moltbook', async (c) => {
  const id = c.req.param('id');
  const agentService = new AgentService(c.env.DB);
  const trustService = new TrustService(c.env.DB);
  
  const agent = await agentService.getById(id);
  if (!agent) {
    return c.json({ 
      success: false, 
      error: { code: 'not_found', message: 'Agent not found' } 
    }, 404);
  }
  
  if (!agent.moltbook_username) {
    return c.json({ 
      success: false, 
      error: { code: 'no_moltbook', message: 'No Moltbook username linked' } 
    }, 400);
  }
  
  // Check Moltbook for verification code
  const result = await agentService.verifyMoltbook(agent);
  
  if (result.verified) {
    // Update agent with verification and karma
    await agentService.update(id, {
      moltbook_verified: true,
      moltbook_karma: result.karma,
      status: 'active',
    });
    
    // Recalculate trust score
    const newScore = await trustService.calculateScore(id);
    await agentService.update(id, { trust_score: newScore });
    
    const updated = await agentService.getById(id);
    return c.json({ 
      success: true, 
      data: {
        verified: true,
        karma_imported: result.karma,
        trust_score: newScore,
        agent: agentService.toPublic(updated!),
      }
    });
  }
  
  return c.json({ 
    success: false, 
    error: { 
      code: 'verification_failed', 
      message: `Verification code not found. Create a Moltbook post containing "${agent.verification_code}" to verify.` 
    } 
  }, 400);
});

// GET /v1/agents/:id/trust - Get trust details
agentRoutes.get('/:id/trust', async (c) => {
  const id = c.req.param('id');
  const agentService = new AgentService(c.env.DB);
  const trustService = new TrustService(c.env.DB);
  
  const agent = await agentService.getById(id);
  if (!agent) {
    return c.json({ 
      success: false, 
      error: { code: 'not_found', message: 'Agent not found' } 
    }, 404);
  }
  
  const details = await trustService.getDetails(agent);
  return c.json({ success: true, data: details });
});

// POST /v1/agents/:id/vouch - Vouch for an agent
// BREAKING CHANGE (v1.1): Requires authentication. from_agent_id is now derived from
// the authenticated agent, not from request body. The :id param is the agent being vouched for.
agentRoutes.post('/:id/vouch', requireApiKeyAuth, zValidator('json', vouchSchema), async (c) => {
  const toId = c.req.param('id');
  // from_agent_id is now derived from authenticated context (BREAKING CHANGE)
  const from_agent_id = c.get('authenticatedAgentId');
  const agentService = new AgentService(c.env.DB);
  const trustService = new TrustService(c.env.DB);
  
  // Verify voucher exists and is verified
  const voucher = await agentService.getById(from_agent_id);
  if (!voucher || !voucher.moltbook_verified) {
    return c.json({ 
      success: false, 
      error: { code: 'unauthorized', message: 'Only verified agents can vouch' } 
    }, 403);
  }
  
  // Verify target exists
  const target = await agentService.getById(toId);
  if (!target) {
    return c.json({ 
      success: false, 
      error: { code: 'not_found', message: 'Agent not found' } 
    }, 404);
  }
  
  // Can't vouch for yourself
  if (from_agent_id === toId) {
    return c.json({ 
      success: false, 
      error: { code: 'invalid_vouch', message: 'Cannot vouch for yourself' } 
    }, 400);
  }
  
  try {
    await agentService.addVouch(from_agent_id, toId);
    
    // Recalculate trust score
    const newScore = await trustService.calculateScore(toId);
    await agentService.update(toId, { trust_score: newScore });
    
    return c.json({ 
      success: true, 
      data: { 
        vouch_added: true, 
        new_trust_score: newScore 
      } 
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('UNIQUE constraint')) {
      return c.json({ 
        success: false, 
        error: { code: 'already_vouched', message: 'Already vouched for this agent' } 
      }, 409);
    }
    throw error;
  }
});

export { agentRoutes, requireAgentAuth, requireApiKeyAuth };
