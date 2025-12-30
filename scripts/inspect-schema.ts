
import 'dotenv/config';
import { TursoHttpClient } from '../src/lib/turso';
import fs from 'fs';

async function inspectSchema() {
    const dbUrl = process.env.TURSO_DATABASE_URL;
    const authToken = process.env.TURSO_AUTH_TOKEN;

    if (!dbUrl || !authToken) {
        console.error('Missing env vars');
        return;
    }

    const client = new TursoHttpClient(dbUrl, authToken);

    try {
        let output = '';
        output += '--- products table ---\n';
        const productsInfo = await client.execute({ sql: 'PRAGMA table_info(products)' });
        output += productsInfo.rows.map((r: any) => `${r.name} (${r.type})`).join(', ') + '\n';

        output += '\n--- product_images table ---\n';
        const imagesInfo = await client.execute({ sql: 'PRAGMA table_info(product_images)' });
        output += imagesInfo.rows.map((r: any) => `${r.name} (${r.type})`).join(', ') + '\n';

        fs.writeFileSync('schema_info.txt', output);
        console.log('Done');
    } catch (error) {
        console.error(error);
    }
}

inspectSchema();
