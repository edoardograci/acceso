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

export function locationIntro(ctx: CityCtx): { paragraphs: string[]; h2s: string[] } {
  const where = ctx.countryName ? `${ctx.cityName}, ${ctx.countryName}` : ctx.cityName;
  const countLine = ctx.totalStudios ? `This directory currently includes ${ctx.totalStudios} studios in ${where}.` : `This directory highlights studios in ${where}.`;
  const examples =
    (ctx.exampleStudios?.length ?? 0) > 0
      ? `Notable entries include ${ctx.exampleStudios!.slice(0, 3).join(', ')}.`
      : `Use the listings below to find a studio by practice, aesthetics, and availability.`;

  const p1 = `Looking for independent industrial and furniture design studios in ${where}? Acceso is a curated directory built for fast, intent-driven discovery.`;
  const p2 = `${countLine} ${examples}`;
  const p3 = `Each listing links to a studio profile with location context, external links, and related designers so you can keep exploring without dead ends.`;

  return {
    paragraphs: uniq([p1, p2, p3]),
    h2s: uniq([`Studios in ${where}`, `Related locations`, `Explore more designers`]),
  };
}

