/**
 * Type declarations for Cloudflare Vitest Pool Workers test environment
 *
 * Augments the `cloudflare:test` module to include our D1 binding.
 * This must match the bindings defined in wrangler.toml.
 */

import type { Env } from '../src/types';

declare module 'cloudflare:test' {
  interface ProvidedEnv extends Env {}
}
