/**
 * Environment bindings for the generative worker
 */
export interface Env {
  // Workers AI for embeddings
  AI: Ai;

  // Vectorize index for RAG retrieval
  VECTORIZE: VectorizeIndex;

  // R2 bucket for storing generated images
  IMAGES: R2Bucket;

  // KV for caching and state tracking
  CACHE: KVNamespace;

  // Configuration
  EDS_ORIGIN: string;
  DA_ORG: string;
  DA_REPO: string;

  // API Keys (secrets)
  ANTHROPIC_API_KEY: string;
  GOOGLE_API_KEY: string;
  GOOGLE_SERVICE_ACCOUNT_JSON: string;
  DA_TOKEN: string;

  // Optional configuration
  VERTEX_AI_REGION?: string;
}

/**
 * Content types from RAG
 */
export type ContentType = 'product' | 'recipe' | 'editorial' | 'support' | 'brand';

/**
 * Layout IDs matching layouts.ts templates
 */
export type LayoutId =
  | 'product-detail'
  | 'product-comparison'
  | 'recipe-collection'
  | 'use-case-landing'
  | 'support'
  | 'category-browse'
  | 'educational'
  | 'promotional'
  | 'quick-answer'
  | 'lifestyle';

/**
 * Intent classification result
 */
export interface IntentClassification {
  intentType: 'product_info' | 'recipe' | 'comparison' | 'support' | 'general';
  confidence: number;
  layoutId: LayoutId;
  contentTypes: ContentType[];
  entities: {
    products: string[];
    ingredients: string[];
    goals: string[];
  };
}

/**
 * RAG chunk from Vectorize
 */
export interface RAGChunk {
  id: string;
  score: number;
  text: string;
  metadata: {
    content_type: ContentType;
    source_url: string;
    page_title: string;
    product_sku?: string;
    product_category?: string;
    recipe_category?: string;
    image_url?: string;
  };
}

/**
 * RAG context assembled for generation
 */
export interface RAGContext {
  chunks: RAGChunk[];
  totalRelevance: number;
  hasProductInfo: boolean;
  hasRecipes: boolean;
  sourceUrls: string[];
}

/**
 * Block types supported by EDS
 */
export type BlockType = 'hero' | 'cards' | 'columns' | 'split-content' | 'text' | 'cta' | 'faq'
  | 'benefits-grid' | 'recipe-cards' | 'product-recommendation' | 'tips-banner'
  | 'ingredient-search' | 'recipe-filter-bar' | 'recipe-grid' | 'quick-view-modal' | 'technique-spotlight'
  | 'support-hero' | 'diagnosis-card' | 'troubleshooting-steps' | 'support-cta';

/**
 * Generated content structure
 */
export interface GeneratedContent {
  headline: string;
  subheadline: string;
  blocks: ContentBlock[];
  meta: {
    title: string;
    description: string;
  };
  citations: Citation[];
}

/**
 * A content block in the generated page
 */
export interface ContentBlock {
  id: string;
  type: BlockType;
  variant?: string;
  sectionStyle?: 'default' | 'highlight' | 'dark';
  content: HeroContent | CardsContent | ColumnsContent | SplitContentContent | TextContent | CTAContent | FAQContent;
}

/**
 * Hero block content
 */
export interface HeroContent {
  headline: string;
  subheadline: string;
  ctaText?: string;
  ctaUrl?: string;
  imagePrompt: string;
  imageUrl?: string;
}

/**
 * Cards block content
 */
export interface CardsContent {
  cards: Array<{
    title: string;
    description: string;
    imagePrompt: string;
    imageUrl?: string;
    linkText?: string;
    linkUrl?: string;
  }>;
}

/**
 * Columns block content
 */
export interface ColumnsContent {
  columns: Array<{
    headline?: string;
    text: string;
    imagePrompt?: string;
    imageUrl?: string;
  }>;
}

/**
 * Text block content
 */
export interface TextContent {
  headline?: string;
  body: string;
}

/**
 * CTA block content
 */
export interface CTAContent {
  headline: string;
  text?: string;
  buttonText: string;
  buttonUrl: string;
  isGenerative?: boolean;
  generationHint?: string;
}

/**
 * FAQ block content
 */
export interface FAQContent {
  items: Array<{
    question: string;
    answer: string;
  }>;
}

/**
 * Split-Content block content
 */
export interface SplitContentContent {
  eyebrow?: string;
  headline: string;
  body: string;
  price?: string;
  priceNote?: string;
  primaryCtaText: string;
  primaryCtaUrl: string;
  secondaryCtaText?: string;
  secondaryCtaUrl?: string;
  imagePrompt: string;
  imageUrl?: string;
}

/**
 * Citation for sourced content
 */
export interface Citation {
  text: string;
  sourceUrl: string;
  sourceTitle: string;
}

/**
 * Layout decision - now derived from templates, not Gemini
 * @deprecated Use LayoutTemplate from prompts/layouts.ts instead
 */
export interface LayoutDecision {
  blocks: Array<{
    blockType: BlockType;
    contentIndex: number;
    variant: string;
    width: 'full' | 'contained';
    sectionStyle?: 'default' | 'highlight' | 'dark';
  }>;
}

/**
 * Image generation request
 */
export interface ImageRequest {
  id: string;
  blockId: string;
  prompt: string;
  aspectRatio: string;
  size: 'hero' | 'card' | 'column' | 'thumbnail';
}

/**
 * Generated image result
 */
export interface GeneratedImage {
  id: string;
  url: string;
  prompt: string;
}

/**
 * SSE event types
 */
export type SSEEvent =
  | { event: 'layout'; data: { blocks: BlockType[] } }
  | { event: 'block-start'; data: { blockId: string; blockType: BlockType; position: number } }
  | { event: 'block-content'; data: { blockId: string; html: string; partial: boolean; sectionStyle?: 'default' | 'highlight' | 'dark' } }
  | { event: 'block-complete'; data: { blockId: string } }
  | { event: 'image-placeholder'; data: { imageId: string; blockId: string } }
  | { event: 'image-ready'; data: { imageId: string; url: string } }
  | { event: 'generation-complete'; data: { pageUrl: string } }
  | { event: 'error'; data: { code: string; message: string; recoverable: boolean } };

/**
 * Generation state stored in KV
 */
export interface GenerationState {
  status: 'pending' | 'in_progress' | 'complete' | 'failed';
  query: string;
  slug: string;
  startedAt: string;
  completedAt?: string;
  error?: string;
  pageUrl?: string;
}

/**
 * Brand compliance result
 */
export interface BrandComplianceResult {
  isCompliant: boolean;
  score: number;
  violations: Array<{
    type: 'banned_word' | 'tone_mismatch' | 'off_brand_claim';
    text: string;
    suggestion: string;
  }>;
}
