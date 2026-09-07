// src/pages/api/admin/suggestions/[id].ts
// Triage or remove one recommendation. Recommendations are submitted
// anonymously — no contact address is captured — so there is deliberately no
// email path here, only accept / dismiss / delete.
import type { APIRoute } from 'astro';
import { adminNotFound, isAdmin } from '../../../../lib/admin';
import { deleteSuggestion, isSuggestionStatus, updateSuggestion } from '../../../../lib/db';
import {
  checkRateLimit,
  createRateLimitResponse,
  getClientIdentifier,
  RateLimits,
} from '../../../../lib/rate-limiter';
import type { Env } from '../../../../env.d';

export const prerender = false;

function resolveEnv(locals: App.Locals): Env {
  const runtimeEnv = locals.runtime?.env || {};
  const metaEnv = import.meta.env || {};
  return { ...metaEnv, ...runtimeEnv } as unknown as Env;
}

export const POST: APIRoute = async ({ request, locals, params }) => {
  const env = resolveEnv(locals);
  if (!isAdmin(locals.user, env)) return adminNotFound();

  const id = String(params.id || '').trim();
  if (!id) return Response.json({ error: 'Missing suggestion id' }, { status: 400 });

  try {
    const identifier = getClientIdentifier(request, locals.user!.id);
    const rateLimit = await checkRateLimit(identifier, RateLimits.ADMIN, env);
    if (!rateLimit.success) {
      return createRateLimitResponse(rateLimit.retryAfter || 60, rateLimit.limit);
    }

    const body = await request.json().catch(() => null);
    if (!body || !isSuggestionStatus(body.status)) {
      return Response.json(
        { error: 'status must be "new", "accepted" or "dismissed"' },
        { status: 400 }
      );
    }

    const updated = await updateSuggestion(id, body.status, env);
    if (!updated) {
      return Response.json({ error: 'Recommendation not found' }, { status: 404 });
    }

    return Response.json({ success: true }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error: any) {
    console.error('[Admin Suggestion Update] Error:', error);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
};

export const DELETE: APIRoute = async ({ request, locals, params }) => {
  const env = resolveEnv(locals);
  if (!isAdmin(locals.user, env)) return adminNotFound();

  const id = String(params.id || '').trim();
  if (!id) return Response.json({ error: 'Missing suggestion id' }, { status: 400 });

  try {
    const identifier = getClientIdentifier(request, locals.user!.id);
    const rateLimit = await checkRateLimit(identifier, RateLimits.ADMIN, env);
    if (!rateLimit.success) {
      return createRateLimitResponse(rateLimit.retryAfter || 60, rateLimit.limit);
    }

    const removed = await deleteSuggestion(id, env);
    if (!removed) {
      return Response.json({ error: 'Recommendation not found' }, { status: 404 });
    }

    return Response.json({ success: true }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error: any) {
    console.error('[Admin Suggestion Delete] Error:', error);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
};
