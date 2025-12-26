// scripts/generate-studios.ts
import 'dotenv/config';
import fs from 'fs';
import path from 'path';

interface Studio {
  id: string;
  slug: string;
  name: string;
  city: string;
  cover: string | null;
  website: string | null;
  instagram: string | null;
  email: string | null;
  email2: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  status: string;
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

  // Wrap args in typed format for Turso HTTP API
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

  // Convert rows array to objects
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
    if (typeof obj.cover === 'string' && obj.cover.startsWith('http://')) {
      obj.cover = obj.cover.replace('http://', 'https://');
    }
    if (typeof obj.website === 'string' && obj.website.startsWith('http://')) {
      obj.website = obj.website.replace('http://', 'https://');
    }

    return obj;
  });

  return rows;
}

async function generateStudiosData() {
  // Validate environment variables
  const dbUrl = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!dbUrl || !authToken) {
    console.error('❌ Error: Missing environment variables!');
    console.error('Please create a .env file with:');
    console.error('  TURSO_DATABASE_URL=your_url');
    console.error('  TURSO_AUTH_TOKEN=your_token');
    console.error('\nCurrent values:');
    console.error('  TURSO_DATABASE_URL:', dbUrl ? 'Set' : 'Missing');
    console.error('  TURSO_AUTH_TOKEN:', authToken ? 'Set' : 'Missing');
    process.exit(1);
  }

  try {
    console.log('🔍 Fetching studios from database...');
    console.log('📡 Database URL:', dbUrl.replace(/:[^:]*@/, ':***@')); // Hide credentials in URL

    const rows = await queryTurso(
      dbUrl,
      authToken,
      'SELECT * FROM studios WHERE status = ? ORDER BY name ASC',
      ['Published']
    );

    const studios: Studio[] = rows.map((r: any) => ({
      id: r.id != null ? String(r.id) : '',
      slug: r.slug != null ? String(r.slug) : '',
      name: r.name != null ? String(r.name) : '',
      city: r.city != null ? String(r.city) : '',
      cover: r.cover ?? null,
      website: r.website ?? null,
      instagram: r.instagram ?? null,
      email: r.email ?? null,
      email2: r.email2 ?? null,
      address: r.address ?? null,
      latitude: r.latitude !== undefined && r.latitude !== null ? Number(r.latitude) : null,
      longitude: r.longitude !== undefined && r.longitude !== null ? Number(r.longitude) : null,
      status: r.status != null ? String(r.status) : '',
    }));

    console.log(`✅ Found ${studios.length} published studios`);

    // Create public directory if it doesn't exist
    const publicDir = path.join(process.cwd(), 'public');
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }

    // Write to public/studios.json
    const outputPath = path.join(publicDir, 'studios.json');
    fs.writeFileSync(outputPath, JSON.stringify(studios, null, 2));
    console.log(`💾 Written ${studios.length} studios to ${outputPath}`);

    // Also create a metadata file with last update time
    const metadataPath = path.join(publicDir, 'studios-metadata.json');
    const cities = [...new Set(studios.map((s) => s.city))].sort();
    fs.writeFileSync(
      metadataPath,
      JSON.stringify({
        lastUpdated: new Date().toISOString(),
        count: studios.length,
        cities,
      }, null, 2)
    );

    console.log('🎉 Static studio data generated successfully!');
    console.log(`📊 Cities: ${cities.join(', ')}`);
  } catch (error) {
    console.error('❌ Error generating studio data:', error);
    process.exit(1);
  }
}

generateStudiosData();