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

/* ============================================================
   Admin dashboard metrics
   Read-only aggregates over the app's own tables. These complement the
   PostHog numbers: signups and saved items are ground truth here, whereas
   PostHog only ever sees what the browser managed to send.
   ============================================================ */

export interface AdminTursoMetrics {
  totalUsers: number;
  newUsers: number;
  signupsByDay: { day: string; count: number }[];
  saves: { designers: number; objects: number; museums: number; universities: number };
  recentSaves: { designers: number; objects: number; museums: number; universities: number };
  submissionsByStatus: { status: string; count: number }[];
  suggestions: number;
  errors: string[];
}

const EMPTY_ADMIN_TURSO_METRICS: AdminTursoMetrics = {
  totalUsers: 0,
  newUsers: 0,
  signupsByDay: [],
  saves: { designers: 0, objects: 0, museums: 0, universities: 0 },
  recentSaves: { designers: 0, objects: 0, museums: 0, universities: 0 },
  submissionsByStatus: [],
  suggestions: 0,
  errors: [],
};

/**
 * Aggregate app-side metrics for the admin dashboard.
 *
 * Every query is run independently and failures are collected rather than
 * thrown: `submissions` and `suggestions` were created outside the setup
 * scripts, so a table missing in one environment must not blank out the whole
 * panel.
 */
export async function getAdminTursoMetrics(env: Env, days: number): Promise<AdminTursoMetrics> {
  const windowDays = Math.min(Math.max(Math.floor(days) || 7, 1), 365);
  const cacheKey = getCacheKey('admin_turso_metrics', windowDays);
  const cached = getFromCache<AdminTursoMetrics>(cacheKey);
  if (cached) return cached;

  const turso = new TursoHttpClient(env.TURSO_DATABASE_URL, env.TURSO_AUTH_TOKEN);
  const metrics: AdminTursoMetrics = {
    ...EMPTY_ADMIN_TURSO_METRICS,
    saves: { ...EMPTY_ADMIN_TURSO_METRICS.saves },
    recentSaves: { ...EMPTY_ADMIN_TURSO_METRICS.recentSaves },
    signupsByDay: [],
    submissionsByStatus: [],
    errors: [],
  };

  // users.created_at is an INTEGER unix timestamp; user_saved_* store TEXT
  // datetimes from datetime('now'), so the two need different comparisons.
  const sinceUnix = Math.floor(Date.now() / 1000) - windowDays * 86400;
  const sinceModifier = `-${windowDays} days`;

  const run = async (label: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (error: any) {
      metrics.errors.push(`${label}: ${error?.message || 'query failed'}`);
    }
  };

  const savedTables: [keyof AdminTursoMetrics['saves'], string][] = [
    ['designers', 'user_saved_designers'],
    ['objects', 'user_saved_objects'],
    ['museums', 'user_saved_museums'],
    ['universities', 'user_saved_universities'],
  ];

  await Promise.all([
    run('users', async () => {
      const result = await turso.execute({
        sql: 'SELECT count(*) AS total, sum(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS recent FROM users',
        args: [sinceUnix],
      });
      metrics.totalUsers = Number(result.rows[0]?.total ?? 0);
      metrics.newUsers = Number(result.rows[0]?.recent ?? 0);
    }),

    run('signups_by_day', async () => {
      const result = await turso.execute({
        sql: `SELECT date(created_at, 'unixepoch') AS day, count(*) AS count
              FROM users WHERE created_at >= ? GROUP BY day ORDER BY day ASC`,
        args: [sinceUnix],
      });
      metrics.signupsByDay = result.rows.map((row: any) => ({
        day: String(row.day),
        count: Number(row.count ?? 0),
      }));
    }),

    ...savedTables.map(([key, table]) =>
      run(table, async () => {
        const result = await turso.execute({
          sql: `SELECT count(*) AS total,
                       sum(CASE WHEN created_at >= datetime('now', ?) THEN 1 ELSE 0 END) AS recent
                FROM ${table}`,
          args: [sinceModifier],
        });
        metrics.saves[key] = Number(result.rows[0]?.total ?? 0);
        metrics.recentSaves[key] = Number(result.rows[0]?.recent ?? 0);
      })
    ),

    run('submissions', async () => {
      const result = await turso.execute({
        sql: 'SELECT status, count(*) AS count FROM submissions GROUP BY status ORDER BY count DESC',
      });
      metrics.submissionsByStatus = result.rows.map((row: any) => ({
        status: String(row.status ?? 'unknown'),
        count: Number(row.count ?? 0),
      }));
    }),

    run('suggestions', async () => {
      const result = await turso.execute({
        sql: 'SELECT count(*) AS count FROM suggestions WHERE created_at >= ?',
        args: [sinceUnix],
      });
      metrics.suggestions = Number(result.rows[0]?.count ?? 0);
    }),
  ]);

  setCache(cacheKey, metrics);
  return metrics;
}

export const SUBMISSION_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

export const SUGGESTION_STATUSES = ['new', 'accepted', 'dismissed'] as const;
export type SuggestionStatus = (typeof SUGGESTION_STATUSES)[number];

export function isSubmissionStatus(value: unknown): value is SubmissionStatus {
  return SUBMISSION_STATUSES.includes(value as SubmissionStatus);
}

export function isSuggestionStatus(value: unknown): value is SuggestionStatus {
  return SUGGESTION_STATUSES.includes(value as SuggestionStatus);
}

export interface AdminSubmissionRow {
  id: string;
  userId: string;
  name: string;
  website: string;
  city: string;
  country: string;
  address: string | null;
  instagram: string | null;
  description: string;
  contactEmail: string;
  imageUrl: string | null;
  status: string;
  createdAt: string;
  reviewedAt: number | null;
  reviewedBy: string | null;
  adminNotes: string | null;
  profileUrl: string | null;
  acceptanceEmailSentAt: number | null;
  rejectionEmailSentAt: number | null;
}

export interface AdminSuggestionRow {
  id: string;
  type: string;
  name: string;
  city: string;
  website: string | null;
  status: string;
  createdAt: string;
  reviewedAt: number | null;
}

export interface AdminInbox {
  submissions: AdminSubmissionRow[];
  suggestions: AdminSuggestionRow[];
  /** Queue sizes, so the shell can badge nav items without a second request. */
  counts: {
    submissions: Record<string, number>;
    suggestions: Record<string, number>;
    pendingSubmissions: number;
    newSuggestions: number;
  };
  errors: string[];
}

const ADMIN_INBOX_CACHE_KEY = 'admin_inbox';

/**
 * Drop the cached inbox. Every admin write calls this: `getAdminInbox` is
 * cached for CACHE_TTL, so without an explicit bust the queue would keep
 * showing the pre-action state for up to 30s after an approve or a delete —
 * which reads as the action having silently failed.
 */
export function invalidateAdminInbox(): void {
  invalidateCache(ADMIN_INBOX_CACHE_KEY);
}

function toNullableNumber(value: any): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function tally(rows: { status: string }[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const key = row.status || 'unknown';
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

/**
 * Full submission/suggestion rows for the admin inbox. Independent of PostHog.
 *
 * The review columns (`reviewed_at`, `admin_notes`, …) are added by
 * scripts/migrate-review-workflow.ts. Each SELECT is attempted with those
 * columns first and retried without them, so an un-migrated environment
 * degrades to the old read-only view instead of erroring out entirely.
 */
export async function getAdminInbox(env: Env): Promise<AdminInbox> {
  const cacheKey = getCacheKey(ADMIN_INBOX_CACHE_KEY);
  const cached = getFromCache<AdminInbox>(cacheKey);
  if (cached) return cached;

  const turso = new TursoHttpClient(env.TURSO_DATABASE_URL, env.TURSO_AUTH_TOKEN);
  const inbox: AdminInbox = {
    submissions: [],
    suggestions: [],
    counts: { submissions: {}, suggestions: {}, pendingSubmissions: 0, newSuggestions: 0 },
    errors: [],
  };

  const run = async (label: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (error: any) {
      inbox.errors.push(`${label}: ${error?.message || 'query failed'}`);
    }
  };

  /** Run `sql`, falling back to `fallbackSql` when the review columns are absent. */
  const selectWithFallback = async (sql: string, fallbackSql: string) => {
    try {
      return await turso.execute({ sql });
    } catch (error: any) {
      if (/no such column/i.test(String(error?.message || ''))) {
        return await turso.execute({ sql: fallbackSql });
      }
      throw error;
    }
  };

  await Promise.all([
    run('submissions', async () => {
      const result = await selectWithFallback(
        `SELECT id, user_id, name, website, city, country, address, instagram,
                description, contact_email, image_url, status, created_at,
                reviewed_at, reviewed_by, admin_notes, profile_url,
                acceptance_email_sent_at, rejection_email_sent_at
         FROM submissions
         ORDER BY created_at DESC
         LIMIT 200`,
        `SELECT id, user_id, name, website, city, country, address, instagram,
                description, contact_email, image_url, status, created_at
         FROM submissions
         ORDER BY created_at DESC
         LIMIT 200`
      );
      inbox.submissions = result.rows.map((row: any) => ({
        id: String(row.id ?? ''),
        userId: String(row.user_id ?? ''),
        name: String(row.name ?? ''),
        website: String(row.website ?? ''),
        city: String(row.city ?? ''),
        country: String(row.country ?? ''),
        address: row.address != null ? String(row.address) : null,
        instagram: row.instagram != null ? String(row.instagram) : null,
        description: String(row.description ?? ''),
        contactEmail: String(row.contact_email ?? ''),
        imageUrl: row.image_url != null ? String(row.image_url) : null,
        status: String(row.status ?? 'unknown'),
        createdAt: String(row.created_at ?? ''),
        reviewedAt: toNullableNumber(row.reviewed_at),
        reviewedBy: row.reviewed_by != null ? String(row.reviewed_by) : null,
        adminNotes: row.admin_notes != null ? String(row.admin_notes) : null,
        profileUrl: row.profile_url != null ? String(row.profile_url) : null,
        acceptanceEmailSentAt: toNullableNumber(row.acceptance_email_sent_at),
        rejectionEmailSentAt: toNullableNumber(row.rejection_email_sent_at),
      }));
    }),
    run('suggestions', async () => {
      const result = await selectWithFallback(
        `SELECT id, type, name, city, website, created_at, status, reviewed_at
         FROM suggestions
         ORDER BY created_at DESC
         LIMIT 400`,
        `SELECT id, type, name, city, website, created_at
         FROM suggestions
         ORDER BY created_at DESC
         LIMIT 400`
      );
      inbox.suggestions = result.rows.map((row: any) => ({
        id: String(row.id ?? ''),
        type: String(row.type ?? ''),
        name: String(row.name ?? ''),
        city: String(row.city ?? ''),
        website: row.website != null ? String(row.website) : null,
        status: String(row.status ?? 'new'),
        createdAt: String(row.created_at ?? ''),
        reviewedAt: toNullableNumber(row.reviewed_at),
      }));
    }),
  ]);

  inbox.counts.submissions = tally(inbox.submissions);
  inbox.counts.suggestions = tally(inbox.suggestions);
  inbox.counts.pendingSubmissions = inbox.counts.submissions.pending ?? 0;
  inbox.counts.newSuggestions = inbox.counts.suggestions.new ?? 0;

  setCache(cacheKey, inbox);
  return inbox;
}

/* ============================================================
   Admin review actions
   Writes behind /api/admin/*. Each one busts the inbox cache so the queue
   reflects the change on the next poll.
   ============================================================ */

/** One submission by id, or null. Used before sending a decision email. */
export async function getSubmissionById(
  id: string,
  env: Env
): Promise<AdminSubmissionRow | null> {
  const turso = new TursoHttpClient(env.TURSO_DATABASE_URL, env.TURSO_AUTH_TOKEN);
  const result = await turso.execute({
    sql: `SELECT id, user_id, name, website, city, country, address, instagram,
                 description, contact_email, image_url, status, created_at,
                 reviewed_at, reviewed_by, admin_notes, profile_url,
                 acceptance_email_sent_at, rejection_email_sent_at
          FROM submissions WHERE id = ? LIMIT 1`,
    args: [id],
  });

  const row: any = result.rows[0];
  if (!row) return null;

  return {
    id: String(row.id ?? ''),
    userId: String(row.user_id ?? ''),
    name: String(row.name ?? ''),
    website: String(row.website ?? ''),
    city: String(row.city ?? ''),
    country: String(row.country ?? ''),
    address: row.address != null ? String(row.address) : null,
    instagram: row.instagram != null ? String(row.instagram) : null,
    description: String(row.description ?? ''),
    contactEmail: String(row.contact_email ?? ''),
    imageUrl: row.image_url != null ? String(row.image_url) : null,
    status: String(row.status ?? 'unknown'),
    createdAt: String(row.created_at ?? ''),
    reviewedAt: toNullableNumber(row.reviewed_at),
    reviewedBy: row.reviewed_by != null ? String(row.reviewed_by) : null,
    adminNotes: row.admin_notes != null ? String(row.admin_notes) : null,
    profileUrl: row.profile_url != null ? String(row.profile_url) : null,
    acceptanceEmailSentAt: toNullableNumber(row.acceptance_email_sent_at),
    rejectionEmailSentAt: toNullableNumber(row.rejection_email_sent_at),
  };
}

export interface SubmissionUpdate {
  status?: SubmissionStatus;
  adminNotes?: string | null;
  profileUrl?: string | null;
}

/**
 * Apply a review decision to a submission.
 *
 * `reviewed_at`/`reviewed_by` are stamped only when the status actually moves
 * off `pending`, so editing a note on an already-reviewed row doesn't rewrite
 * who reviewed it. Returns false when no row matched.
 */
export async function updateSubmission(
  id: string,
  update: SubmissionUpdate,
  reviewerEmail: string,
  env: Env
): Promise<boolean> {
  const sets: string[] = [];
  const args: any[] = [];

  if (update.status !== undefined) {
    sets.push('status = ?', 'updated_at = ?');
    args.push(update.status, Math.floor(Date.now() / 1000));

    if (update.status === 'pending') {
      // Reopening a decision clears the review stamp; the email timestamps stay
      // so an already-notified applicant is still visibly notified.
      sets.push('reviewed_at = NULL', 'reviewed_by = NULL');
    } else {
      sets.push('reviewed_at = ?', 'reviewed_by = ?');
      args.push(Math.floor(Date.now() / 1000), reviewerEmail);
    }
  }

  if (update.adminNotes !== undefined) {
    sets.push('admin_notes = ?');
    args.push(update.adminNotes || null);
  }

  if (update.profileUrl !== undefined) {
    sets.push('profile_url = ?');
    args.push(update.profileUrl || null);
  }

  if (!sets.length) return false;

  const turso = new TursoHttpClient(env.TURSO_DATABASE_URL, env.TURSO_AUTH_TOKEN);
  const result = await turso.execute({
    sql: `UPDATE submissions SET ${sets.join(', ')} WHERE id = ?`,
    args: [...args, id],
  });

  invalidateAdminInbox();
  return (result.rowsAffected ?? 0) > 0;
}

/**
 * Record that a decision email went out. Called only after Resend accepted the
 * message, so the timestamp never claims a send that failed.
 */
export async function markDecisionEmailSent(
  id: string,
  kind: 'acceptance' | 'rejection',
  env: Env
): Promise<void> {
  const column = kind === 'acceptance' ? 'acceptance_email_sent_at' : 'rejection_email_sent_at';
  const turso = new TursoHttpClient(env.TURSO_DATABASE_URL, env.TURSO_AUTH_TOKEN);
  await turso.execute({
    sql: `UPDATE submissions SET ${column} = ? WHERE id = ?`,
    args: [Math.floor(Date.now() / 1000), id],
  });
  invalidateAdminInbox();
}

/** Triage a recommendation. Returns false when no row matched. */
export async function updateSuggestion(
  id: string,
  status: SuggestionStatus,
  env: Env
): Promise<boolean> {
  const turso = new TursoHttpClient(env.TURSO_DATABASE_URL, env.TURSO_AUTH_TOKEN);
  const result = await turso.execute({
    sql: 'UPDATE suggestions SET status = ?, reviewed_at = ? WHERE id = ?',
    args: [status, status === 'new' ? null : Math.floor(Date.now() / 1000), id],
  });

  invalidateAdminInbox();
  return (result.rowsAffected ?? 0) > 0;
}

/** Permanently remove a recommendation (spam, junk). */
export async function deleteSuggestion(id: string, env: Env): Promise<boolean> {
  const turso = new TursoHttpClient(env.TURSO_DATABASE_URL, env.TURSO_AUTH_TOKEN);
  const result = await turso.execute({
    sql: 'DELETE FROM suggestions WHERE id = ?',
    args: [id],
  });

  invalidateAdminInbox();
  return (result.rowsAffected ?? 0) > 0;
}
