import { TITLE_MAX, DESC_MAX, truncateAtWord, entityTitle, entityDescription } from './meta';

/**
 * Fair SEO: title, meta description, Event schema and the visible date line
 * are all derived from the structured fields (start_date / end_date / city /
 * ticket / focus), never from the authored `description` text.
 *
 * Why: searchers type "<fair> 2027" or "<fair> dates". When the authored
 * description still said "June 2026" after start_date rolled to 2027, the
 * snippet contradicted the query (and the Event JSON-LD contradicted itself).
 * One source of truth removes that whole class of bug at every date roll.
 */

type Ymd = { y: number; m: number; d: number };

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Date-only strings are parsed by hand: `new Date('2027-06-09')` is UTC midnight
// and renders as the previous day in timezones west of UTC.
export function parseIsoDate(value: unknown): Ymd | null {
  if (typeof value !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return { y, m: mo, d };
}

const key = (t: Ymd) => t.y * 10000 + t.m * 100 + t.d;

export type FairEdition = {
  start: Ymd;
  end: Ymd;
  /** Year of the first day; the year people put in the query. */
  year: number;
  isPast: boolean;
  spansYears: boolean;
  singleDay: boolean;
};

export function getFairEdition(fair: any, now: Date = new Date()): FairEdition | null {
  const start = parseIsoDate(fair?.start_date) ?? parseIsoDate(fair?.end_date);
  if (!start) return null;
  let end = parseIsoDate(fair?.end_date) ?? start;
  if (key(end) < key(start)) end = start; // bad CMS data: never render a negative range
  const today: Ymd = { y: now.getUTCFullYear(), m: now.getUTCMonth() + 1, d: now.getUTCDate() };
  return {
    start,
    end,
    year: start.y,
    isPast: key(end) < key(today),
    spansYears: end.y !== start.y,
    singleDay: key(end) === key(start),
  };
}

function fmt(t: Ymd, month: 'long' | 'short', withYear: boolean): string {
  const name = month === 'long' ? MONTHS[t.m - 1] : MONTHS_SHORT[t.m - 1];
  return `${t.d} ${name}${withYear ? ` ${t.y}` : ''}`;
}

/**
 * - title: no year (the year is already in the title), short months: "9–11 June", "28 Aug–6 Sep"
 * - long:  for sentences, words not dashes: "9 to 11 June", "28 August to 6 September"
 * - full:  standalone with year: "9–11 June 2027"
 */
export function formatFairRange(ed: FairEdition, style: 'title' | 'long' | 'full'): string {
  const { start: s, end: e } = ed;
  const withYear = style === 'full' || ed.spansYears;
  if (ed.singleDay) return fmt(s, style === 'title' ? 'short' : 'long', withYear);

  const sameMonth = s.y === e.y && s.m === e.m;
  const dash = style === 'long' ? ' to ' : '–';

  if (sameMonth) {
    return `${s.d}${dash}${e.d} ${MONTHS[s.m - 1]}${withYear ? ` ${s.y}` : ''}`;
  }
  const month = style === 'title' ? 'short' : 'long';
  const sep = style === 'title' ? '–' : style === 'full' ? ' – ' : ' to ';
  return `${fmt(s, month, ed.spansYears)}${sep}${fmt(e, month, withYear)}`;
}

/** Visible line under the H1; must agree with the title and meta. */
export function fairDateLine(ed: FairEdition | null): string {
  return ed ? formatFairRange(ed, 'full') : '';
}

const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function withYear(name: string, ed: FairEdition): string {
  return /\b20\d{2}\b/.test(name) ? name : `${name} ${ed.year}`;
}

export function fairTitle(name: string, cityName: string | undefined, ed: FairEdition): string {
  const head = withYear(name, ed);
  const dates = formatFairRange(ed, 'title');
  // "Berlin Design Week 2026: 14–17 May, Berlin" wastes characters.
  const cityRedundant = !cityName || normalize(name).includes(normalize(cityName));

  const candidates = [
    ...(cityRedundant ? [] : [`${head}: ${dates}, ${cityName} | Acceso`]),
    `${head}: ${dates} | Acceso`,
    ...(cityRedundant ? [] : [`${head}: ${dates}, ${cityName}`]),
    `${head} | Acceso`,
    head,
  ];
  return candidates.find((c) => c.length <= TITLE_MAX) ?? head;
}

export function fairDescription(
  fair: any,
  cityName: string | undefined,
  countryName: string | undefined,
  ed: FairEdition,
): string {
  const head = withYear(fair.name, ed);
  const when = `${ed.singleDay ? 'on' : 'from'} ${formatFairRange(ed, 'long')}`;
  const verb = ed.isPast ? 'took place' : 'takes place';
  const where =
    cityName && countryName && normalize(cityName) !== normalize(countryName)
      ? `${cityName}, ${countryName}`
      : cityName || countryName || '';
  const lead = `${head} ${verb} ${when}${where ? ` in ${where}` : ''}.`;

  const ticket = typeof fair.ticket === 'string' ? fair.ticket.trim().toLowerCase() : '';
  const admission = ticket === 'free' ? 'Free entry.' : ticket === 'paid only' ? 'Ticketed entry.' : '';

  const focusItems =
    typeof fair.focus === 'string'
      ? fair.focus.split(',').map((f: string) => f.trim()).filter(Boolean).slice(0, 3)
      : [];
  const focus = focusItems.length ? `Focus: ${focusItems.join(', ')}.` : '';

  let out = lead;
  for (const part of [admission, focus, 'Venue, programme and visitor info on Acceso.']) {
    if (part && `${out} ${part}`.length <= DESC_MAX) out = `${out} ${part}`;
  }
  return out.length > DESC_MAX ? truncateAtWord(out, DESC_MAX) : out;
}

/**
 * True when every 20xx year in the text belongs to this edition. Used to keep
 * a stale authored description out of the Event JSON-LD, where it would
 * contradict startDate.
 */
export function descriptionMatchesEdition(text: string | null | undefined, ed: FairEdition): boolean {
  const years = (text ?? '').match(/\b20\d{2}\b/g) ?? [];
  return years.every((y) => Number(y) === ed.start.y || Number(y) === ed.end.y);
}

// ── Event location ─────────────────────────────────────────────────────────

// An address that is not where the fair happens: "Multiple venues", or the
// organiser's office (3 Days of Design, Vienna Design Week, Dubai's d3 offices).
const NOT_A_VENUE = /^multiple venues?$|\b(headquarters|head office|organi[sz]er|management offices?)\b/i;
// A first address segment that is a street or building number, not a venue name.
const STREETISH =
  /^\d|\s[\d–-]+[a-z]?$|\b(street|road|avenue|boulevard|lane|drive|platz|strasse|straße|via|viale|calle|avenida|rue|plaza|daero)\b/i;

function buildLocation(fair: any, cityName: string, countryName: string) {
  const addr = typeof fair.address === 'string' ? fair.address.trim() : '';
  const cityOnly = {
    '@type': 'Place',
    name: cityName,
    address: { '@type': 'PostalAddress', addressLocality: cityName, addressCountry: countryName },
  };
  if (!addr || NOT_A_VENUE.test(addr)) return cityOnly;

  // Prefer an explicit `venue` field; otherwise use the first address segment
  // only when it reads like a venue rather than a street.
  const first = addr.split(',')[0].trim();
  const explicit = typeof fair.venue === 'string' ? fair.venue.trim() : '';
  const venueName = explicit || (first && !STREETISH.test(first) && normalize(first) !== normalize(cityName) ? first : '');

  const lat = parseFloat(fair.latitude);
  const lng = parseFloat(fair.longitude);

  return {
    '@type': 'Place',
    name: venueName || cityName,
    address: {
      '@type': 'PostalAddress',
      streetAddress: addr,
      addressLocality: cityName,
      addressCountry: countryName,
    },
    ...(!isNaN(lat) && !isNaN(lng) ? { geo: { '@type': 'GeoCoordinates', latitude: lat, longitude: lng } } : {}),
  };
}

export function fairEventSchema(params: {
  fair: any;
  canonical: string;
  cityName: string;
  countryName: string;
  imageUrl?: string | null;
  edition: FairEdition;
  /** Meta description built from structured fields (always consistent with the dates). */
  fallbackDescription: string;
}) {
  const { fair, canonical, cityName, countryName, imageUrl, edition, fallbackDescription } = params;
  const authored = typeof fair.description === 'string' ? fair.description.trim() : '';
  const description =
    authored && descriptionMatchesEdition(authored, edition) ? authored : fallbackDescription;
  const alt = Array.isArray(fair.alt_names)
    ? fair.alt_names
    : typeof fair.alt_names === 'string'
      ? fair.alt_names.split(',').map((a: string) => a.trim()).filter(Boolean)
      : [];

  return {
    '@type': 'Event',
    '@id': `${canonical}#event`,
    name: withYear(fair.name, edition),
    ...(alt.length ? { alternateName: alt } : {}),
    description,
    url: canonical,
    ...(imageUrl ? { image: [imageUrl] } : {}),
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    eventStatus: 'https://schema.org/EventScheduled',
    startDate: fair.start_date || fair.end_date,
    ...(fair.end_date ? { endDate: fair.end_date } : {}),
    location: buildLocation(fair, cityName, countryName),
    ...(fair.website ? { organizer: { '@type': 'Organization', name: fair.name, url: fair.website } } : {}),
  };
}

/** Title + description for the page, falling back to the generic helpers when a fair has no usable date. */
export function fairSeo(params: {
  fair: any;
  cityName: string;
  countryName: string;
  now?: Date;
}) {
  const { fair, cityName, countryName, now } = params;
  const edition = getFairEdition(fair, now);
  if (!edition) {
    return {
      edition: null as FairEdition | null,
      title: entityTitle(fair.name, 'Design Fair', cityName),
      description: entityDescription(
        fair.description,
        `${fair.name} is a design fair in ${cityName}, ${countryName}. Explore dates, venues, and exhibitors on Acceso.`,
      ),
    };
  }
  return {
    edition,
    title: fairTitle(fair.name, cityName, edition),
    description: fairDescription(fair, cityName, countryName, edition),
  };
}
