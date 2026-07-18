export interface MoodboardImage {
  id: string;
  product_id: string;
  image_url: string;
  r2_key: string;
  position: number;
  created_at: string;
}

export interface MoodboardItem {
  id: string;
  slug: string;
  name: string;
  designer: string | null;
  year: string | null;
  client: string | null;
  link: string | null;
  city: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  images: MoodboardImage[];
  cover: string | null;
}

/**
 * Derive a `cover` from the first available image when the stored `cover`
 * is missing. Moodboard data is edited by hand in production; if `cover`
 * is ever left null the galleries would silently render empty, so we
 * recover gracefully from `images[0].image_url` instead of dropping items.
 */
export function withCover<T extends Partial<MoodboardItem>>(item: T): T {
  if (item.cover) return item;
  const firstImage = item.images?.[0]?.image_url;
  return { ...item, cover: firstImage ?? null };
}

export function withCovers<T extends Partial<MoodboardItem>>(items: T[]): T[] {
  return (items ?? []).map(withCover);
}
