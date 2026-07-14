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
  return `Design studios in ${where} | Acceso`;
}

export function locationDescription(ctx: CityCtx): string {
  const where = ctx.countryName ? `${ctx.cityName}, ${ctx.countryName}` : ctx.cityName;
  const count = ctx.totalStudios ? `${ctx.totalStudios}+` : 'independent';
  return `Browse ${count} industrial and furniture design studios in ${where}. Explore portfolios, locations, and related designers — curated for discovery.`;
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

