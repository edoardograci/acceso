import { createClient } from '@libsql/client';
import type { Studio } from './types';

// Wrap the global fetch to short-circuit calls to the migrations/jobs
// HTTP endpoints. Some hosting providers (for example, Turso) don't expose
// the libsql migrations endpoint the client expects and return 400 which
// causes the client to throw while trying to check migration jobs.
//
// Returning a 404 for /v1/jobs makes the client treat the database as
// a non-schema database and skip the migration waiting logic.
// Save the original fetch implementation so our wrapper can call it. This
// prevents infinite recursion when we replace globalThis.fetch below.
const _originalFetch: typeof fetch = (globalThis.fetch ?? fetch) as unknown as typeof fetch;

const safeFetch: typeof fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : String(input);

  try {
    if (url.includes('/v1/jobs')) {
      // Return a 404-like response so the libsql client won't attempt to
      // interpret the database as a schema-management DB.
      return new Response(JSON.stringify({}), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      }) as unknown as Response;
    }
  } catch (err) {
    // If Response isn't available for some reason, fall back to the original fetch.
  }

  return _originalFetch(input as any, init as any);
};

// Some internal parts of the @libsql client (migrations.js) call the global
// fetch directly. Install our wrapper as the global fetch so those calls are
// also short-circuited for the /v1/jobs endpoints.
try {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  globalThis.fetch = safeFetch;
} catch (err) {
  // ignore if we can't overwrite global fetch
}

export const turso = createClient({
  url: import.meta.env.TURSO_DATABASE_URL,
  authToken: import.meta.env.TURSO_AUTH_TOKEN,
  fetch: safeFetch,
});

export async function getStudioBySlug(slug: string): Promise<Studio | null> {
  try {
    const result = await turso.execute({
      sql: 'SELECT * FROM studios WHERE slug = ? AND status = ? LIMIT 1',
      args: [slug, 'Published']
    });

    if (result.rows.length === 0) return null;

    return result.rows[0] as unknown as Studio;
  } catch (error) {
    console.error('Error fetching studio:', error);
    return null;
  }
}

export async function getAllStudios(): Promise<Studio[]> {
  try {
    const result = await turso.execute({
      sql: 'SELECT * FROM studios WHERE status = ? ORDER BY name ASC',
      args: ['Published']
    });

    return result.rows as unknown as Studio[];
  } catch (error) {
    console.error('Error fetching studios:', error);
    return [];
  }
}

export async function getStudiosByCity(city: string): Promise<Studio[]> {
  try {
    const result = await turso.execute({
      sql: 'SELECT * FROM studios WHERE city = ? AND status = ? ORDER BY name ASC',
      args: [city, 'Published']
    });

    return result.rows as unknown as Studio[];
  } catch (error) {
    console.error('Error fetching studios by city:', error);
    return [];
  }
}