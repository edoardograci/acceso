// src/lib/turso.ts
export interface TursoHttpResponse {
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

export class TursoHttpClient {
    private baseUrl: string;
    private authToken: string;
    // Shared by every instance in the isolate and keyed by SQL+args, so each
    // distinct session id is a distinct key. Without a cap the map grows for the
    // whole life of the isolate and eventually trips the Worker memory limit —
    // same reason src/lib/db.ts caps its own cache.
    private static cache = new Map<string, { data: any, timestamp: number }>();
    private static CACHE_TTL = 30000; // 30 seconds
    private static MAX_CACHE_SIZE = 500;

    private static setCached(key: string, data: any) {
        // Deleting first moves a refreshed key to the end of the iteration
        // order, so the first key is always the oldest write and eviction is O(1).
        TursoHttpClient.cache.delete(key);
        if (TursoHttpClient.cache.size >= TursoHttpClient.MAX_CACHE_SIZE) {
            const oldestKey = TursoHttpClient.cache.keys().next().value;
            if (oldestKey !== undefined) TursoHttpClient.cache.delete(oldestKey);
        }
        TursoHttpClient.cache.set(key, { data, timestamp: Date.now() });
    }

    constructor(url: string, authToken: string) {
        if (!url) {
            console.error('[Turso] Database URL is missing');
            this.baseUrl = '';
        } else {
            this.baseUrl = url.replace('libsql://', 'https://');
        }
        this.authToken = authToken || '';
    }

    async execute(query: { sql: string; args?: any[] }, options: { useCache?: boolean } = {}) {
        const cacheKey = JSON.stringify({ sql: query.sql, args: query.args });

        if (options.useCache) {
            const cached = TursoHttpClient.cache.get(cacheKey);
            if (cached) {
                if (Date.now() - cached.timestamp < TursoHttpClient.CACHE_TTL) {
                    return cached.data;
                }
                // Drop it now instead of leaving a dead entry taking up a slot.
                TursoHttpClient.cache.delete(cacheKey);
            }
        }

        const endpoint = `${this.baseUrl}/v2/pipeline`;

        // Wrap args in typed format for Turso HTTP API
        const typedArgs = (query.args || []).map(arg => {
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

        const requestBody = {
            requests: [
                {
                    type: 'execute',
                    stmt: {
                        sql: query.sql,
                        args: typedArgs,
                    },
                },
            ],
        };

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${this.authToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            const errorText = await response.text();
            // Several API routes echo error.message straight back to the caller,
            // so the details stay in the logs and the thrown message stays generic.
            console.error(`[Turso] HTTP ${response.status}: ${errorText}`);
            throw new Error(`Turso HTTP API error: ${response.status}`);
        }

        const data: TursoHttpResponse = await response.json();
        const pipelineResult = data.results?.[0];
        if (!pipelineResult || pipelineResult.type !== 'ok') {
            const tursoError = (pipelineResult as any)?.error;
            const detail = tursoError?.message
                ? `${tursoError.message}${tursoError.code ? ` (${tursoError.code})` : ''}`
                : JSON.stringify(tursoError || pipelineResult || data);
            // Same reason as above: the statement text names tables and columns,
            // so it belongs in the logs and never in a thrown message that a
            // route might hand to the client.
            console.error(`[Turso] query failed: ${detail} | SQL: ${query.sql}`);
            throw new Error('Turso query failed');
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
                    } else if (val.type === 'integer' || val.type === 'float') {
                        val = Number(val.value);
                    } else {
                        val = val.value;
                    }
                }
                obj[col.name] = val;
            });
            return obj;
        });

        const result_data = { rows, rowsAffected: result.affected_row_count };
        if (options.useCache) {
            TursoHttpClient.setCached(cacheKey, result_data);
        }
        return result_data;
    }
}
