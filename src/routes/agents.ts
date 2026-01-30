/**
 * Agent Routes - API endpoints for MoltID agent management
 * 
 * All routes are prefixed with /v1/agents (set in index.ts)
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { AgentService } from '../services/agent';
import { TrustService } from '../services/trust';
import type { Env } from '../types';

const agentRoutes = new Hono<{ Bindings: Env }>();

// Validation schemas
const createAgentSchema = z.object({
  moltbook_username: z.string().min(1).max(64).optional(),
  public_key: z.string().optional(),
  capabilities: z.array(z.string()).optional(),
});

const vouchSchema = z.object({
  from_agent_id: z.string().min(1),
  signature: z.string().optional(), // For future key-based auth
});

// POST /v1/agents - Register new agent
agentRoutes.post('/', zValidator('json', createAgentSchema), async (c) => {
  const input = c.req.valid('json');
  const agentService = new AgentService(c.env.DB);
  
  try {
    const agent = await agentService.create(input);
    return c.json({ success: true, data: agent }, 201);
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
      message: `Verification code not found. Add "${agent.verification_code}" to your Moltbook bio or post.` 
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
agentRoutes.post('/:id/vouch', zValidator('json', vouchSchema), async (c) => {
  const toId = c.req.param('id');
  const { from_agent_id } = c.req.valid('json');
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

export { agentRoutes };
