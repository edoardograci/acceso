export const TITLE_MAX = 60;
export const DESC_MAX = 155;
const DESC_MIN = 120;

export function truncateAtWord(str: string, max: number): string {
  if (str.length <= max) return str;
  const cut = str.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd() + '…';
}

export function entityTitle(name: string, typeLabel: string, city?: string): string {
  if (city) {
    const withCity = `${name} - ${typeLabel} in ${city} | Acceso`;
    if (withCity.length <= TITLE_MAX) return withCity;
  }
  const withoutCity = `${name} - ${typeLabel} | Acceso`;
  if (withoutCity.length <= TITLE_MAX + 8) return withoutCity;
  return `${name} | Acceso`;
}

export function entityDescription(raw: string | null | undefined, fallback: string): string {
  const base = (raw || '').trim();
  if (!base) return fallback;
  if (base.length > DESC_MAX) return truncateAtWord(base, DESC_MAX);
  if (base.length < DESC_MIN) return truncateAtWord(`${base} ${fallback}`, DESC_MAX);
  return base;
}

// ── Designer (studio) pages ──────────────────────────────────────────────────

const STUDIO_DESC_TAIL = 'Explore projects and studio details on Acceso.';

// A period after one of these does not end a sentence ("Acme Inc. was founded…").
const ABBREVIATION_END = /\b(?:Inc|Ltd|Co|Corp|Dr|Mr|Mrs|Ms|St|Jr|Sr|vs|No|Nos|etc|S\.p\.A|S\.r\.l|S\.A|e\.g|i\.e)\.$/i;

function splitSentences(text: string): string[] {
  const parts = text.split(/(?<=[.!?])\s+(?=[A-Z"\u201C\u2018(])/);
  const out: string[] = [];
  for (const part of parts) {
    if (out.length && ABBREVIATION_END.test(out[out.length - 1])) out[out.length - 1] += ` ${part}`;
    else out.push(part);
  }
  return out;
}

/**
 * Meta description for /designers/<slug>, built from the studio's own bio.
 *
 * Used to be the same sentence on every studio page ("X is an independent design
 * studio based in Y. Explore projects…"), which gives Google nothing to
 * distinguish ~600 pages and leaves it free to rewrite the snippet. Now:
 *  - no bio            -> the previous generic sentence
 *  - short bio         -> the bio plus a short closing clause, up to the budget
 *  - bio in range      -> the bio as is
 *  - long bio          -> as many WHOLE sentences as fit; if that lands too short
 *                         (e.g. one very long opening sentence), trim at a word.
 */
export function studioDescription(studio: {
  name: string;
  city?: string | null;
  description?: string | null;
}): string {
  const fallback = `${studio.name} is an independent design studio${studio.city ? ` based in ${studio.city}` : ''}. Explore projects, objects, and studio information.`;
  const clean = (studio.description || '').replace(/\s+/g, ' ').trim();
  if (!clean) return fallback;

  if (clean.length < DESC_MIN) return truncateAtWord(`${clean} ${STUDIO_DESC_TAIL}`, DESC_MAX);
  if (clean.length <= DESC_MAX) return clean;

  let out = '';
  for (const sentence of splitSentences(clean)) {
    const next = out ? `${out} ${sentence}` : sentence;
    if (next.length > DESC_MAX) break;
    out = next;
  }
  return out.length >= DESC_MIN ? out : truncateAtWord(clean, DESC_MAX);
}
