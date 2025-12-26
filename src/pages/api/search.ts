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
}

interface SearchResponse {
  success: boolean;
  results: SearchResult[];
  query: string;
  error?: string;
  debug?: any;
}

export const POST: APIRoute = async ({ request, locals }) => {
  console.log('=== Search API Called ===');

  try {
    const body = await request.json() as { query: string };
    const { query } = body;

    console.log('Search query:', query);

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

    // Generate embeddings
    console.log('Generating embeddings for query:', query);
    let embeddingsResponse;
    try {
      embeddingsResponse = await env.AI.run(
        '@cf/qwen/qwen3-embedding-0.6b',
        { text: [query] }
      ) as any;
    } catch (aiError: any) {
      console.error('AI Run error:', aiError);
      throw new Error(`AI model failed: ${aiError.message}`);
    }

    if (!embeddingsResponse?.data?.[0]) {
      console.error('Empty response from AI model:', embeddingsResponse);
      throw new Error('Failed to generate embeddings');
    }

    const queryEmbedding = embeddingsResponse.data[0];

    if (!Array.isArray(queryEmbedding) || queryEmbedding.length !== 1024) {
      console.error('Invalid embedding format:', {
        type: typeof queryEmbedding,
        isArray: Array.isArray(queryEmbedding),
        length: queryEmbedding?.length
      });
      throw new Error(`Invalid embedding: expected array of 1024, got ${typeof queryEmbedding}`);
    }

    console.log('✓ Embedding generated');

    // Query Vectorize
    console.log('Querying Vectorize...');
    const vectorizeResult = (await env.VECTORIZE.query(queryEmbedding, {
      topK: 50,
      returnMetadata: 'all',
    })) as VectorizeResult;

    console.log(`Found ${vectorizeResult.matches?.length || 0} matches`);

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

    // Process matches with correct metadata extraction
    const grouped = new Map<string, { score: number; image_url: string }>();

    for (const match of vectorizeResult.matches) {
      if (!match.metadata?.folder || !match.metadata?.key) {
        console.log('Skipping match without required metadata');
        continue;
      }

      // Extract product_id from folder path
      // folder format: "moodboard/2210d7da-2e8c-80bb-bd05-d0724b60fdc3/"
      const folderMatch = match.metadata.folder.match(/moodboard\/([^\/]+)\//);
      if (!folderMatch) {
        console.log('Could not extract product_id from folder:', match.metadata.folder);
        continue;
      }
      const productId = folderMatch[1];

      // Construct image URL from key
      // key format: "moodboard/2210d7da-2e8c-80bb-bd05-d0724b60fdc3/1-a20a0570.webp"
      const imageUrl = `https://mood.acceso.design/${match.metadata.key}`;

      console.log('Extracted:', { productId, imageUrl, score: match.score });

      // Keep the highest scoring image for each product
      const existing = grouped.get(productId);
      if (!existing || match.score > existing.score) {
        grouped.set(productId, {
          score: match.score,
          image_url: imageUrl,
        });
      }
    }

    console.log(`Grouped into ${grouped.size} products`);

    // Convert to results array
    const results: SearchResult[] = Array.from(grouped.entries())
      .map(([product_id, data]) => ({
        product_id,
        image_url: data.image_url,
        score: data.score,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 20);

    console.log(`Returning ${results.length} results`);

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