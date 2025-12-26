// scripts/generate-spotlight.ts
import 'dotenv/config';
import fs from 'fs';
import path from 'path';

interface SpotlightItem {
  id: string;
  product_id: string;
  start_date: string;
  end_date: string | null;
  created_at: string;
  updated_at: string;
  product: {
    id: string;
    slug: string;
    name: string;
    designer: string | null;
    year: string | null;
    client: string | null;
    link: string | null;
    city: string | null;
    cover: string | null;
  } | null;
}

interface TursoHttpResponse {
  results: {
    type: string;
    response: {
      type: string;
      result: {
        cols: { name: string; decltype?: string }[];
        rows: any[][];
        affected_row_count: number;
        last_insert_rowid: string | null;
        replication_index: string;
      };
    };
  }[];
}

async function queryTurso(url: string, authToken: string, sql: string, args: any[] = []) {
  const baseUrl = url.replace('libsql://', 'https://');
  const endpoint = `${baseUrl}/v2/pipeline`;

  const typedArgs = args.map(arg => {
    if (typeof arg === 'string') {
      return { type: 'text', value: arg };
    } else if (typeof arg === 'number') {
      return Number.isInteger(arg) ? { type: 'integer', value: arg } : { type: 'float', value: arg };
    } else if (arg === null) {
      return { type: 'null' };
    } else if (typeof arg === 'boolean') {
      return { type: 'integer', value: arg ? 1 : 0 };
    }
    throw new Error(`Unsupported arg type: ${typeof arg}`);
  });

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${authToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requests: [
        {
          type: 'execute',
          stmt: { sql, args: typedArgs },
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Turso HTTP API error: ${response.status} ${errorText}`);
  }

  const data: TursoHttpResponse = await response.json();
  const pipelineResult = data.results?.[0];
  if (!pipelineResult || pipelineResult.type !== 'ok') {
    throw new Error('No valid pipeline result in Turso API response');
  }

  const result = pipelineResult.response.result;
  if (!result) throw new Error('No execute result in Turso API response');

  const rows = result.rows.map((row) => {
    const obj: any = {};
    result.cols.forEach((col, idx) => {
      let val = row[idx];
      if (val && typeof val === 'object' && 'type' in val) {
        if (val.type === 'null') {
          val = null;
        } else if (val.type === 'blob') {
          val = atob(val.base64 || '');
        } else {
          val = val.value;
        }
      }
      obj[col.name] = val;
    });

    // Normalize URLs to HTTPS
    if (typeof obj.image_url === 'string' && obj.image_url.startsWith('http://')) {
      obj.image_url = obj.image_url.replace('http://', 'https://');
    }
    if (typeof obj.cover === 'string' && obj.cover.startsWith('http://')) {
      obj.cover = obj.cover.replace('http://', 'https://');
    }

    return obj;
  });

  return rows;
}

async function generateSpotlightData() {
  const dbUrl = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!dbUrl || !authToken) {
    console.error('❌ Error: Missing environment variables!');
    console.error('Please create a .env file with:');
    console.error('  TURSO_DATABASE_URL=your_url');
    console.error('  TURSO_AUTH_TOKEN=your_token');
    process.exit(1);
  }

  try {
    console.log('🌟 Fetching spotlight items from database...');

    // Fetch all spotlight items with their associated product data
    const spotlightData = await queryTurso(
      dbUrl,
      authToken,
      `SELECT 
        s.id,
        s.product_id,
        s.start_date,
        s.end_date,
        s.created_at,
        s.updated_at,
        p.id as product_id,
        p.slug,
        p.name,
        p.designer,
        p.year,
        p.client,
        p.link,
        p.city
      FROM spotlight s
      LEFT JOIN products p ON s.product_id = p.id
      ORDER BY s.start_date DESC`,
      []
    );

    console.log(`✅ Found ${spotlightData.length} spotlight items`);

    // Get the first image for each product (as cover)
    const productIds = spotlightData.map((s: any) => s.product_id).filter(Boolean);
    const covers = new Map<string, string>();

    if (productIds.length > 0) {
      const placeholders = productIds.map(() => '?').join(',');
      const images = await queryTurso(
        dbUrl,
        authToken,
        `SELECT DISTINCT product_id, image_url 
         FROM product_images 
         WHERE product_id IN (${placeholders}) 
         AND position = 0`,
        productIds
      );

      images.forEach((img: any) => {
        covers.set(img.product_id, img.image_url);
      });
    }

    // Build spotlight items with product details
    const spotlightItems: SpotlightItem[] = spotlightData.map((s: any) => ({
      id: s.id,
      product_id: s.product_id,
      start_date: s.start_date,
      end_date: s.end_date,
      created_at: s.created_at,
      updated_at: s.updated_at,
      product: s.slug ? {
        id: s.product_id,
        slug: s.slug,
        name: s.name,
        designer: s.designer,
        year: s.year,
        client: s.client,
        link: s.link,
        city: s.city,
        cover: covers.get(s.product_id) || null
      } : null
    }));

    // Create public directory if it doesn't exist
    const publicDir = path.join(process.cwd(), 'public');
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }

    // Write to public/spotlight.json
    const outputPath = path.join(publicDir, 'spotlight.json');
    fs.writeFileSync(outputPath, JSON.stringify(spotlightItems, null, 2));
    console.log(`💾 Written ${spotlightItems.length} spotlight items to ${outputPath}`);

    // Create metadata file
    const metadataPath = path.join(publicDir, 'spotlight-metadata.json');
    const now = new Date();
    const activeSpotlights = spotlightItems.filter(s => {
      const start = new Date(s.start_date);
      const end = s.end_date ? new Date(s.end_date) : null;
      return start <= now && (!end || end >= now);
    });

    fs.writeFileSync(
      metadataPath,
      JSON.stringify({
        lastUpdated: now.toISOString(),
        count: spotlightItems.length,
        activeCount: activeSpotlights.length,
        dateRange: {
          earliest: spotlightItems[spotlightItems.length - 1]?.start_date || null,
          latest: spotlightItems[0]?.start_date || null
        }
      }, null, 2)
    );

    console.log('🎉 Spotlight data generated successfully!');
    console.log(`📊 Total spotlight items: ${spotlightItems.length}`);
    console.log(`📊 Currently active: ${activeSpotlights.length}`);
  } catch (error) {
    console.error('❌ Error generating spotlight data:', error);
    process.exit(1);
  }
}

generateSpotlightData();