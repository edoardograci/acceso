import type { APIRoute } from 'astro';
import { checkRateLimit, createRateLimitResponse, getClientIdentifier, RateLimits } from '../../../../lib/rate-limiter';
import { toArray } from '../../../../lib/readJson';
import type { Env } from '../../../../env.d';
import type { Studio } from '../../../../lib/types';

export const prerender = false;

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i;

type StudioContact = Pick<Studio, 'slug' | 'email' | 'email2'>;

function studioEmails(studio: Pick<Studio, 'email' | 'email2'>): string[] {
  return [studio.email, studio.email2]
    .filter((value): value is string => typeof value === 'string' && value.includes('@'))
    .map((value) => value.trim());
}

function privateJson(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

export const GET: APIRoute = async ({ params, request, locals }) => {
  if (!locals.user?.id) {
    return privateJson({ error: 'Unauthorized' }, 401);
  }

  const slug = String(params.slug || '');
  if (!SLUG_RE.test(slug) || slug.length > 160) {
    return privateJson({ error: 'Not found' }, 404);
  }

  const env = (locals.runtime?.env || import.meta.env) as unknown as Env;
  const clientId = getClientIdentifier(request, locals.user.id);
  const rateLimitResult = await checkRateLimit(clientId, RateLimits.CONTACTS, env);
  if (!rateLimitResult.success) {
    const response = createRateLimitResponse(Math.max(1, rateLimitResult.retryAfter ?? 1), rateLimitResult.limit);
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  }

  try {
    const bucket = env.CONTACTS_BUCKET;
    if (!bucket) {
      console.error('[contacts API] CONTACTS_BUCKET binding is unavailable');
      return privateJson({ error: 'Contacts are temporarily unavailable' }, 503);
    }

    const object = await bucket.get('test-studio-contacts.json');
    if (!object) {
      console.error('[contacts API] test-studio-contacts.json is missing from CONTACTS_BUCKET');
      return privateJson({ error: 'Contacts are temporarily unavailable' }, 503);
    }

    const raw = JSON.parse(await object.text());
    const studio = (toArray(raw) as StudioContact[]).find((item) => item.slug === slug);
    if (!studio) {
      return privateJson({ error: 'Not found' }, 404);
    }

    return privateJson({ emails: studioEmails(studio) });
  } catch (error) {
    console.error('[contacts API] failed to load studio contacts:', error);
    return privateJson({ error: 'Internal Server Error' }, 500);
  }
};
