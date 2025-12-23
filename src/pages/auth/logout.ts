// src/pages/auth/logout.ts
import type { APIRoute } from 'astro';
import { createLucia } from '../../lib/auth/lucia';

export const POST: APIRoute = async ({ locals, redirect, cookies }) => {
  const env = locals.runtime.env;
  
  try {
    const lucia = createLucia(env);
    const sessionId = cookies.get(lucia.sessionCookieName)?.value;

    if (sessionId) {
      await lucia.invalidateSession(sessionId);
    }

    // Create blank session cookie to clear it
    const blankCookie = lucia.createBlankSessionCookie();
    cookies.set(blankCookie.name, blankCookie.value, blankCookie.attributes);
    
    return redirect('/', 302);
  } catch (error) {
    console.error('[Logout] Error logging out:', error);
    // Still redirect even if there's an error
    return redirect('/', 302);
  }
};

