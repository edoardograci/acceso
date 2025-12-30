
import 'dotenv/config';
import { TursoHttpClient } from '../src/lib/turso';
import fs from 'fs';

async function inspectData() {
    const dbUrl = process.env.TURSO_DATABASE_URL;
    const authToken = process.env.TURSO_AUTH_TOKEN;

    if (!dbUrl || !authToken) {
        console.error('Missing env vars');
        return;
    }

    const client = new TursoHttpClient(dbUrl, authToken);

    try {
        const result = await client.execute({
            sql: 'SELECT embedding_text, enrichment_json FROM product_images WHERE embedding_text IS NOT NULL LIMIT 3'
        });

        fs.writeFileSync('data_sample.txt', JSON.stringify(result.rows, null, 2));
        console.log('Done');
    } catch (error) {
        console.error(error);
    }
}

inspectData();
