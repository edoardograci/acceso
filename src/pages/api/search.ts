// src/pages/api/search.ts
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
    product_id?: string;
    url?: string;
  };
}

interface VectorizeResult {
  matches: VectorizeMatch[];
}

interface EnrichmentData {
  images: {
    [imageId: string]: {
      embedding_text: string;
      enrichment: any;
    };
  };
  metadata: {
    all_keywords: string[];
    primary_category: string;
    materials: string[];
    colors: string[];
    styles: string[];
  };
}

interface SearchResult {
  product_id: string;
  image_url: string;
  score: number;
  match_count?: number;
  match_type?: string; // 'semantic' | 'keyword' | 'hybrid'
}

interface SearchResponse {
  success: boolean;
  results: SearchResult[];
  query: string;
  error?: string;
  debug?: any;
}

// Keyword matching configuration
const KEYWORD_BOOST = 0.25; // How much to boost keyword matches
const EXACT_MATCH_BOOST = 0.35; // Extra boost for exact keyword matches

function normalizeText(text: string): string {
  return text.toLowerCase().trim().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ');
}

function tokenize(text: string): string[] {
  return normalizeText(text).split(' ').filter(t => t.length > 0);
}

/**
 * Calculate keyword match score based on enrichment data
 */
function calculateKeywordScore(
  query: string,
  enrichment: EnrichmentData
): { score: number; matches: string[] } {
  const queryTokens = tokenize(query);
  const queryNormalized = normalizeText(query);

  let score = 0;
  const matches: string[] = [];

  // Check all keywords
  const allText = [
    ...enrichment.metadata.all_keywords,
    ...enrichment.metadata.materials,
    ...enrichment.metadata.colors,
    ...enrichment.metadata.styles
  ].map(k => normalizeText(k));

  for (const keyword of allText) {
    // Exact match (full query matches keyword)
    if (keyword === queryNormalized) {
      score += EXACT_MATCH_BOOST;
      matches.push(keyword);
      continue;
    }

    // Partial match (keyword contains query or vice versa)
    if (keyword.includes(queryNormalized) || queryNormalized.includes(keyword)) {
      score += KEYWORD_BOOST * 0.8;
      matches.push(keyword);
      continue;
    }

    // Token overlap
    const keywordTokens = tokenize(keyword);
    const overlap = queryTokens.filter(qt => keywordTokens.some(kt => kt.includes(qt) || qt.includes(kt)));
    if (overlap.length > 0) {
      score += KEYWORD_BOOST * (overlap.length / queryTokens.length) * 0.5;
      matches.push(keyword);
    }
  }

  return { score: Math.min(score, 0.5), matches }; // Cap keyword boost at 0.5
}

/**
 * Load static enrichment data
 */
async function loadEnrichment(): Promise<Map<string, EnrichmentData>> {
  try {
    // In production, this is bundled and cached by Cloudflare
    const response = await fetch(new URL('/moodboard-enrichment.json', 'https://acceso.pages.dev').toString());
    if (!response.ok) throw new Error('Failed to load enrichment');

    const data = await response.json();
    console.log(`Successfully loaded enrichment for ${Object.keys(data).length} products`);
    return new Map(Object.entries(data));
  } catch (error) {
    console.error('Failed to load enrichment data from https://acceso.pages.dev/moodboard-enrichment.json:', error);
    return new Map();
  }
}

export const POST: APIRoute = async ({ request, locals }) => {
  console.log('=== Hybrid Search API Called ===');

  try {
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

    if (!locals.runtime) {
      throw new Error('Server environment not initialized correctly');
    }

    const env = locals.runtime.env as any;

    if (!env || !env.AI || !env.VECTORIZE) {
      throw new Error('AI or VECTORIZE binding not available');
    }

    // Load static enrichment data
    const enrichmentMap = await loadEnrichment();
    console.log(`Loaded enrichment for ${enrichmentMap.size} products`);

    // 1. Generate query embedding
    const expandedQuery = `[PRODUCT IMAGE] ${query}`;

    let embeddingsResponse;
    try {
      embeddingsResponse = await env.AI.run(
        '@cf/qwen/qwen3-embedding-0.6b',
        { text: [expandedQuery] }
      ) as any;
    } catch (aiError: any) {
      throw new Error(`AI model failed: ${aiError.message}`);
    }

    if (!embeddingsResponse?.data?.[0]) {
      throw new Error('Failed to generate embeddings');
    }

    const queryEmbedding = embeddingsResponse.data[0];

    // 2. Query Vectorize for semantic matches
    // NOTE: Wildcards like "moodboard/*" are not supported in Cloudflare Vectorize filters.
    // Removed filter to ensure we get results, we will filter in code if needed.
    const vectorizeResult = await env.VECTORIZE.query(queryEmbedding, {
      topK: 100,
      returnMetadata: 'indexed',
      returnValues: false,
    });

    console.log(`Vectorize found ${vectorizeResult.matches?.length || 0} semantic matches`);

    if (!vectorizeResult.matches || vectorizeResult.matches.length === 0) {
      console.log('No semantic matches found in Vectorize');
      return new Response(
        JSON.stringify({
          success: true,
          results: [],
          query,
          debug: {
            semantic_matches: 0,
            keyword_matches: 0,
            filter_applied: 'none'
          }
        } as SearchResponse),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 3. Hybrid scoring: Combine semantic + keyword matches
    const scoredResults = new Map<string, {
      product_id: string;
      image_url: string;
      semantic_score: number;
      keyword_score: number;
      final_score: number;
      match_count: number;
      keyword_matches: string[];
      match_type: string;
    }>();

    for (const match of vectorizeResult.matches) {
      // Try to get product_id directly from metadata first
      let productId = match.metadata?.product_id;

      // Fallback: extract from folder or key if not in metadata
      if (!productId) {
        if (match.metadata?.folder) {
          const folderMatch = match.metadata.folder.match(/moodboard\/([^\/]+)\//);
          if (folderMatch) productId = folderMatch[1];
        }
        if (!productId && match.metadata?.key) {
          const keyMatch = match.metadata.key.match(/moodboard\/([^\/]+)\//);
          if (keyMatch) productId = keyMatch[1];
        }
      }

      if (!productId) {
        console.warn('Could not extract product_id from match metadata:', match.metadata);
        continue;
      }

      // Filter: Only include moodboard items in code since we removed the DB filter
      const isMoodboard = (match.metadata?.folder?.startsWith('moodboard/')) ||
        (match.metadata?.key?.startsWith('moodboard/'));

      if (!isMoodboard) {
        console.log(`Skipping non-moodboard item: ${productId} (${match.metadata?.folder})`);
        continue;
      }

      // Get image URL - prefer metadata.url, fallback to constructing from key
      const imageUrl = match.metadata?.url ||
        (match.metadata?.key ? `https://mood.acceso.design/${match.metadata.key}` : null);

      if (!imageUrl) {
        console.warn('Could not determine image URL for match:', match.id);
        continue;
      }

      // Get enrichment data for this product
      const enrichment = enrichmentMap.get(productId);
      if (!enrichment) {
        console.log(`No enrichment found for product_id: ${productId}. Available keys: ${Array.from(enrichmentMap.keys()).slice(0, 5)}...`);
      }

      // Calculate keyword score
      let keywordScore = 0;
      let keywordMatches: string[] = [];
      if (enrichment) {
        const keywordResult = calculateKeywordScore(query, enrichment);
        keywordScore = keywordResult.score;
        keywordMatches = keywordResult.matches;
      }

      // Combine scores
      const semanticScore = match.score;
      const finalScore = semanticScore + keywordScore;

      // Determine match type
      let matchType = 'semantic';
      if (keywordScore > 0.2) {
        matchType = semanticScore > 0.4 ? 'hybrid' : 'keyword';
      }

      const existing = scoredResults.get(productId);
      if (!existing) {
        scoredResults.set(productId, {
          product_id: productId,
          image_url: imageUrl,
          semantic_score: semanticScore,
          keyword_score: keywordScore,
          final_score: finalScore,
          match_count: 1,
          keyword_matches: keywordMatches,
          match_type: matchType
        });
      } else {
        // If multiple images from same product, keep the best combined score
        if (finalScore > existing.final_score) {
          existing.image_url = imageUrl;
          existing.semantic_score = Math.max(existing.semantic_score, semanticScore);
          existing.keyword_score = Math.max(existing.keyword_score, keywordScore);
          existing.final_score = finalScore;
        }
        existing.match_count++;
        existing.keyword_matches.push(...keywordMatches);
      }
    }

    // 4. Sort by final score and format results
    const rankedResults: SearchResult[] = Array.from(scoredResults.values())
      .sort((a, b) => b.final_score - a.final_score)
      .map(result => ({
        product_id: result.product_id,
        image_url: result.image_url,
        score: result.final_score,
        match_count: result.match_count,
        match_type: result.match_type
      }));

    console.log(`Hybrid search complete: ${rankedResults.length} results`);

    return new Response(
      JSON.stringify({
        success: true,
        results: rankedResults,
        query,
        debug: {
          semantic_matches: vectorizeResult.matches.length,
          hybrid_matches: rankedResults.length,
          enrichment_loaded: enrichmentMap.size > 0,
          filter_applied: 'in-code'
        }
      } as SearchResponse),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Hybrid search error:', error);
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