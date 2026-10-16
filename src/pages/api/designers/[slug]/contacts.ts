import type { APIRoute } from 'astro';
import { checkRateLimit, createRateLimitResponse, getClientIdentifier, RateLimits } from '../../../../lib/rate-limiter';
import { readJsonFromBucket, toArray } from '../../../../lib/readJson';
import type { Env } from '../../../../env.d';
import type { Studio } from '../../../../lib/types';

export const prerender = false;

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i;

function studioEmails(studio: Studio): string[] {
  return [studio.email, studio.email2]
    .filter((value): value is string => typeof value === 'string' && value.includes('@'))
    .map((value) => value.trim());
}

export const GET: APIRoute = async ({ params, request, locals }) => {
  if (!locals.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const slug = String(params.slug || '');
  if (!SLUG_RE.test(slug) || slug.length > 160) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  const env = (locals.runtime?.env || import.meta.env) as unknown as Env;
  const clientId = getClientIdentifier(request, locals.user.id);
  const rateLimitResult = await checkRateLimit(clientId, RateLimits.CONTACTS, env);
  if (!rateLimitResult.success) {
    return createRateLimitResponse(Math.max(1, rateLimitResult.retryAfter ?? 1), rateLimitResult.limit);
  }

  try {
    const raw = await readJsonFromBucket('test-studios.json', env);
    const studio = (toArray(raw) as Studio[]).find((item) => item.slug === slug);
    if (!studio) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    return Response.json(
      { emails: studioEmails(studio) },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    console.error('[contacts API] failed to load studio contacts:', error);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
};
