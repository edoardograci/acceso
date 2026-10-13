/**
 * Single source of truth for "is this page worth indexing?" and for how long
 * noindexed URLs stay in the sitemaps.
 *
 * The sitemap generators and the page templates both import from here so the
 * two can never disagree (a URL in the sitemap that the page itself noindexes
 * sends Google mixed signals, and the reverse hides pages you want crawled).
 */

/** Robots value for pages that should stay crawlable but out of the index. */
export const NOINDEX_FOLLOW = 'noindex, follow';

// ── Studios ────────────────────────────────────────────────────────────────

/**
 * Mirrors the rule already used by designers/[slug].astro and
 * sitemaps/designers.xml.ts: only an explicit `false` or `0` opts a studio out;
 * a missing field keeps the studio indexable.
 */
export function isStudioIndexable(s: { indexable?: boolean | number | null } | null | undefined): boolean {
  return !!s && s.indexable !== false && s.indexable !== 0;
}

export function countIndexableStudios(studios: Array<{ indexable?: boolean | number | null }>): number {
  let n = 0;
  for (const s of studios) if (isStudioIndexable(s)) n++;
  return n;
}

// ── Designers location pages (/designers/in/<city|country>) ────────────────

/**
 * A location page is indexable when EITHER
 *  - it has at least this many indexable studios (it links to something that
 *    can rank), OR
 *  - it lists at least MIN_TOTAL_STUDIOS studios of any kind, so a city whose
 *    new studios are all `indexable: 0` can still rank on its own listing.
 *
 * A city with a single noindexed studio stays out: a one-card page whose only
 * child is noindexed has nothing to offer a searcher. Empty cities (shared
 * with the fairs/schools/museums directories) are always out.
 */
export const MIN_INDEXABLE_STUDIOS = 1;
export const MIN_TOTAL_STUDIOS = 2;

export function locationIsIndexable(indexableStudioCount: number, totalStudioCount: number): boolean {
  return indexableStudioCount >= MIN_INDEXABLE_STUDIOS || totalStudioCount >= MIN_TOTAL_STUDIOS;
}

// ── Noindexed URLs kept in the sitemaps for a while ────────────────────────

/**
 * /discover/* and /designers/page/2..N are served `noindex, follow`. Leaving
 * them in a sitemap for a few weeks gets Google to recrawl them (and so see the
 * noindex) sooner. After this date the sitemaps drop them automatically; no
 * second deploy needed. Afterwards projects.xml.ts can be deleted.
 */
export const NOINDEX_SITEMAP_GRACE_UNTIL = '2026-11-23';

/**
 * The day the noindex went live. Used as the (true) lastmod of the pagination
 * URLs: their content did change that day, and a fresh lastmod prompts a recrawl.
 * Set this to your deploy date.
 */
export const NOINDEX_CHANGE_DATE = '2026-10-12';

export function noindexGraceActive(now: Date = new Date()): boolean {
  return now.getTime() < Date.parse(`${NOINDEX_SITEMAP_GRACE_UNTIL}T00:00:00Z`);
}
