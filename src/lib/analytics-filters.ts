// src/lib/analytics-filters.ts
//
// Cross-filtering for the admin analytics dashboard.
//
// A filter is a `{ key, value }` pair that narrows every panel at once: click
// a country row and the graph, the top pages and every other breakdown re-query
// with that country applied. Filters live in the URL as repeated `f=key:value`
// params so a filtered view can be bookmarked and shared.
//
// SECURITY: filter values arrive from the URL and are interpolated into HogQL.
// The rest of the query layer only ever interpolates regex-validated day
// strings, so this module is the single place where untrusted text meets SQL.
// Keys are whitelisted against FILTER_EXPRESSIONS and values go through
// quoteHogString(); nothing else may build a filter clause.

export const FILTER_KEYS = [
  'path',
  'section',
  'pageType',
  'country',
  'device',
  'browser',
  'os',
  'referrerType',
  'referringDomain',
  'utmSource',
  'utmCampaign',
  'aiPlatform',
] as const;

export type FilterKey = (typeof FILTER_KEYS)[number];

export interface AnalyticsFilter {
  key: FilterKey;
  value: string;
}

/** Human-readable name for a filter key, used in the pill UI. */
export const FILTER_LABELS: Record<FilterKey, string> = {
  path: 'Page',
  section: 'Section',
  pageType: 'Page type',
  country: 'Country',
  device: 'Device',
  browser: 'Browser',
  os: 'OS',
  referrerType: 'Referrer type',
  referringDomain: 'Referrer',
  utmSource: 'UTM source',
  utmCampaign: 'UTM campaign',
  aiPlatform: 'AI platform',
};

/** Longest value we will accept. Anything longer is a mistake or an attack. */
const MAX_FILTER_VALUE_LENGTH = 300;

/** Most filters we will apply at once, to bound query complexity. */
const MAX_FILTERS = 8;

export function isFilterKey(value: unknown): value is FilterKey {
  return FILTER_KEYS.includes(value as FilterKey);
}

/**
 * Escape a value for use as a HogQL/ClickHouse single-quoted string literal.
 *
 * Backslash must be escaped first — escaping the quote first would double-escape
 * the backslash it introduced. Control characters are stripped rather than
 * encoded: no legitimate filter value contains them, and dropping them keeps
 * the emitted SQL readable in logs.
 */
export function quoteHogString(value: string): string {
  // Strip control characters by codepoint rather than a regex range: they
  // have no place in a filter value and would make emitted SQL unreadable.
  const cleaned = Array.from(String(value))
    .filter((char) => {
      const code = char.codePointAt(0) ?? 0;
      return code >= 0x20 && code !== 0x7f;
    })
    .join('')
    .slice(0, MAX_FILTER_VALUE_LENGTH);
  return `'${cleaned.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

/**
 * Parse filters out of a URLSearchParams. Unknown keys and empty values are
 * dropped silently — a malformed URL should degrade to a less-filtered view,
 * never to an error page.
 */
export function parseFilters(params: URLSearchParams): AnalyticsFilter[] {
  const filters: AnalyticsFilter[] = [];
  const seen = new Set<string>();

  for (const raw of params.getAll('f')) {
    const separator = raw.indexOf(':');
    if (separator <= 0) continue;

    const key = raw.slice(0, separator).trim();
    const value = raw.slice(separator + 1).trim();
    if (!isFilterKey(key) || !value) continue;

    // The same key+value twice would add a redundant AND clause.
    const dedupeKey = `${key}:${value}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    filters.push({ key, value: value.slice(0, MAX_FILTER_VALUE_LENGTH) });
    if (filters.length >= MAX_FILTERS) break;
  }

  return filters;
}

/** Serialize filters back into `f=key:value` params, in a stable order. */
export function serializeFilters(filters: AnalyticsFilter[]): string {
  return filters
    .map((filter) => `f=${encodeURIComponent(`${filter.key}:${filter.value}`)}`)
    .join('&');
}

/**
 * A stable, order-independent identity for a filter set.
 *
 * The metrics cache is keyed partly on this. Without it, a filtered request
 * would be served the cached *unfiltered* payload — the numbers would silently
 * ignore the filter the user just clicked.
 */
export function filtersCacheKey(filters: AnalyticsFilter[]): string {
  if (!filters.length) return 'all';
  return filters
    .map((filter) => `${filter.key}=${filter.value}`)
    .sort()
    .join('&');
}
