/**
 * Environment bindings for the crawler worker
 */
export interface Env {
  // Workers AI for generating embeddings
  AI: Ai;

  // Vectorize index for storing content embeddings
  VECTORIZE: VectorizeIndex;

  // R2 bucket for storing raw HTML
  RAW_HTML: R2Bucket;

  // KV for tracking crawl state
  CRAWL_STATE: KVNamespace;

  // Configuration
  CRAWL_DOMAIN: string;
  RATE_LIMIT_MS: string;
  MAX_PAGES: string;
}

/**
 * Content types for classification
 */
export type ContentType = 'product' | 'recipe' | 'editorial' | 'support' | 'brand';

/**
 * A job in the crawl queue
 */
export interface CrawlJob {
  url: string;
  depth: number;
  parentUrl?: string;
  contentType?: ContentType;
}

/**
 * Extracted content from a page
 */
export interface ExtractedContent {
  url: string;
  title: string;
  description: string;
  contentType: ContentType;
  headings: string[];
  bodyText: string;
  productSpecs?: ProductSpecs;
  recipeData?: RecipeData;
  images: ImageInfo[];
  links: string[];
  rawHtml: string;
  extractedAt: string;
}

/**
 * Product specification data
 */
export interface ProductSpecs {
  sku?: string;
  name: string;
  category?: string;
  price?: string;
  features: string[];
  specifications: Record<string, string>;
}

/**
 * Recipe data
 */
export interface RecipeData {
  name: string;
  category?: string;
  ingredients: string[];
  instructions: string[];
  prepTime?: string;
  cookTime?: string;
  servings?: string;
}

/**
 * Image information
 */
export interface ImageInfo {
  src: string;
  alt: string;
  context: string; // surrounding text context
}

/**
 * A text chunk ready for embedding
 */
export interface TextChunk {
  id: string;
  text: string;
  metadata: ChunkMetadata;
}

/**
 * Metadata stored with each vector
 */
export interface ChunkMetadata {
  content_type: ContentType;
  source_url: string;
  chunk_text: string;
  page_title: string;
  product_sku?: string;
  product_category?: string;
  recipe_category?: string;
  image_url?: string;
  freshness_score: number;
  indexed_at: string;
}

/**
 * Crawl statistics
 */
export interface CrawlStats {
  totalPages: number;
  processedPages: number;
  failedPages: number;
  totalChunks: number;
  byContentType: Record<ContentType, number>;
  lastUpdated: string;
}
