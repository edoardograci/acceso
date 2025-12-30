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

export const POST: APIRoute = async ({ request, locals }) => {
  console.log('=== Hybrid Search API Called ===');

  // Helper functions
  function normalizeText(text: string): string {
    return text.toLowerCase().trim().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ');
  }

  function tokenize(text: string): string[] {
    return normalizeText(text).split(' ').filter(t => t.length > 0);
  }

  function calculateKeywordScore(query: string, enrichment: EnrichmentData): { score: number; matches: string[] } {
    const KEYWORD_BOOST = 0.25;
    const EXACT_MATCH_BOOST = 0.35;

    const queryTokens = tokenize(query);
    const queryNormalized = normalizeText(query);

    let score = 0;
    const matches: string[] = [];

    const allText = [
      ...(enrichment.metadata.all_keywords || []),
      ...(enrichment.metadata.materials || []),
      ...(enrichment.metadata.colors || []),
      ...(enrichment.metadata.styles || []),
    ].map(k => normalizeText(k));

    for (const keyword of allText) {
      if (keyword === queryNormalized) {
        score += EXACT_MATCH_BOOST;
        matches.push(keyword);
        continue;
      }
      if (keyword.includes(queryNormalized) || queryNormalized.includes(keyword)) {
        score += KEYWORD_BOOST * 0.8;
        matches.push(keyword);
        continue;
      }
      const keywordTokens = tokenize(keyword);
      const overlap = queryTokens.filter(qt => keywordTokens.some(kt => kt.includes(qt) || qt.includes(kt)));
      if (overlap.length > 0) {
        score += KEYWORD_BOOST * (overlap.length / queryTokens.length) * 0.5;
        matches.push(keyword);
      }
    }

    return { score: Math.min(score, 0.5), matches };
  }

  async function loadEnrichment(origin: string): Promise<Map<string, EnrichmentData>> {
    try {
      const enrichmentUrl = new URL('/moodboard-enrichment.json', origin).toString();
      const response = await fetch(enrichmentUrl);

      if (!response.ok) {
        console.warn(`Failed to load from ${enrichmentUrl}, trying fallback.`);
        const fallbackUrl = 'https://acceso-4xj.pages.dev/moodboard-enrichment.json';
        const fallbackResponse = await fetch(fallbackUrl);
        if (!fallbackResponse.ok) throw new Error('Failed to load enrichment data from fallback');
        const data = await fallbackResponse.json();
        return new Map(Object.entries(data));
      }

      const data = await response.json();
      return new Map(Object.entries(data));
    } catch (error) {
      console.error('Failed to load enrichment data:', error);
      return new Map();
    }
  }

  try {
    const body = await request.json() as { query: string };
    const { query } = body;

    if (!query || query.trim() === '') {
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

    const url = new URL(request.url);
    const enrichmentMap = await loadEnrichment(url.origin);
    console.log(`Loaded enrichment for ${enrichmentMap.size} products`);

    // Generate embedding
    const expandedQuery = `[PRODUCT IMAGE] ${query}`;
    const embeddingsResponse = await env.AI.run('@cf/qwen/qwen3-embedding-0.6b', { text: [expandedQuery] }) as any;

    if (!embeddingsResponse?.data?.[0]) {
      throw new Error('Failed to generate embeddings');
    }

    const queryEmbedding = embeddingsResponse.data[0];

    // Query Vectorize
    const vectorizeResult = await env.VECTORIZE.query(queryEmbedding, {
      topK: 100,
      returnMetadata: 'indexed',
      returnValues: false,
    });

    console.log(`Vectorize found ${vectorizeResult.matches?.length || 0} semantic matches`);

    if (!vectorizeResult.matches || vectorizeResult.matches.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          results: [],
          query,
          debug: {
            semantic_matches: 0,
            keyword_matches: 0,
            filter_applied: 'none',
          },
        } as SearchResponse),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

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
      let product_id = match.metadata?.product_id;

      if (!product_id) {
        if (match.metadata?.folder) {
          const folderMatch = match.metadata.folder.match(/moodboard\/([^\/]+)\//);
          if (folderMatch) product_id = folderMatch[1];
        }
        if (!product_id && match.metadata?.key) {
          const keyMatch = match.metadata.key.match(/moodboard\/([^\/]+)\//);
          if (keyMatch) product_id = keyMatch[1];
        }
      }

      if (!product_id) continue;

      const isMoodboard = (match.metadata?.folder?.startsWith('moodboard/')) ||
        (match.metadata?.key?.startsWith('moodboard/'));
      if (!isMoodboard) continue;

      const image_url = match.metadata?.url || (match.metadata?.key ? `https://mood.acceso.design/${match.metadata.key}` : null);
      if (!image_url) continue;

      const enrichment = enrichmentMap.get(product_id);

      let keyword_score = 0;
      let keyword_matches: string[] = [];
      if (enrichment) {
        const keywordResult = calculateKeywordScore(query, enrichment);
        keyword_score = keywordResult.score;
        keyword_matches = keywordResult.matches;
      }

      const semantic_score = match.score;
      const final_score = semantic_score + keyword_score;

      let match_type = 'semantic';
      if (keyword_score > 0.2) match_type = semantic_score > 0.4 ? 'hybrid' : 'keyword';

      const existing = scoredResults.get(product_id);
      if (!existing) {
        scoredResults.set(product_id, {
          product_id,
          image_url,
          semantic_score,
          keyword_score,
          final_score,
          match_count: 1,
          keyword_matches,
          match_type,
        });
      } else {
        if (final_score > existing.final_score) {
          existing.image_url = image_url;
          existing.semantic_score = Math.max(existing.semantic_score, semantic_score);
          existing.keyword_score = Math.max(existing.keyword_score, keyword_score);
          existing.final_score = final_score;
        }
        existing.match_count++;
        existing.keyword_matches.push(...keyword_matches);
      }
    }

    const rankedResults: SearchResult[] = Array.from(scoredResults.values())
      .sort((a, b) => b.final_score - a.final_score)
      .map(result => ({
        product_id: result.product_id,
        image_url: result.image_url,
        score: result.final_score,
        match_count: result.match_count,
        match_type: result.match_type,
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
          filter_applied: 'in-code',
        },
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