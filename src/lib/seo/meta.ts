export const TITLE_MAX = 60;
export const DESC_MAX = 155;
export const DESC_MIN = 120;

const BRAND_SUFFIX = ' | Acceso';
const DESC_PAD =
  'Explore Acceso, the curated directory of independent design studios, schools, museums and fairs.';

export function truncateAtWord(str: string, max: number): string {
  if (str.length <= max) return str;
  const cut = str.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd() + '…';
}

/** Hard cap so no template can emit a title longer than the SERP budget. */
export function clampTitle(title: string): string {
  const t = (title || '').replace(/\s+/g, ' ').trim();
  return t.length <= TITLE_MAX ? t : truncateAtWord(t, TITLE_MAX);
}

/**
 * Force every meta description into [DESC_MIN, DESC_MAX]. Short strings get a
 * closing clause; long ones are cut at a word. Layout uses this as a backstop
 * so a single page cannot ship an Ahrefs-flagged snippet again.
 */
export function ensureDescription(text: string, extra?: string): string {
  let out = (text || '').replace(/\s+/g, ' ').trim();
  if (!out) out = extra || DESC_PAD;
  if (out.length < DESC_MIN) {
    const pad = extra || DESC_PAD;
    const needsDot = !/[.!?]$/.test(out);
    const joined = `${out}${needsDot ? '.' : ''} ${pad}`;
    out = joined.length >= DESC_MIN ? joined : `${joined} ${DESC_PAD}`;
  }
  return out.length > DESC_MAX ? truncateAtWord(out, DESC_MAX) : out;
}

export function entityTitle(name: string, typeLabel: string, city?: string): string {
  const n = (name || '').trim();
  const label = (typeLabel || '').trim();
  const candidates: string[] = [];
  if (city) candidates.push(`${n} - ${label} in ${city}${BRAND_SUFFIX}`);
  candidates.push(`${n} - ${label}${BRAND_SUFFIX}`);
  if (city) candidates.push(`${n} - ${label} in ${city}`);
  candidates.push(`${n} - ${label}`);
  candidates.push(`${n}${BRAND_SUFFIX}`);
  const fit = candidates.find((c) => c.length <= TITLE_MAX);
  if (fit) return fit;
  return clampTitle(`${n}${BRAND_SUFFIX}`);
}

export function projectTitle(name: string, designer?: string | null): string {
  const n = (name || '').trim();
  const by = (designer || '').trim();
  const candidates = by
    ? [`${n} by ${by}${BRAND_SUFFIX}`, `${n} by ${by}`, `${n}${BRAND_SUFFIX}`]
    : [`${n} - Design Project${BRAND_SUFFIX}`, `${n}${BRAND_SUFFIX}`];
  const fit = candidates.find((c) => c.length <= TITLE_MAX);
  return fit ?? clampTitle(`${n}${BRAND_SUFFIX}`);
}

export function entityDescription(raw: string | null | undefined, fallback: string): string {
  const base = (raw || '').trim();
  if (!base) return ensureDescription(fallback);
  if (base.length > DESC_MAX) return truncateAtWord(base, DESC_MAX);
  if (base.length < DESC_MIN) return ensureDescription(base, fallback);
  return base;
}

// ── Designer (studio) pages ──────────────────────────────────────────────────

const STUDIO_DESC_TAIL =
  'Explore projects, objects and studio details on Acceso, the curated directory of independent design studios.';

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

function endsWithSentencePunct(text: string): boolean {
  return /[.!?]$/.test(text);
}

/**
 * Meta description for /designers/<slug>, built from the studio's own bio.
 *
 * Bios that are fragments (no terminal punctuation) or shorter than 60
 * characters are not used as the lead — they produced strings like
 * "YUUE Explore projects…". Those pages fall back to a complete sentence
 * and, when the bio itself is a complete sentence, append it.
 */
export function studioDescription(studio: {
  name: string;
  city?: string | null;
  description?: string | null;
}): string {
  const fallback = `${studio.name} is an independent design studio${studio.city ? ` based in ${studio.city}` : ''}.`;
  const clean = (studio.description || '').replace(/\s+/g, ' ').trim();

  let out = fallback;
  if (clean) {
    const usableLead = clean.length >= 60 && endsWithSentencePunct(clean);
    if (usableLead) {
      out = clean;
    } else if (endsWithSentencePunct(clean) && clean !== fallback) {
      out = `${fallback} ${clean}`;
    }
  }

  if (out.length < DESC_MIN) {
    const needsDot = !endsWithSentencePunct(out);
    out = `${out}${needsDot ? '.' : ''} ${STUDIO_DESC_TAIL}`;
  }

  if (out.length <= DESC_MAX) return out.length >= DESC_MIN ? out : ensureDescription(out);

  let fitted = '';
  for (const sentence of splitSentences(out)) {
    const next = fitted ? `${fitted} ${sentence}` : sentence;
    if (next.length > DESC_MAX) break;
    fitted = next;
  }
  if (fitted.length >= DESC_MIN) return fitted;
  return truncateAtWord(out, DESC_MAX);
}
