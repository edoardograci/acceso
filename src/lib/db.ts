import { createClient } from '@libsql/client';
import type { Studio } from './types';

// Check if environment variables exist
const dbUrl = import.meta.env.TURSO_DATABASE_URL;
const dbToken = import.meta.env.TURSO_AUTH_TOKEN;

if (!dbUrl || !dbToken) {
  console.error('Missing database credentials!');
  console.error('TURSO_DATABASE_URL:', dbUrl ? 'Set' : 'Missing');
  console.error('TURSO_AUTH_TOKEN:', dbToken ? 'Set' : 'Missing');
}

export const turso = createClient({
  url: dbUrl || '',
  authToken: dbToken || '',
});

export async function getStudioBySlug(slug: string): Promise<Studio | null> {
  try {
    console.log('Fetching studio by slug:', slug);
    
    const result = await turso.execute({
      sql: 'SELECT * FROM studios WHERE slug = ? AND status = ? LIMIT 1',
      args: [slug, 'Published']
    });

    console.log('Query result rows:', result.rows.length);

    if (result.rows.length === 0) return null;

    return result.rows[0] as unknown as Studio;
  } catch (error) {
    console.error('Error fetching studio:', error);
    throw error; // Re-throw to see the actual error
  }
}

export async function getAllStudios(): Promise<Studio[]> {
  try {
    console.log('Fetching all studios...');
    
    const result = await turso.execute({
      sql: 'SELECT * FROM studios WHERE status = ? ORDER BY name ASC',
      args: ['Published']
    });

    console.log('Found studios:', result.rows.length);
    
    return result.rows as unknown as Studio[];
  } catch (error) {
    console.error('Error fetching studios:', error);
    console.error('Error details:', JSON.stringify(error, null, 2));
    throw error; // Re-throw to see the actual error
  }
}

export async function getStudiosByCity(city: string): Promise<Studio[]> {
  try {
    console.log('Fetching studios by city:', city);
    
    const result = await turso.execute({
      sql: 'SELECT * FROM studios WHERE city = ? AND status = ? ORDER BY name ASC',
      args: [city, 'Published']
    });

    console.log('Found studios in city:', result.rows.length);

    return result.rows as unknown as Studio[];
  } catch (error) {
    console.error('Error fetching studios by city:', error);
    throw error;
  }
}