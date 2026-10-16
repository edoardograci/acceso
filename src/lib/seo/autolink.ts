export type LinkableEntity = {
  name: string;
  href: string;
  aliases?: string[];
  /** Family key ("label:red dot award") shared by members of one award/fair. */
  family?: string;
  /** Region qualifier of a parenthesised member, e.g. "jp" for "(JP)". */
  region?: string;
  /**
   * Curated shorthand labels from FAMILY_SHORTHANDS. Single-token brand
   * spellings ("3daysofdesign") are allowed as links; guessed short names are
   * not, so only these bypass the two-word rule.
   */
  shorthands?: string[];
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function altList(item: { alt_names?: unknown }): string[] {
  if (Array.isArray(item.alt_names)) return item.alt_names.map((a) => String(a).trim()).filter(Boolean);
  if (typeof item.alt_names === 'string') {
    return item.alt_names.split(',').map((a) => a.trim()).filter(Boolean);
  }
  return [];
}

function wordCount(s: string): number {
  return s.split(/[^A-Za-z0-9]+/).filter(Boolean).length;
}

function isMultiWord(s: string): boolean {
  return wordCount(s) >= 2;
}

/** Same identity, different punctuation — never a shorter/guessed name. */
function foldPunct(s: string): string {
  return s
    .replace(/[’‘]/g, "'")
    .replace(/[:/–—,()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function labelKey(s: string): string {
  return foldPunct(s).toLowerCase();
}

/** Official name plus punctuation folding of that full string. */
function nameVariants(name: string): string[] {
  const raw = name.replace(/\s+/g, ' ').trim();
  if (!isMultiWord(raw)) return [];
  const out = new Set<string>([raw]);
  const straight = raw.replace(/[’‘]/g, "'");
  if (isMultiWord(straight)) out.add(straight);
  const folded = foldPunct(raw);
  if (isMultiWord(folded)) out.add(folded);
  return [...out];
}

/** "Red Dot Award: Product Design" → "Red Dot Award"; "Good Design Award (JP)" → "Good Design Award". */
function familyLabel(name: string): string {
  return name
    .replace(/\s*\([^)]*\)\s*$/g, '')
    .replace(/\s*:[\s\S]*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function groupingKey(slug: string, name: string): string {
  if (/^if-/.test(slug) || /^if\b/i.test(name)) return 'brand:if';
  return `label:${labelKey(familyLabel(name))}`;
}

function isParenQualified(name: string): boolean {
  return /\([^)]+\)\s*$/.test(name) && !name.includes(':');
}

/** Two-letter region qualifier of a parenthesised member: "Good Design Award (JP)" → "jp". */
function regionOf(name: string, slug: string): string | undefined {
  if (!isParenQualified(name)) return undefined;
  const paren = /\(([^)]+)\)\s*$/.exec(name);
  const fromName = paren ? paren[1].trim().toLowerCase() : '';
  if (/^[a-z]{2}$/.test(fromName)) return fromName;
  const fromSlug = /-([a-z]{2})$/.exec(slug);
  return fromSlug ? fromSlug[1] : undefined;
}

/** Side programmes, not the main award/fair. */
const VARIANT_RE = /\b(concept|student|social|winter|summer|junior|kids|academy)\b/i;

type FamilyMember = { name: string; slug: string; href: string };

/**
 * Pick the default page in a family, or null if guessing would be wrong
 * (Good Design Award AU/JP/US, Maison&Objet Summer/Winter).
 *
 * Default = the member that is not a named side programme. For Red Dot that
 * is Product Design; for iF that is "iF Award".
 */
function pickDefault(members: FamilyMember[]): FamilyMember | null {
  if (members.length < 2) return null;
  if (members.every((m) => isParenQualified(m.name))) return null;

  const main = members.filter((m) => !VARIANT_RE.test(m.name) && !VARIANT_RE.test(m.slug));
  if (main.length === 1) return main[0];

  const product = members.filter(
    (m) => /product-design/i.test(m.slug) || /\bproduct\s+design\b/i.test(m.name),
  );
  if (product.length === 1) return product[0];

  return null;
}

/**
 * Short names people actually write for the default programme, keyed by the
 * family label. Longest match still wins, so "Red Dot Award: Design Concept"
 * beats "Red Dot" and "iF Design Student Award" beats "iF Design".
 */
const FAMILY_SHORTHANDS: Record<string, string[]> = {
  'red dot award': ['Red Dot'],
  'if award': ['iF Design'],
  '3 days of design': ['3daysofdesign'],
};

/**
 * Short names people actually write for the default programme.
 * Longest match still wins, so "Red Dot Award: Design Concept" beats "Red Dot Award".
 */
function defaultAliases(familyName: string): string[] {
  if (!isMultiWord(familyName)) return [];
  const out = new Set<string>(nameVariants(familyName));
  if (/\bred\s+dot\b/i.test(familyName)) {
    const compact = familyName.replace(/\bred\s+dot\b/gi, 'Reddot');
    if (isMultiWord(compact)) out.add(compact);
  }
  if (!/\bdesign\b/i.test(familyName) && /\baward\b/i.test(familyName)) {
    const withDesign = familyName.replace(/\bAward\b/i, 'Design Award');
    if (isMultiWord(withDesign) && withDesign.toLowerCase() !== familyName.toLowerCase()) {
      out.add(withDesign);
      if (/\bred\s+dot\b/i.test(withDesign)) {
        out.add(withDesign.replace(/\bred\s+dot\b/gi, 'Reddot'));
      }
    }
  }
  return [...out].filter(isMultiWord);
}

function attachDefaultAliases(
  entities: LinkableEntity[],
  items: any[],
  hrefFor: (item: any) => string | null,
): void {
  const members: FamilyMember[] = [];
  for (const item of items) {
    const href = hrefFor(item);
    if (!href || !item?.slug || !item?.name) continue;
    members.push({ name: String(item.name).trim(), slug: String(item.slug), href });
  }

  const groups = new Map<string, FamilyMember[]>();
  for (const m of members) {
    const key = groupingKey(m.slug, m.name);
    const list = groups.get(key);
    if (list) list.push(m);
    else groups.set(key, [m]);
  }

  const byHref = new Map(entities.map((e) => [e.href, e]));
  for (const group of groups.values()) {
    const def = pickDefault(group);
    const family = familyLabel(def?.name ?? group[0].name);
    const key = labelKey(family);
    const shorthand = FAMILY_SHORTHANDS[key];
    // Curated shorthands also cover single-member families, which have no
    // default page to attach to ("3daysofdesign" → 3 Days of Design).
    if (!def && (!shorthand || group.length !== 1)) continue;
    const ent = byHref.get((def ?? group[0]).href);
    if (!ent) continue;
    const extra = [...(def ? defaultAliases(family) : []), ...(shorthand ?? [])];
    if (!extra.length) continue;
    ent.aliases = [...new Set([...(ent.aliases ?? []), ...extra])];
    if (shorthand?.length) {
      ent.shorthands = [...new Set([...(ent.shorthands ?? []), ...shorthand])];
    }
  }
}

function toLinkableEntities(
  items: any[],
  hrefFor: (item: any) => string | null,
): LinkableEntity[] {
  const out: LinkableEntity[] = [];
  for (const item of items) {
    if (!item?.name || !item?.slug) continue;
    const href = hrefFor(item);
    if (!href) continue;
    const name = String(item.name).trim();
    if (!isMultiWord(name)) continue;
    const aliases = [...altList(item), ...nameVariants(name)].filter(
      (a) => a.toLowerCase() !== name.toLowerCase() && isMultiWord(a),
    );
    out.push({
      name,
      href,
      aliases,
      family: labelKey(familyLabel(name)),
      region: regionOf(name, String(item.slug)),
    });
  }
  return out;
}

export function directoryLinkables(awards: any[], fairs: any[]): LinkableEntity[] {
  const hrefAward = (a: any) => (a.slug ? `/directory/awards/${a.slug}` : null);
  const hrefFair = (f: any) => (f.slug ? `/directory/fairs/${f.slug}` : null);
  const awardEntities = toLinkableEntities(awards, hrefAward);
  const fairEntities = toLinkableEntities(fairs, hrefFair);
  attachDefaultAliases(awardEntities, awards, hrefAward);
  attachDefaultAliases(fairEntities, fairs, hrefFair);
  return [...awardEntities, ...fairEntities];
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * A family whose pages only exist per region ("Good Design Award (JP)",
 * "(AU)", "(US)") has no default page, so the bare family label matches
 * nothing. The AU and US programmes are different organisations from the
 * Japanese one, so the label becomes a link only when the page's own region
 * names exactly one member — never guessed.
 */
function resolveRegionLabels(entities: LinkableEntity[], region?: string): LinkableEntity[] {
  if (!region) return entities;
  const want = String(region).trim().toLowerCase();

  const groups = new Map<string, LinkableEntity[]>();
  for (const e of entities) {
    if (!e.family) continue;
    const list = groups.get(e.family);
    if (list) list.push(e);
    else groups.set(e.family, [e]);
  }

  const extras = new Map<LinkableEntity, string[]>();
  for (const group of groups.values()) {
    // A member already owns the family label (its name or an alias), so the
    // default-page logic has handled this family.
    const owned = group.some((e) =>
      [e.name, ...(e.aliases ?? [])].some((l) => labelKey(l) === e.family),
    );
    if (owned) continue;

    const matches = group.filter((e) => e.region === want);
    if (matches.length !== 1) continue;

    const family = familyLabel(matches[0].name);
    const labels = [...nameVariants(family)];
    const stem = family.replace(/\s+awards?$/i, '').trim();
    if (isMultiWord(stem)) labels.push(stem);
    const fresh = labels.filter((l) => l.toLowerCase() !== matches[0].name.toLowerCase());
    if (fresh.length) extras.set(matches[0], fresh);
  }
  if (!extras.size) return entities;

  return entities.map((e) => {
    const extra = extras.get(e);
    if (!extra) return e;
    return { ...e, aliases: [...new Set([...(e.aliases ?? []), ...extra])] };
  });
}

type Pat = { global: RegExp; href: string; len: number };

/**
 * Punctuation that foldPunct treats as equivalent, plus whitespace. One regex
 * then covers curly/straight apostrophes, "(DIA)" vs "DIA", and line-broken names.
 */
const PUNCT_SEP = `[\\s'’‘:/\\u2013\\u2014,()-]+`;
const PUNCT_TRAIL = `(?:['’‘:/\\u2013\\u2014,()-]+)?`;

function patternBody(label: string): string {
  const tokens = escapeHtml(label)
    .replace(/[’‘']/g, ' ')
    .replace(/[:/–—,()]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(escapeRegExp);
  if (!tokens.length) return '';
  return tokens.join(PUNCT_SEP);
}

/**
 * One folded label → one href. If two entries still claim the same key after
 * defaults are assigned, drop that label.
 */
function uniquePatterns(entities: LinkableEntity[], skipHref?: string): Pat[] {
  type Claim = { href: string; label: string };
  const claims = new Map<string, Claim | 'ambiguous'>();

  for (const e of entities) {
    if (!e.href || e.href === skipHref) continue;
    const curated = new Set((e.shorthands ?? []).map((s) => labelKey(s)));
    const labels = [e.name, ...(e.aliases ?? [])]
      .map((s) => s.trim())
      .filter((s) => isMultiWord(s) || curated.has(labelKey(s)));
    for (const label of labels) {
      const key = labelKey(label);
      if (!key) continue;
      const prev = claims.get(key);
      if (!prev) claims.set(key, { href: e.href, label });
      else if (prev !== 'ambiguous' && prev.href !== e.href) claims.set(key, 'ambiguous');
    }
  }

  const pats: Pat[] = [];
  const seen = new Set<string>();
  for (const claim of claims.values()) {
    if (claim === 'ambiguous') continue;
    const dedupe = `${claim.href}\0${labelKey(claim.label)}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    const body = patternBody(claim.label);
    if (!body) continue;
    // Bios write plurals and tiers — "iF Design Awards", "Good Design Awards",
    // "German Design Award Gold" — so a trailing s/es must not break the match.
    const source = `(?<![\\w])${body}(?:e?s)?${PUNCT_TRAIL}(?![\\w])`;
    pats.push({
      global: new RegExp(source, 'gi'),
      href: claim.href,
      len: claim.label.length,
    });
  }
  pats.sort((a, b) => b.len - a.len);
  return pats;
}

function insideAnchor(html: string, index: number): boolean {
  const before = html.slice(0, index);
  return (before.match(/<a /g) || []).length > (before.match(/<\/a>/g) || []).length;
}

export type LinkMentionOpts = {
  skipHref?: string;
  usedHref?: Set<string>;
  /**
   * Region of the page ("au"/"jp"/"us"), used to pick the right member of a
   * family that only exists per region, e.g. "Good Design Award (JP)".
   */
  region?: string;
};

type InternalOpts = LinkMentionOpts & { patterns?: Pat[] };

function compiledPatterns(entities: LinkableEntity[], opts: LinkMentionOpts): Pat[] {
  return uniquePatterns(resolveRegionLabels(entities, opts.region), opts.skipHref);
}

function applyMentions(html: string, pats: Pat[], usedHref: Set<string>): string {
  let out = html;
  for (const { global, href } of pats) {
    if (usedHref.has(href)) continue;
    global.lastIndex = 0;
    let m: RegExpExecArray | null;
    let picked: RegExpExecArray | null = null;
    while ((m = global.exec(out)) !== null) {
      if (insideAnchor(out, m.index)) continue;
      picked = m;
      break;
    }
    if (!picked || picked.index == null) continue;
    const start = picked.index;
    const end = start + picked[0].length;
    out = `${out.slice(0, start)}<a href="${escapeHtml(href)}">${out.slice(start, end)}</a>${out.slice(end)}`;
    usedHref.add(href);
  }
  return out;
}

/**
 * Wrap the first unique mention of each award/fair in `text`. Output is HTML;
 * `text` is escaped first. No match → escaped text, unchanged meaning.
 */
export function linkMentions(text: string, entities: LinkableEntity[], opts: LinkMentionOpts = {}): string {
  const source = text ?? '';
  if (!source) return '';

  const internal = opts as InternalOpts;
  const usedHref = internal.usedHref ?? new Set<string>();
  const pats = internal.patterns ?? compiledPatterns(entities, internal);
  return applyMentions(escapeHtml(source), pats, usedHref);
}

/** Same rules, shared usedHref so a later paragraph cannot repeat a link. */
export function linkMentionParagraphs(
  paragraphs: string[],
  entities: LinkableEntity[],
  opts: LinkMentionOpts = {},
): string[] {
  const internal = opts as InternalOpts;
  const usedHref = internal.usedHref ?? new Set<string>();
  const patterns = internal.patterns ?? compiledPatterns(entities, internal);
  return paragraphs.map((p) => linkMentions(p, entities, { ...internal, usedHref, patterns }));
}

/** Lead then about, one compiled pattern set, one usedHref — award and fair pages. */
export function linkDirectoryMentions(args: {
  description?: string | null;
  aboutParagraphs: string[];
  selfHref: string;
  linkables: LinkableEntity[];
  region?: string;
}): { leadHtml: string; aboutHtml: string[] } {
  const usedHref = new Set<string>();
  const opts: InternalOpts = {
    skipHref: args.selfHref,
    usedHref,
    region: args.region,
    patterns: compiledPatterns(args.linkables, { skipHref: args.selfHref, region: args.region }),
  };
  return {
    leadHtml: args.description ? linkMentions(String(args.description), args.linkables, opts) : '',
    aboutHtml: linkMentionParagraphs(args.aboutParagraphs, args.linkables, opts),
  };
}
