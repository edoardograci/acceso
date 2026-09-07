type CityCtx = {
  cityName: string;
  countryName?: string | null;
  totalStudios?: number | null;
  exampleStudios?: string[];
};

function uniq(parts: Array<string | null | undefined>): string[] {
  const out: string[] = [];
  for (const p of parts) {
    const v = (p ?? '').trim();
    if (!v) continue;
    if (!out.includes(v)) out.push(v);
  }
  return out;
}

export function locationTitle(ctx: CityCtx): string {
  const where = ctx.countryName ? `${ctx.cityName}, ${ctx.countryName}` : ctx.cityName;
  return `Industrial Designers & Studios in ${where} | Acceso`;
}

export function locationDescription(ctx: CityCtx): string {
  const where = ctx.countryName ? `${ctx.cityName}, ${ctx.countryName}` : ctx.cityName;
  const count = ctx.totalStudios ? `${ctx.totalStudios}+` : 'independent';
  return `Browse ${count} industrial and furniture design studios in ${where}. Explore portfolios, locations, and related designers - curated for discovery.`;
}

function joinList(items: string[]): string {
  const list = items.filter((i) => (i ?? '').trim());
  if (list.length === 0) return '';
  if (list.length === 1) return list[0];
  return `${list.slice(0, -1).join(', ')}, and ${list[list.length - 1]}`;
}

export function locationIntro(ctx: CityCtx): { paragraphs: string[]; h2s: string[] } {
  // The bare place name (city name for a city page, country name for a country
  // page) reads best for possessives like "{place}'s design scene".
  const place = ctx.cityName;
  const isCity = !!ctx.countryName;

  const p1 = `Looking for independent industrial designers or furniture design studios in ${place}? Acceso is a curated guide to ${place}'s design scene, helping you discover local studios, designers, and creative businesses.`;

  const countPhrase = ctx.totalStudios
    ? `${ctx.totalStudios} independent design studios`
    : `independent design studios`;
  const examples = joinList((ctx.exampleStudios ?? []).slice(0, 3));
  const includingPhrase = examples ? `, including ${examples}` : '';
  const mapPhrase = isCity ? 'the city map' : 'the map';

  const p2 = `This page currently features ${countPhrase} based in ${place}${includingPhrase}. Browse studio profiles, explore ${mapPhrase}, and discover related designers, schools, awards, and other resources connected to ${place}'s industrial and furniture design community.`;

  return {
    paragraphs: uniq([p1, p2]),
    h2s: uniq([`Studios in ${place}`, `Related locations`, `Explore more designers`]),
  };
}


type ProjectCtx = {
  name: string;
  designer?: string | null;
  year?: string | null;
  city?: string | null;
  client?: string | null;
  imageCount?: number;
};

/** Google renders roughly this much of a description; longer text is clipped. */
const DESCRIPTION_BUDGET = 158;

/**
 * Meta description for a Discover project page.
 *
 * The old text ("{name} by {designer}. Industrial design project gallery.")
 * ran about 55 characters, well under the ~120-160 Google renders, so results
 * were padded with scraped page text. Projects only carry name, designer,
 * year, city and client, so the sentence is assembled from whichever of those
 * exist, and the closing clause steps down through shorter variants until the
 * whole thing fits the budget. A long name plus a long studio name can still
 * exceed it on its own; that is preferable to dropping the identity.
 */
export function projectDescription(ctx: ProjectCtx): string {
  const by = ctx.designer ? ` by ${ctx.designer}` : '';
  const year = ctx.year ? `, ${ctx.year}` : '';
  const where = ctx.city ? ` from ${ctx.city}` : '';
  const forWhom = ctx.client ? ` for ${ctx.client}` : '';

  const head = `${ctx.name}${by}${year}. Independent industrial design project${where}${forWhom}.`;

  // Longest closing first; fall back until one fits.
  const tails = [
    ctx.imageCount && ctx.imageCount > 1
      ? ` Browse ${ctx.imageCount} photographs of the work on Acceso, the curated design directory.`
      : ` See the full gallery on Acceso, the curated design directory.`,
    ` See the full gallery on Acceso, the curated design directory.`,
    ` View the gallery on Acceso.`,
  ];

  for (const tail of tails) {
    if (head.length + tail.length <= DESCRIPTION_BUDGET) return head + tail;
  }

  return head;
}
