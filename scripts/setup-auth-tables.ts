// scripts/setup-auth-tables.ts
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

  // Wrap args in typed format for Turso HTTP API
  const typedArgs = args.map((arg: any) => {
    if (typeof arg === 'string') {
      return { type: 'text', value: arg };
    } else if (typeof arg === 'number') {
      return Number.isInteger(arg) ? { type: 'integer', value: String(arg) } : { type: 'float', value: String(arg) };
    } else if (arg === null) {
      return { type: 'null' };
    } else if (typeof arg === 'boolean') {
      return { type: 'integer', value: arg ? '1' : '0' };
    } else {
      throw new Error(`Unsupported arg type: ${typeof arg}`);
    }
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
          stmt: {
            sql: sql,
            args: typedArgs,
          },
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

  return pipelineResult.response.result;
}

async function setupAuthTables() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url || !authToken) {
    throw new Error('TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set');
  }

  console.log('Setting up authentication tables...\n');

  try {
    // Create users table
    console.log('Creating users table...');
    await queryTurso(url, authToken, `
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        email_verified INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch())
      )
    `);
    console.log('✓ Users table created');

    // Create sessions table
    console.log('Creating sessions table...');
    await queryTurso(url, authToken, `
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    console.log('✓ Sessions table created');

    // Create oauth_accounts table
    console.log('Creating oauth_accounts table...');
    await queryTurso(url, authToken, `
      CREATE TABLE IF NOT EXISTS oauth_accounts (
        provider TEXT NOT NULL,
        provider_user_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        PRIMARY KEY (provider, provider_user_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    console.log('✓ OAuth accounts table created');

    // Create magic_link_tokens table
    console.log('Creating magic_link_tokens table...');
    await queryTurso(url, authToken, `
      CREATE TABLE IF NOT EXISTS magic_link_tokens (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        email TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    console.log('✓ Magic link tokens table created');

    // Create indexes
    console.log('Creating indexes...');
    await queryTurso(url, authToken, `
      CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)
    `);
    await queryTurso(url, authToken, `
      CREATE INDEX IF NOT EXISTS idx_oauth_user_id ON oauth_accounts(user_id)
    `);
    await queryTurso(url, authToken, `
      CREATE INDEX IF NOT EXISTS idx_magic_link_email ON magic_link_tokens(email)
    `);
    console.log('✓ Indexes created');

    console.log('\n✅ All authentication tables created successfully!');
  } catch (error) {
    console.error('\n❌ Error setting up auth tables:', error);
    process.exit(1);
  }
}

setupAuthTables();

