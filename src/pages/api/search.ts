import type { APIRoute } from 'astro';

interface VectorizeMatch {
  id: string;
  score: number;
  metadata?: {
    filename?: string;
    folder?: string;
    key?: string;
    item_id?: number;
    timestamp?: number;
    info?: string;
  };
}

interface VectorizeResult {
  matches: VectorizeMatch[];
}

interface SearchResult {
  product_id: string;
  image_url: string;
  score: number;
  match_count?: number; // Debug/Internal use
}

interface SearchResponse {
  success: boolean;
  results: SearchResult[];
  query: string;
  error?: string;
  debug?: any;
}

// --------------------------------------------------------------------------
// Configuration & heuristics
// --------------------------------------------------------------------------

const ADJECTIVES = new Set([
  'modern', 'vintage', 'retro', 'antique', 'industrial', 'minimal', 'minimalist', 'contemporary',
  'wood', 'wooden', 'metal', 'metallic', 'glass', 'marble', 'stone', 'ceramic', 'concrete', 'leather', 'fabric', 'textile', 'plastic', 'acrylic',
  'red', 'blue', 'green', 'black', 'white', 'yellow', 'orange', 'purple', 'grey', 'gray', 'brown', 'beige', 'gold', 'silver', 'copper', 'brass',
  'floor', 'table', 'wall', 'ceiling', 'suspension', 'pendant', 'outdoor', 'indoor',
  'small', 'large', 'big', 'tall', 'low', 'high', 'round', 'square', 'rectangular',
  'italian', 'scandinavian', 'japanese', 'french', 'german',
  'living', 'dining', 'bedroom', 'kitchen', 'office', 'desk'
]);

const CONFIG = {
  GENERIC: {
    topK: 50,       // Limited to 50 when returnMetadata='all'
    threshold: 0.60 // Looser threshold to avoid empty results
  },
  SPECIFIC: {
    topK: 50,       // Focused search
    threshold: 0.72 // Stricter threshold for precision
  }
};

// --------------------------------------------------------------------------
// Helper Functions
// --------------------------------------------------------------------------

function classifyQuery(query: string): 'GENERIC' | 'SPECIFIC' {
  const tokens = query.toLowerCase().trim().split(/\s+/).filter(t => t.length > 0);

  // Rule 1: Long queries are specific
  if (tokens.length > 2) return 'SPECIFIC';

  // Rule 2: Short queries with adjectives/constraints are specific
  const hasAdjective = tokens.some(token => ADJECTIVES.has(token));
  if (hasAdjective) return 'SPECIFIC';

  // Default: Generic (e.g., "lamp", "chair")
  return 'GENERIC';
}

function expandQuery(query: string, type: 'GENERIC' | 'SPECIFIC'): string {
  // Type Anchoring: Must match the format in Turso 'embedding_text' column
  // Found format: [PRODUCT IMAGE]\nObject type: ...\nCategory: design...
  const prefix = '[PRODUCT IMAGE]';
  const cleanQuery = query.trim();

  if (type === 'GENERIC') {
    // Structured expansion for generic queries to match indexed documents
    // This maximizes dot product with the structured metadata in the DB
    return `${prefix}
Object type: ${cleanQuery}
Category: design
Platform: Acceso moodboard`;
  }

  // Specific queries: Anchor to the same domain
  return `${prefix} ${cleanQuery}`;
}

export const POST: APIRoute = async ({ request, locals }) => {
  console.log('=== Search API Called ===');

  try {
    const body = await request.json() as { query: string };
    const { query } = body;

    console.log('Original query:', query);

    if (!query || query.trim().length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          results: [],
          query: '',
          error: 'Query is required',
        } as SearchResponse),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!locals.runtime) {
      console.error('locals.runtime is undefined. Environment bindings missing.');
      throw new Error('Server environment not initialized correctly');
    }

    const env = locals.runtime.env as any;

    if (!env || !env.AI || !env.VECTORIZE) {
      console.error('Bindings missing in env:', { hasAi: !!env?.AI, hasVectorize: !!env?.VECTORIZE });
      throw new Error('AI or VECTORIZE binding not available');
    }

    // 1. Classify & Expand
    const queryType = classifyQuery(query);
    const expandedQuery = expandQuery(query, queryType);
    const config = CONFIG[queryType];

    console.log(`Query classified as: ${queryType}`);
    console.log(`Expanded query:\n${expandedQuery}`);
    console.log(`Using config: topK=${config.topK}, threshold=${config.threshold}`);

    // 2. Generate Embeddings
    let embeddingsResponse;
    try {
      embeddingsResponse = await env.AI.run(
        '@cf/qwen/qwen3-embedding-0.6b',
        { text: [expandedQuery] }
      ) as any;
    } catch (aiError: any) {
      console.error('AI Run error:', aiError);
      throw new Error(`AI model failed: ${aiError.message}`);
    }

    if (!embeddingsResponse?.data?.[0]) {
      throw new Error('Failed to generate embeddings');
    }

    const queryEmbedding = embeddingsResponse.data[0];

    // 3. Query Vectorize
    const vectorizeResult = (await env.VECTORIZE.query(queryEmbedding, {
      topK: config.topK, // Dynamic topK
      returnMetadata: 'all',
    })) as VectorizeResult;

    console.log(`Vectorize found ${vectorizeResult.matches?.length || 0} raw matches`);

    if (!vectorizeResult.matches || vectorizeResult.matches.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          results: [],
          query,
          debug: { type: queryType, matches: 0 }
        } as SearchResponse),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 4. Process, Group, and Rank
    const groups = new Map<string, {
      scores: number[];
      bestImage: string;
      maxScore: number;
    }>();

    for (const match of vectorizeResult.matches) {
      // Basic filtering based on dynamic threshold
      // We process match.score to normalized filtering
      // But first we must just collect valid metadata

      if (!match.metadata?.folder || !match.metadata?.key) continue;

      const folderMatch = match.metadata.folder.match(/moodboard\/([^\/]+)\//);
      if (!folderMatch) continue;

      // Apply strict threshold check early
      if (match.score < config.threshold) continue;

      const productId = folderMatch[1];
      const imageUrl = `https://mood.acceso.design/${match.metadata.key}`;

      const existing = groups.get(productId);
      if (!existing) {
        groups.set(productId, {
          scores: [match.score],
          bestImage: imageUrl,
          maxScore: match.score
        });
      } else {
        existing.scores.push(match.score);
        if (match.score > existing.maxScore) {
          existing.bestImage = imageUrl;
          existing.maxScore = match.score;
        }
      }
    }

    console.log(`Filtered and grouped into ${groups.size} products`);

    // 5. Advanced Ranking calculation
    const rankedResults: SearchResult[] = Array.from(groups.entries())
      .map(([productId, data]) => {
        const count = data.scores.length;
        const avgScore = data.scores.reduce((a, b) => a + b, 0) / count;

        // Base score is the best match
        let finalScore = data.maxScore;

        // Boost for multiple matches (implies product is visually consistent with query across multiple angles/images)
        if (count > 1) {
          // Add a weighted average boost
          // Heuristic: If we have multiple matches, we trust the average more
          finalScore = (finalScore * 0.7) + (avgScore * 0.3);

          // Add a small log boost for count to favor "rich" results
          // Cap the boost to avoid counting thousands of low quality matches
          finalScore += Math.log10(count) * 0.05;
        } else {
          // Slight penalty for single matches that are weak
          // (helps reduce random noise in generic queries)
          if (finalScore < (config.threshold + 0.05)) {
            finalScore *= 0.95;
          }
        }

        return {
          product_id: productId,
          image_url: data.bestImage,
          score: finalScore,
          match_count: count
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 20); // Top 20

    // 6. Final Response
    return new Response(
      JSON.stringify({
        success: true,
        results: rankedResults,
        query,
        debug: {
          type: queryType,
          expanded: expandedQuery,
          threshold: config.threshold,
          raw_matches: vectorizeResult.matches.length,
          grouped_matches: groups.size
        }
      } as SearchResponse),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Search error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        results: [],
        query: '',
        error: error instanceof Error ? error.message : 'Search failed',
      } as SearchResponse),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};