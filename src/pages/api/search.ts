import type { APIRoute } from 'astro';

interface VectorizeMatch {
  id: string;
  score: number;
  metadata?: {
    product_id?: string;
    image_url?: string;
    position?: number;
  };
}

interface VectorizeResult {
  matches: VectorizeMatch[];
}

interface SearchResult {
  product_id: string;
  image_url: string;
  score: number;
}

interface SearchResponse {
  success: boolean;
  results: SearchResult[];
  query: string;
  error?: string;
}

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    // Parse request body
    const body = await request.json() as { query: string };
    const { query } = body;

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

    // Get Cloudflare environment
    const env = locals.runtime.env as any;

    // Step 1: Generate embeddings for query using Cloudflare AI
    const embeddingsResponse = await env.AI.run(
      '@cf/baai/bge-base-en-v1.5',
      { text: query }
    ) as any;

    if (!embeddingsResponse || !embeddingsResponse.data) {
      throw new Error('Failed to generate embeddings');
    }

    const queryEmbedding = embeddingsResponse.data[0];

    // Step 2: Query Vectorize index
    const vectorizeResult = (await env.VECTORIZE.query(queryEmbedding, {
      topK: 100, // Get many results to group by product
      returnMetadata: true,
    })) as VectorizeResult;

    if (!vectorizeResult.matches || vectorizeResult.matches.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          results: [],
          query,
        } as SearchResponse),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Step 3: Group by product_id and keep highest-scoring image
    const grouped = new Map<
      string,
      {
        score: number;
        image_url?: string;
      }
    >();

    for (const match of vectorizeResult.matches) {
      if (!match.metadata?.product_id) continue;

      const productId = match.metadata.product_id;
      const existing = grouped.get(productId);

      // Keep the match with the highest score
      if (!existing || match.score > existing.score) {
        grouped.set(productId, {
          score: match.score,
          image_url: match.metadata.image_url,
        });
      }
    }

    // Step 4: Convert to results array, sort by score descending
    const results: SearchResult[] = Array.from(grouped.entries())
      .map(([product_id, data]) => ({
        product_id,
        image_url: data.image_url || '',
        score: data.score,
      }))
      .filter((r) => r.image_url) // Only include results with images
      .sort((a, b) => b.score - a.score)
      .slice(0, 20); // Return top 20 products

    return new Response(
      JSON.stringify({
        success: true,
        results,
        query,
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
