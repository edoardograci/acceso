// src/pages/auth/magic-link/send.ts
import type { APIRoute } from 'astro';
import { generateMagicLink } from '../../../lib/auth/magic-link';

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  
  try {
    const body = await request.json() as { email?: string };
    const { email } = body;

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Valid email is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const magicLink = await generateMagicLink(email.toLowerCase().trim(), env);

    // TODO: In production, send email via Resend or similar service
    // For MVP, return the link in the response for testing
    return new Response(
      JSON.stringify({ 
        success: true, 
        magicLink,
        message: 'Magic link generated. In production, this will be sent via email.',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[Magic Link] Error generating magic link:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Failed to generate magic link' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

