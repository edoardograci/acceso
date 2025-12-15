import type { APIRoute } from 'astro';

interface VectorizeMatch {
  id: string;
  score: number;
  metadata?: Record<string, any>; // Changed to accept any metadata structure
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

    const env = locals.runtime.env as any;
    
    console.log('Environment check:', {
      hasAI: !!env.AI,
      hasVectorize: !!env.VECTORIZE,
      envKeys: Object.keys(env)
    });

    if (!env.AI) {
      throw new Error('AI binding not available');
    }
    
    if (!env.VECTORIZE) {
      throw new Error('VECTORIZE binding not available');
    }

    // Generate embeddings
    console.log('Generating embeddings with @cf/baai/bge-m3...');
    
    const embeddingsResponse = await env.AI.run(
      '@cf/baai/bge-m3',
      { text: [query] }
    ) as any;

    console.log('Embeddings response structure:', {
      hasData: !!embeddingsResponse?.data,
      dataType: Array.isArray(embeddingsResponse?.data),
      firstElementType: embeddingsResponse?.data?.[0] ? typeof embeddingsResponse.data[0] : 'undefined',
      firstElementLength: Array.isArray(embeddingsResponse?.data?.[0]) ? embeddingsResponse.data[0].length : 'N/A'
    });

    if (!embeddingsResponse?.data?.[0]) {
      throw new Error('Failed to generate embeddings - invalid response structure');
    }

    const queryEmbedding = embeddingsResponse.data[0];
    
    if (!Array.isArray(queryEmbedding)) {
      throw new Error(`Embedding is not an array, got: ${typeof queryEmbedding}`);
    }
    
    if (queryEmbedding.length !== 1024) {
      throw new Error(`Embedding dimension mismatch: got ${queryEmbedding.length}, expected 1024`);
    }

    console.log('✓ Embedding generated:', queryEmbedding.length, 'dimensions');

    // Query Vectorize
    console.log('Querying Vectorize index...');
    
    const vectorizeResult = (await env.VECTORIZE.query(queryEmbedding, {
      topK: 10, // Reduced for debugging
      returnMetadata: 'all',
    })) as VectorizeResult;

    console.log('Vectorize raw result:', {
      matchCount: vectorizeResult.matches?.length || 0,
      firstMatchStructure: vectorizeResult.matches?.[0] ? {
        id: vectorizeResult.matches[0].id,
        score: vectorizeResult.matches[0].score,
        hasMetadata: !!vectorizeResult.matches[0].metadata,
        metadataKeys: vectorizeResult.matches[0].metadata ? Object.keys(vectorizeResult.matches[0].metadata) : [],
        fullMetadata: vectorizeResult.matches[0].metadata
      } : null
    });

    if (!vectorizeResult.matches || vectorizeResult.matches.length === 0) {
      console.log('No matches found');
      return new Response(
        JSON.stringify({
          success: true,
          results: [],
          query,
          debug: {
            embeddingGenerated: true,
            embeddingDimensions: queryEmbedding.length,
            vectorizeQueried: true,
            matchesFound: 0,
            note: 'Index might be empty or threshold too high'
          }
        } as SearchResponse),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Log all matches with their metadata
    console.log('All matches metadata:');
    vectorizeResult.matches.forEach((match, idx) => {
      console.log(`Match ${idx}:`, {
        id: match.id,
        score: match.score,
        metadata: match.metadata
      });
    });

    // Process matches - be flexible with metadata keys
    const grouped = new Map<string, { score: number; image_url?: string }>();

    for (const match of vectorizeResult.matches) {
      // Try different possible metadata key names
      const productId = match.metadata?.product_id || 
                       match.metadata?.productId || 
                       match.metadata?.id ||
                       match.id; // Fallback to vector ID

      const imageUrl = match.metadata?.image_url || 
                      match.metadata?.imageUrl || 
                      match.metadata?.url ||
                      match.metadata?.cover;

      console.log('Processing match:', {
        originalId: match.id,
        extractedProductId: productId,
        extractedImageUrl: imageUrl,
        score: match.score
      });

      if (!productId) {
        console.log('⚠️ Skipping match - no product ID found');
        continue;
      }

      const existing = grouped.get(productId);
      if (!existing || match.score > existing.score) {
        grouped.set(productId, {
          score: match.score,
          image_url: imageUrl,
        });
      }
    }

    console.log('Grouped results:', grouped.size);

    const results: SearchResult[] = Array.from(grouped.entries())
      .map(([product_id, data]) => ({
        product_id,
        image_url: data.image_url || '',
        score: data.score,
      }))
      .filter((r) => {
        const hasImage = !!r.image_url;
        if (!hasImage) {
          console.log('⚠️ Filtered out result without image:', r.product_id);
        }
        return hasImage;
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 20);

    console.log('Final results:', results.length);

    return new Response(
      JSON.stringify({
        success: true,
        results,
        query,
        debug: {
          totalMatches: vectorizeResult.matches.length,
          groupedProducts: grouped.size,
          finalResults: results.length,
          sampleMatch: vectorizeResult.matches[0] ? {
            id: vectorizeResult.matches[0].id,
            score: vectorizeResult.matches[0].score,
            metadata: vectorizeResult.matches[0].metadata
          } : null
        }
      } as SearchResponse),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('=== Search Error ===');
    console.error('Error:', error);
    console.error('Stack:', error instanceof Error ? error.stack : 'No stack');
    
    return new Response(
      JSON.stringify({
        success: false,
        results: [],
        query: '',
        error: error instanceof Error ? error.message : 'Search failed',
        debug: {
          errorType: error?.constructor?.name,
          errorMessage: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined
        }
      } as SearchResponse),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};