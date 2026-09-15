import type { Env } from '../env.d';
import { TursoHttpClient } from './turso';

// In-memory fallback for local dev / edge if DB table not yet created
const inMemoryAdStats = {
  clicks: 0,
  impressions: 0,
  history: [] as { id: string; type: string; timestamp: number }[],
};

export async function trackAdEvent(adId: string, type: 'click' | 'impression', env: Env) {
  const now = Math.floor(Date.now() / 1000);
  
  if (type === 'click') {
    inMemoryAdStats.clicks++;
    inMemoryAdStats.history.unshift({ id: adId, type, timestamp: now });
    if (inMemoryAdStats.history.length > 100) inMemoryAdStats.history.pop();
  } else {
    inMemoryAdStats.impressions++;
  }

  if (env.TURSO_DATABASE_URL && env.TURSO_AUTH_TOKEN) {
    try {
      const turso = new TursoHttpClient(env.TURSO_DATABASE_URL, env.TURSO_AUTH_TOKEN);
      await turso.execute({
        sql: `CREATE TABLE IF NOT EXISTS ad_events (
          id TEXT PRIMARY KEY,
          ad_id TEXT NOT NULL,
          event_type TEXT NOT NULL,
          created_at INTEGER NOT NULL
        )`,
      });
      const id = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);
      await turso.execute({
        sql: `INSERT INTO ad_events (id, ad_id, event_type, created_at) VALUES (?, ?, ?, ?)`,
        args: [id, adId, type, now],
      });
    } catch (e) {
      console.warn('[AdTracker] Turso log failed, using in-memory fallback:', e);
    }
  }
}

export async function getAdMetrics(env: Env) {
  let clicks = inMemoryAdStats.clicks;
  let impressions = inMemoryAdStats.impressions;
  let recentEvents: { id: string; type: string; timestamp: number }[] = [...inMemoryAdStats.history];

  if (env.TURSO_DATABASE_URL && env.TURSO_AUTH_TOKEN) {
    try {
      const turso = new TursoHttpClient(env.TURSO_DATABASE_URL, env.TURSO_AUTH_TOKEN);
      const res = await turso.execute({
        sql: `SELECT event_type, COUNT(*) as cnt FROM ad_events GROUP BY event_type`,
      });
      for (const row of res.rows as any[]) {
        if (row.event_type === 'click') clicks = Math.max(clicks, Number(row.cnt));
        if (row.event_type === 'impression') impressions = Math.max(impressions, Number(row.cnt));
      }

      const recentRes = await turso.execute({
        sql: `SELECT ad_id, event_type, created_at FROM ad_events WHERE event_type = 'click' ORDER BY created_at DESC LIMIT 50`,
      });
      if (recentRes.rows.length > 0) {
        recentEvents = recentRes.rows.map((r: any) => ({
          id: String(r.ad_id),
          type: String(r.event_type),
          timestamp: Number(r.created_at),
        }));
      }
    } catch {
      // Fallback to in-memory stats
    }
  }

  const ctrNum = impressions > 0 ? (clicks / impressions) * 100 : 0;
  const ctr = ctrNum.toFixed(2) + '%';

  return {
    clicks,
    impressions,
    ctr,
    recentEvents,
  };
}
