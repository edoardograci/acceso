/**
 * "Discover more in <city> / <country> / the world" tiers for detail pages.
 * Same selection rules as the designer page, so every directory behaves alike:
 *
 *  - city:    up to `limit` others in the same city
 *  - country: up to `limit` others in the same country, different city
 *  - world:   up to `limit` outside the country, at most one per city first
 *             (so the largest city does not dominate), filled up if needed
 *
 * Everything is deterministic (no Math.random) so pages stay cacheable and
 * the HTML does not change between crawls. The world tier starts at an offset
 * derived from the current slug: the designer page always shows the
 * alphabetically-first entries, which funnels the world links of every page to
 * the same handful of entries. Rotating the start spreads internal links
 * across the whole directory while staying stable per page.
 */
export type DiscoveryItem = {
  slug: string;
  city_slug?: string | null;
  country_slug?: string | null;
};

// FNV-1a: tiny, stable, no dependencies.
function stableHash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function pickDiscoveryTiers<T extends DiscoveryItem>(all: T[], current: T, limit = 10) {
  const others = all.filter((x) => x.slug !== current.slug);

  const sameCity = current.city_slug
    ? others.filter((x) => x.city_slug === current.city_slug).slice(0, limit)
    : [];

  const sameCountry = current.country_slug
    ? others
        .filter((x) => x.country_slug === current.country_slug && x.city_slug !== current.city_slug)
        .slice(0, limit)
    : [];

  const pool = others
    .filter((x) => !current.country_slug || x.country_slug !== current.country_slug)
    .sort((a, b) => String(a.slug).localeCompare(String(b.slug)));
  const start = pool.length ? stableHash(String(current.slug)) % pool.length : 0;
  const rotated = [...pool.slice(start), ...pool.slice(0, start)];

  const world: T[] = [];
  const seenCities = new Set<string>();
  for (const x of rotated) {
    if (world.length >= limit) break;
    const cityKey = x.city_slug || x.slug;
    if (seenCities.has(cityKey)) continue;
    seenCities.add(cityKey);
    world.push(x);
  }
  for (const x of rotated) {
    if (world.length >= limit) break;
    if (!world.includes(x)) world.push(x);
  }

  return { sameCity, sameCountry, world };
}
