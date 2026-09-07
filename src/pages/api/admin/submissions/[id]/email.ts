// src/pages/api/admin/submissions/[id]/email.ts
// Send (or preview) the acceptance / rejection email for one submission.
//
// GET  ?kind=acceptance&profileUrl=… → renders the email without sending, for
//      the dashboard's preview panel.
// POST { kind, profileUrl? }        → sends it and records the timestamp.
//
// The "sent" timestamp is written only after Resend accepts the message, so the
// dashboard never shows a send that silently failed.
import type { APIRoute } from 'astro';
import { adminNotFound, isAdmin } from '../../../../../lib/admin';
import { getSubmissionById, markDecisionEmailSent, updateSubmission } from '../../../../../lib/db';
import {
  renderDecisionEmail,
  sendDecisionEmail,
  type DecisionKind,
} from '../../../../../lib/emails/submission-decision';
import {
  checkRateLimit,
  createRateLimitResponse,
  getClientIdentifier,
  RateLimits,
} from '../../../../../lib/rate-limiter';
import type { Env } from '../../../../../env.d';

export const prerender = false;

function isDecisionKind(value: unknown): value is DecisionKind {
  return value === 'acceptance' || value === 'rejection';
}

function resolveEnv(locals: App.Locals): Env {
  const runtimeEnv = locals.runtime?.env || {};
  const metaEnv = import.meta.env || {};
  return { ...metaEnv, ...runtimeEnv } as unknown as Env;
}

export const GET: APIRoute = async ({ locals, params, url }) => {
  const env = resolveEnv(locals);
  if (!isAdmin(locals.user, env)) return adminNotFound();

  const kind = url.searchParams.get('kind');
  if (!isDecisionKind(kind)) {
    return Response.json({ error: 'kind must be "acceptance" or "rejection"' }, { status: 400 });
  }

  const profileUrl = url.searchParams.get('profileUrl')?.trim() || '';
  if (kind === 'acceptance' && !profileUrl) {
    return Response.json({ error: 'A profile URL is required to preview an acceptance' }, { status: 400 });
  }

  const submission = await getSubmissionById(String(params.id || ''), env);
  if (!submission) {
    return Response.json({ error: 'Submission not found' }, { status: 404 });
  }

  const rendered = renderDecisionEmail(kind, profileUrl);
  return Response.json(
    { ...rendered, to: submission.contactEmail },
    { headers: { 'Cache-Control': 'private, no-store' } }
  );
};

export const POST: APIRoute = async ({ request, locals, params }) => {
  const env = resolveEnv(locals);
  if (!isAdmin(locals.user, env)) return adminNotFound();

  const id = String(params.id || '').trim();
  if (!id) return Response.json({ error: 'Missing submission id' }, { status: 400 });

  try {
    const identifier = getClientIdentifier(request, locals.user!.id);
    const rateLimit = await checkRateLimit(identifier, RateLimits.ADMIN, env);
    if (!rateLimit.success) {
      return createRateLimitResponse(rateLimit.retryAfter || 60, rateLimit.limit);
    }

    const body = await request.json().catch(() => null);
    if (!body || !isDecisionKind(body.kind)) {
      return Response.json({ error: 'kind must be "acceptance" or "rejection"' }, { status: 400 });
    }
    const kind: DecisionKind = body.kind;

    const submission = await getSubmissionById(id, env);
    if (!submission) {
      return Response.json({ error: 'Submission not found' }, { status: 404 });
    }
    if (!submission.contactEmail) {
      return Response.json({ error: 'This submission has no contact email' }, { status: 400 });
    }

    let profileUrl = String(body.profileUrl ?? submission.profileUrl ?? '').trim();
    if (kind === 'acceptance') {
      if (!profileUrl) {
        return Response.json({ error: 'A profile URL is required for an acceptance email' }, { status: 400 });
      }
      if (!/^https?:\/\/\S+$/i.test(profileUrl)) {
        return Response.json({ error: 'Profile URL must be a valid http(s) URL' }, { status: 400 });
      }
    }

    const apiKey =
      (env as any).RESEND_API_KEY ||
      import.meta.env.RESEND_API_KEY ||
      (typeof process !== 'undefined' ? process.env?.RESEND_API_KEY : '') ||
      '';
    if (!apiKey) {
      return Response.json({ error: 'RESEND_API_KEY is not configured' }, { status: 500 });
    }

    await sendDecisionEmail(apiKey, {
      to: submission.contactEmail,
      kind,
      profileUrl: profileUrl || undefined,
    });

    await markDecisionEmailSent(id, kind, env);

    // Remember the URL that was actually mailed out, so a later resend or an
    // audit shows the same link the applicant received.
    if (kind === 'acceptance' && profileUrl && profileUrl !== submission.profileUrl) {
      await updateSubmission(id, { profileUrl }, locals.user!.email ?? '', env);
    }

    return Response.json(
      { success: true, sentTo: submission.contactEmail },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error: any) {
    console.error('[Admin Submission Email] Error:', error);
    return Response.json(
      { error: error?.message || 'Failed to send the email' },
      { status: 502 }
    );
  }
};
