import { TITLE_MAX, DESC_MAX, truncateAtWord, entityTitle, entityDescription } from './meta';
import { parseIsoDate } from './fair';

/**
 * Award SEO: title, meta description and FAQ are built from the structured
 * fields (deadlines, fee, prototype, optional fee_note) instead of the authored
 * `description`.
 *
 * What searchers actually type for awards is "<award> deadline", "<award> entry
 * fee", "<award> how to apply", "<award> 2027". Those facts lived lower on the
 * page while the snippet showed a generic definition. We don't claim an award
 * "year" (many awards are entered in one calendar year for the next one), only
 * the deadline date, which is a fact.
 */

type Ymd = { y: number; m: number; d: number };

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const key = (t: Ymd) => t.y * 10000 + t.m * 100 + t.d;
const short = (t: Ymd) => `${t.d} ${MONTHS_SHORT[t.m - 1]} ${t.y}`;
const long = (t: Ymd) => `${t.d} ${MONTHS[t.m - 1]} ${t.y}`;

export type AwardDeadlines = {
  /** All parseable deadlines, ascending. */
  all: Ymd[];
  /** Earliest deadline that has not passed (UTC date), if any. */
  next: Ymd | null;
  /** Latest deadline on record. */
  last: Ymd | null;
  isOpen: boolean;
};

export function getAwardDeadlines(deadlines: unknown, now: Date = new Date()): AwardDeadlines {
  const all =
    typeof deadlines === 'string'
      ? deadlines
          .split(',')
          .map((d) => parseIsoDate(d.trim()))
          .filter((d): d is Ymd => d !== null)
          .sort((a, b) => key(a) - key(b))
      : [];
  const today: Ymd = { y: now.getUTCFullYear(), m: now.getUTCMonth() + 1, d: now.getUTCDate() };
  const next = all.find((d) => key(d) >= key(today)) ?? null;
  return { all, next, last: all.length ? all[all.length - 1] : null, isOpen: next !== null };
}

const feeKind = (award: any): 'free' | 'paid' | null => {
  const f = typeof award.fee === 'string' ? award.fee.trim().toLowerCase() : '';
  return f === 'free' ? 'free' : f === 'paid' ? 'paid' : null;
};

/** Optional, hand-curated, e.g. "HK$2,200 per entry". Never parsed out of free text. */
const feeNote = (award: any): string =>
  typeof award.fee_note === 'string' ? award.fee_note.trim().replace(/[.\s]+$/, '') : '';

export function awardTitle(name: string, dl: AwardDeadlines): string {
  const n = name.trim();
  const date = dl.isOpen ? dl.next! : dl.last!;
  const label = dl.isOpen ? 'Deadline' : 'Last Deadline';
  const core = `${n} - ${label} ${short(date)}`;
  const candidates = [`${core} | Acceso`, core, `${n} | Acceso`, n];
  return candidates.find((c) => c.length <= TITLE_MAX) ?? n;
}

export function awardDescription(award: any, dl: AwardDeadlines): string {
  const name = String(award.name).trim();
  const date = dl.isOpen ? dl.next! : dl.last!;
  const lead = dl.isOpen
    ? `${name} - ${dl.all.filter((d) => key(d) >= key(dl.next!)).length > 1 ? 'next ' : ''}entry deadline ${long(date)}.`
    : `${name} - latest entry deadline on record: ${long(date)}.`;

  const kind = feeKind(award);
  const note = feeNote(award);
  const fee =
    kind === 'free' ? 'Free to enter.' : kind === 'paid' ? (note ? `Entry fee: ${note}.` : 'Paid entry.') : '';

  const proto = typeof award.prototype === 'string' ? award.prototype.trim() : '';
  const prototype =
    proto === 'Required'
      ? 'Physical prototype required.'
      : proto === 'Finalists only'
        ? 'Prototype only for finalists.'
        : proto === 'None'
          ? 'No prototype needed.'
          : '';

  let out = lead;
  for (const part of [fee, prototype, 'Eligibility, prizes and how to apply.']) {
    if (part && `${out} ${part}`.length <= DESC_MAX) out = `${out} ${part}`;
  }
  return out.length > DESC_MAX ? truncateAtWord(out, DESC_MAX) : out;
}

export type Faq = { q: string; a: string };

/**
 * Single source for the visible FAQ section and the FAQPage JSON-LD (they used
 * to be written twice and could drift). Order follows search demand.
 */
export function awardFaqs(award: any, dl: AwardDeadlines): Faq[] {
  const name = String(award.name).trim();
  const faqs: Faq[] = [];

  if (award.description) faqs.push({ q: `What is ${name}?`, a: String(award.description).trim() });

  if (dl.all.length) {
    const a = dl.isOpen
      ? dl.all.filter((d) => key(d) >= key(dl.next!)).length > 1
        ? `Upcoming entry deadlines: ${dl.all.filter((d) => key(d) >= key(dl.next!)).map(long).join(', ')}.`
        : `The next entry deadline is ${long(dl.next!)}.`
      : `The most recent entry deadline on record was ${long(dl.last!)}. Check the official website for the next call.`;
    faqs.push({ q: `What is the ${name} entry deadline?`, a });
  }

  const kind = feeKind(award);
  const note = feeNote(award);
  if (kind === 'free') {
    faqs.push({ q: `Is ${name} free to enter?`, a: 'Yes, entry is free.' });
  } else if (kind === 'paid' && note) {
    // Only when a verified amount is on record; "Paid" alone answers nothing.
    faqs.push({ q: `What is the ${name} entry fee?`, a: `Entry is paid: ${note}. Fees can change between award cycles, so confirm on the official website.` });
  }

  if (award.eligibility) faqs.push({ q: 'Who can enter this award?', a: String(award.eligibility) });
  if (award.prize) faqs.push({ q: 'What is the prize?', a: String(award.prize) });
  if (award.submission_requirements) {
    faqs.push({ q: `How do I apply to ${name}?`, a: String(award.submission_requirements) });
  }

  if (award.prototype) {
    const p = String(award.prototype).trim();
    faqs.push({
      q: 'Do I need to submit a physical prototype?',
      a:
        p === 'Finalists only'
          ? 'Only finalists are required to submit a physical prototype. You do not need to submit one when applying or making your initial submission. If selected as a finalist, a physical prototype may need to be sent for evaluation and additional costs may apply. Check the official award website for specific requirements and shipping details.'
          : p === 'Required'
            ? 'A physical prototype is required as part of the submission. Check the official award website for details on prototype requirements, shipping, evaluation, and any associated costs.'
            : 'A physical prototype is not required for this award. You can submit your project without providing a physical prototype.',
    });
  }
  return faqs;
}

export function awardSeo(params: { award: any; cityName?: string; now?: Date }) {
  const { award, cityName, now } = params;
  const dl = getAwardDeadlines(award.deadlines, now);
  const faqs = awardFaqs(award, dl);
  if (!dl.last) {
    return {
      deadlines: dl,
      faqs,
      title: entityTitle(award.name, 'Design Award', cityName),
      description: entityDescription(
        award.description,
        `${award.name} is a design award${cityName ? ` based in ${cityName}` : ''}. Explore eligibility, prizes, and deadlines on Acceso.`,
      ),
    };
  }
  return { deadlines: dl, faqs, title: awardTitle(award.name, dl), description: awardDescription(award, dl) };
}
