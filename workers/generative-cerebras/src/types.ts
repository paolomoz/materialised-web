/**
 * Environment bindings for the generative worker
 */
export interface Env {
  // Workers AI for embeddings
  AI: Ai;

  // Vectorize index for RAG retrieval
  VECTORIZE: VectorizeIndex;

  // Vectorize index for image asset lookup (Priority 3)
  IMAGE_INDEX?: VectorizeIndex;

  // R2 bucket for storing generated images
  IMAGES: R2Bucket;

  // KV for caching and state tracking
  CACHE: KVNamespace;

  // Configuration
  EDS_ORIGIN: string;
  DA_ORG: string;
  DA_REPO: string;

  // API Keys (secrets)
  CEREBRAS_API_KEY: string;
  GOOGLE_API_KEY: string;
  GOOGLE_SERVICE_ACCOUNT_JSON: string;
  DA_TOKEN: string;
  FAL_API_KEY?: string;

  // Optional configuration
  VERTEX_AI_REGION?: string;

  // Image provider: 'fal' for FLUX Schnell, 'imagen' for Google Imagen 3
  IMAGE_PROVIDER?: 'fal' | 'imagen';

  // D1 database binding for adaptive-web (for image migration)
  ADAPTIVE_WEB_DB?: D1Database;
}

/**
 * Content types from RAG
 */
export type ContentType = 'product' | 'recipe' | 'editorial' | 'support' | 'brand';

/**
 * User context extracted from queries for personalization
 * Comprehensive context capturing dietary, health, cooking, cultural, household, and practical factors
 */
export interface UserContext {
  // === DIETARY & HEALTH ===
  dietary?: {
    avoid: string[];        // Ingredients to exclude: ["carrots", "nuts", "shellfish"]
    preferences: string[];  // Dietary lifestyles: ["vegan", "keto", "gluten-free", "paleo"]
  };
  health?: {
    conditions: string[];   // Health conditions: ["diabetes", "heart-health", "digestive", "pregnancy"]
    goals: string[];        // Health goals: ["weight-loss", "muscle-gain", "immune-boost", "energy"]
    considerations: string[]; // Special considerations: ["low-sodium", "low-sugar", "high-fiber"]
  };

  // === AUDIENCE & HOUSEHOLD ===
  audience?: string[];      // Target audience: ["children", "family", "guests", "toddlers", "seniors"]
  household?: {
    pickyEaters: string[];  // Picky eater constraints: ["no-green-vegetables", "no-mixed-textures"]
    texture: string[];      // Texture preferences: ["smooth", "chunky", "creamy", "crispy"]
    spiceLevel: string[];   // Spice tolerance: ["mild", "medium", "spicy", "no-spice"]
    portions: string[];     // Portion needs: ["single-serving", "family-sized", "crowd", "meal-prep-batch"]
  };

  // === COOKING CONTEXT ===
  cooking?: {
    equipment: string[];    // Available equipment: ["vitamix", "instant-pot", "air-fryer", "no-stove"]
    skillLevel: string[];   // Skill level: ["beginner", "intermediate", "advanced", "chef"]
    kitchen: string[];      // Kitchen constraints: ["small-kitchen", "dorm-room", "outdoor", "rv"]
  };

  // === CULTURAL & REGIONAL ===
  cultural?: {
    cuisine: string[];      // Cuisine preferences: ["mexican", "asian", "mediterranean", "italian", "indian"]
    religious: string[];    // Religious dietary laws: ["halal", "kosher", "fasting", "no-alcohol"]
    regional: string[];     // Regional context: ["southern", "midwest", "coastal", "farm-fresh"]
  };

  // === TIME & OCCASION ===
  occasion?: string[];      // Time/event context: ["breakfast", "weeknight", "holiday", "party", "game-day"]
  season?: string[];        // Seasonal context: ["fall", "winter", "summer", "spring", "holiday-season"]

  // === LIFESTYLE & ACTIVITY ===
  lifestyle?: string[];     // Activity/lifestyle: ["athletic", "sedentary", "busy-professional", "stay-at-home"]
  fitnessContext?: string[]; // Fitness context: ["pre-workout", "post-workout", "recovery", "competition-day"]

  // === PRACTICAL CONSTRAINTS ===
  constraints?: string[];   // Time/effort: ["quick", "5-minutes", "make-ahead", "one-pot"]
  budget?: string[];        // Budget context: ["budget-friendly", "premium-ingredients", "pantry-staples"]
  shopping?: string[];      // Shopping context: ["costco-bulk", "farmers-market", "grocery-delivery", "what-i-have"]
  storage?: string[];       // Storage needs: ["freezer-friendly", "no-leftovers", "meal-prep", "lunchbox"]

  // === INGREDIENTS ON HAND ===
  available?: string[];     // Ingredients user has: ["chicken", "rice", "broccoli"]
  mustUse?: string[];       // Ingredients that must be used: ["ripe-bananas", "leftover-turkey"]
}

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
  | 'lifestyle'
  | 'single-recipe'
  | 'campaign-landing'
  | 'about-story';

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
    userContext?: UserContext;
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
 * RAG result quality level for confidence-based fallbacks
 */
export type RAGQuality = 'high' | 'medium' | 'low';

/**
 * RAG context assembled for generation
 */
export interface RAGContext {
  chunks: RAGChunk[];
  totalRelevance: number;
  hasProductInfo: boolean;
  hasRecipes: boolean;
  sourceUrls: string[];
  /** [IMPROVEMENT #14] Quality assessment for confidence-based fallbacks */
  quality: RAGQuality;
}

/**
 * Block types supported by EDS
 */
export type BlockType = 'hero' | 'cards' | 'columns' | 'split-content' | 'text' | 'cta' | 'faq'
  | 'benefits-grid' | 'recipe-cards' | 'product-recommendation' | 'tips-banner'
  | 'ingredient-search' | 'recipe-filter-bar' | 'recipe-grid' | 'quick-view-modal' | 'technique-spotlight'
  | 'support-hero' | 'diagnosis-card' | 'troubleshooting-steps' | 'support-cta'
  | 'comparison-table' | 'use-case-cards' | 'verdict-card' | 'comparison-cta'
  | 'product-hero' | 'specs-table' | 'feature-highlights' | 'included-accessories' | 'product-cta'
  | 'product-cards'
  // Single Recipe blocks
  | 'recipe-hero' | 'ingredients-list' | 'recipe-steps' | 'nutrition-facts' | 'recipe-tips'
  // Campaign Landing blocks
  | 'countdown-timer' | 'testimonials'
  // About/Story blocks
  | 'timeline' | 'team-cards';

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
 * CTA type for distinguishing actionable buttons
 * - 'explore': Triggers new page generation (e.g., "See recipes", "Learn more")
 * - 'shop': Links to product/cart pages (e.g., "Shop Now", "Add to Cart")
 * - 'external': Links to external sites (e.g., "Find Retailer")
 */
export type CTAType = 'explore' | 'shop' | 'external';

/**
 * CTA block content
 */
export interface CTAContent {
  headline: string;
  text?: string;
  buttonText: string;
  buttonUrl: string;
  ctaType?: CTAType;
  generationHint?: string; // Required for explore CTAs - describes what to generate
  isGenerative?: boolean; // @deprecated Use ctaType === 'explore' instead
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
  // RAG-only mode: Images are resolved server-side, no SSE events needed
  // | { event: 'image-placeholder'; data: { imageId: string; blockId: string } }
  // | { event: 'image-ready'; data: { imageId: string; url: string } }
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

/**
 * Query history entry for session context
 */
export interface QueryHistoryEntry {
  query: string;
  intent: string;
  entities: {
    products: string[];
    ingredients: string[];
    goals: string[];
    userContext?: UserContext;
  };
}

/**
 * Session context parameter passed from frontend
 * Contains previous queries from the same browser tab session
 */
export interface SessionContextParam {
  previousQueries: QueryHistoryEntry[];
}

// ============================================================================
// Content Provenance Types
// ============================================================================

/**
 * Content source classification
 */
export type ContentSourceType = 'rag' | 'generated' | 'hybrid';

/**
 * Recipe source classification
 */
export type RecipeSourceType =
  | 'vitamix_official'   // Exact match to vitamix.com recipe
  | 'rag_adapted'        // Based on RAG but modified
  | 'ai_generated'       // No RAG source, fully generated
  | 'unknown';           // Unable to determine

/**
 * Provenance tracking for a content block
 */
export interface BlockProvenanceInfo {
  blockId: string;
  blockType: string;
  source: ContentSourceType;
  ragContribution: number;     // 0-100 percentage
  ragSourceUrls: string[];
}

/**
 * Provenance tracking for a recipe
 */
export interface RecipeProvenanceInfo {
  recipeName: string;
  source: RecipeSourceType;
  originalUrl?: string;
  matchScore?: number;         // Similarity to original (0-1)
}

/**
 * Overall content provenance summary
 */
export interface ContentProvenanceSummary {
  overallSource: ContentSourceType;
  ragPercentage: number;
  totalBlocks: number;
  recipeCount: number;
  aiGeneratedRecipes: number;
  sourceUrls: string[];
}
