import type { Studio } from './types';
import type { Env } from '../env.d';
import { TursoHttpClient } from './turso';

export async function getStudioBySlug(slug: string, env: Env): Promise<Studio | null> {
  try {
    const turso = new TursoHttpClient(env.TURSO_DATABASE_URL, env.TURSO_AUTH_TOKEN);
    const result = await turso.execute({
      sql: 'SELECT * FROM studios WHERE slug = ? AND status = ? LIMIT 1',
      args: [slug, 'Published'],
    }, { useCache: true });
    return result.rows.length ? (result.rows[0] as Studio) : null;
  } catch (error) {
    console.error('[DB] Error fetching studio by slug:', error);
    throw error;
  }
}

export async function getAllStudios(env: Env): Promise<Studio[]> {
  try {
    const turso = new TursoHttpClient(env.TURSO_DATABASE_URL, env.TURSO_AUTH_TOKEN);
    const result = await turso.execute({
      sql: 'SELECT * FROM studios WHERE status = ? ORDER BY name ASC',
      args: ['Published'],
    }, { useCache: true });
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

// Collections
export async function saveDesigner(userId: string, studioId: string, env: Env): Promise<boolean> {
  try {
    const turso = new TursoHttpClient(env.TURSO_DATABASE_URL, env.TURSO_AUTH_TOKEN);
    const id = crypto.randomUUID();
    await turso.execute({
      sql: 'INSERT INTO user_saved_designers (id, user_id, studio_id) VALUES (?, ?, ?)',
      args: [id, userId, studioId],
    });
    return true;
  } catch (error: any) {
    if (error.message && error.message.includes('UNIQUE constraint failed')) {
      return true; // Already saved, treat as success
    }
    console.error('[DB] Error saving designer:', error);
    throw error;
  }
}

export async function removeDesigner(userId: string, studioId: string, env: Env): Promise<boolean> {
  try {
    const turso = new TursoHttpClient(env.TURSO_DATABASE_URL, env.TURSO_AUTH_TOKEN);
    await turso.execute({
      sql: 'DELETE FROM user_saved_designers WHERE user_id = ? AND studio_id = ?',
      args: [userId, studioId],
    });
    return true;
  } catch (error) {
    console.error('[DB] Error removing designer:', error);
    throw error;
  }
}

export async function saveObject(userId: string, productId: string, env: Env): Promise<boolean> {
  try {
    const turso = new TursoHttpClient(env.TURSO_DATABASE_URL, env.TURSO_AUTH_TOKEN);
    const id = crypto.randomUUID();
    await turso.execute({
      sql: 'INSERT INTO user_saved_objects (id, user_id, product_id) VALUES (?, ?, ?)',
      args: [id, userId, productId],
    });
    return true;
  } catch (error: any) {
    if (error.message && error.message.includes('UNIQUE constraint failed')) {
      return true; // Already saved
    }
    console.error('[DB] Error saving object:', error);
    throw error;
  }
}

export async function removeObject(userId: string, productId: string, env: Env): Promise<boolean> {
  try {
    const turso = new TursoHttpClient(env.TURSO_DATABASE_URL, env.TURSO_AUTH_TOKEN);
    await turso.execute({
      sql: 'DELETE FROM user_saved_objects WHERE user_id = ? AND product_id = ?',
      args: [userId, productId],
    });
    return true;
  } catch (error) {
    console.error('[DB] Error removing object:', error);
    throw error;
  }
}

export async function getSavedDesigners(userId: string, env: Env): Promise<string[]> {
  try {
    const turso = new TursoHttpClient(env.TURSO_DATABASE_URL, env.TURSO_AUTH_TOKEN);
    const result = await turso.execute({
      sql: 'SELECT studio_id FROM user_saved_designers WHERE user_id = ?',
      args: [userId],
    }, { useCache: true });
    return result.rows.map((row: any) => row.studio_id as string);
  } catch (error) {
    console.error('[DB] Error fetching saved designers:', error);
    throw error;
  }
}

export async function getSavedObjects(userId: string, env: Env): Promise<string[]> {
  try {
    const turso = new TursoHttpClient(env.TURSO_DATABASE_URL, env.TURSO_AUTH_TOKEN);
    const result = await turso.execute({
      sql: 'SELECT product_id FROM user_saved_objects WHERE user_id = ?',
      args: [userId],
    }, { useCache: true });
    return result.rows.map((row: any) => row.product_id as string);
  } catch (error) {
    console.error('[DB] Error fetching saved objects:', error);
    throw error;
  }
}

export async function checkSavedStatus(userId: string, type: 'designers' | 'objects', id: string, env: Env): Promise<boolean> {
  try {
    const turso = new TursoHttpClient(env.TURSO_DATABASE_URL, env.TURSO_AUTH_TOKEN);
    const table = type === 'designers' ? 'user_saved_designers' : 'user_saved_objects';
    const column = type === 'designers' ? 'studio_id' : 'product_id';

    // Use boolean check to return integer 1 or 0
    const result = await turso.execute({
      sql: `SELECT 1 FROM ${table} WHERE user_id = ? AND ${column} = ? LIMIT 1`,
      args: [userId, id],
    });
    return result.rows.length > 0;
  } catch (error) {
    console.error('[DB] Error checking saved status:', error);
    throw error;
  }
}

export async function getCollectionsCounts(userId: string, env: Env): Promise<{ designers: number, objects: number }> {
  try {
    const turso = new TursoHttpClient(env.TURSO_DATABASE_URL, env.TURSO_AUTH_TOKEN);

    const [designersResult, objectsResult] = await Promise.all([
      turso.execute({
        sql: 'SELECT COUNT(*) as count FROM user_saved_designers WHERE user_id = ?',
        args: [userId],
      }),
      turso.execute({
        sql: 'SELECT COUNT(*) as count FROM user_saved_objects WHERE user_id = ?',
        args: [userId],
      })
    ]);

    return {
      designers: Number(designersResult.rows[0]?.count) || 0,
      objects: Number(objectsResult.rows[0]?.count) || 0
    };
  } catch (error) {
    console.error('[DB] Error fetching collection counts:', error);
    throw error;
  }
}