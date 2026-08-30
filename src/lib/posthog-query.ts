// src/lib/posthog-query.ts
// Server-side reader for the PostHog Query API (HogQL).
//
// Note the two different PostHog hosts: the browser sends events to the ingest
// host (eu.i.posthog.com, PUBLIC_POSTHOG_HOST) while the REST/query API lives on
// the app host (eu.posthog.com). Only the app host is used here.
//
// The personal API key never leaves the server: every call in this module runs
// inside the Worker and only aggregated numbers are returned to the browser.

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

/** A single `label → counts` breakdown row. */
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

const QUERY_TIMEOUT_MS = 20000;
const DEFAULT_HOST = 'https://eu.posthog.com';

/**
 * The dashboard itself must never show up in its own numbers. The admin layout
 * does not load PostHog at all, so this is a second line of defence — and it
 * also covers any /admin traffic recorded before that layout existed.
 * The coalesce matters: `NULL NOT LIKE …` is NULL, which would silently drop
 * every event that carries no $pathname.
 */
const EXCLUDE_ADMIN = `coalesce(toString(properties.$pathname), '') NOT LIKE '/admin%'`;

/**
 * Read PostHog credentials from the runtime env.
 * Returns null when the dashboard has not been configured yet, so callers can
 * render a "not configured" state instead of throwing.
 */
export function getPostHogConfig(env: Env): PostHogConfig | null {
  const anyEnv = env as any;
  const apiKey = String(anyEnv?.POSTHOG_API_KEY || '').trim();
  const projectId = String(anyEnv?.POSTHOG_PROJECT_ID || '').trim();
  if (!apiKey || !projectId) return null;

  const host = String(anyEnv?.POSTHOG_API_HOST || DEFAULT_HOST).trim().replace(/\/$/, '');
  return { apiKey, projectId, host };
}

/** Run one HogQL query and return its columns/rows. Throws on API errors. */
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
      // Truncate: PostHog error bodies can carry the whole query back.
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

/** Guard against anything but a plain integer reaching a query string. */
function safeDays(days: number): number {
  const n = Math.floor(Number(days));
  if (!Number.isFinite(n) || n < 1) return 7;
  return Math.min(n, 365);
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

/**
 * Daily pageviews/sessions/visitors over twice the requested window, so the
 * caller can compare the current period against the one immediately before it
 * without a second round trip.
 */
export async function fetchTrafficSeries(config: PostHogConfig, days: number): Promise<TrafficPoint[]> {
  const window = safeDays(days) * 2;
  const result = await hogql(
    config,
    `SELECT toDate(timestamp) AS day,
            count() AS pageviews,
            count(DISTINCT properties.$session_id) AS sessions,
            count(DISTINCT distinct_id) AS visitors
     FROM events
     WHERE event = '$pageview'
       AND timestamp >= now() - INTERVAL ${window} DAY
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

/**
 * Generic `GROUP BY <expression>` breakdown over pageviews.
 * `expression` is a fixed HogQL snippet defined in this file — never user input.
 */
async function fetchBreakdown(
  config: PostHogConfig,
  days: number,
  expression: string,
  limit = 25,
  extraWhere = ''
): Promise<BreakdownRow[]> {
  const window = safeDays(days);
  const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 500);

  const result = await hogql(
    config,
    `SELECT ${expression} AS label,
            count(DISTINCT properties.$session_id) AS sessions,
            count() AS pageviews
     FROM events
     WHERE event = '$pageview'
       AND timestamp >= now() - INTERVAL ${window} DAY
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

/** The site's own hostnames — a link between two Acceso pages is not acquisition. */
const OWN_DOMAINS = `('acceso.design', 'www.acceso.design')`;

/** Raw referring domain, with PostHog's `$direct` sentinel normalised. */
const REFERRING_DOMAIN = `if(coalesce(toString(properties.$referring_domain), '') IN ('', '$direct'), 'direct', toString(properties.$referring_domain))`;

const EXPR = {
  path: `coalesce(nullIf(toString(properties.$pathname), ''), '/')`,
  pageType: `coalesce(nullIf(toString(properties.page_type), ''), 'unknown')`,
  /**
   * Derived here rather than read from the client's `referrer_type` property:
   * the site's classifyReferrer() does not exclude its own domain, so internal
   * navigation is tagged 'referral' and would swamp the acquisition panel.
   */
  referrerType: `multiIf(
    ${REFERRING_DOMAIN} = 'direct', 'direct',
    toString(properties.$referring_domain) IN ${OWN_DOMAINS}, 'internal',
    match(toString(properties.$referring_domain), '(google|bing|duckduckgo|yahoo|ecosia|brave)\\\\.'), 'organic search',
    match(toString(properties.$referring_domain), '(instagram|facebook|linkedin|pinterest|reddit|tiktok|threads|t\\\\.co)'), 'social',
    'referral'
  )`,
  referringDomain: REFERRING_DOMAIN,
  utmSource: `coalesce(nullIf(toString(properties.utm_source), ''), nullIf(toString(properties.initial_utm_source), ''), 'none')`,
  utmCampaign: `coalesce(nullIf(toString(properties.utm_campaign), ''), nullIf(toString(properties.initial_utm_campaign), ''), 'none')`,
  country: `coalesce(nullIf(toString(properties.$geoip_country_name), ''), nullIf(toString(properties.$geoip_country_code), ''), 'unknown')`,
  device: `coalesce(nullIf(toString(properties.device_category), ''), nullIf(toString(properties.$device_type), ''), 'unknown')`,
} as const;

/** Internal navigation is excluded so the panel shows real acquisition sources. */
const EXTERNAL_ONLY = `coalesce(toString(properties.$referring_domain), '') NOT IN ${OWN_DOMAINS}`;

export const fetchTopPaths = (c: PostHogConfig, d: number) => fetchBreakdown(c, d, EXPR.path, 300);
export const fetchPageTypes = (c: PostHogConfig, d: number) => fetchBreakdown(c, d, EXPR.pageType, 25);
export const fetchReferrerTypes = (c: PostHogConfig, d: number) => fetchBreakdown(c, d, EXPR.referrerType, 10);
export const fetchReferringDomains = (c: PostHogConfig, d: number) =>
  fetchBreakdown(c, d, EXPR.referringDomain, 15, EXTERNAL_ONLY);
export const fetchUtmSources = (c: PostHogConfig, d: number) => fetchBreakdown(c, d, EXPR.utmSource, 15);
export const fetchUtmCampaigns = (c: PostHogConfig, d: number) => fetchBreakdown(c, d, EXPR.utmCampaign, 15);
export const fetchCountries = (c: PostHogConfig, d: number) => fetchBreakdown(c, d, EXPR.country, 15);
export const fetchDevices = (c: PostHogConfig, d: number) => fetchBreakdown(c, d, EXPR.device, 10);

/**
 * Session-level engagement, reconstructed from the event stream: PostHog's
 * session table is not queried, we derive duration from the first and last
 * event sharing a $session_id. A session with a single pageview counts as a
 * bounce.
 */
export async function fetchSessionStats(config: PostHogConfig, days: number): Promise<SessionStats> {
  const window = safeDays(days);
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
         AND timestamp >= now() - INTERVAL ${window} DAY
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

/**
 * Every non-pageview event with its volume. Deliberately generic rather than a
 * hardcoded list, so events added to the site later show up here on their own.
 */
export async function fetchCustomEvents(config: PostHogConfig, days: number): Promise<EventCountRow[]> {
  const window = safeDays(days);
  const result = await hogql(
    config,
    `SELECT event, count() AS total
     FROM events
     WHERE timestamp >= now() - INTERVAL ${window} DAY
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
