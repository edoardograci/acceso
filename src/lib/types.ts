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


export interface NavLink {
  label: string;
  href: string;
}
