import { companionOdooConfigured } from '@/lib/companion-odoo';

/**
 * Which build is running and whether it points at Odoo (Jodi #9/#14).
 * Set DOJANG_RELEASE_SHA to the deployed commit; anything that isn't a full
 * 40-character SHA is reported as null.
 */
export function releaseInfo() {
  const revision = process.env.DOJANG_RELEASE_SHA ?? '';
  return {
    revision: /^[a-f0-9]{40}$/.test(revision) ? revision : null,
    mode: companionOdooConfigured() ? 'odoo' : 'unconfigured',
  };
}

/** Never cached: each check must describe this exact moment. */
export const NO_STORE = { 'cache-control': 'private, no-store' };
