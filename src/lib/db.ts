import type { Env } from '../env.d';
import { TursoHttpClient } from './turso';

// In-memory cache for database queries
const dbCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 30 * 1000; // 30 seconds for Edge consistency
const MAX_CACHE_SIZE = 500;

function getCacheKey(operation: string, ...params: any[]): string {
  return `${operation}:${JSON.stringify(params)}`;
}

function getFromCache<T>(key: string): T | null {
  const cached = dbCache.get(key);
  if (!cached) return null;

  const age = Date.now() - cached.timestamp;
  if (age > CACHE_TTL) {
    dbCache.delete(key);
    return null;
  }

  return cached.data as T;
}

function setCache(key: string, data: any): void {
  // Prevent memory leak
  if (dbCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = Array.from(dbCache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp)[0][0];
    dbCache.delete(oldestKey);
  }

  dbCache.set(key, { data, timestamp: Date.now() });
}

function invalidateCache(pattern: string): void {
  const keys = Array.from(dbCache.keys()).filter(k => k.includes(pattern));
  keys.forEach(k => {
    dbCache.delete(k);
  });
}

function parseTimestamp(val: any): number {
  if (!val) return 0;
  const n = Number(val);
  if (!isNaN(n)) return n; // Numeric (Unix TS) or Numeric String
  return Math.floor(Date.parse(val) / 1000); // ISO String
}

/*
export async function getStudioBySlug(slug: string, env: Env): Promise<Studio | null> {
  const cacheKey = getCacheKey('studio_by_slug', slug);
  const cached = getFromCache<Studio>(cacheKey);
  if (cached) return cached;

  try {
    const turso = new TursoHttpClient(env.TURSO_DATABASE_URL, env.TURSO_AUTH_TOKEN);
    const result = await turso.execute({
      sql: 'SELECT * FROM studios WHERE slug = ? AND status = ? LIMIT 1',
      args: [slug, 'Published'],
    }, { useCache: true });

    const studio = result.rows.length ? (result.rows[0] as Studio) : null;
    if (studio) setCache(cacheKey, studio);
    return studio;
  } catch (error) {
    console.error('[DB] Error fetching studio by slug:', error);
    throw error;
  }
}

export async function getAllStudios(env: Env): Promise<Studio[]> {
  const cacheKey = getCacheKey('all_studios');
  const cached = getFromCache<Studio[]>(cacheKey);
  if (cached) return cached;

  try {
    const turso = new TursoHttpClient(env.TURSO_DATABASE_URL, env.TURSO_AUTH_TOKEN);
    const result = await turso.execute({
      sql: 'SELECT * FROM studios WHERE status = ? ORDER BY name ASC',
      args: ['Published'],
    }, { useCache: true });

    const studios = result.rows as Studio[];
    setCache(cacheKey, studios);
    return studios;
  } catch (error) {
    console.error('[DB] Error fetching studios:', error);
    throw error;
  }
}

export async function getStudiosByCity(city: string, env: Env): Promise<Studio[]> {
  const cacheKey = getCacheKey('studios_by_city', city);
  const cached = getFromCache<Studio[]>(cacheKey);
  if (cached) return cached;

  try {
    const turso = new TursoHttpClient(env.TURSO_DATABASE_URL, env.TURSO_AUTH_TOKEN);
    const result = await turso.execute({
      sql: 'SELECT * FROM studios WHERE city = ? AND status = ? ORDER BY name ASC',
      args: [city, 'Published'],
    });

    const studios = result.rows as Studio[];
    setCache(cacheKey, studios);
    return studios;
  } catch (error) {
    console.error('[DB] Error fetching studios by city:', error);
    throw error;
  }
}
*/

const generateId = () => {
  try {
    return globalThis.crypto.randomUUID();
  } catch {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }
};

// Collections
export async function saveDesigner(userId: string, studioId: string, env: Env): Promise<boolean> {
  const turso = new TursoHttpClient(env.TURSO_DATABASE_URL, env.TURSO_AUTH_TOKEN);
  const now = Math.floor(Date.now() / 1000);

  try {
    // ATOMIC: Check limit and insert in single query to prevent race conditions
    // Use crypto.randomUUID() for the primary key
    const result = await turso.execute({
      sql: `
        INSERT INTO user_saved_designers (id, user_id, studio_id, created_at)
        SELECT ?, ?, ?, ?
        WHERE (
          SELECT COUNT(*) FROM user_saved_designers WHERE user_id = ?
        ) < 100
        AND NOT EXISTS (
          SELECT 1 FROM user_saved_designers WHERE user_id = ? AND studio_id = ?
        )
      `,
      args: [generateId(), userId, studioId, now, userId, userId, studioId],
    });

    // Check if row was inserted
    if (result.rowsAffected === 0) {
      // Either limit reached OR already saved
      const countResult = await turso.execute({
        sql: 'SELECT COUNT(*) as count FROM user_saved_designers WHERE user_id = ?',
        args: [userId],
      });

      const count = (countResult.rows[0] as any).count;
      if (count >= 100) {
        throw new Error('LIMIT_REACHED');
      }

      // Already saved - ensure cache is synced anyway
      invalidateCache(userId);
      return false;
    }

    // Clear user-specific cache
    invalidateCache(userId);
    return true;
  } catch (error: any) {
    if (error.message === 'LIMIT_REACHED') {
      throw error; // Re-throw to preserve error type
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

    invalidateCache(userId);
    return true;
  } catch (error) {
    console.error('[DB] Error removing designer:', error);
    throw error;
  }
}

export async function saveObject(userId: string, productId: string, env: Env): Promise<boolean> {
  const turso = new TursoHttpClient(env.TURSO_DATABASE_URL, env.TURSO_AUTH_TOKEN);
  const now = Math.floor(Date.now() / 1000);

  try {
    // ATOMIC: Single query with limit check - no transaction needed
    const result = await turso.execute({
      sql: `
        INSERT INTO user_saved_objects (id, user_id, product_id, created_at)
        SELECT ?, ?, ?, ?
        WHERE (SELECT COUNT(*) FROM user_saved_objects WHERE user_id = ?) < 100
        AND NOT EXISTS (SELECT 1 FROM user_saved_objects WHERE user_id = ? AND product_id = ?)
      `,
      args: [generateId(), userId, productId, now, userId, userId, productId],
    });

    // Check if row was inserted
    if (result.rowsAffected === 0) {
      // Either limit reached OR already saved
      const countResult = await turso.execute({
        sql: 'SELECT COUNT(*) as count FROM user_saved_objects WHERE user_id = ?',
        args: [userId],
      });

      const count = (countResult.rows[0] as any).count;
      if (count >= 100) {
        throw new Error('LIMIT_REACHED');
      }

      // Already saved - return false but no error
      return false;
    }

    // Clear user-specific cache
    invalidateCache(userId);
    return true;
  } catch (error: any) {
    if (error.message === 'LIMIT_REACHED') {
      throw error; // Re-throw to preserve error type
    }
    console.error('[DB] Error saving object:', error);
    throw error;
  }
}

export async function removeObject(userId: string, productId: string, env: Env): Promise<boolean> {
  const turso = new TursoHttpClient(env.TURSO_DATABASE_URL, env.TURSO_AUTH_TOKEN);

  try {
    // Simple DELETE - no transaction needed (atomic by default)
    await turso.execute({
      sql: 'DELETE FROM user_saved_objects WHERE user_id = ? AND product_id = ?',
      args: [userId, productId],
    });

    // Clear user-specific cache
    invalidateCache(userId);
    return true;
  } catch (error) {
    console.error('[DB] Error removing object:', error);
    throw error;
  }
}

export async function saveMuseum(userId: string, museumId: string, env: Env): Promise<boolean> {
  const turso = new TursoHttpClient(env.TURSO_DATABASE_URL, env.TURSO_AUTH_TOKEN);
  const now = Math.floor(Date.now() / 1000);

  try {
    const result = await turso.execute({
      sql: `
        INSERT INTO user_saved_museums (id, user_id, museum_id, created_at)
        SELECT ?, ?, ?, ?
        WHERE (SELECT COUNT(*) FROM user_saved_museums WHERE user_id = ?) < 100
        AND NOT EXISTS (SELECT 1 FROM user_saved_museums WHERE user_id = ? AND museum_id = ?)
      `,
      args: [generateId(), userId, museumId, now, userId, userId, museumId],
    });

    if (result.rowsAffected === 0) {
      const countResult = await turso.execute({
        sql: 'SELECT COUNT(*) as count FROM user_saved_museums WHERE user_id = ?',
        args: [userId],
      });

      const count = (countResult.rows[0] as any).count;
      if (count >= 100) {
        throw new Error('LIMIT_REACHED');
      }

      invalidateCache(userId);
      return false;
    }

    invalidateCache(userId);
    return true;
  } catch (error: any) {
    if (error.message === 'LIMIT_REACHED') {
      throw error;
    }
    console.error('[DB] Error saving museum:', error);
    throw error;
  }
}

export async function removeMuseum(userId: string, museumId: string, env: Env): Promise<boolean> {
  try {
    const turso = new TursoHttpClient(env.TURSO_DATABASE_URL, env.TURSO_AUTH_TOKEN);
    await turso.execute({
      sql: 'DELETE FROM user_saved_museums WHERE user_id = ? AND museum_id = ?',
      args: [userId, museumId],
    });

    invalidateCache(userId);
    return true;
  } catch (error) {
    console.error('[DB] Error removing museum:', error);
    throw error;
  }
}

export async function getSavedMuseums(userId: string, env: Env): Promise<string[]> {
  const cacheKey = getCacheKey('collections', userId, 'museums');
  const cached = getFromCache<string[]>(cacheKey);
  if (cached) return cached;

  try {
    const turso = new TursoHttpClient(env.TURSO_DATABASE_URL, env.TURSO_AUTH_TOKEN);
    const result = await turso.execute({
      sql: 'SELECT museum_id FROM user_saved_museums WHERE user_id = ?',
      args: [userId],
    });

    const ids = result.rows
      .sort((a: any, b: any) => parseTimestamp(b.created_at) - parseTimestamp(a.created_at))
      .map((row: any) => row.museum_id as string);
    setCache(cacheKey, ids);
    return ids;
  } catch (error) {
    console.error('[DB] Error fetching saved museums:', error);
    throw error;
  }
}

export async function saveUniversity(userId: string, universityId: string, env: Env): Promise<boolean> {
  const turso = new TursoHttpClient(env.TURSO_DATABASE_URL, env.TURSO_AUTH_TOKEN);
  const now = Math.floor(Date.now() / 1000);

  try {
    const result = await turso.execute({
      sql: `
        INSERT INTO user_saved_universities (id, user_id, university_id, created_at)
        SELECT ?, ?, ?, ?
        WHERE (SELECT COUNT(*) FROM user_saved_universities WHERE user_id = ?) < 100
        AND NOT EXISTS (SELECT 1 FROM user_saved_universities WHERE user_id = ? AND university_id = ?)
      `,
      args: [generateId(), userId, universityId, now, userId, userId, universityId],
    });

    if (result.rowsAffected === 0) {
      const countResult = await turso.execute({
        sql: 'SELECT COUNT(*) as count FROM user_saved_universities WHERE user_id = ?',
        args: [userId],
      });

      const count = (countResult.rows[0] as any).count;
      if (count >= 100) {
        throw new Error('LIMIT_REACHED');
      }

      invalidateCache(userId);
      return false;
    }

    invalidateCache(userId);
    return true;
  } catch (error: any) {
    if (error.message === 'LIMIT_REACHED') {
      throw error;
    }
    console.error('[DB] Error saving university:', error);
    throw error;
  }
}

export async function removeUniversity(userId: string, universityId: string, env: Env): Promise<boolean> {
  try {
    const turso = new TursoHttpClient(env.TURSO_DATABASE_URL, env.TURSO_AUTH_TOKEN);
    await turso.execute({
      sql: 'DELETE FROM user_saved_universities WHERE user_id = ? AND university_id = ?',
      args: [userId, universityId],
    });

    invalidateCache(userId);
    return true;
  } catch (error) {
    console.error('[DB] Error removing university:', error);
    throw error;
  }
}

export async function getSavedUniversities(userId: string, env: Env): Promise<string[]> {
  const cacheKey = getCacheKey('collections', userId, 'universities');
  const cached = getFromCache<string[]>(cacheKey);
  if (cached) return cached;

  try {
    const turso = new TursoHttpClient(env.TURSO_DATABASE_URL, env.TURSO_AUTH_TOKEN);
    const result = await turso.execute({
      sql: 'SELECT university_id FROM user_saved_universities WHERE user_id = ?',
      args: [userId],
    });

    const ids = result.rows
      .sort((a: any, b: any) => parseTimestamp(b.created_at) - parseTimestamp(a.created_at))
      .map((row: any) => row.university_id as string);
    setCache(cacheKey, ids);
    return ids;
  } catch (error) {
    console.error('[DB] Error fetching saved universities:', error);
    throw error;
  }
}

export async function getSavedDesigners(userId: string, env: Env): Promise<string[]> {
  const cacheKey = getCacheKey('collections', userId, 'designers');
  const cached = getFromCache<string[]>(cacheKey);
  if (cached) return cached;

  try {
    const turso = new TursoHttpClient(env.TURSO_DATABASE_URL, env.TURSO_AUTH_TOKEN);
    const result = await turso.execute({
      sql: 'SELECT studio_id FROM user_saved_designers WHERE user_id = ?',
      args: [userId],
    });

    const ids = result.rows
      .sort((a: any, b: any) => parseTimestamp(b.created_at) - parseTimestamp(a.created_at))
      .map((row: any) => row.studio_id as string);
    setCache(cacheKey, ids);
    return ids;
  } catch (error) {
    console.error('[DB] Error fetching saved designers:', error);
    throw error;
  }
}

export async function getSavedObjects(userId: string, env: Env): Promise<string[]> {
  const cacheKey = getCacheKey('collections', userId, 'objects');
  const cached = getFromCache<string[]>(cacheKey);
  if (cached) return cached;

  try {
    const turso = new TursoHttpClient(env.TURSO_DATABASE_URL, env.TURSO_AUTH_TOKEN);
    const result = await turso.execute({
      sql: 'SELECT product_id FROM user_saved_objects WHERE user_id = ?',
      args: [userId],
    });

    const ids = result.rows
      .sort((a: any, b: any) => parseTimestamp(b.created_at) - parseTimestamp(a.created_at))
      .map((row: any) => row.product_id as string);
    setCache(cacheKey, ids);
    return ids;
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

export async function getCollectionsCounts(userId: string, env: Env): Promise<{ designers: number, objects: number, museums: number, universities: number }> {
  const cacheKey = getCacheKey('collections:counts', userId);
  const cached = getFromCache<{ designers: number, objects: number, museums: number, universities: number }>(cacheKey);
  if (cached) return cached;

  try {
    const turso = new TursoHttpClient(env.TURSO_DATABASE_URL, env.TURSO_AUTH_TOKEN);

    const [designersResult, objectsResult, museumsResult, universitiesResult] = await Promise.all([
      turso.execute({
        sql: 'SELECT COUNT(*) as count FROM user_saved_designers WHERE user_id = ?',
        args: [userId],
      }),
      turso.execute({
        sql: 'SELECT COUNT(*) as count FROM user_saved_objects WHERE user_id = ?',
        args: [userId],
      }),
      turso.execute({
        sql: 'SELECT COUNT(*) as count FROM user_saved_museums WHERE user_id = ?',
        args: [userId],
      }),
      turso.execute({
        sql: 'SELECT COUNT(*) as count FROM user_saved_universities WHERE user_id = ?',
        args: [userId],
      })
    ]);

    const counts = {
      designers: Number(designersResult.rows[0]?.count) || 0,
      objects: Number(objectsResult.rows[0]?.count) || 0,
      museums: Number(museumsResult.rows[0]?.count) || 0,
      universities: Number(universitiesResult.rows[0]?.count) || 0
    };

    setCache(cacheKey, counts);
    return counts;
  } catch (error) {
    console.error('[DB] Error fetching collection counts:', error);
    throw error;
  }
}

export async function getDesignerCollectionSummary(userId: string, env: Env): Promise<{ count: number; recentId: string | null }> {
  const cacheKey = getCacheKey('collections:designer_summary', userId);
  const cached = getFromCache<{ count: number; recentId: string | null }>(cacheKey);
  if (cached) return cached;

  try {
    const turso = new TursoHttpClient(env.TURSO_DATABASE_URL, env.TURSO_AUTH_TOKEN);
    const result = await turso.execute({
      sql: 'SELECT studio_id, created_at FROM user_saved_designers WHERE user_id = ?',
      args: [userId],
    });

    const rows = result.rows.map((r: any) => ({
      id: r.studio_id as string,
      ts: parseTimestamp(r.created_at)
    })).sort((a: { ts: number }, b: { ts: number }) => b.ts - a.ts);

    const summary = {
      count: rows.length,
      recentId: rows[0]?.id || null
    };

    setCache(cacheKey, summary);
    return summary;
  } catch (error) {
    console.error('[DB] Error fetching designer collection summary:', error);
    return { count: 0, recentId: null };
  }
}

export async function getObjectCollectionSummary(userId: string, env: Env): Promise<{ count: number; recentId: string | null }> {
  const cacheKey = getCacheKey('collections:object_summary', userId);
  const cached = getFromCache<{ count: number; recentId: string | null }>(cacheKey);
  if (cached) return cached;

  try {
    const turso = new TursoHttpClient(env.TURSO_DATABASE_URL, env.TURSO_AUTH_TOKEN);
    const result = await turso.execute({
      sql: 'SELECT product_id, created_at FROM user_saved_objects WHERE user_id = ?',
      args: [userId],
    });

    const rows = result.rows.map((r: any) => ({
      id: r.product_id as string,
      ts: parseTimestamp(r.created_at)
    })).sort((a: { ts: number }, b: { ts: number }) => b.ts - a.ts);

    const summary = {
      count: rows.length,
      recentId: rows[0]?.id || null
    };

    setCache(cacheKey, summary);
    return summary;
  } catch (error) {
    console.error('[DB] Error fetching object collection summary:', error);
    return { count: 0, recentId: null };
  }
}

export async function getFullCollectionStatus(userId: string, env: Env): Promise<{ designers: string[], objects: string[], museums: string[], universities: string[] }> {
  const cacheKey = getCacheKey('collections:full', userId);
  const cached = getFromCache<{ designers: string[], objects: string[], museums: string[], universities: string[] }>(cacheKey);
  if (cached) return cached;

  try {
    const turso = new TursoHttpClient(env.TURSO_DATABASE_URL, env.TURSO_AUTH_TOKEN);
    const result = await turso.execute({
      sql: `SELECT * FROM (
              SELECT studio_id as id, 'designer' as type, created_at FROM user_saved_designers WHERE user_id = ?
              UNION ALL
              SELECT product_id as id, 'object' as type, created_at FROM user_saved_objects WHERE user_id = ?
              UNION ALL
              SELECT museum_id as id, 'museum' as type, created_at FROM user_saved_museums WHERE user_id = ?
              UNION ALL
              SELECT university_id as id, 'university' as type, created_at FROM user_saved_universities WHERE user_id = ?
            ) ORDER BY created_at DESC`,
      args: [userId, userId, userId, userId],
    });

    const designers: string[] = [];
    const objects: string[] = [];
    const museums: string[] = [];
    const universities: string[] = [];

    // Explicitly sort by created_at DESC in JS to guarantee order, handling mixed DB formats
    result.rows.sort((a: any, b: any) => parseTimestamp(b.created_at) - parseTimestamp(a.created_at));

    result.rows.forEach((row: any) => {
      if (row.type === 'designer') designers.push(row.id);
      else if (row.type === 'museum') museums.push(row.id);
      else if (row.type === 'university') universities.push(row.id);
      else objects.push(row.id);
    });

    const status = { designers, objects, museums, universities };
    setCache(cacheKey, status);
    return status;
  } catch (error) {
    console.error('[DB] Error fetching full collection status:', error);
    throw error;
  }
}

export async function getProfileSummary(userId: string, env: Env): Promise<{
  designers: { count: number, recentId: string | null },
  objects: { count: number, recentId: string | null },
  museums: { count: number, recentId: string | null },
  universities: { count: number, recentId: string | null }
}> {
  const cacheKey = getCacheKey('collections:profile_summary', userId);
  const cached = getFromCache<any>(cacheKey);
  if (cached) return cached;

  try {
    const turso = new TursoHttpClient(env.TURSO_DATABASE_URL, env.TURSO_AUTH_TOKEN);
    const [designersResult, objectsResult, museumsResult, universitiesResult] = await Promise.all([
      turso.execute({
        sql: 'SELECT studio_id, created_at FROM user_saved_designers WHERE user_id = ?',
        args: [userId],
      }),
      turso.execute({
        sql: 'SELECT product_id, created_at FROM user_saved_objects WHERE user_id = ?',
        args: [userId],
      }),
      turso.execute({
        sql: 'SELECT museum_id, created_at FROM user_saved_museums WHERE user_id = ?',
        args: [userId],
      }),
      turso.execute({
        sql: 'SELECT university_id, created_at FROM user_saved_universities WHERE user_id = ?',
        args: [userId],
      })
    ]);

    const dRows = designersResult.rows.map((r: any) => ({ id: r.studio_id as string, ts: parseTimestamp(r.created_at) })).sort((a: { ts: number }, b: { ts: number }) => b.ts - a.ts);
    const oRows = objectsResult.rows.map((r: any) => ({ id: r.product_id as string, ts: parseTimestamp(r.created_at) })).sort((a: { ts: number }, b: { ts: number }) => b.ts - a.ts);
    const mRows = museumsResult.rows.map((r: any) => ({ id: r.museum_id as string, ts: parseTimestamp(r.created_at) })).sort((a: { ts: number }, b: { ts: number }) => b.ts - a.ts);
    const uRows = universitiesResult.rows.map((r: any) => ({ id: r.university_id as string, ts: parseTimestamp(r.created_at) })).sort((a: { ts: number }, b: { ts: number }) => b.ts - a.ts);

    const summary = {
      designers: { count: dRows.length, recentId: dRows[0]?.id || null },
      objects: { count: oRows.length, recentId: oRows[0]?.id || null },
      museums: { count: mRows.length, recentId: mRows[0]?.id || null },
      universities: { count: uRows.length, recentId: uRows[0]?.id || null }
    };

    setCache(cacheKey, summary);
    return summary;
  } catch (error) {
    console.error('[DB] Error fetching profile summary:', error);
    return {
      designers: { count: 0, recentId: null },
      objects: { count: 0, recentId: null },
      museums: { count: 0, recentId: null },
      universities: { count: 0, recentId: null }
    };
  }
}
