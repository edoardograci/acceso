export interface Studio {
  id: string;
  notion_id: string;
  slug: string;
  status: string;
  name: string;
  number: number | null;
  city: string;
  city_slug: string;
  cover: string | null;
  website: string | null;
  instagram: string | null;
  email: string | null;
  email2: string | null;
  phone: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  description: string | null;
  country: string | null;
  country_slug: string | null;
  created_at: string;
  updated_at: string;
}

export interface Museum {
  id: string;
  slug: string;
  name: string;
  city: string | null;
  city_slug: string | null;
  country: string | null;
  country_slug: string | null;
  address: string | null;
  image: string | null;
  description: string | null;
  website: string | null;
  instagram: string | null;
  facebook: string | null;
  contact: string | null;
  opening_hours: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface University {
  id: string;
  slug: string;
  name: string;
  city: string | null;
  city_slug: string | null;
  country: string | null;
  country_slug: string | null;
  address: string | null;
  image: string | null;
  description: string | null;
  website: string | null;
  instagram: string | null;
  contact: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface NavLink {
  label: string;
  href: string;
}
