import type { APIRoute } from 'astro';
import { renderUrlSet, toW3CDate } from '../../lib/seo/sitemap';
import { readJsonFromBucket, toArray } from '../../lib/readJson';
import { isStudioIndexable, locationIsIndexable } from '../../lib/seo/indexing';

type Tally = { total: number; indexable: number; latest: number };

export const GET: APIRoute = async ({ site, locals }) => {
  if (!site) return new Response('Missing site config', { status: 500 });

  const env = (locals as any)?.runtime?.env || import.meta.env;
  const [rawStudios, rawCities, rawCountries] = await Promise.all([
    readJsonFromBucket('test-studios.json', env),
    readJsonFromBucket('test-cities.json', env),
    readJsonFromBucket('test-countries.json', env),
  ]);
  const studios = toArray(rawStudios);

  // /designers/in/<slug> 404s unless the slug exists in the cities or countries
  // reference data, so never advertise one that is missing from both. (The cities
  // file is shared with the fairs/schools/museums directories, so most of it has
  // no designers at all.)
  const knownCities = new Set<string>(toArray(rawCities).map((c: any) => c?.slug).filter(Boolean));
  const knownCountries = new Set<string>(toArray(rawCountries).map((c: any) => c?.slug).filter(Boolean));

  // Per place: how many studios the page lists, how many of those are indexable,
  // and the newest updated_at among the listed studios (never "now"). The page
  // template applies the same rule (lib/seo/indexing.ts).
  const cities = new Map<string, Tally>();
  const countries = new Map<string, Tally>();
  const add = (map: Map<string, Tally>, slug: string, indexable: boolean, t: number) => {
    const cur = map.get(slug) ?? { total: 0, indexable: 0, latest: NaN };
    cur.total++;
    if (indexable) cur.indexable++;
    if (!isNaN(t) && (isNaN(cur.latest) || t > cur.latest)) cur.latest = t;
    map.set(slug, cur);
  };
  for (const s of studios) {
    const indexable = isStudioIndexable(s);
    const t = s?.updated_at ? new Date(s.updated_at).getTime() : NaN;
    if (s?.city_slug) add(cities, s.city_slug, indexable, t);
    if (s?.country_slug) add(countries, s.country_slug, indexable, t);
  }
  const lastmodOf = (tally: Tally): string | undefined =>
    isNaN(tally.latest) ? undefined : toW3CDate(new Date(tally.latest));

  const urls = [];
  const emittedCities = new Set<string>();
  for (const [slug, tally] of cities) {
    if (!knownCities.has(slug) || !locationIsIndexable(tally.indexable, tally.total)) continue;
    emittedCities.add(slug);
    urls.push({
      loc: new URL(`/designers/in/${encodeURIComponent(slug)}`, site).toString(),
      lastmod: lastmodOf(tally),
      changefreq: 'weekly' as const,
      priority: 0.6,
    });
  }
  for (const [slug, tally] of countries) {
    // Skip country slugs already emitted as a city (avoids dupes).
    if (emittedCities.has(slug)) continue;
    if (!knownCountries.has(slug) || !locationIsIndexable(tally.indexable, tally.total)) continue;
    urls.push({
      loc: new URL(`/designers/in/${encodeURIComponent(slug)}`, site).toString(),
      lastmod: lastmodOf(tally),
      changefreq: 'weekly' as const,
      priority: 0.5,
    });
  }

  return new Response(renderUrlSet(urls), {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=900, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
};
