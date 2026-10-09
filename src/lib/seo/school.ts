import { TITLE_MAX, DESC_MAX, truncateAtWord } from './meta';

/**
 * School SEO.
 *
 * Most impressions on school pages come from the school's own name, where the
 * official site and Wikipedia usually rank above us. What Acceso has that those
 * results don't is structured programme data (degrees, specialization), so the
 * title and snippet lead with that instead of the raw 250-300 character
 * `description`, which Google was truncating mid-sentence.
 */

const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const list = (value: unknown, sep: RegExp): string[] =>
  typeof value === 'string' ? value.split(sep).map((s) => s.trim()).filter(Boolean) : [];

/** "Bachelor of Fine Arts in Industrial Design + Master of ..." -> separate degrees. */
export function parseDegrees(degree: unknown): string[] {
  return list(degree, /\s\+\s/);
}

export function schoolTitle(name: string, cityName?: string): string {
  const n = name.trim();
  // "Design Academy Eindhoven - Design Programs in Eindhoven" wastes characters.
  const cityRedundant = !cityName || normalize(n).includes(normalize(cityName));
  const candidates = [
    ...(cityRedundant ? [] : [`${n} - Design Programs in ${cityName} | Acceso`]),
    `${n} - Design Programs | Acceso`,
    ...(cityRedundant ? [] : [`${n} - Design Programs in ${cityName}`]),
    `${n} - Design Programs`,
    `${n} | Acceso`,
    n,
  ];
  return candidates.find((c) => c.length <= TITLE_MAX) ?? n;
}

export function schoolDescription(u: any, cityName?: string, countryName?: string): string {
  const name = String(u.name).trim();
  const where =
    cityName && countryName && normalize(cityName) !== normalize(countryName)
      ? `${cityName}, ${countryName}`
      : cityName || countryName || '';
  const lead = `${name} - design school${where ? ` in ${where}` : ''}.`;

  const degrees = parseDegrees(u.degree);
  const specialization = list(u.specialization, /,/).slice(0, 3);
  const address = typeof u.address === 'string' ? u.address.trim() : '';

  let out = lead;
  const add = (part: string) => {
    if (part && `${out} ${part}`.length <= DESC_MAX) out = `${out} ${part}`;
  };

  // As many full degree names as fit, in order; never cut one mid-name. If the
  // list is partial, say "include" so the snippet never implies it is complete.
  let shownCount = 0;
  for (let i = 1; i <= degrees.length; i++) {
    const label = i < degrees.length ? 'Degrees include' : 'Degrees:';
    // The partial label is longer, so test with it when more degrees remain.
    if (`${out} ${label} ${degrees.slice(0, i).join('; ')}.`.length > DESC_MAX) break;
    shownCount = i;
  }
  if (shownCount) {
    const label = shownCount < degrees.length ? 'Degrees include' : 'Degrees:';
    add(`${label} ${degrees.slice(0, shownCount).join('; ')}.`);
  }

  if (specialization.length) add(`Focus: ${specialization.join(', ')}.`);
  if (address) add(`Address: ${address}.`);
  add('Admissions, courses and campus info.');

  return out.length > DESC_MAX ? truncateAtWord(out, DESC_MAX) : out;
}

/** "name@school.edu / +39 02 1234" -> { email, telephone } (either may be absent). */
export function parseContact(contact: unknown): { email?: string; telephone?: string } {
  const parts = list(contact, /[/|;]/);
  const email = parts.map((p) => p.match(/[^\s,]+@[^\s,]+\.[^\s,]+/)?.[0]).find(Boolean);
  const telephone = parts.find((p) => !p.includes('@') && /^\+?[\d\s().-]+$/.test(p) && (p.match(/\d/g) || []).length >= 6);
  return { ...(email ? { email } : {}), ...(telephone ? { telephone } : {}) };
}

export function schoolSchemaNode(params: {
  university: any;
  canonical: string;
  cityName: string;
  countryName: string;
  imageUrl?: string | null;
  geo?: { latitude: number; longitude: number } | null;
  /** Meta description, used when there is no authored description. */
  fallbackDescription: string;
}) {
  const { university: u, canonical, cityName, countryName, imageUrl, geo, fallbackDescription } = params;
  const { email, telephone } = parseContact(u.contact);
  const knowsAbout = list(u.specialization, /,/);
  const description = typeof u.description === 'string' && u.description.trim() ? u.description.trim() : fallbackDescription;

  return {
    // Every record is a degree-granting design school; CollegeOrUniversity is
    // the specific subtype of EducationalOrganization.
    '@type': 'CollegeOrUniversity',
    '@id': `${canonical}#school`,
    name: u.name,
    description,
    url: canonical,
    // Was the raw bucket path ("universities/x/logo.webp"), which is not a valid image URL.
    ...(imageUrl ? { image: imageUrl } : {}),
    ...(u.address
      ? {
          address: {
            '@type': 'PostalAddress',
            streetAddress: u.address,
            addressLocality: cityName,
            addressCountry: countryName,
          },
        }
      : {}),
    ...(geo ? { geo: { '@type': 'GeoCoordinates', ...geo } } : {}),
    ...(telephone ? { telephone } : {}),
    ...(email ? { email } : {}),
    ...(knowsAbout.length ? { knowsAbout } : {}),
    sameAs: [u.website, u.instagram, u.facebook].filter(Boolean),
  };
}

export function schoolSeo(params: { university: any; cityName: string; countryName: string }) {
  const { university: u, cityName, countryName } = params;
  return {
    title: schoolTitle(u.name, cityName),
    description: schoolDescription(u, cityName, countryName),
  };
}
