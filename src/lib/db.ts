import { createClient } from '@libsql/client';
import type { Studio } from './types';

export const turso = createClient({
  url: import.meta.env.TURSO_DATABASE_URL,
  authToken: import.meta.env.TURSO_AUTH_TOKEN,
});

export async function getStudioBySlug(slug: string): Promise<Studio | null> {
  try {
    const result = await turso.execute({
      sql: 'SELECT * FROM studios WHERE slug = ? AND status = ? LIMIT 1',
      args: [slug, 'Published']
    });

    if (result.rows.length === 0) return null;

    return result.rows[0] as unknown as Studio;
  } catch (error) {
    console.error('Error fetching studio:', error);
    return null;
  }
}

export async function getAllStudios(): Promise<Studio[]> {
  try {
    const result = await turso.execute({
      sql: 'SELECT * FROM studios WHERE status = ? ORDER BY name ASC',
      args: ['Published']
    });

    return result.rows as unknown as Studio[];
  } catch (error) {
    console.error('Error fetching studios:', error);
    return [];
  }
}

export async function getStudiosByCity(city: string): Promise<Studio[]> {
  try {
    const result = await turso.execute({
      sql: 'SELECT * FROM studios WHERE city = ? AND status = ? ORDER BY name ASC',
      args: [city, 'Published']
    });

    return result.rows as unknown as Studio[];
  } catch (error) {
    console.error('Error fetching studios by city:', error);
    return [];
  }
}