// src/pages/auth/logout.ts
import type { APIRoute } from 'astro';
import { createLucia } from '../../lib/auth/lucia';

export const POST: APIRoute = async ({ locals, cookies }) => {
  const runtimeEnv = locals.runtime?.env || {};
  const metaEnv = import.meta.env || {};
  const env = { ...metaEnv, ...runtimeEnv } as unknown as any; // Type 'any' used to matching Env usually but explicitly ensuring it passes to createLucia

  try {
    const lucia = createLucia(env);
    const sessionId = cookies.get(lucia.sessionCookieName)?.value;

    if (sessionId) {
      await lucia.invalidateSession(sessionId);
    }

    // Create blank session cookie to clear it
    const blankCookie = lucia.createBlankSessionCookie();
    cookies.set(blankCookie.name, blankCookie.value, blankCookie.attributes);

    // Return HTML that clears sessionStorage before redirecting
    return new Response(
      `<!DOCTYPE html>
<html>
<head>
  <title>Logging out...</title>
</head>
<body>
  <script>
    // Clear all sessionStorage including collections state
    sessionStorage.clear();
    
    // Clear collections state if it exists
    if (window.collectionsState) {
      window.collectionsState.clear();
    }
    
    // Redirect to home
    window.location.href = '/';
  </script>
  <p>Logging out...</p>
</body>
</html>`,
      {
        status: 200,
        headers: {
          'Content-Type': 'text/html',
        },
      }
    );
  } catch (error) {
    console.error('[Logout] Error logging out:', error);
    // Still clear and redirect even if there's an error
    return new Response(
      `<!DOCTYPE html>
<html>
<head>
  <title>Logging out...</title>
</head>
<body>
  <script>
    sessionStorage.clear();
    window.location.href = '/';
  </script>
  <p>Logging out...</p>
</body>
</html>`,
      {
        status: 200,
        headers: {
          'Content-Type': 'text/html',
        },
      }
    );
  }
};

