// src/lib/admin-metrics.ts
// Assembles the admin dashboard payload from PostHog (traffic/behaviour) and
// Turso (signups, saved items, submissions), and caches the result.
//
// Every PostHog query runs independently: one failing block degrades to an
// error message next to that panel instead of blanking the dashboard.

import type { Env } from '../env.d';
import { getAdminTursoMetrics, type AdminTursoMetrics } from './db';
import {
  fetchCountries,
  fetchCustomEvents,
  fetchDevices,
  fetchPageTypes,
  fetchReferringDomains,
  fetchReferrerTypes,
  fetchSessionStats,
  fetchTopPaths,
  fetchTrafficSeries,
  fetchUtmCampaigns,
  fetchUtmSources,
  getPostHogConfig,
  type BreakdownRow,
  type EventCountRow,
  type PostHogConfig,
  type SessionStats,
  type TrafficPoint,
} from './posthog-query';

export const RANGES = { '7d': 7, '30d': 30, '90d': 90 } as const;
export type RangeKey = keyof typeof RANGES;
export const DEFAULT_RANGE: RangeKey = '30d';

/** Cloudflare Cache API TTL. PostHog's query API is slow and rate limited. */
const CACHE_TTL_SECONDS = 300;
const CACHE_ORIGIN = 'https://admin-metrics.acceso.internal';

export interface TrafficTotals {
  pageviews: number;
  sessions: number;
  visitors: number;
}

export interface AdminMetrics {
  range: RangeKey;
  days: number;
  generatedAt: string;
  posthogConfigured: boolean;
  traffic: {
    series: TrafficPoint[];
    current: TrafficTotals;
    previous: TrafficTotals;
  };
  content: {
    sections: BreakdownRow[];
    topPages: BreakdownRow[];
    pageTypes: BreakdownRow[];
  };
  acquisition: {
    referrerTypes: BreakdownRow[];
    referringDomains: BreakdownRow[];
    utmSources: BreakdownRow[];
    utmCampaigns: BreakdownRow[];
    countries: BreakdownRow[];
    devices: BreakdownRow[];
  };
  engagement: {
    sessions: SessionStats;
    customEvents: EventCountRow[];
  };
  app: AdminTursoMetrics;
  errors: string[];
}

/** Normalise the ?range= query param; anything unknown falls back to default. */
export function parseRange(value: string | null | undefined): RangeKey {
  const key = String(value || '').trim() as RangeKey;
  return key in RANGES ? key : DEFAULT_RANGE;
}

/** Percentage change between two periods; null when there is no baseline. */
export function percentChange(current: number, previous: number): number | null {
  if (!previous) return current > 0 ? null : 0;
  return ((current - previous) / previous) * 100;
}

/**
 * Group site paths into the sections the site is actually organised in, so the
 * ranking reads as "which part of Acceso gets used" rather than a flat URL list.
 */
export function classifyPath(path: string): string {
  const p = path.toLowerCase();
  if (p === '/' || p === '/map' || p.startsWith('/map/')) return 'Home / Map';
  if (p.startsWith('/designers')) return 'Studios';
  if (p.startsWith('/directory/museums') || p.startsWith('/events/museums')) return 'Museums';
  if (p.startsWith('/directory/schools')) return 'Schools';
  if (p.startsWith('/directory/awards') || p.startsWith('/events/awards')) return 'Awards';
  if (p.startsWith('/directory/fairs') || p.startsWith('/events/fairs')) return 'Fairs';
  if (p.startsWith('/directory')) return 'Directory';
  if (p.startsWith('/events')) return 'Events';
  if (p.startsWith('/discover')) return 'Discover';
  if (p.startsWith('/moodboard')) return 'Moodboard';
  if (p.startsWith('/collections')) return 'Collections';
  if (p.startsWith('/profile') || p.startsWith('/login')) return 'Account';
  if (p.startsWith('/embed')) return 'Embed widgets';
  if (p.startsWith('/submission')) return 'Submissions';
  return 'Other';
}

function aggregateSections(paths: BreakdownRow[]): BreakdownRow[] {
  const totals = new Map<string, BreakdownRow>();

  for (const row of paths) {
    const label = classifyPath(row.label);
    const entry = totals.get(label) || { label, sessions: 0, pageviews: 0 };
    // Sessions are summed across paths, so a visitor browsing two sections is
    // counted in both — these are section weights, not unique session counts.
    entry.sessions += row.sessions;
    entry.pageviews += row.pageviews;
    totals.set(label, entry);
  }

  return Array.from(totals.values()).sort((a, b) => b.pageviews - a.pageviews);
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function shiftDays(from: Date, delta: number): Date {
  const d = new Date(from.getTime());
  d.setUTCDate(d.getUTCDate() + delta);
  return d;
}

const emptyTotals = (): TrafficTotals => ({ pageviews: 0, sessions: 0, visitors: 0 });

function addPoint(totals: TrafficTotals, point: TrafficPoint): void {
  totals.pageviews += point.pageviews;
  totals.sessions += point.sessions;
  totals.visitors += point.visitors;
}

/**
 * Split the double-length series into the current window and the one before it,
 * filling gaps so the chart has one point per day.
 *
 * Day boundaries come from the PostHog project's timezone while the cutoffs are
 * computed in UTC; on a non-UTC project the edge days can be off by a few hours.
 */
export function splitTrafficSeries(
  series: TrafficPoint[],
  days: number
): { series: TrafficPoint[]; current: TrafficTotals; previous: TrafficTotals } {
  const today = new Date();
  const currentStart = isoDay(shiftDays(today, -(days - 1)));
  const previousStart = isoDay(shiftDays(today, -(days * 2 - 1)));

  const byDay = new Map(series.map((point) => [point.day, point]));
  const current = emptyTotals();
  const previous = emptyTotals();
  const filled: TrafficPoint[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const day = isoDay(shiftDays(today, -i));
    const point = byDay.get(day) || { day, pageviews: 0, sessions: 0, visitors: 0 };
    filled.push(point);
    addPoint(current, point);
  }

  for (const point of series) {
    if (point.day >= previousStart && point.day < currentStart) addPoint(previous, point);
  }

  return { series: filled, current, previous };
}

function emptyPostHogBlocks() {
  return {
    traffic: { series: [] as TrafficPoint[], current: emptyTotals(), previous: emptyTotals() },
    content: { sections: [], topPages: [], pageTypes: [] } as AdminMetrics['content'],
    acquisition: {
      referrerTypes: [],
      referringDomains: [],
      utmSources: [],
      utmCampaigns: [],
      countries: [],
      devices: [],
    } as AdminMetrics['acquisition'],
    engagement: {
      sessions: {
        sessions: 0,
        avgDurationSec: 0,
        medianDurationSec: 0,
        avgPageviews: 0,
        bounceRate: 0,
      },
      customEvents: [] as EventCountRow[],
    },
  };
}

async function collectPostHog(config: PostHogConfig, days: number) {
  const blocks = emptyPostHogBlocks();
  const errors: string[] = [];

  const settle = async <T>(label: string, promise: Promise<T>, apply: (value: T) => void) => {
    try {
      apply(await promise);
    } catch (error: any) {
      errors.push(`${label}: ${error?.message || 'query failed'}`);
    }
  };

  await Promise.all([
    settle('traffic', fetchTrafficSeries(config, days), (series) => {
      blocks.traffic = splitTrafficSeries(series, days);
    }),
    settle('top_paths', fetchTopPaths(config, days), (paths) => {
      blocks.content.sections = aggregateSections(paths);
      blocks.content.topPages = paths.slice(0, 25);
    }),
    settle('page_types', fetchPageTypes(config, days), (rows) => {
      blocks.content.pageTypes = rows;
    }),
    settle('referrer_types', fetchReferrerTypes(config, days), (rows) => {
      blocks.acquisition.referrerTypes = rows;
    }),
    settle('referring_domains', fetchReferringDomains(config, days), (rows) => {
      blocks.acquisition.referringDomains = rows;
    }),
    settle('utm_sources', fetchUtmSources(config, days), (rows) => {
      blocks.acquisition.utmSources = rows;
    }),
    settle('utm_campaigns', fetchUtmCampaigns(config, days), (rows) => {
      blocks.acquisition.utmCampaigns = rows;
    }),
    settle('countries', fetchCountries(config, days), (rows) => {
      blocks.acquisition.countries = rows;
    }),
    settle('devices', fetchDevices(config, days), (rows) => {
      blocks.acquisition.devices = rows;
    }),
    settle('session_stats', fetchSessionStats(config, days), (stats) => {
      blocks.engagement.sessions = stats;
    }),
    settle('custom_events', fetchCustomEvents(config, days), (rows) => {
      blocks.engagement.customEvents = rows;
    }),
  ]);

  return { blocks, errors };
}

function cacheRequest(range: RangeKey): Request {
  return new Request(`${CACHE_ORIGIN}/${range}`);
}

async function readCache(range: RangeKey): Promise<AdminMetrics | null> {
  const cacheStore = (globalThis as any).caches?.default;
  if (!cacheStore) return null;
  try {
    const hit = await cacheStore.match(cacheRequest(range));
    return hit ? ((await hit.json()) as AdminMetrics) : null;
  } catch {
    return null;
  }
}

async function writeCache(range: RangeKey, metrics: AdminMetrics): Promise<void> {
  const cacheStore = (globalThis as any).caches?.default;
  if (!cacheStore) return;
  try {
    await cacheStore.put(
      cacheRequest(range),
      new Response(JSON.stringify(metrics), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': `max-age=${CACHE_TTL_SECONDS}`,
        },
      })
    );
  } catch {
    // A cold or unavailable cache is not worth failing the request over.
  }
}

/**
 * Build the full dashboard payload. Served from the Cloudflare Cache API for
 * CACHE_TTL_SECONDS unless `refresh` is set.
 */
export async function getAdminMetrics(
  env: Env,
  range: RangeKey,
  options: { refresh?: boolean } = {}
): Promise<AdminMetrics> {
  if (!options.refresh) {
    const cached = await readCache(range);
    if (cached) return cached;
  }

  const days = RANGES[range];
  const config = getPostHogConfig(env);

  const [posthog, app] = await Promise.all([
    config ? collectPostHog(config, days) : Promise.resolve({ blocks: emptyPostHogBlocks(), errors: [] }),
    getAdminTursoMetrics(env, days).catch((error: any) => ({
      totalUsers: 0,
      newUsers: 0,
      signupsByDay: [],
      saves: { designers: 0, objects: 0, museums: 0, universities: 0 },
      recentSaves: { designers: 0, objects: 0, museums: 0, universities: 0 },
      submissionsByStatus: [],
      pendingStudioRequests: 0,
      suggestions: 0,
      errors: [`turso: ${error?.message || 'query failed'}`],
    })),
  ]);

  const metrics: AdminMetrics = {
    range,
    days,
    generatedAt: new Date().toISOString(),
    posthogConfigured: Boolean(config),
    ...posthog.blocks,
    app,
    errors: [...posthog.errors, ...app.errors],
  };

  await writeCache(range, metrics);
  return metrics;
}
