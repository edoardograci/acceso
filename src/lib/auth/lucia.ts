import { Lucia } from 'lucia';
import type { Env } from '../../env.d';
import { TursoHttpClient } from '../turso';

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
          attributes: {},
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
        return result.rows.map((session: any) => ({
          id: session.id,
          userId: session.user_id,
          expiresAt: new Date(session.expires_at * 1000),
          attributes: {},
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
          id: user.id as string,
          attributes: {
            email: user.email as string,
            emailVerified: Boolean(user.email_verified),
          },
        };
      } catch (error) {
        console.error('[Lucia] Error getting user:', error);
        return null;
      }
    },

    async setUser(user: { id: string; attributes: { email: string; emailVerified: boolean } }) {
      try {
        const now = Math.floor(Date.now() / 1000);
        await turso.execute({
          sql: 'INSERT INTO users (id, email, email_verified, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
          args: [user.id, user.attributes.email, user.attributes.emailVerified ? 1 : 0, now, now],
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
        // Delete user's collections first
        await turso.execute({
          sql: 'DELETE FROM user_saved_designers WHERE user_id = ?',
          args: [userId],
        });

        await turso.execute({
          sql: 'DELETE FROM user_saved_objects WHERE user_id = ?',
          args: [userId],
        });

        // Delete user's sessions
        await turso.execute({
          sql: 'DELETE FROM sessions WHERE user_id = ?',
          args: [userId],
        });

        // Finally delete the user
        await turso.execute({
          sql: 'DELETE FROM users WHERE id = ?',
          args: [userId],
        });

        console.log('[Lucia] User and all associated data deleted:', userId);
      } catch (error) {
        console.error('[Lucia] Error deleting user:', error);
        throw error;
      }
    },

    async getSessionAndUser(sessionId: string): Promise<[session: { id: string; userId: string; expiresAt: Date; attributes: {} } | null, user: { id: string; attributes: { email: string; emailVerified: boolean } } | null]> {
      try {
        const result = await turso.execute({
          sql: `
            SELECT 
              s.id as session_id, 
              s.user_id, 
              s.expires_at,
              u.id as user_id,
              u.email,
              u.email_verified
            FROM sessions s
            INNER JOIN users u ON s.user_id = u.id
            WHERE s.id = ?
            LIMIT 1
          `,
          args: [sessionId],
        }, { useCache: true });

        if (result.rows.length === 0) {
          return [null, null] as [null, null];
        }

        const row = result.rows[0];
        const session = {
          id: row.session_id as string,
          userId: row.user_id as string,
          expiresAt: new Date((row.expires_at as number) * 1000),
          attributes: {},
        };
        const user = {
          id: row.user_id as string,
          attributes: {
            email: row.email as string,
            emailVerified: Boolean(row.email_verified),
          },
        };
        return [session, user];
      } catch (error) {
        console.error('[Lucia] Error getting session and user:', error);
        return [null, null] as [null, null];
      }
    },

    async deleteExpiredSessions() {
      try {
        const now = Math.floor(Date.now() / 1000);
        await turso.execute({
          sql: 'DELETE FROM sessions WHERE expires_at < ?',
          args: [now],
        });
      } catch (error) {
        console.error('[Lucia] Error deleting expired sessions:', error);
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