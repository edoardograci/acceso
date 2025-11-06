// src/lib/db.ts (entire file)
import type { Studio } from './types';

interface TursoHttpResponse {
  results: {
    type: string;
    response: {
      type: string;
      result: {
        cols: { name: string; decltype?: string }[];
        rows: any[][];
        affected_row_count: number;
        last_insert_rowid: string | null;
        replication_index: string;
      };
    };
  }[];
}

class TursoHttpClient {
  private baseUrl: string;
  private authToken: string;

  constructor(url: string, authToken: string) {
    this.baseUrl = url.replace('libsql://', 'https://');
    this.authToken = authToken;

    console.log('[Turso] Initialized HTTP client with base URL:', this.baseUrl);
  }

  async execute(query: { sql: string; args?: any[] }) {
    try {
      const endpoint = `${this.baseUrl}/v2/pipeline`;

      console.log('\n[Turso] Executing query...');
      console.log('[Turso] Endpoint:', endpoint);
      console.log('[Turso] SQL:', query.sql);

      // Wrap args in typed format for Turso HTTP API
      const typedArgs = (query.args || []).map(arg => {
        if (typeof arg === 'string') {
          return { type: 'text', value: arg };
        } else if (typeof arg === 'number') {
          return Number.isInteger(arg) ? { type: 'integer', value: arg } : { type: 'float', value: arg };
        } else if (arg === null) {
          return { type: 'null' };
        } else if (typeof arg === 'boolean') {
          return { type: 'integer', value: arg ? 1 : 0 };
        } else {
          throw new Error(`Unsupported arg type: ${typeof arg}`);
        }
      });

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requests: [
            {
              type: 'execute',
              stmt: {
                sql: query.sql,
                args: typedArgs,
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
      const pipelineResult = data.results?.[0];
      if (!pipelineResult || pipelineResult.type !== 'ok') {
        throw new Error('No valid pipeline result in Turso API response');
      }

      const result = pipelineResult.response.result;
      if (!result) throw new Error('No execute result in Turso API response');

      // Convert rows array to objects, extracting values if typed
      const rows = result.rows.map((row) => {
        const obj: any = {};
        result.cols.forEach((col, idx) => {
          let val = row[idx];
          if (val && typeof val === 'object' && 'type' in val) {
            if (val.type === 'null') {
              val = null;
            } else if (val.type === 'blob') {
              val = atob(val.base64 || '');
            } else {
              val = val.value;
              if (val.type === 'integer' || val.type === 'float') {
                val = Number(val);
              }
            }
          }
          obj[col.name] = val;
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

export async function getStudioBySlug(slug: string, env: Env): Promise<Studio | null> {
  try {
    const turso = new TursoHttpClient(env.TURSO_DATABASE_URL, env.TURSO_AUTH_TOKEN);
    console.log('\n[DB] Fetching studio by slug:', slug);
    const result = await turso.execute({
      sql: 'SELECT * FROM studios WHERE slug = ? AND status = ? LIMIT 1',
      args: [slug, 'Published'],
    });
    return result.rows.length ? (result.rows[0] as Studio) : null;
  } catch (error) {
    console.error('[DB] Error fetching studio by slug:', error);
    throw error;
  }
}

export async function getAllStudios(env: Env): Promise<Studio[]> {
  try {
    const turso = new TursoHttpClient(env.TURSO_DATABASE_URL, env.TURSO_AUTH_TOKEN);
    console.log('\n[DB] Fetching all studios...');
    const result = await turso.execute({
      sql: 'SELECT * FROM studios WHERE status = ? ORDER BY name ASC',
      args: ['Published'],
    });
    return result.rows as Studio[];
  } catch (error) {
    console.error('[DB] Error fetching studios:', error);
    throw error;
  }
}

export async function getStudiosByCity(city: string, env: Env): Promise<Studio[]> {
  try {
    const turso = new TursoHttpClient(env.TURSO_DATABASE_URL, env.TURSO_AUTH_TOKEN);
    console.log('\n[DB] Fetching studios by city:', city);
    const result = await turso.execute({
      sql: 'SELECT * FROM studios WHERE city = ? AND status = ? ORDER BY name ASC',
      args: [city, 'Published'],
    });
    return result.rows as Studio[];
  } catch (error) {
    console.error('[DB] Error fetching studios by city:', error);
    throw error;
  }
}