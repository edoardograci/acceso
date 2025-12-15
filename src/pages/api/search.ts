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
  debug?: any; // Add debug info
}

export const POST: APIRoute = async ({ request, locals }) => {
  console.log('=== Search API Called ===');
  
  try {
    // Parse request body
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

    // Get Cloudflare environment
    const env = locals.runtime.env as any;
    
    console.log('Environment bindings available:', {
      hasAI: !!env.AI,
      hasVectorize: !!env.VECTORIZE
    });

    if (!env.AI) {
      throw new Error('AI binding not available');
    }
    
    if (!env.VECTORIZE) {
      throw new Error('VECTORIZE binding not available');
    }

    // Step 1: Generate embeddings for query
    console.log('Generating embeddings...');
    const embeddingsResponse = await env.AI.run(
      '@cf/baai/bge-m3',
      { text: [query] } // Note: some models expect an array
    ) as any;

    console.log('Embeddings response:', {
      hasData: !!embeddingsResponse?.data,
      dataLength: embeddingsResponse?.data?.[0]?.length,
      type: typeof embeddingsResponse?.data?.[0]
    });

    if (!embeddingsResponse || !embeddingsResponse.data || !embeddingsResponse.data[0]) {
      throw new Error('Failed to generate embeddings - no data returned');
    }

    const queryEmbedding = embeddingsResponse.data[0];
    
    // Verify embedding dimensions
    if (!Array.isArray(queryEmbedding)) {
      throw new Error('Embedding is not an array');
    }
    
    if (queryEmbedding.length !== 1024) {
      throw new Error(`Embedding dimension mismatch: got ${queryEmbedding.length}, expected 1024`);
    }

    console.log('Embedding generated successfully, length:', queryEmbedding.length);

    // Step 2: Query Vectorize index
    console.log('Querying Vectorize index...');
    
    try {
      const vectorizeResult = (await env.VECTORIZE.query(queryEmbedding, {
        topK: 50,
        returnMetadata: 'all', // Try 'all' instead of true
      })) as VectorizeResult;

      console.log('Vectorize result:', {
        matchCount: vectorizeResult.matches?.length || 0,
        hasMatches: !!vectorizeResult.matches
      });

      if (!vectorizeResult.matches || vectorizeResult.matches.length === 0) {
        console.log('No matches found in Vectorize');
        return new Response(
          JSON.stringify({
            success: true,
            results: [],
            query,
            debug: {
              embeddingGenerated: true,
              vectorizeQueried: true,
              matchesFound: 0
            }
          } as SearchResponse),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // Step 3: Group by product_id
      console.log('Processing matches...');
      const grouped = new Map<
        string,
        {
          score: number;
          image_url?: string;
        }
      >();

      for (const match of vectorizeResult.matches) {
        console.log('Match:', {
          id: match.id,
          score: match.score,
          hasMetadata: !!match.metadata,
          productId: match.metadata?.product_id
        });

        if (!match.metadata?.product_id) {
          console.log('Skipping match without product_id');
          continue;
        }

        const productId = match.metadata.product_id;
        const existing = grouped.get(productId);

        if (!existing || match.score > existing.score) {
          grouped.set(productId, {
            score: match.score,
            image_url: match.metadata.image_url,
          });
        }
      }

      console.log('Grouped products:', grouped.size);

      // Step 4: Convert to results array
      const results: SearchResult[] = Array.from(grouped.entries())
        .map(([product_id, data]) => ({
          product_id,
          image_url: data.image_url || '',
          score: data.score,
        }))
        .filter((r) => r.image_url)
        .sort((a, b) => b.score - a.score)
        .slice(0, 20);

      console.log('Final results count:', results.length);

      return new Response(
        JSON.stringify({
          success: true,
          results,
          query,
          debug: {
            totalMatches: vectorizeResult.matches.length,
            groupedProducts: grouped.size,
            finalResults: results.length
          }
        } as SearchResponse),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    } catch (vectorizeError) {
      console.error('Vectorize query error:', vectorizeError);
      throw new Error(`Vectorize query failed: ${vectorizeError.message}`);
    }
  } catch (error) {
    console.error('=== Search Error ===');
    console.error('Error details:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack');
    
    return new Response(
      JSON.stringify({
        success: false,
        results: [],
        query: '',
        error: error instanceof Error ? error.message : 'Search failed',
        debug: {
          errorType: error?.constructor?.name,
          errorMessage: error instanceof Error ? error.message : String(error)
        }
      } as SearchResponse),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};