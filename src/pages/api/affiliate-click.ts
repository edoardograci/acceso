import type { APIRoute } from 'astro';
import { trackAffiliateClick, type AffiliateCategory } from '../../lib/ad-tracker';
import type { Env } from '../../env.d';

export const prerender = false;

const CATEGORIES = new Set<AffiliateCategory>(['books', 'tools', 'courses']);
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const POST: APIRoute = async ({ request, locals }) => {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return new Response(null, { status: 400 });
  }

  if (!payload || typeof payload !== 'object') {
    return new Response(null, { status: 400 });
  }

  const { category, item } = payload as Record<string, unknown>;
  if (
    typeof category !== 'string' ||
    !CATEGORIES.has(category as AffiliateCategory) ||
    typeof item !== 'string' ||
    item.length > 160 ||
    !SLUG_RE.test(item)
  ) {
    return new Response(null, { status: 400 });
  }

  const env = (locals.runtime?.env || import.meta.env) as unknown as Env;
  try {
    await trackAffiliateClick(category as AffiliateCategory, item, env);
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error('[Affiliate clicks] failed to record click:', error);
    return new Response(null, { status: 500 });
  }
};
