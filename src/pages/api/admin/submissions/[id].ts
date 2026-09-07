// src/pages/api/admin/submissions/[id].ts
// Apply a review decision to a submission. Status changes never send email —
// that is the sibling /email route — so approving a row can't surprise an
// applicant, and re-sending a message can't silently move the status.
import type { APIRoute } from 'astro';
import { adminNotFound, isAdmin } from '../../../../lib/admin';
import { isSubmissionStatus, updateSubmission } from '../../../../lib/db';
import {
  checkRateLimit,
  createRateLimitResponse,
  getClientIdentifier,
  RateLimits,
} from '../../../../lib/rate-limiter';
import type { Env } from '../../../../env.d';

export const prerender = false;

const MAX_NOTES_LENGTH = 2000;

export const POST: APIRoute = async ({ request, locals, params }) => {
  const runtimeEnv = locals.runtime?.env || {};
  const metaEnv = import.meta.env || {};
  const env = { ...metaEnv, ...runtimeEnv } as unknown as Env;

  if (!isAdmin(locals.user, env)) {
    return adminNotFound();
  }

  const id = String(params.id || '').trim();
  if (!id) {
    return Response.json({ error: 'Missing submission id' }, { status: 400 });
  }

  try {
    const identifier = getClientIdentifier(request, locals.user!.id);
    const rateLimit = await checkRateLimit(identifier, RateLimits.ADMIN, env);
    if (!rateLimit.success) {
      return createRateLimitResponse(rateLimit.retryAfter || 60, rateLimit.limit);
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const update: Parameters<typeof updateSubmission>[1] = {};

    if (body.status !== undefined) {
      if (!isSubmissionStatus(body.status)) {
        return Response.json({ error: 'Invalid status' }, { status: 400 });
      }
      update.status = body.status;
    }

    if (body.adminNotes !== undefined) {
      const notes = String(body.adminNotes ?? '').trim();
      if (notes.length > MAX_NOTES_LENGTH) {
        return Response.json(
          { error: `Notes must be ${MAX_NOTES_LENGTH} characters or fewer` },
          { status: 400 }
        );
      }
      update.adminNotes = notes || null;
    }

    if (body.profileUrl !== undefined) {
      const url = String(body.profileUrl ?? '').trim();
      if (url && !/^https?:\/\/\S+$/i.test(url)) {
        return Response.json({ error: 'Profile URL must be a valid http(s) URL' }, { status: 400 });
      }
      update.profileUrl = url || null;
    }

    if (!Object.keys(update).length) {
      return Response.json({ error: 'Nothing to update' }, { status: 400 });
    }

    const updated = await updateSubmission(id, update, locals.user!.email ?? '', env);
    if (!updated) {
      return Response.json({ error: 'Submission not found' }, { status: 404 });
    }

    return Response.json({ success: true }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error: any) {
    console.error('[Admin Submission Update] Error:', error);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
};
