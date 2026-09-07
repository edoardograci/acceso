// src/lib/admin-metrics.ts
// Assembles admin dashboard payloads from PostHog and Turso.

import type { Env } from '../env.d';
import { filtersCacheKey, type AnalyticsFilter } from './analytics-filters';
import {
  buildDateRange,
  fetchAiPlatforms,
  fetchAiReferrerDetails,
  fetchBrowsers,
  fetchCountries,
  fetchCustomEvents,
  fetchDayTotals,
  fetchDevices,
  fetchHourlyTraffic,
  fetchLiveDetail,
  fetchLiveStats,
  fetchOperatingSystems,
  fetchPageTypes,
  fetchSections,
  fetchReferringDomains,
  fetchReferrerTypes,
  fetchSessionStats,
  fetchTopPaths,
  fetchTrafficSeries,
  fetchUtmCampaigns,
  fetchUtmSources,
  getPostHogConfig,
  parseDay,
  utcToday,
  type AiReferrerRow,
  type BreakdownRow,
  type EventCountRow,
  type HourlyPoint,
  type LiveDetail,
  type LiveStats,
  type PostHogConfig,
  type SessionStats,
  type TrafficPoint,
} from './posthog-query';

export const RANGES = { '1d': 1, '7d': 7, '30d': 30, '90d': 90 } as const;
export type RangeKey = keyof typeof RANGES;
export const DEFAULT_RANGE: RangeKey = '30d';
export type MetricsPart = 'core' | 'extra' | 'all';

const CACHE_TTL_SECONDS = 300;
const LIVE_CACHE_TTL_SECONDS = 30;
const CACHE_ORIGIN = 'https://admin-metrics.acceso.internal';

export interface TrafficTotals {
  pageviews: number;
  sessions: number;
  visitors: number;
}

export interface AdminMetrics {
  range: RangeKey;
  days: number;
  selectedDay: string;
  isToday: boolean;
  part: MetricsPart;
  generatedAt: string;
  posthogConfigured: boolean;
  live: LiveStats | null;
  selectedDayTotals: TrafficPoint | null;
  hourly: HourlyPoint[];
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
    browsers: BreakdownRow[];
    operatingSystems: BreakdownRow[];
  };
  aiReferrers: {
    platforms: BreakdownRow[];
    details: AiReferrerRow[];
  };
  engagement: {
    sessions: SessionStats;
    customEvents: EventCountRow[];
  };
  /** Filters this payload was computed under; echoed back so the UI can verify. */
  filters: AnalyticsFilter[];
  errors: string[];
}

export function parseRange(value: string | null | undefined): RangeKey {
  const key = String(value || '').trim() as RangeKey;
  return key in RANGES ? key : DEFAULT_RANGE;
}

export function parseSelectedDay(value: string | null | undefined): string {
  return parseDay(value) || utcToday();
}

export function percentChange(current: number, previous: number): number | null {
  if (!previous) return current > 0 ? null : 0;
  return ((current - previous) / previous) * 100;
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

export function splitTrafficSeries(
  series: TrafficPoint[],
  days: number,
  endDay: string
): { series: TrafficPoint[]; current: TrafficTotals; previous: TrafficTotals } {
  const end = new Date(`${endDay}T00:00:00Z`);
  const currentStart = isoDay(shiftDays(end, -(days - 1)));
  const previousStart = isoDay(shiftDays(end, -(days * 2 - 1)));

  const byDay = new Map(series.map((point) => [point.day, point]));
  const current = emptyTotals();
  const previous = emptyTotals();
  const filled: TrafficPoint[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const day = isoDay(shiftDays(end, -i));
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
    live: null as LiveStats | null,
    selectedDayTotals: null as TrafficPoint | null,
    hourly: [] as HourlyPoint[],
    traffic: { series: [] as TrafficPoint[], current: emptyTotals(), previous: emptyTotals() },
    content: { sections: [], topPages: [], pageTypes: [] } as AdminMetrics['content'],
    acquisition: {
      referrerTypes: [],
      referringDomains: [],
      utmSources: [],
      utmCampaigns: [],
      countries: [],
      devices: [],
      browsers: [],
      operatingSystems: [],
    } as AdminMetrics['acquisition'],
    aiReferrers: { platforms: [] as BreakdownRow[], details: [] as AiReferrerRow[] },
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

async function collectPostHog(
  config: PostHogConfig,
  days: number,
  selectedDay: string,
  part: MetricsPart,
  filters: AnalyticsFilter[]
) {
  const blocks = emptyPostHogBlocks();
  const errors: string[] = [];

  const settle = async <T>(label: string, promise: Promise<T>, apply: (value: T) => void) => {
    try {
      apply(await promise);
    } catch (error: any) {
      errors.push(`${label}: ${error?.message || 'query failed'}`);
    }
  };

  const core: Promise<void>[] = [
    settle('traffic', fetchTrafficSeries(config, days, selectedDay, filters), (series) => {
      blocks.traffic = splitTrafficSeries(series, days, selectedDay);
    }),
    settle('top_paths', fetchTopPaths(config, days, selectedDay, filters), (paths) => {
      blocks.content.topPages = paths.slice(0, 30);
    }),
    // Sections are grouped in SQL, not folded from topPages: summing
    // distinct-visitor counts across paths counted one visitor once per page.
    settle('sections', fetchSections(config, days, selectedDay, filters), (rows) => {
      blocks.content.sections = rows;
    }),
    settle('countries', fetchCountries(config, days, selectedDay, filters), (rows) => {
      blocks.acquisition.countries = rows;
    }),
    settle('devices', fetchDevices(config, days, selectedDay, filters), (rows) => {
      blocks.acquisition.devices = rows;
    }),
    settle('browsers', fetchBrowsers(config, days, selectedDay, filters), (rows) => {
      blocks.acquisition.browsers = rows;
    }),
    settle('day_totals', fetchDayTotals(config, selectedDay, filters), (totals) => {
      blocks.selectedDayTotals = totals;
    }),
    settle('hourly', fetchHourlyTraffic(config, selectedDay, filters), (rows) => {
      blocks.hourly = rows;
    }),
  ];

  const extra: Promise<void>[] = [
    settle('page_types', fetchPageTypes(config, days, selectedDay, filters), (rows) => {
      blocks.content.pageTypes = rows;
    }),
    settle('referrer_types', fetchReferrerTypes(config, days, selectedDay, filters), (rows) => {
      blocks.acquisition.referrerTypes = rows;
    }),
    settle('referring_domains', fetchReferringDomains(config, days, selectedDay, filters), (rows) => {
      blocks.acquisition.referringDomains = rows;
    }),
    settle('utm_sources', fetchUtmSources(config, days, selectedDay, filters), (rows) => {
      blocks.acquisition.utmSources = rows;
    }),
    settle('utm_campaigns', fetchUtmCampaigns(config, days, selectedDay, filters), (rows) => {
      blocks.acquisition.utmCampaigns = rows;
    }),
    settle('operating_systems', fetchOperatingSystems(config, days, selectedDay, filters), (rows) => {
      blocks.acquisition.operatingSystems = rows;
    }),
    settle('ai_platforms', fetchAiPlatforms(config, days, selectedDay, filters), (rows) => {
      blocks.aiReferrers.platforms = rows;
    }),
    settle('ai_details', fetchAiReferrerDetails(config, days, selectedDay, filters), (rows) => {
      blocks.aiReferrers.details = rows;
    }),
    settle('session_stats', fetchSessionStats(config, days, selectedDay, filters), (stats) => {
      blocks.engagement.sessions = stats;
    }),
    settle('custom_events', fetchCustomEvents(config, days, selectedDay, filters), (rows) => {
      blocks.engagement.customEvents = rows;
    }),
  ];

  const queries = part === 'core' ? core : part === 'extra' ? extra : [...core, ...extra];
  await Promise.all(queries);
  return { blocks, errors };
}

/**
 * Cache identity for one payload.
 *
 * The filter set is part of the key. Without it a filtered request would be
 * served the cached *unfiltered* payload and the dashboard would silently
 * ignore the filter that was just clicked.
 */
function cacheKey(
  range: RangeKey,
  day: string,
  kind: 'metrics' | 'live' | 'live-detail' | 'core' | 'extra',
  filters: AnalyticsFilter[] = []
): string {
  return `${CACHE_ORIGIN}/${kind}/${range}/${day}/${encodeURIComponent(filtersCacheKey(filters))}`;
}

async function readCache<T>(key: string): Promise<T | null> {
  const cacheStore = (globalThis as any).caches?.default;
  if (!cacheStore) return null;
  try {
    const hit = await cacheStore.match(new Request(key));
    return hit ? ((await hit.json()) as T) : null;
  } catch {
    return null;
  }
}

async function writeCache(key: string, data: unknown, ttl: number): Promise<void> {
  const cacheStore = (globalThis as any).caches?.default;
  if (!cacheStore) return;
  try {
    await cacheStore.put(
      new Request(key),
      new Response(JSON.stringify(data), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': `max-age=${ttl}`,
        },
      })
    );
  } catch {
    // Non-fatal
  }
}

export interface LiveAnalytics {
  live: LiveStats | null;
  detail: LiveDetail | null;
  posthogConfigured: boolean;
  generatedAt: string;
  errors: string[];
}

const EMPTY_LIVE_DETAIL: LiveDetail = { pages: [], countries: [], referrers: [] };

export async function getLiveAnalytics(
  env: Env,
  options: { refresh?: boolean } = {}
): Promise<LiveAnalytics> {
  const key = cacheKey(DEFAULT_RANGE, utcToday(), 'live');
  if (!options.refresh) {
    const cached = await readCache<LiveAnalytics>(key);
    if (cached) return cached;
  }

  const config = getPostHogConfig(env);
  if (!config) {
    return {
      live: null,
      detail: null,
      posthogConfigured: false,
      generatedAt: new Date().toISOString(),
      errors: [],
    };
  }

  const errors: string[] = [];
  let live: LiveStats | null = null;
  let detail: LiveDetail | null = null;

  // Headline counters and the "Right now" breakdowns are independent: a failure
  // in one must not blank the other.
  const [statsResult, detailResult] = await Promise.allSettled([
    fetchLiveStats(config),
    fetchLiveDetail(config),
  ]);

  if (statsResult.status === 'fulfilled') live = statsResult.value;
  else errors.push(`live: ${statsResult.reason?.message || 'query failed'}`);

  if (detailResult.status === 'fulfilled') detail = detailResult.value;
  else {
    detail = EMPTY_LIVE_DETAIL;
    errors.push(`live_detail: ${detailResult.reason?.message || 'query failed'}`);
  }

  const payload: LiveAnalytics = {
    live,
    detail,
    posthogConfigured: true,
    generatedAt: new Date().toISOString(),
    errors,
  };
  await writeCache(key, payload, LIVE_CACHE_TTL_SECONDS);
  return payload;
}

export async function getAdminMetrics(
  env: Env,
  range: RangeKey,
  options: { refresh?: boolean; day?: string; part?: MetricsPart; filters?: AnalyticsFilter[] } = {}
): Promise<AdminMetrics> {
  const selectedDay = parseSelectedDay(options.day);
  const part: MetricsPart = options.part || 'all';
  const filters = options.filters || [];
  const kind = part === 'all' ? 'metrics' : part;
  const cacheKeyStr = cacheKey(range, selectedDay, kind, filters);

  if (!options.refresh) {
    const cached = await readCache<AdminMetrics>(cacheKeyStr);
    if (cached) return cached;
  }

  const days = RANGES[range];
  const config = getPostHogConfig(env);
  const isToday = selectedDay === utcToday();

  const posthog = config
    ? await collectPostHog(config, days, selectedDay, part, filters)
    : { blocks: emptyPostHogBlocks(), errors: [] };

  const metrics: AdminMetrics = {
    range,
    days,
    selectedDay,
    isToday,
    part,
    generatedAt: new Date().toISOString(),
    posthogConfigured: Boolean(config),
    ...posthog.blocks,
    filters,
    errors: posthog.errors,
  };

  await writeCache(cacheKeyStr, metrics, CACHE_TTL_SECONDS);
  return metrics;
}

export { buildDateRange, utcToday };
