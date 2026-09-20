type BreadcrumbItem = { name: string; url: string };

const SITE = 'https://acceso.design';

function toAbsoluteUrl(url: string): string {
  try {
    return new URL(url, SITE).toString();
  } catch {
    return url;
  }
}

export function breadcrumbList(items: BreadcrumbItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, idx) => ({
      '@type': 'ListItem',
      position: idx + 1,
      name: it.name,
      item: toAbsoluteUrl(it.url),
    })),
  };
}

export function itemList(params: { url: string; name: string; items: Array<{ url: string; name: string }> }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    url: params.url,
    name: params.name,
    numberOfItems: params.items.length,
    itemListElement: params.items.map((it, idx) => ({
      '@type': 'ListItem',
      position: idx + 1,
      url: it.url,
      name: it.name,
    })),
  };
}

export function organization(params: {
  url: string;
  name: string;
  logo?: string;
  sameAs?: string[];
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${params.url}#organization`,
    name: params.name,
    url: params.url,
    ...(params.logo ? { logo: params.logo } : {}),
    ...(params.sameAs?.length ? { sameAs: params.sameAs } : {}),
  };
}

export function website(params: { url: string; name: string }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${params.url}#website`,
    url: params.url,
    name: params.name,
    publisher: { '@id': `${params.url}#organization` },
    potentialAction: {
      '@type': 'SearchAction',
      target: `${params.url}search?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };
}

export function faqPage(faqs: Array<{ q: string; a: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
}

/**
 * One node per listed entity: real external website (sameAs) and first-hand
 * description, additive to the existing ItemList (which stays as-is,
 * pointing at internal profile URLs for site navigation). This data is
 * never rendered as a visible link on the page — it's what lets a crawler
 * or AI engine read "X, based in Y, official site Z" as a structured fact
 * even though the card itself only shows a name, photo and one-line
 * description.
 */
export function entityBusinessNodes(params: {
  /** schema.org @type for every node, e.g. 'LocalBusiness', 'Museum', 'EducationalOrganization'. */
  type: string;
  items: Array<{
    name: string;
    url: string;
    website?: string | null;
    description?: string | null;
    city?: string | null;
    country?: string | null;
  }>;
}) {
  return params.items.map((it) => ({
    '@context': 'https://schema.org',
    '@type': params.type,
    name: it.name,
    url: it.url,
    ...(it.website ? { sameAs: [it.website] } : {}),
    ...(it.description ? { description: it.description } : {}),
    ...(it.city || it.country
      ? {
          address: {
            '@type': 'PostalAddress',
            ...(it.city ? { addressLocality: it.city } : {}),
            ...(it.country ? { addressCountry: it.country } : {}),
          },
        }
      : {}),
  }));
}

/** @deprecated Use entityBusinessNodes({ type: 'LocalBusiness', ... }) — kept so existing call sites don't need a type argument. */
export function studioBusinessNodes(params: {
  items: Array<{
    name: string;
    url: string;
    website?: string | null;
    description?: string | null;
    city?: string | null;
    country?: string | null;
  }>;
}) {
  return entityBusinessNodes({ type: 'LocalBusiness', items: params.items });
}

/** Design museums: schema.org/Museum, not LocalBusiness — matches what these actually are. */
export function museumBusinessNodes(params: Parameters<typeof studioBusinessNodes>[0]) {
  return entityBusinessNodes({ type: 'Museum', items: params.items });
}

/** Design schools: schema.org/EducationalOrganization, not LocalBusiness. */
export function schoolBusinessNodes(params: Parameters<typeof studioBusinessNodes>[0]) {
  return entityBusinessNodes({ type: 'EducationalOrganization', items: params.items });
}
