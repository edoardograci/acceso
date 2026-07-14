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

    const typedArgs = args.map((arg: any) => {
        if (typeof arg === 'string') {
            return { type: 'text', value: arg };
        } else if (typeof arg === 'number') {
            return Number.isInteger(arg) ? { type: 'integer', value: String(arg) } : { type: 'float', value: String(arg) };
        } else if (arg === null) {
            return { type: 'null' };
        } else if (typeof arg === 'boolean') {
            return { type: 'integer', value: arg ? '1' : '0' };
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
        const tursoError = (pipelineResult as any)?.error;
        const detail = tursoError?.message || JSON.stringify(tursoError || pipelineResult || data);
        throw new Error(`Turso query failed: ${detail} | SQL: ${sql}`);
    }

    const result = pipelineResult.response.result;
    if (!result) throw new Error('No execute result in Turso API response');

    return result;
}

async function initCollectionsDb() {
    const dbUrl = process.env.TURSO_DATABASE_URL;
    const authToken = process.env.TURSO_AUTH_TOKEN;

    if (!dbUrl || !authToken) {
        console.error('❌ Error: Missing environment variables!');
        process.exit(1);
    }

    console.log('🔍 Initializing collections tables...');

    // Collection items for designers
    const createDesignersTable = `
    CREATE TABLE IF NOT EXISTS user_saved_designers (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      studio_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id, studio_id)
    );
  `;

    const createDesignersIndex = `
    CREATE INDEX IF NOT EXISTS idx_user_saved_designers_user_id ON user_saved_designers(user_id);
  `;

    // Collection items for moodboard objects
    const createObjectsTable = `
    CREATE TABLE IF NOT EXISTS user_saved_objects (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id, product_id)
    );
  `;

    const createObjectsIndex = `
    CREATE INDEX IF NOT EXISTS idx_user_saved_objects_user_id ON user_saved_objects(user_id);
  `;

    // Collection items for museums
    const createMuseumsTable = `
    CREATE TABLE IF NOT EXISTS user_saved_museums (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      museum_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id, museum_id)
    );
  `;

    const createMuseumsIndex = `
    CREATE INDEX IF NOT EXISTS idx_user_saved_museums_user_id ON user_saved_museums(user_id);
  `;

    // Collection items for universities
    const createUniversitiesTable = `
    CREATE TABLE IF NOT EXISTS user_saved_universities (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      university_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id, university_id)
    );
  `;

    const createUniversitiesIndex = `
    CREATE INDEX IF NOT EXISTS idx_user_saved_universities_user_id ON user_saved_universities(user_id);
  `;

    try {
        await queryTurso(dbUrl, authToken, createDesignersTable);
        console.log('✅ Created user_saved_designers table');

        await queryTurso(dbUrl, authToken, createDesignersIndex);
        console.log('✅ Created index on user_saved_designers');

        await queryTurso(dbUrl, authToken, createObjectsTable);
        console.log('✅ Created user_saved_objects table');

        await queryTurso(dbUrl, authToken, createObjectsIndex);
        console.log('✅ Created index on user_saved_objects');

        await queryTurso(dbUrl, authToken, createMuseumsTable);
        console.log('✅ Created user_saved_museums table');

        await queryTurso(dbUrl, authToken, createMuseumsIndex);
        console.log('✅ Created index on user_saved_museums');

        await queryTurso(dbUrl, authToken, createUniversitiesTable);
        console.log('✅ Created user_saved_universities table');

        await queryTurso(dbUrl, authToken, createUniversitiesIndex);
        console.log('✅ Created index on user_saved_universities');

        console.log('🎉 Database initialization complete!');
    } catch (error) {
        console.error('❌ Error initializing database:', error);
        process.exit(1);
    }
}

initCollectionsDb();
