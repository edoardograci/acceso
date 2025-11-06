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
  }

  async execute(query: { sql: string; args?: any[] }) {
    try {
      const response = await fetch(`${this.baseUrl}/v2/pipeline`, {
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

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Turso HTTP API error: ${response.status} ${errorText}`);
      }

      const data: TursoHttpResponse = await response.json();
      const result = data.results[0];

      // Convert rows array to objects
      const rows = result.rows.map(row => {
        const obj: any = {};
        result.columns.forEach((col, idx) => {
          obj[col] = row[idx];
        });
        return obj;
      });

      return { rows };
    } catch (error) {
      console.error('Database query error:', error);
      throw error;
    }
  }
}

// Initialize client
const dbUrl = import.meta.env.TURSO_DATABASE_URL;
const dbToken = import.meta.env.TURSO_AUTH_TOKEN;

if (!dbUrl || !dbToken) {
  console.error('Missing database credentials!');
  console.error('TURSO_DATABASE_URL:', dbUrl ? 'Set' : 'Missing');
  console.error('TURSO_AUTH_TOKEN:', dbToken ? 'Set' : 'Missing');
}

export const turso = new TursoHttpClient(dbUrl || '', dbToken || '');

export async function getStudioBySlug(slug: string): Promise<Studio | null> {
  try {
    console.log('Fetching studio by slug:', slug);
    
    const result = await turso.execute({
      sql: 'SELECT * FROM studios WHERE slug = ? AND status = ? LIMIT 1',
      args: [slug, 'Published']
    });

    console.log('Query result rows:', result.rows.length);

    if (result.rows.length === 0) return null;

    return result.rows[0] as unknown as Studio;
  } catch (error) {
    console.error('Error fetching studio:', error);
    throw error;
  }
}

export async function getAllStudios(): Promise<Studio[]> {
  try {
    console.log('Fetching all studios...');
    
    const result = await turso.execute({
      sql: 'SELECT * FROM studios WHERE status = ? ORDER BY name ASC',
      args: ['Published']
    });

    console.log('Found studios:', result.rows.length);
    
    return result.rows as unknown as Studio[];
  } catch (error) {
    console.error('Error fetching studios:', error);
    throw error;
  }
}

export async function getStudiosByCity(city: string): Promise<Studio[]> {
  try {
    console.log('Fetching studios by city:', city);
    
    const result = await turso.execute({
      sql: 'SELECT * FROM studios WHERE city = ? AND status = ? ORDER BY name ASC',
      args: [city, 'Published']
    });

    console.log('Found studios in city:', result.rows.length);

    return result.rows as unknown as Studio[];
  } catch (error) {
    console.error('Error fetching studios by city:', error);
    throw error;
  }
}