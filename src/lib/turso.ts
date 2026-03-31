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
    private static cache = new Map<string, { data: any, timestamp: number }>();
    private static CACHE_TTL = 30000; // 30 seconds

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
            if (cached && (Date.now() - cached.timestamp < TursoHttpClient.CACHE_TTL)) {
                return cached.data;
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
            TursoHttpClient.cache.set(cacheKey, { data: result_data, timestamp: Date.now() });
        }
        return result_data;
    }
}
