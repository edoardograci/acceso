import 'dotenv/config';

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

    return result;
}

async function addCreatedAtIndexes() {
    const dbUrl = process.env.TURSO_DATABASE_URL;
    const authToken = process.env.TURSO_AUTH_TOKEN;

    if (!dbUrl || !authToken) {
        console.error('❌ Error: Missing environment variables!');
        process.exit(1);
    }

    console.log('🔍 Adding created_at indexes to collections tables...');

    const createDesignersCreatedAtIndex = `
    CREATE INDEX IF NOT EXISTS idx_user_saved_designers_created_at 
    ON user_saved_designers(user_id, created_at DESC);
  `;

    const createObjectsCreatedAtIndex = `
    CREATE INDEX IF NOT EXISTS idx_user_saved_objects_created_at 
    ON user_saved_objects(user_id, created_at DESC);
  `;

    try {
        await queryTurso(dbUrl, authToken, createDesignersCreatedAtIndex);
        console.log('✅ Created created_at index on user_saved_designers');

        await queryTurso(dbUrl, authToken, createObjectsCreatedAtIndex);
        console.log('✅ Created created_at index on user_saved_objects');

        console.log('🎉 Migration complete!');
    } catch (error) {
        console.error('❌ Error running migration:', error);
        process.exit(1);
    }
}

addCreatedAtIndexes();
