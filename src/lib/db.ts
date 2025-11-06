import type { Studio } from './types';

// Turso HTTP API client for Cloudflare compatibility
interface TursoHttpResponse {
  results: {
    columns: string[];
    rows: any[][];
  }[];
}

class TursoHttpClient {
  private baseUrl: string;
  private authToken: string;

  constructor(url: string, authToken: string) {
    // Convert libsql:// to https://
    this.baseUrl = url.replace('libsql://', 'https://');
    this.authToken = authToken;
    console.log('[Turso] Initialized HTTP client with base URL:', this.baseUrl);
  }

  async execute(query: { sql: string; args?: any[] }) {
    try {
      const endpoint = `${this.baseUrl}/v2/pipeline`;
      console.log('\n[Turso] Executing query...');
      console.log('[Turso] Endpoint:', endpoint);
      console.log('[Turso] Headers:', {
        Authorization: this.authToken ? 'Bearer ***' : 'MISSING',
        'Content-Type': 'application/json',
      });
      console.log('[Turso] SQL:', query.sql);
      console.log('[Turso] Args:', query.args);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requests: [
            {
              type: 'execute',
              stmt: {
                sql: query.sql,
                args: query.args || [],
              },
            },
          ],
        }),
      });

      console.log('[Turso] HTTP status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Turso] HTTP error text:', errorText);
        throw new Error(`Turso HTTP API error: ${response.status} ${errorText}`);
      }

      const data: TursoHttpResponse = await response.json();
      const result = data.results?.[0];

      if (!result) {
        console.error('[Turso] No results returned from API.');
        throw new Error('No results in Turso API response');
      }

      // Convert rows array to objects
      const rows = result.rows.map(row => {
        const obj: any = {};
        result.columns.forEach((col, idx) => {
          obj[col] = row[idx];
        });
        return obj;
      });

      console.log('[Turso] Rows returned:', rows.length);
      return { rows };
    } catch (error) {
      console.error('[Turso] Database query error:', error);
      throw error;
    }
  }
}

// Initialize client
const dbUrl = import.meta.env.TURSO_DATABASE_URL;
const dbToken = import.meta.env.TURSO_AUTH_TOKEN;

console.log('\n[Turso] Environment setup check...');
console.log('[Turso] TURSO_DATABASE_URL:', dbUrl ? 'Set' : 'Missing');
console.log('[Turso] TURSO_AUTH_TOKEN:', dbToken ? 'Set' : 'Missing');

if (!dbUrl || !dbToken) {
  console.error('[Turso] Missing database credentials! Execution may fail.');
}

export const turso = new TursoHttpClient(dbUrl || '', dbToken || '');

export async function getStudioBySlug(slug: string): Promise<Studio | null> {
  try {
    console.log('\n[DB] Fetching studio by slug:', slug);

    const result = await turso.execute({
      sql: 'SELECT * FROM studios WHERE slug = ? AND status = ? LIMIT 1',
      args: [slug, 'Published'],
    });

    console.log('[DB] Query result rows:', result.rows.length);

    if (result.rows.length === 0) return null;

    return result.rows[0] as unknown as Studio;
  } catch (error) {
    console.error('[DB] Error fetching studio by slug:', error);
    throw error;
  }
}

export async function getAllStudios(): Promise<Studio[]> {
  try {
    console.log('\n[DB] Fetching all studios...');

    const result = await turso.execute({
      sql: 'SELECT * FROM studios WHERE status = ? ORDER BY name ASC',
      args: ['Published'],
    });

    console.log('[DB] Found studios:', result.rows.length);

    return result.rows as unknown as Studio[];
  } catch (error) {
    console.error('[DB] Error fetching studios:', error);
    throw error;
  }
}

export async function getStudiosByCity(city: string): Promise<Studio[]> {
  try {
    console.log('\n[DB] Fetching studios by city:', city);

    const result = await turso.execute({
      sql: 'SELECT * FROM studios WHERE city = ? AND status = ? ORDER BY name ASC',
      args: [city, 'Published'],
    });

    console.log('[DB] Found studios in city:', result.rows.length);

    return result.rows as unknown as Studio[];
  } catch (error) {
    console.error('[DB] Error fetching studios by city:', error);
    throw error;
  }
}
