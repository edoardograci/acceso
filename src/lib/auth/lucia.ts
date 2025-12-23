// src/lib/auth/lucia.ts
import { Lucia } from 'lucia';
import type { Env } from '../../env.d';

// Re-export TursoHttpClient for use in adapter
export class TursoHttpClient {
  private baseUrl: string;
  private authToken: string;

  constructor(url: string, authToken: string) {
    this.baseUrl = url.replace('libsql://', 'https://');
    this.authToken = authToken;
  }

  async execute(query: { sql: string; args?: any[] }) {
    const endpoint = `${this.baseUrl}/v2/pipeline`;

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

    if (!response.ok) {
      const errorText = await response.text();
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
          } else if (val.type === 'integer' || val.type === 'float') {
            // Check type BEFORE extracting value
            val = Number(val.value);
          } else {
            val = val.value;
          }
        }
        obj[col.name] = val;
      });
      return obj;
    });

    return { rows };
  }
}

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

// Custom Turso adapter for Lucia
function createTursoAdapter(env: Env) {
  const turso = new TursoHttpClient(env.TURSO_DATABASE_URL, env.TURSO_AUTH_TOKEN);

  return {
    async getSession(sessionId: string) {
      try {
        const result = await turso.execute({
          sql: 'SELECT * FROM sessions WHERE id = ?',
          args: [sessionId],
        });
        if (result.rows.length === 0) return null;
        const session = result.rows[0];
        return {
          id: session.id,
          userId: session.user_id,
          expiresAt: new Date(session.expires_at * 1000),
        };
      } catch (error) {
        console.error('[Lucia] Error getting session:', error);
        return null;
      }
    },

    async getUserSessions(userId: string) {
      try {
        const result = await turso.execute({
          sql: 'SELECT * FROM sessions WHERE user_id = ?',
          args: [userId],
        });
        return result.rows.map((session) => ({
          id: session.id,
          userId: session.user_id,
          expiresAt: new Date(session.expires_at * 1000),
        }));
      } catch (error) {
        console.error('[Lucia] Error getting user sessions:', error);
        return [];
      }
    },

    async setSession(session: { id: string; userId: string; expiresAt: Date }) {
      try {
        await turso.execute({
          sql: 'INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)',
          args: [session.id, session.userId, Math.floor(session.expiresAt.getTime() / 1000)],
        });
      } catch (error) {
        console.error('[Lucia] Error setting session:', error);
        throw error;
      }
    },

    async deleteSession(sessionId: string) {
      try {
        await turso.execute({
          sql: 'DELETE FROM sessions WHERE id = ?',
          args: [sessionId],
        });
      } catch (error) {
        console.error('[Lucia] Error deleting session:', error);
        throw error;
      }
    },

    async deleteUserSessions(userId: string) {
      try {
        await turso.execute({
          sql: 'DELETE FROM sessions WHERE user_id = ?',
          args: [userId],
        });
      } catch (error) {
        console.error('[Lucia] Error deleting user sessions:', error);
        throw error;
      }
    },

    async updateSessionExpiration(sessionId: string, expiresAt: Date) {
      try {
        await turso.execute({
          sql: 'UPDATE sessions SET expires_at = ? WHERE id = ?',
          args: [Math.floor(expiresAt.getTime() / 1000), sessionId],
        });
      } catch (error) {
        console.error('[Lucia] Error updating session expiration:', error);
        throw error;
      }
    },

    async getUser(userId: string) {
      try {
        const result = await turso.execute({
          sql: 'SELECT * FROM users WHERE id = ?',
          args: [userId],
        });
        if (result.rows.length === 0) return null;
        const user = result.rows[0];
        return {
          id: user.id,
          email: user.email,
          emailVerified: Boolean(user.email_verified),
        };
      } catch (error) {
        console.error('[Lucia] Error getting user:', error);
        return null;
      }
    },

    async setUser(user: { id: string; email: string; emailVerified: boolean }) {
      try {
        const now = Math.floor(Date.now() / 1000);
        await turso.execute({
          sql: 'INSERT INTO users (id, email, email_verified, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
          args: [user.id, user.email, user.emailVerified ? 1 : 0, now, now],
        });
      } catch (error) {
        console.error('[Lucia] Error setting user:', error);
        throw error;
      }
    },

    async updateUser(userId: string, updates: Partial<{ email: string; emailVerified: boolean }>) {
      try {
        const updatesList: string[] = [];
        const args: any[] = [];
        
        if (updates.email !== undefined) {
          updatesList.push('email = ?');
          args.push(updates.email);
        }
        if (updates.emailVerified !== undefined) {
          updatesList.push('email_verified = ?');
          args.push(updates.emailVerified ? 1 : 0);
        }
        
        if (updatesList.length === 0) return;
        
        updatesList.push('updated_at = ?');
        args.push(Math.floor(Date.now() / 1000));
        args.push(userId);
        
        await turso.execute({
          sql: `UPDATE users SET ${updatesList.join(', ')} WHERE id = ?`,
          args,
        });
      } catch (error) {
        console.error('[Lucia] Error updating user:', error);
        throw error;
      }
    },

    async deleteUser(userId: string) {
      try {
        await turso.execute({
          sql: 'DELETE FROM users WHERE id = ?',
          args: [userId],
        });
      } catch (error) {
        console.error('[Lucia] Error deleting user:', error);
        throw error;
      }
    },
  };
}

// Create Lucia instance factory (needs env to create adapter)
export function createLucia(env: Env) {
  const adapter = createTursoAdapter(env);
  
  return new Lucia(adapter, {
    sessionCookie: {
      attributes: {
        secure: import.meta.env.PROD,
        sameSite: 'lax',
        httpOnly: true,
      },
    },
    getUserAttributes: (attributes) => {
      return {
        email: attributes.email,
        emailVerified: attributes.emailVerified,
      };
    },
  });
}

// Type declarations for Lucia
declare module 'lucia' {
  interface Register {
    Lucia: ReturnType<typeof createLucia>;
    DatabaseUserAttributes: {
      email: string;
      emailVerified: boolean;
    };
  }
}