import type { APIRoute } from 'astro';
import { trackAdEvent, getAdMetrics } from '../../lib/ad-tracker';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const url = new URL(request.url);
    const adId = url.searchParams.get('id') || 'designer-from-nowhere';
    const type = (url.searchParams.get('type') || 'click') as 'click' | 'impression';

    const env = locals.runtime?.env || (import.meta as any).env;
    await trackAdEvent(adId, type, env);

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};

export const GET: APIRoute = async ({ locals }) => {
  try {
    const env = locals.runtime?.env || (import.meta as any).env;
    const metrics = await getAdMetrics(env);
    return new Response(JSON.stringify(metrics), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};
