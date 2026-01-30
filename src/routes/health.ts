/**
 * Health Routes - API health check endpoint
 * 
 * Mounted at /v1 (so /v1/health becomes the full path)
 */

import { Hono } from 'hono';
import type { Env } from '../types';

const healthRoutes = new Hono<{ Bindings: Env }>();

healthRoutes.get('/health', async (c) => {
  // Quick DB check
  try {
    await c.env.DB.prepare('SELECT 1').first();
    return c.json({ 
      status: 'healthy', 
      timestamp: new Date().toISOString(),
      version: '1.0.0',
    });
  } catch (error) {
    return c.json({ 
      status: 'unhealthy', 
      timestamp: new Date().toISOString(),
      error: 'Database connection failed',
    }, 503);
  }
});

export { healthRoutes };
