type BreadcrumbItem = { name: string; url: string };

export function breadcrumbList(items: BreadcrumbItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, idx) => ({
      '@type': 'ListItem',
      position: idx + 1,
      name: it.name,
      item: it.url,
    })),
  };
}

export function itemList(params: { url: string; name: string; items: Array<{ url: string; name: string }> }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    url: params.url,
    name: params.name,
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
  };
}

