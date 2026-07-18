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
