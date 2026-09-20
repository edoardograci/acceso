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

/** Past this many characters a title starts getting clipped in the SERP. */
const TITLE_BUDGET = 60;
const BRAND_SUFFIX = ' | Acceso';

/**
 * Prefix + place, split so the H1 can wrap just the place name in its own
 * <span> (for the underline accent) while still rendering the exact same
 * text content as locationTitle() below. Title and H1 must never say
 * something different from each other, so both are built from this one
 * source instead of two separately-written strings.
 */
export function locationH1Parts(ctx: CityCtx): { prefix: string; place: string } {
  const place = ctx.countryName ? `${ctx.cityName}, ${ctx.countryName}` : ctx.cityName;
  return { prefix: 'Industrial & Furniture Design Studios in', place };
}

export function locationH1(ctx: CityCtx): string {
  const { prefix, place } = locationH1Parts(ctx);
  return `${prefix} ${place}`;
}

export function locationTitle(ctx: CityCtx): string {
  const base = locationH1(ctx);
  // Drop the brand suffix for longer city/country names rather than let the
  // title run past the safe SERP length — better to lose "| Acceso" than
  // to lose the city name to truncation.
  return base.length + BRAND_SUFFIX.length <= TITLE_BUDGET ? `${base}${BRAND_SUFFIX}` : base;
}

export function locationDescription(ctx: CityCtx): string {
  const where = ctx.countryName ? `${ctx.cityName}, ${ctx.countryName}` : ctx.cityName;
  const count = ctx.totalStudios ? `${ctx.totalStudios}+` : 'a curated list of';
  return `${where} is home to ${count} independent industrial and furniture design studios. Browse portfolios, specialties, and locations, curated by Acceso.`;
}

function joinList(items: string[]): string {
  const list = items.filter((i) => (i ?? '').trim());
  if (list.length === 0) return '';
  if (list.length === 1) return list[0];
  return `${list.slice(0, -1).join(', ')}, and ${list[list.length - 1]}`;
}

/**
 * Single, quotable direct-answer paragraph. Replaces the old two-paragraph
 * SEO filler block that used to sit at the bottom of the page — this one
 * renders directly under the H1, ahead of the results grid.
 */
export function locationIntro(ctx: CityCtx): { paragraph: string } {
  const countPhrase = ctx.totalStudios ? `${ctx.totalStudios}+` : 'a growing number of';
  const paragraph = `${ctx.cityName} is home to ${countPhrase} independent design studios working in industrial and furniture design, from solo practices to multidisciplinary teams.`;
  return { paragraph };
}

/**
 * Shared label so the visible breadcrumb and the BreadcrumbList schema never
 * say something different from the title/H1 above ("Designers" was too
 * generic — it overlaps with interior, graphic and fashion design studios
 * that show up for the same query).
 */
export const LOCATION_BREADCRUMB_LABEL = 'Industrial & Furniture Designers';

type UniCtx = {
  cityName: string;
  countryName?: string | null;
  totalUniversities?: number | null;
  exampleUniversities?: string[];
};

export function universityH1Parts(ctx: UniCtx): { prefix: string; place: string } {
  const place = ctx.countryName ? `${ctx.cityName}, ${ctx.countryName}` : ctx.cityName;
  return { prefix: 'Design Schools in', place };
}

export function universityH1(ctx: UniCtx): string {
  const { prefix, place } = universityH1Parts(ctx);
  return `${prefix} ${place}`;
}

export function universityTitle(ctx: UniCtx): string {
  const base = universityH1(ctx);
  return base.length + BRAND_SUFFIX.length <= TITLE_BUDGET ? `${base}${BRAND_SUFFIX}` : base;
}

export function universityDescription(ctx: UniCtx): string {
  const where = ctx.countryName ? `${ctx.cityName}, ${ctx.countryName}` : ctx.cityName;
  const count = ctx.totalUniversities ? `${ctx.totalUniversities}+` : 'leading';
  return `${where} is home to ${count} design schools and institutions. Browse programs in industrial, furniture, and product design, curated by Acceso.`;
}

/**
 * Single, quotable direct-answer paragraph. Replaces the old two-paragraph
 * SEO filler block that used to sit at the bottom of the page — this one
 * renders directly under the H1, ahead of the results grid.
 */
export function universityIntro(ctx: UniCtx): { paragraph: string } {
  const countPhrase = ctx.totalUniversities ? `${ctx.totalUniversities}+` : 'a growing number of';
  const paragraph = `${ctx.cityName} is home to ${countPhrase} schools and institutions teaching industrial, furniture, and product design, from foundation courses to postgraduate studios.`;
  return { paragraph };
}

/**
 * Shared label so the visible breadcrumb and the BreadcrumbList schema never
 * say something different from the title/H1 above.
 */
export const UNIVERSITY_BREADCRUMB_LABEL = 'Design Schools';

type MuseumCtx = {
  cityName: string;
  countryName?: string | null;
  totalMuseums?: number | null;
  exampleMuseums?: string[];
};

export function museumH1Parts(ctx: MuseumCtx): { prefix: string; place: string } {
  const place = ctx.countryName ? `${ctx.cityName}, ${ctx.countryName}` : ctx.cityName;
  return { prefix: 'Design Museums in', place };
}

export function museumH1(ctx: MuseumCtx): string {
  const { prefix, place } = museumH1Parts(ctx);
  return `${prefix} ${place}`;
}

export function museumTitle(ctx: MuseumCtx): string {
  const base = museumH1(ctx);
  return base.length + BRAND_SUFFIX.length <= TITLE_BUDGET ? `${base}${BRAND_SUFFIX}` : base;
}

export function museumDescription(ctx: MuseumCtx): string {
  const where = ctx.countryName ? `${ctx.cityName}, ${ctx.countryName}` : ctx.cityName;
  const count = ctx.totalMuseums ? `${ctx.totalMuseums}+` : 'notable';
  return `${where} is home to ${count} design museums and foundations. Explore collections in furniture, product, and industrial design, curated by Acceso.`;
}

/**
 * Single, quotable direct-answer paragraph. Replaces the old two-paragraph
 * SEO filler block that used to sit at the bottom of the page — this one
 * renders directly under the H1, ahead of the results grid.
 */
export function museumIntro(ctx: MuseumCtx): { paragraph: string } {
  const countPhrase = ctx.totalMuseums ? `${ctx.totalMuseums}+` : 'a growing number of';
  const paragraph = `${ctx.cityName} is home to ${countPhrase} museums and foundations with collections in furniture, product, and industrial design, from permanent galleries to rotating exhibitions.`;
  return { paragraph };
}

/**
 * Shared label so the visible breadcrumb and the BreadcrumbList schema never
 * say something different from the title/H1 above.
 */
export const MUSEUM_BREADCRUMB_LABEL = 'Design Museums';


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
