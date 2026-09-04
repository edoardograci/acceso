// src/lib/posthog-query.ts
// Server-side reader for the PostHog Query API (HogQL).

import type { Env } from '../env.d';

export interface PostHogConfig {
  apiKey: string;
  projectId: string;
  host: string;
}

export interface HogQLResult {
  columns: string[];
  rows: any[][];
}

export interface BreakdownRow {
  label: string;
  sessions: number;
  pageviews: number;
}

export interface TrafficPoint {
  day: string;
  pageviews: number;
  sessions: number;
  visitors: number;
}

export interface HourlyPoint {
  hour: string;
  pageviews: number;
  visitors: number;
}

export interface SessionStats {
  sessions: number;
  avgDurationSec: number;
  medianDurationSec: number;
  avgPageviews: number;
  bounceRate: number;
}

export interface EventCountRow {
  event: string;
  total: number;
}

export interface AiReferrerRow {
  platform: string;
  country: string;
  path: string;
  pageviews: number;
  visitors: number;
}

export interface LiveStats {
  liveVisitors: number;
  livePageviews: number;
  todayPageviews: number;
  todayVisitors: number;
}

export interface DateRange {
  /** Inclusive start day YYYY-MM-DD */
  startDay: string;
  /** Inclusive end day YYYY-MM-DD */
  endDay: string;
}

const QUERY_TIMEOUT_MS = 20000;
const DEFAULT_HOST = 'https://eu.posthog.com';

const EXCLUDE_ADMIN = `coalesce(toString(properties.$pathname), '') NOT LIKE '/admin%'`;

/** Prefer server-side visitor_hash; fall back to distinct_id for legacy events. */
export const VISITOR_ID = `coalesce(nullIf(toString(properties.visitor_hash), ''), distinct_id)`;

const OWN_DOMAINS = `('acceso.design', 'www.acceso.design')`;
const REFERRING_DOMAIN = `if(coalesce(toString(properties.$referring_domain), '') IN ('', '$direct'), 'direct', toString(properties.$referring_domain))`;

const AI_DOMAIN_PATTERN =
  '(chatgpt|openai|perplexity|claude|anthropic|gemini|bard|copilot|bing[.]com/chat|phind|you[.]com|poe[.]com|meta[.]ai|mistral|deepseek)';

const AI_PLATFORM = `multiIf(
  match(toString(properties.$referring_domain), 'chatgpt|openai'), 'ChatGPT',
  match(toString(properties.$referring_domain), 'perplexity'), 'Perplexity',
  match(toString(properties.$referring_domain), 'claude|anthropic'), 'Claude',
  match(toString(properties.$referring_domain), 'gemini|bard'), 'Gemini',
  match(toString(properties.$referring_domain), 'copilot|bing'), 'Copilot',
  match(toString(properties.$referring_domain), 'phind'), 'Phind',
  match(toString(properties.$referring_domain), 'you[.]com'), 'You.com',
  match(toString(properties.$referring_domain), 'poe[.]com'), 'Poe',
  match(toString(properties.$referring_domain), 'meta[.]ai'), 'Meta AI',
  match(toString(properties.$referring_domain), 'mistral'), 'Mistral',
  match(toString(properties.$referring_domain), 'deepseek'), 'DeepSeek',
  'Other AI'
)`;

const EXPR = {
  path: `coalesce(nullIf(toString(properties.$pathname), ''), '/')`,
  pageType: `coalesce(nullIf(toString(properties.page_type), ''), 'unknown')`,
  referrerType: `multiIf(
    ${REFERRING_DOMAIN} = 'direct', 'direct',
    toString(properties.$referring_domain) IN ${OWN_DOMAINS}, 'internal',
    match(toString(properties.$referring_domain), '(google|bing|duckduckgo|yahoo|ecosia|brave)[.]'), 'organic search',
    match(toString(properties.$referring_domain), '(instagram|facebook|linkedin|pinterest|reddit|tiktok|threads|t[.]co)'), 'social',
    match(toString(properties.$referring_domain), '${AI_DOMAIN_PATTERN}'), 'ai',
    'referral'
  )`,
  referringDomain: REFERRING_DOMAIN,
  utmSource: `coalesce(nullIf(toString(properties.utm_source), ''), nullIf(toString(properties.initial_utm_source), ''), 'none')`,
  utmCampaign: `coalesce(nullIf(toString(properties.utm_campaign), ''), nullIf(toString(properties.initial_utm_campaign), ''), 'none')`,
  country: `coalesce(nullIf(toString(properties.$geoip_country_name), ''), nullIf(toString(properties.$geoip_country_code), ''), 'unknown')`,
  device: `coalesce(nullIf(toString(properties.device_category), ''), nullIf(toString(properties.$device_type), ''), 'unknown')`,
  browser: `coalesce(nullIf(toString(properties.$browser), ''), 'unknown')`,
} as const;

const EXTERNAL_ONLY = `coalesce(toString(properties.$referring_domain), '') NOT IN ${OWN_DOMAINS}`;
const AI_ONLY = `match(toString(properties.$referring_domain), '${AI_DOMAIN_PATTERN}')`;

export function getPostHogConfig(env: Env): PostHogConfig | null {
  const anyEnv = env as any;
  const apiKey = String(anyEnv?.POSTHOG_API_KEY || '').trim();
  const projectId = String(anyEnv?.POSTHOG_PROJECT_ID || '').trim();
  if (!apiKey || !projectId) return null;

  const host = String(anyEnv?.POSTHOG_API_HOST || DEFAULT_HOST).trim().replace(/\/$/, '');
  return { apiKey, projectId, host };
}

export async function hogql(config: PostHogConfig, query: string): Promise<HogQLResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), QUERY_TIMEOUT_MS);

  try {
    const response = await fetch(`${config.host}/api/projects/${config.projectId}/query/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: { kind: 'HogQLQuery', query } }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`PostHog API ${response.status}: ${body.slice(0, 300)}`);
    }

    const data: any = await response.json();
    return {
      columns: Array.isArray(data?.columns) ? data.columns : [],
      rows: Array.isArray(data?.results) ? data.results : [],
    };
  } finally {
    clearTimeout(timeout);
  }
}

function safeDays(days: number): number {
  const n = Math.floor(Number(days));
  if (!Number.isFinite(n) || n < 1) return 7;
  return Math.min(n, 365);
}

/** Validate YYYY-MM-DD; returns null if invalid. */
export function parseDay(value: string | null | undefined): string | null {
  const day = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const date = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return day;
}

export function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function shiftDay(day: string, delta: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** Build an inclusive date range ending on endDay spanning `days` calendar days. */
export function buildDateRange(endDay: string, days: number): DateRange {
  const safe = safeDays(days);
  return {
    startDay: shiftDay(endDay, -(safe - 1)),
    endDay,
  };
}

function dateFilter(range: DateRange): string {
  return `toDate(timestamp) >= toDate('${range.startDay}')
       AND toDate(timestamp) <= toDate('${range.endDay}')`;
}

function singleDayFilter(day: string): string {
  return `toDate(timestamp) = toDate('${day}')`;
}

function toNumber(value: any): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toDayString(value: any): string {
  if (typeof value === 'string') return value.slice(0, 10);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value ?? '').slice(0, 10);
}

function toHourString(value: any): string {
  if (typeof value === 'string') return value.slice(0, 16).replace('T', ' ');
  return String(value ?? '').slice(0, 16);
}

async function fetchBreakdownForRange(
  config: PostHogConfig,
  range: DateRange,
  expression: string,
  limit = 25,
  extraWhere = ''
): Promise<BreakdownRow[]> {
  const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 500);

  const result = await hogql(
    config,
    `SELECT ${expression} AS label,
            count(DISTINCT ${VISITOR_ID}) AS sessions,
            count() AS pageviews
     FROM events
     WHERE event = '$pageview'
       AND ${dateFilter(range)}
       AND ${EXCLUDE_ADMIN}
       ${extraWhere ? `AND ${extraWhere}` : ''}
     GROUP BY label
     ORDER BY sessions DESC, pageviews DESC
     LIMIT ${safeLimit}`
  );

  return result.rows.map((row) => ({
    label: String(row[0] ?? 'unknown'),
    sessions: toNumber(row[1]),
    pageviews: toNumber(row[2]),
  }));
}

async function fetchBreakdown(
  config: PostHogConfig,
  days: number,
  expression: string,
  limit = 25,
  extraWhere = '',
  endDay = utcToday()
): Promise<BreakdownRow[]> {
  return fetchBreakdownForRange(config, buildDateRange(endDay, days), expression, limit, extraWhere);
}

export async function fetchTrafficSeries(
  config: PostHogConfig,
  days: number,
  endDay = utcToday()
): Promise<TrafficPoint[]> {
  const range = buildDateRange(endDay, safeDays(days) * 2);
  const result = await hogql(
    config,
    `SELECT toDate(timestamp) AS day,
            count() AS pageviews,
            count(DISTINCT properties.$session_id) AS sessions,
            count(DISTINCT ${VISITOR_ID}) AS visitors
     FROM events
     WHERE event = '$pageview'
       AND ${dateFilter(range)}
       AND ${EXCLUDE_ADMIN}
     GROUP BY day
     ORDER BY day ASC`
  );

  return result.rows.map((row) => ({
    day: toDayString(row[0]),
    pageviews: toNumber(row[1]),
    sessions: toNumber(row[2]),
    visitors: toNumber(row[3]),
  }));
}

export async function fetchHourlyTraffic(config: PostHogConfig, day: string): Promise<HourlyPoint[]> {
  const result = await hogql(
    config,
    `SELECT toStartOfHour(timestamp) AS hour,
            count() AS pageviews,
            count(DISTINCT ${VISITOR_ID}) AS visitors
     FROM events
     WHERE event = '$pageview'
       AND ${singleDayFilter(day)}
       AND ${EXCLUDE_ADMIN}
     GROUP BY hour
     ORDER BY hour ASC`
  );

  return result.rows.map((row) => ({
    hour: toHourString(row[0]),
    pageviews: toNumber(row[1]),
    visitors: toNumber(row[2]),
  }));
}

export async function fetchLiveStats(config: PostHogConfig): Promise<LiveStats> {
  const today = utcToday();
  const result = await hogql(
    config,
    `SELECT
       countIf(timestamp >= now() - INTERVAL 5 MINUTE) AS live_pageviews,
       count(DISTINCT if(timestamp >= now() - INTERVAL 30 MINUTE, ${VISITOR_ID}, NULL)) AS live_visitors,
       countIf(toDate(timestamp) = toDate('${today}')) AS today_pageviews,
       count(DISTINCT if(toDate(timestamp) = toDate('${today}'), ${VISITOR_ID}, NULL)) AS today_visitors
     FROM events
     WHERE event = '$pageview'
       AND timestamp >= now() - INTERVAL 1 DAY
       AND ${EXCLUDE_ADMIN}`
  );

  const row = result.rows[0] || [];
  return {
    livePageviews: toNumber(row[0]),
    liveVisitors: toNumber(row[1]),
    todayPageviews: toNumber(row[2]),
    todayVisitors: toNumber(row[3]),
  };
}

export async function fetchDayTotals(config: PostHogConfig, day: string): Promise<TrafficPoint> {
  const result = await hogql(
    config,
    `SELECT count() AS pageviews,
            count(DISTINCT properties.$session_id) AS sessions,
            count(DISTINCT ${VISITOR_ID}) AS visitors
     FROM events
     WHERE event = '$pageview'
       AND ${singleDayFilter(day)}
       AND ${EXCLUDE_ADMIN}`
  );

  const row = result.rows[0] || [];
  return {
    day,
    pageviews: toNumber(row[0]),
    sessions: toNumber(row[1]),
    visitors: toNumber(row[2]),
  };
}

export const fetchTopPaths = (c: PostHogConfig, d: number, endDay?: string) =>
  fetchBreakdown(c, d, EXPR.path, 300, '', endDay);
export const fetchPageTypes = (c: PostHogConfig, d: number, endDay?: string) =>
  fetchBreakdown(c, d, EXPR.pageType, 25, '', endDay);
export const fetchReferrerTypes = (c: PostHogConfig, d: number, endDay?: string) =>
  fetchBreakdown(c, d, EXPR.referrerType, 10, '', endDay);
export const fetchReferringDomains = (c: PostHogConfig, d: number, endDay?: string) =>
  fetchBreakdown(c, d, EXPR.referringDomain, 15, EXTERNAL_ONLY, endDay);
export const fetchUtmSources = (c: PostHogConfig, d: number, endDay?: string) =>
  fetchBreakdown(c, d, EXPR.utmSource, 15, '', endDay);
export const fetchUtmCampaigns = (c: PostHogConfig, d: number, endDay?: string) =>
  fetchBreakdown(c, d, EXPR.utmCampaign, 15, '', endDay);
export const fetchCountries = (c: PostHogConfig, d: number, endDay?: string) =>
  fetchBreakdown(c, d, EXPR.country, 15, '', endDay);
export const fetchDevices = (c: PostHogConfig, d: number, endDay?: string) =>
  fetchBreakdown(c, d, EXPR.device, 10, '', endDay);
export const fetchBrowsers = (c: PostHogConfig, d: number, endDay?: string) =>
  fetchBreakdown(c, d, EXPR.browser, 12, '', endDay);

export async function fetchAiPlatforms(config: PostHogConfig, days: number, endDay?: string): Promise<BreakdownRow[]> {
  return fetchBreakdown(config, days, AI_PLATFORM, 15, AI_ONLY, endDay);
}

export async function fetchAiReferrerDetails(
  config: PostHogConfig,
  days: number,
  endDay?: string
): Promise<AiReferrerRow[]> {
  const range = buildDateRange(endDay || utcToday(), safeDays(days));
  const result = await hogql(
    config,
    `SELECT ${AI_PLATFORM} AS platform,
            ${EXPR.country} AS country,
            ${EXPR.path} AS path,
            count() AS pageviews,
            count(DISTINCT ${VISITOR_ID}) AS visitors
     FROM events
     WHERE event = '$pageview'
       AND ${dateFilter(range)}
       AND ${EXCLUDE_ADMIN}
       AND ${AI_ONLY}
     GROUP BY platform, country, path
     ORDER BY pageviews DESC
     LIMIT 50`
  );

  return result.rows.map((row) => ({
    platform: String(row[0] ?? 'unknown'),
    country: String(row[1] ?? 'unknown'),
    path: String(row[2] ?? '/'),
    pageviews: toNumber(row[3]),
    visitors: toNumber(row[4]),
  }));
}

export async function fetchSessionStats(
  config: PostHogConfig,
  days: number,
  endDay?: string
): Promise<SessionStats> {
  const range = buildDateRange(endDay || utcToday(), safeDays(days));
  const result = await hogql(
    config,
    `SELECT count() AS sessions,
            avg(duration_sec) AS avg_duration_sec,
            median(duration_sec) AS median_duration_sec,
            avg(views) AS avg_pageviews,
            countIf(views <= 1) / count() AS bounce_rate
     FROM (
       SELECT properties.$session_id AS session_id,
              dateDiff('second', min(timestamp), max(timestamp)) AS duration_sec,
              countIf(event = '$pageview') AS views
       FROM events
       WHERE event IN ('$pageview', '$pageleave')
         AND ${dateFilter(range)}
         AND ${EXCLUDE_ADMIN}
         AND notEmpty(toString(properties.$session_id))
       GROUP BY session_id
     )`
  );

  const row = result.rows[0] || [];
  return {
    sessions: toNumber(row[0]),
    avgDurationSec: toNumber(row[1]),
    medianDurationSec: toNumber(row[2]),
    avgPageviews: toNumber(row[3]),
    bounceRate: toNumber(row[4]),
  };
}

export async function fetchCustomEvents(
  config: PostHogConfig,
  days: number,
  endDay?: string
): Promise<EventCountRow[]> {
  const range = buildDateRange(endDay || utcToday(), safeDays(days));
  const result = await hogql(
    config,
    `SELECT event, count() AS total
     FROM events
     WHERE ${dateFilter(range)}
       AND event NOT IN ('$pageview', '$pageleave')
       AND ${EXCLUDE_ADMIN}
     GROUP BY event
     ORDER BY total DESC
     LIMIT 30`
  );

  return result.rows.map((row) => ({
    event: String(row[0] ?? 'unknown'),
    total: toNumber(row[1]),
  }));
}
