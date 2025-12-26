// scripts/generate-moodboard.ts
import 'dotenv/config';
import fs from 'fs';
import path from 'path';

interface Product {
  id: string;
  slug: string;
  name: string;
  designer: string | null;
  year: string | null;
  client: string | null;
  link: string | null;
  city: string | null;
  keywords: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

interface ProductImage {
  id: string;
  product_id: string;
  image_url: string;
  r2_key: string;
  position: number;
  created_at: string;
}

interface MoodboardItem extends Product {
  images: ProductImage[];
  cover: string | null;
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

    return obj;
  });

  return rows;
}

async function generateMoodboardData() {
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
    console.log('🎨 Fetching moodboard products from database...');

    // Fetch all published products
    const products = await queryTurso(
      dbUrl,
      authToken,
      'SELECT * FROM products WHERE status = ? ORDER BY created_at DESC',
      ['Published']
    );

    console.log(`✅ Found ${products.length} published products`);

    // Fetch all product images
    const allImages = await queryTurso(
      dbUrl,
      authToken,
      'SELECT * FROM product_images ORDER BY product_id, position',
      []
    );

    console.log(`✅ Found ${allImages.length} product images`);

    // Group images by product_id
    const imagesByProduct = new Map<string, ProductImage[]>();
    allImages.forEach((img: any) => {
      const productImages = imagesByProduct.get(img.product_id) || [];
      productImages.push({
        id: img.id,
        product_id: img.product_id,
        image_url: img.image_url,
        r2_key: img.r2_key,
        position: img.position,
        created_at: img.created_at
      });
      imagesByProduct.set(img.product_id, productImages);
    });

    // Combine products with their images
    const moodboardItems: MoodboardItem[] = products.map((p: any) => {
      const images = imagesByProduct.get(p.id) || [];
      const cover = images.length > 0 ? images[0].image_url : null;

      return {
        id: p.id,
        slug: p.slug,
        name: p.name,
        designer: p.designer,
        year: p.year,
        client: p.client,
        link: p.link,
        city: p.city,
        keywords: p.keywords,
        status: p.status,
        created_at: p.created_at,
        updated_at: p.updated_at,
        images,
        cover
      };
    });

    // Create public directory if it doesn't exist
    const publicDir = path.join(process.cwd(), 'public');
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }

    // Write to public/moodboard.json
    const outputPath = path.join(publicDir, 'moodboard.json');
    fs.writeFileSync(outputPath, JSON.stringify(moodboardItems, null, 2));
    console.log(`💾 Written ${moodboardItems.length} moodboard items to ${outputPath}`);

    // Create metadata file
    const metadataPath = path.join(publicDir, 'moodboard-metadata.json');
    const designers = [...new Set(moodboardItems.map(i => i.designer).filter(Boolean))].sort();
    fs.writeFileSync(
      metadataPath,
      JSON.stringify({
        lastUpdated: new Date().toISOString(),
        count: moodboardItems.length,
        totalImages: allImages.length,
        designers
      }, null, 2)
    );

    console.log('🎉 Moodboard data generated successfully!');
    console.log(`📊 Total products: ${moodboardItems.length}`);
    console.log(`📊 Total images: ${allImages.length}`);
    console.log(`📊 Designers: ${designers.length}`);
  } catch (error) {
    console.error('❌ Error generating moodboard data:', error);
    process.exit(1);
  }
}

generateMoodboardData();