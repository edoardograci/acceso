import type { Env } from '../env.d';
import { TursoHttpClient } from './turso';

export type AffiliateCategory = 'books' | 'tools' | 'courses';

// In-memory fallback for local dev / edge if DB table not yet created
const inMemoryAdStats = {
  clicks: 0,
  impressions: 0,
  history: [] as { id: string; type: string; timestamp: number }[],
};

let adEventsTableReady: Promise<void> | null = null;

async function ensureAdEventsTable(turso: TursoHttpClient): Promise<void> {
  if (!adEventsTableReady) {
    adEventsTableReady = turso.execute({
      sql: `CREATE TABLE IF NOT EXISTS ad_events (
        id TEXT PRIMARY KEY,
        ad_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )`,
    }).then(() => undefined).catch((error) => {
      adEventsTableReady = null;
      throw error;
    });
  }
  await adEventsTableReady;
}

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
      await ensureAdEventsTable(turso);
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

export async function trackAffiliateClick(
  category: AffiliateCategory,
  itemSlug: string,
  env: Env,
): Promise<void> {
  if (!env.TURSO_DATABASE_URL || !env.TURSO_AUTH_TOKEN) {
    throw new Error('Affiliate click database is not configured');
  }

  const adId = `affiliate:${category}:${itemSlug}`;
  const now = Math.floor(Date.now() / 1000);
  const turso = new TursoHttpClient(env.TURSO_DATABASE_URL, env.TURSO_AUTH_TOKEN);
  await ensureAdEventsTable(turso);
  const id = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

  await turso.execute({
    sql: 'INSERT INTO ad_events (id, ad_id, event_type, created_at) VALUES (?, ?, ?, ?)',
    args: [id, adId, 'click', now],
  });
}

export interface AffiliateMetrics {
  category: AffiliateCategory;
  clicks: number;
  items: { slug: string; clicks: number }[];
  recentEvents: { slug: string; timestamp: number }[];
}

export async function getAffiliateMetrics(env: Env): Promise<AffiliateMetrics[]> {
  const categories: AffiliateCategory[] = ['books', 'tools', 'courses'];
  const metrics = new Map<AffiliateCategory, AffiliateMetrics>(
    categories.map((category) => [category, { category, clicks: 0, items: [], recentEvents: [] }]),
  );

  if (!env.TURSO_DATABASE_URL || !env.TURSO_AUTH_TOKEN) {
    throw new Error('Affiliate metrics database is not configured');
  }

  const turso = new TursoHttpClient(env.TURSO_DATABASE_URL, env.TURSO_AUTH_TOKEN);
  await ensureAdEventsTable(turso);
  const counts = await turso.execute({
    sql: `SELECT ad_id, COUNT(*) AS clicks
          FROM ad_events
          WHERE event_type = 'click' AND ad_id LIKE 'affiliate:%'
          GROUP BY ad_id`,
  });

  for (const row of counts.rows as { ad_id: string; clicks: number }[]) {
    const [, category, ...slugParts] = String(row.ad_id).split(':');
    if (!categories.includes(category as AffiliateCategory)) continue;
    const metric = metrics.get(category as AffiliateCategory)!;
    const clicks = Number(row.clicks);
    metric.clicks += clicks;
    metric.items.push({ slug: slugParts.join(':'), clicks });
  }

  const recent = await turso.execute({
    sql: `SELECT ad_id, created_at
          FROM ad_events
          WHERE event_type = 'click' AND ad_id LIKE 'affiliate:%'
          ORDER BY created_at DESC
          LIMIT 100`,
  });

  for (const row of recent.rows as { ad_id: string; created_at: number }[]) {
    const [, category, ...slugParts] = String(row.ad_id).split(':');
    if (!categories.includes(category as AffiliateCategory)) continue;
    metrics.get(category as AffiliateCategory)!.recentEvents.push({
      slug: slugParts.join(':'),
      timestamp: Number(row.created_at),
    });
  }

  for (const metric of metrics.values()) {
    metric.items.sort((a, b) => b.clicks - a.clicks || a.slug.localeCompare(b.slug));
  }

  return categories.map((category) => metrics.get(category)!);
}
