import type {
  Env,
  IntentClassification,
  RAGContext,
  GeneratedContent,
  LayoutDecision,
  ImageRequest,
  GeneratedImage,
  SSEEvent,
  SessionContextParam,
} from '../types';
import { classifyIntent, generateContent, validateBrandCompliance } from '../ai-clients/cerebras';
import { analyzeQuery } from '../ai-clients/gemini';
// RAG_ONLY_IMAGES mode: Image generation is disabled, all images resolved from RAG
// Keeping ImageProvider type for compatibility with OrchestratorContext
// generateImages and decideImageStrategy are no longer used
import { type ImageProvider } from '../ai-clients/image-router';
import { smartRetrieve, findProductImage, findBestImage, type ImageContext, type ImageLookupResult } from './rag';
import { getLayoutForIntent, adjustLayoutForRAGContent, templateToLayoutDecision, type LayoutTemplate } from '../prompts/layouts';
import { validateContentSafety, type ContentSafetyResult } from './content-safety';
import { getFallbackContent, getFallbackLayout } from './fallback-content';
import { validateTopicRelevance, getTopicRejectionResponse } from './topic-relevance';

/**
 * Check if a video URL is valid (must be an actual external video URL)
 * We only accept http/https URLs that look like actual video content
 * (e.g., YouTube, Vimeo, or video file extensions)
 */
function isValidVideoUrl(url: string | undefined): boolean {
  if (!url) return false;
  const trimmed = url.trim().toLowerCase();

  // Reject empty, "#", or placeholder-like URLs
  if (!trimmed || trimmed === '#' || trimmed === '/#' || trimmed.startsWith('#')) return false;

  // Must be an external URL (not relative paths which are likely placeholders)
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) return false;

  // Check for known video platforms or video file extensions
  const videoPatterns = [
    'youtube.com', 'youtu.be', 'vimeo.com', 'wistia.com',
    '.mp4', '.webm', '.mov', '.avi', '.m4v'
  ];

  return videoPatterns.some(pattern => trimmed.includes(pattern));
}

/**
 * Orchestration context passed between stages
 */
interface OrchestrationContext {
  query: string;
  slug: string;
  intent?: IntentClassification;
  ragContext?: RAGContext;
  entities?: {
    products: string[];
    ingredients: string[];
    goals: string[];
    keywords: string[];
  };
  content?: GeneratedContent;
  layout?: LayoutDecision;
  images?: GeneratedImage[];
}

/**
 * Callback for streaming SSE events
 */
type SSECallback = (event: SSEEvent) => void;

/**
 * Main orchestration function - coordinates all AI services
 * @param imageProvider Optional override for image provider ('fal' | 'lora' | 'imagen')
 * @param sessionContext Optional session context with previous queries from the same browser tab
 */
export async function orchestrate(
  query: string,
  slug: string,
  env: Env,
  onEvent: SSECallback,
  imageProvider?: ImageProvider,
  sessionContext?: SessionContextParam
): Promise<{
  content: GeneratedContent;
  layout: LayoutDecision;
  images: GeneratedImage[];
  html: string;
}> {
  const ctx: OrchestrationContext = { query, slug };

  try {
    // Stage 1: Intent Classification (fast, blocking)
    // Pass session context so classifier can interpret short queries in context
    ctx.intent = await classifyIntent(query, env, sessionContext);

    // Stage 1.5: Topic Relevance / Food Angle Finder
    // Find a food/culinary angle for any query, only reject truly offensive content
    const topicResult = await validateTopicRelevance(query, ctx.intent, env);
    if (!topicResult.relevant) {
      console.log('[Orchestrator] Query rejected:', {
        query,
        reason: topicResult.rejectionMessage,
      });

      onEvent({
        event: 'error',
        data: {
          code: 'OFF_TOPIC_QUERY',
          message: topicResult.rejectionMessage || 'This request contains content I cannot help with.',
          recoverable: true,
        },
      });

      return getTopicRejectionResponse(topicResult);
    }

    // Use the suggested query (food angle) for content generation
    // This reframes queries like "Formula One" → "race day snacks and drinks"
    const effectiveQuery = topicResult.suggestedQuery || query;
    if (topicResult.suggestedQuery && topicResult.suggestedQuery !== query) {
      console.log('[Orchestrator] Query reframed for food angle:', {
        original: query,
        reframed: topicResult.suggestedQuery,
        foodAngle: topicResult.foodAngle,
      });
    }

    // Stage 2: Parallel - Smart RAG retrieval + Query analysis
    // Use effectiveQuery (food-angle reframed query) for retrieval and analysis
    const [ragContext, entities] = await Promise.all([
      smartRetrieve(effectiveQuery, ctx.intent, env, ctx.intent.entities.userContext),
      analyzeQuery(effectiveQuery, env),
    ]);

    ctx.ragContext = ragContext;
    ctx.entities = entities;

    // Get layout template based on intent (needed for content generation)
    // Now passes LLM's layoutId and confidence for smarter selection
    // Also passes original query for bare product name detection
    let layoutTemplate = getLayoutForIntent(
      ctx.intent.intentType,
      ctx.intent.contentTypes,
      ctx.intent.entities,
      ctx.intent.layoutId,  // LLM's layout choice
      ctx.intent.confidence, // LLM's confidence score
      query  // Original query for bare product name check
    );

    // Adjust layout based on RAG results (e.g., no recipes found → fallback)
    // Pass query to prevent bare product queries from being overridden
    layoutTemplate = adjustLayoutForRAGContent(layoutTemplate, ragContext, query);

    console.log('Layout selection:', {
      query,
      intentType: ctx.intent.intentType,
      llmLayoutId: ctx.intent.layoutId,
      llmConfidence: ctx.intent.confidence,
      contentTypes: ctx.intent.contentTypes,
      entities: ctx.intent.entities,
      selectedLayout: layoutTemplate.id,
    });

    // Extract block types from layout template for preview
    const blockTypes = layoutTemplate.sections.flatMap(
      section => section.blocks.map(block => block.type)
    );

    // Send layout preview
    onEvent({
      event: 'layout',
      data: { blocks: blockTypes },
    });

    // Stage 3: Content Generation (main LLM call)
    // Use effectiveQuery to generate food-focused content
    ctx.content = await generateContent(effectiveQuery, ragContext, ctx.intent, layoutTemplate, env, sessionContext);

    // Stage 4: Derive layout from template + Resolve images from RAG
    // No Gemini call - we use the predefined layout template directly
    const layout = templateToLayoutDecision(layoutTemplate);

    console.log('Layout decision from template:', {
      layoutId: layoutTemplate.id,
      blocks: layout.blocks.map(b => ({
        type: b.blockType,
        variant: b.variant,
        width: b.width,
      })),
    });

    ctx.layout = layout;

    // Stage 5: Stream content IMMEDIATELY with placeholder images
    // This shows content to users as fast as possible
    console.log('[Orchestrator] Streaming content with placeholder images');
    await streamBlockContent(ctx.content, layout, ctx.slug, onEvent, ctx.ragContext, new Map());

    // Stage 5b: Resolve images in BACKGROUND (parallel)
    // Images are resolved after content is visible, emitting image-ready events
    const imageResolutionPromise = resolveImagesInBackground(ctx.content, ragContext, env, onEvent);

    // Initialize empty images array (will be populated after resolution)
    ctx.images = [];

    // Stage 6: Quality Validation (runs in parallel with image resolution)
    const fullText = extractFullText(ctx.content);
    const safetyResult = await validateContentSafety(
      fullText,
      { query, intent: ctx.intent.intentType },
      env
    );

    // Log safety validation results
    console.log('[Orchestrator] Content safety validation:', {
      safe: safetyResult.safe,
      blocked: safetyResult.blocked,
      scores: safetyResult.scores,
      flagCount: safetyResult.flags.length,
      timing: safetyResult.timing,
    });

    // BLOCKING: Replace content with fallback if blocked
    if (safetyResult.blocked) {
      console.error('[Orchestrator] Content BLOCKED for safety:', {
        reason: safetyResult.reason,
        flags: safetyResult.flags.slice(0, 5), // Log first 5 flags
        scores: safetyResult.scores,
      });

      // Log blocked content to KV for monitoring (async, don't await)
      logBlockedContent(env, query, safetyResult).catch(err =>
        console.error('[Orchestrator] Failed to log blocked content:', err)
      );

      // Replace with safe fallback content
      ctx.content = getFallbackContent(ctx.intent.intentType, safetyResult.reason);
      ctx.layout = getFallbackLayout(ctx.intent.intentType);

      // Signal blocked event
      onEvent({
        event: 'error',
        data: {
          code: 'CONTENT_SAFETY_BLOCK',
          message: 'Content was blocked for safety. Showing fallback content.',
          recoverable: true,
        },
      });
    } else if (!safetyResult.safe) {
      // Content passed but has warnings - log for monitoring
      console.warn('[Orchestrator] Content safety warnings:', {
        flags: safetyResult.flags,
        suggestions: safetyResult.suggestions,
      });
    }

    // Wait for image resolution to complete before signaling done
    // (images continue to stream via image-ready events during this time)
    await imageResolutionPromise;
    console.log('[Orchestrator] All images resolved');

    // Build final HTML (images already have predictable URLs based on slug)
    // Pass RAG context so product-hero can use existing images
    const html = buildEDSHTML(ctx.content, ctx.layout, ctx.slug, ctx.ragContext);

    // Signal completion
    onEvent({
      event: 'generation-complete',
      data: { pageUrl: `/discover/${slug}` },
    });

    return {
      content: ctx.content,
      layout: ctx.layout,
      images: ctx.images,
      html,
    };
  } catch (error) {
    onEvent({
      event: 'error',
      data: {
        code: 'GENERATION_FAILED',
        message: (error as Error).message,
        recoverable: false,
      },
    });
    throw error;
  }
}

/**
 * Resolved image info for a block
 */
interface ResolvedImage {
  url: string;
  source: 'map' | 'rag' | 'index';
  score?: number;
  alt?: string;
  cropNeeded?: boolean;
}

/**
 * Image request for background resolution
 */
interface ImageResolveRequest {
  id: string;
  context: ImageContext;
  query: string;
  blockType: string;
}

/**
 * Transparent 1x1 placeholder for shimmer effect
 * The shimmer animation is handled by CSS on img[data-gen-image]
 */
const PLACEHOLDER_IMAGE = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

/**
 * Collect all image requests from content blocks without resolving them.
 * Used to build the list of images that need to be resolved in background.
 */
function collectImageRequests(content: GeneratedContent): ImageResolveRequest[] {
  const requests: ImageResolveRequest[] = [];

  for (const block of content.blocks) {
    const blockContent = block.content as any;

    switch (block.type) {
      case 'hero': {
        const query = blockContent.imagePrompt || blockContent.headline || 'Vitamix blending lifestyle';
        requests.push({ id: 'hero', context: 'lifestyle', query, blockType: 'hero' });
        break;
      }

      case 'cards': {
        if (blockContent.cards) {
          for (let i = 0; i < blockContent.cards.length; i++) {
            const card = blockContent.cards[i];
            const query = card.imagePrompt || card.title || 'Vitamix feature';
            requests.push({ id: `card-${i}`, context: 'lifestyle', query, blockType: 'cards' });
          }
        }
        break;
      }

      case 'product-cards': {
        if (blockContent.products) {
          for (let i = 0; i < blockContent.products.length; i++) {
            const product = blockContent.products[i];
            const query = product.name || 'Vitamix blender';
            requests.push({ id: `product-card-${block.id}-${i}`, context: 'product', query, blockType: 'product-cards' });
          }
        }
        break;
      }

      case 'columns': {
        if (blockContent.columns) {
          for (let i = 0; i < blockContent.columns.length; i++) {
            const col = blockContent.columns[i];
            const query = col.imagePrompt || col.headline || 'Vitamix feature';
            requests.push({ id: `col-${i}`, context: 'lifestyle', query, blockType: 'columns' });
          }
        }
        break;
      }

      case 'split-content': {
        const imageId = `split-content-${block.id}`;
        const query = blockContent.imagePrompt || blockContent.headline || 'Vitamix lifestyle';
        requests.push({ id: imageId, context: 'lifestyle', query, blockType: 'split-content' });
        break;
      }

      case 'recipe-cards': {
        if (blockContent.recipes) {
          for (let i = 0; i < blockContent.recipes.length; i++) {
            const recipe = blockContent.recipes[i];
            const query = recipe.title || 'Vitamix recipe';
            requests.push({ id: `recipe-${i}`, context: 'recipe', query, blockType: 'recipe-cards' });
          }
        }
        break;
      }

      case 'product-hero': {
        const imageId = `product-hero-${block.id}`;
        const productName = blockContent.productName || 'Vitamix blender';
        requests.push({ id: imageId, context: 'product', query: productName, blockType: 'product-hero' });
        break;
      }

      case 'recipe-hero': {
        const imageId = `recipe-hero-${block.id}`;
        const query = blockContent.title || blockContent.headline || 'Vitamix recipe';
        requests.push({ id: imageId, context: 'recipe', query, blockType: 'recipe-hero' });
        break;
      }

      case 'recipe-grid': {
        if (blockContent.recipes) {
          for (let i = 0; i < blockContent.recipes.length; i++) {
            const recipe = blockContent.recipes[i];
            const query = recipe.title || 'Vitamix recipe';
            requests.push({ id: `grid-recipe-${i}`, context: 'recipe', query, blockType: 'recipe-cards' });
          }
        }
        break;
      }

      case 'technique-spotlight': {
        const imageId = `technique-${block.id}`;
        const query = blockContent.title || 'Vitamix technique';
        requests.push({ id: imageId, context: 'lifestyle', query, blockType: 'cards' });
        break;
      }

      case 'feature-highlights': {
        if (blockContent.features) {
          for (let i = 0; i < blockContent.features.length; i++) {
            const feature = blockContent.features[i];
            const query = feature.title || 'Vitamix feature';
            requests.push({ id: `feature-highlights-${block.id}-${i}`, context: 'lifestyle', query, blockType: 'cards' });
          }
        }
        break;
      }

      case 'included-accessories': {
        if (blockContent.accessories) {
          for (let i = 0; i < blockContent.accessories.length; i++) {
            const accessory = blockContent.accessories[i];
            const query = accessory.name || 'Vitamix accessory';
            requests.push({ id: `included-accessories-${block.id}-${i}`, context: 'product', query, blockType: 'product-cards' });
          }
        }
        break;
      }

      case 'troubleshooting-steps': {
        if (blockContent.steps) {
          for (let i = 0; i < blockContent.steps.length; i++) {
            const step = blockContent.steps[i];
            const query = step.title || 'Vitamix troubleshooting';
            requests.push({ id: `step-${block.id}-${i}`, context: 'lifestyle', query, blockType: 'cards' });
          }
        }
        break;
      }

      case 'product-recommendation': {
        const imageId = `product-rec-${block.id}`;
        const query = blockContent.productName || 'Vitamix blender';
        requests.push({ id: imageId, context: 'product', query, blockType: 'product-cards' });
        break;
      }

      // Blocks without images - no action needed
      case 'text':
      case 'cta':
      case 'faq':
      case 'benefits-grid':
      case 'comparison-table':
      case 'nutrition-table':
      case 'specifications':
      case 'reviews':
      case 'warranty-info':
        break;

      default:
        // Unknown block type - skip
        break;
    }
  }

  return requests;
}

/**
 * Resolve images in background and emit image-ready events as each completes.
 * All images are resolved in parallel for maximum speed.
 */
async function resolveImagesInBackground(
  content: GeneratedContent,
  ragContext: RAGContext,
  env: Env,
  onEvent: SSECallback
): Promise<void> {
  const requests = collectImageRequests(content);

  if (requests.length === 0) {
    console.log('[resolveImagesInBackground] No images to resolve');
    return;
  }

  console.log(`[resolveImagesInBackground] Starting parallel resolution of ${requests.length} images`);

  // Resolve all images in parallel, emit events as each completes
  await Promise.all(requests.map(async (req) => {
    try {
      const image = await findBestImage(req.context, req.query, ragContext, env, req.blockType);
      if (image) {
        onEvent({
          event: 'image-ready',
          data: {
            imageId: req.id,
            url: image.url,
            cropNeeded: image.cropNeeded || false,
          },
        });
      }
    } catch (err) {
      console.error(`[resolveImagesInBackground] Failed to resolve image ${req.id}:`, err);
      // Don't emit error - image will stay as placeholder
    }
  }));

  console.log('[resolveImagesInBackground] All images resolved');
}

/**
 * Resolve all images for content blocks using RAG-only lookup.
 * No image generation - always returns best available RAG image.
 *
 * Returns a map of imageId -> resolved image URL
 * e.g., 'hero' -> 'https://...', 'card-0' -> 'https://...', etc.
 */
async function resolveBlockImages(
  content: GeneratedContent,
  ragContext: RAGContext,
  env: Env
): Promise<Map<string, ResolvedImage | null>> {
  const resolved = new Map<string, ResolvedImage | null>();

  for (const block of content.blocks) {
    const blockContent = block.content as any;

    switch (block.type) {
      case 'hero': {
        const query = blockContent.imagePrompt || blockContent.headline || 'Vitamix blending lifestyle';
        const result = await findBestImage('lifestyle', query, ragContext, env, 'hero');
        resolved.set('hero', result ? { ...result } : null);
        break;
      }

      case 'cards': {
        if (blockContent.cards) {
          for (let i = 0; i < blockContent.cards.length; i++) {
            const card = blockContent.cards[i];
            const query = card.imagePrompt || card.title || 'Vitamix feature';
            const result = await findBestImage('lifestyle', query, ragContext, env, 'cards');
            resolved.set(`card-${i}`, result ? { ...result } : null);
          }
        }
        break;
      }

      case 'product-cards': {
        if (blockContent.products) {
          for (let i = 0; i < blockContent.products.length; i++) {
            const product = blockContent.products[i];
            const query = product.name || 'Vitamix blender';
            const result = await findBestImage('product', query, ragContext, env, 'product-cards');
            resolved.set(`product-card-${block.id}-${i}`, result ? { ...result } : null);
          }
        }
        break;
      }

      case 'columns': {
        if (blockContent.columns) {
          for (let i = 0; i < blockContent.columns.length; i++) {
            const col = blockContent.columns[i];
            const query = col.imagePrompt || col.headline || 'Vitamix feature';
            const result = await findBestImage('lifestyle', query, ragContext, env, 'columns');
            resolved.set(`col-${i}`, result ? { ...result } : null);
          }
        }
        break;
      }

      case 'split-content': {
        const imageId = `split-content-${block.id}`;
        const query = blockContent.imagePrompt || blockContent.headline || 'Vitamix lifestyle';
        const result = await findBestImage('lifestyle', query, ragContext, env, 'split-content');
        resolved.set(imageId, result ? { ...result } : null);
        break;
      }

      case 'recipe-cards': {
        if (blockContent.recipes) {
          for (let i = 0; i < blockContent.recipes.length; i++) {
            const recipe = blockContent.recipes[i];
            const query = recipe.title || 'Vitamix recipe';
            const result = await findBestImage('recipe', query, ragContext, env, 'recipe-cards');
            resolved.set(`recipe-${i}`, result ? { ...result } : null);
          }
        }
        break;
      }

      case 'product-hero': {
        const imageId = `product-hero-${block.id}`;
        const productName = blockContent.productName || 'Vitamix blender';
        const result = await findBestImage('product', productName, ragContext, env, 'product-hero');
        resolved.set(imageId, result ? { ...result } : null);
        break;
      }

      case 'recipe-hero': {
        const imageId = `recipe-hero-${block.id}`;
        const query = blockContent.title || blockContent.headline || 'Vitamix recipe';
        const result = await findBestImage('recipe', query, ragContext, env, 'recipe-hero');
        resolved.set(imageId, result ? { ...result } : null);
        break;
      }

      case 'recipe-grid': {
        if (blockContent.recipes) {
          for (let i = 0; i < blockContent.recipes.length; i++) {
            const recipe = blockContent.recipes[i];
            const query = recipe.title || 'Vitamix recipe';
            const result = await findBestImage('recipe', query, ragContext, env, 'recipe-cards');
            resolved.set(`grid-recipe-${i}`, result ? { ...result } : null);
          }
        }
        break;
      }

      case 'technique-spotlight': {
        const imageId = `technique-${block.id}`;
        const query = blockContent.title || 'Vitamix technique';
        const result = await findBestImage('lifestyle', query, ragContext, env, 'cards');
        resolved.set(imageId, result ? { ...result } : null);
        break;
      }

      case 'feature-highlights': {
        if (blockContent.features) {
          for (let i = 0; i < blockContent.features.length; i++) {
            const feature = blockContent.features[i];
            const query = feature.title || 'Vitamix feature';
            const result = await findBestImage('lifestyle', query, ragContext, env, 'cards');
            resolved.set(`feature-highlights-${block.id}-${i}`, result ? { ...result } : null);
          }
        }
        break;
      }

      case 'included-accessories': {
        if (blockContent.accessories) {
          for (let i = 0; i < blockContent.accessories.length; i++) {
            const accessory = blockContent.accessories[i];
            const query = accessory.name || 'Vitamix accessory';
            const result = await findBestImage('product', query, ragContext, env, 'product-cards');
            resolved.set(`included-accessories-${block.id}-${i}`, result ? { ...result } : null);
          }
        }
        break;
      }

      case 'troubleshooting-steps': {
        if (blockContent.steps) {
          for (let i = 0; i < blockContent.steps.length; i++) {
            const step = blockContent.steps[i];
            const query = step.title || 'Vitamix troubleshooting';
            const result = await findBestImage('lifestyle', query, ragContext, env, 'cards');
            resolved.set(`step-${block.id}-${i}`, result ? { ...result } : null);
          }
        }
        break;
      }

      case 'product-recommendation': {
        const imageId = `product-rec-${block.id}`;
        const query = blockContent.productName || 'Vitamix blender';
        const result = await findBestImage('product', query, ragContext, env, 'product-cards');
        resolved.set(imageId, result ? { ...result } : null);
        break;
      }

      // Blocks without images - no action needed
      case 'text':
      case 'cta':
      case 'faq':
      case 'benefits-grid':
      case 'comparison-table':
      case 'nutrition-table':
      case 'specifications':
      case 'reviews':
      case 'warranty-info':
        break;

      default:
        console.log(`[resolveBlockImages] Unknown block type: ${block.type}`);
    }
  }

  console.log(`[resolveBlockImages] Resolved ${resolved.size} images for ${content.blocks.length} blocks`);
  return resolved;
}

/**
 * @deprecated RAG_ONLY_IMAGES mode - Image generation is disabled.
 * This function is kept for potential rollback but is no longer called.
 * Images are now resolved server-side via resolveBlockImages() using RAG lookup.
 *
 * Build image generation requests
 * Image IDs match the data-gen-image attributes in the HTML
 */
function buildImageRequests(
  content: GeneratedContent,
  decisions: Map<string, { useExisting: boolean; url?: string; prompt?: string }>,
  ragContext?: RAGContext
): ImageRequest[] {
  const requests: ImageRequest[] = [];

  for (const block of content.blocks) {
    const decision = decisions.get(block.id);

    // Skip if using existing image
    if (decision?.useExisting) continue;

    const blockContent = block.content as any;

    // Handle different block types with their specific image ID naming
    switch (block.type) {
      case 'hero':
        // Always generate hero image with fallback prompt
        requests.push({
          id: 'hero',
          blockId: block.id,
          prompt: decision?.prompt || blockContent.imagePrompt || `Hero image for ${blockContent.headline || 'Vitamix blending lifestyle'}`,
          aspectRatio: getAspectRatioForBlock(block.type),
          size: getSizeForBlock(block.type),
        });
        break;

      case 'cards':
        if (blockContent.cards) {
          blockContent.cards.forEach((card: any, i: number) => {
            // Always generate card images with fallback prompt
            requests.push({
              id: `card-${i}`,
              blockId: block.id,
              prompt: card.imagePrompt || decision?.prompt || `Image for ${card.title || 'Vitamix feature'}`,
              aspectRatio: getAspectRatioForBlock(block.type),
              size: getSizeForBlock(block.type),
            });
          });
        }
        break;

      case 'product-cards':
        if (blockContent.products) {
          blockContent.products.forEach((product: any, i: number) => {
            // Always generate product card images with fallback prompt
            requests.push({
              id: `product-card-${block.id}-${i}`,
              blockId: block.id,
              prompt: product.imagePrompt || decision?.prompt || `Vitamix ${product.name || 'blender'} product photo on neutral background`,
              aspectRatio: '1:1',
              size: 'card',
            });
          });
        }
        break;

      case 'columns':
        if (blockContent.columns) {
          blockContent.columns.forEach((col: any, i: number) => {
            // Always generate column images with fallback prompt
            requests.push({
              id: `col-${i}`,
              blockId: block.id,
              prompt: col.imagePrompt || decision?.prompt || `Image for ${col.headline || 'Vitamix feature column'}`,
              aspectRatio: getAspectRatioForBlock(block.type),
              size: getSizeForBlock(block.type),
            });
          });
        }
        break;

      case 'split-content':
        // Always generate split-content image with fallback prompt
        requests.push({
          id: `split-content-${block.id}`,
          blockId: block.id,
          prompt: decision?.prompt || blockContent.imagePrompt || `Image for ${blockContent.headline || 'Vitamix lifestyle content'}`,
          aspectRatio: '4:3',
          size: 'card',
        });
        break;

      case 'recipe-cards':
        if (blockContent.recipes) {
          blockContent.recipes.forEach((recipe: any, i: number) => {
            // Always generate recipe card images with fallback prompt
            requests.push({
              id: `recipe-${i}`,
              blockId: block.id,
              prompt: recipe.imagePrompt || decision?.prompt || `Appetizing ${recipe.title || 'healthy smoothie'} food photography`,
              aspectRatio: '4:3',
              size: 'card',
            });
          });
        }
        break;

      case 'product-recommendation':
        // Always generate product recommendation image with fallback prompt
        requests.push({
          id: `product-rec-${block.id}`,
          blockId: block.id,
          prompt: decision?.prompt || blockContent.imagePrompt || `Vitamix blender product recommendation photo`,
          aspectRatio: '4:3',
          size: 'card',
        });
        break;

      case 'recipe-grid':
        // Recipe grid has multiple recipes, each with their own image
        if (blockContent.recipes) {
          blockContent.recipes.forEach((recipe: any, i: number) => {
            // Always generate recipe grid images with fallback prompt
            requests.push({
              id: `grid-recipe-${i}`,
              blockId: block.id,
              prompt: recipe.imagePrompt || decision?.prompt || `Appetizing ${recipe.title || 'healthy smoothie'} food photography`,
              aspectRatio: '4:3',
              size: 'card',
            });
          });
        }
        break;

      case 'technique-spotlight':
        // Technique spotlight always needs an image (unless using a valid video URL)
        // The HTML builder adds an image even without imagePrompt, so we must generate one
        if (!isValidVideoUrl(blockContent.videoUrl)) {
          requests.push({
            id: `technique-${block.id}`,
            blockId: block.id,
            prompt: decision?.prompt || blockContent.imagePrompt || `Professional blending technique demonstration: ${blockContent.title || 'blender technique'}`,
            aspectRatio: '4:3',
            size: 'card',
          });
        }
        break;

      case 'troubleshooting-steps':
        // Troubleshooting steps - always generate images for each step
        if (blockContent.steps) {
          blockContent.steps.forEach((step: any, i: number) => {
            // Always generate troubleshooting step images with fallback prompt
            requests.push({
              id: `step-${block.id}-${i}`,
              blockId: block.id,
              prompt: step.imagePrompt || decision?.prompt || `Illustration for troubleshooting step: ${step.title || 'blender maintenance'}`,
              aspectRatio: '4:3',
              size: 'card',
            });
          });
        }
        break;

      case 'product-hero': {
        // Skip generation if we can find a product image from RAG
        const ragImage = ragContext && blockContent.productName
          ? findProductImage(blockContent.productName, ragContext)
          : undefined;
        if (ragImage) {
          console.log(`[buildImageRequests] Skipping product-hero generation - using RAG image for "${blockContent.productName}"`);
          break;
        }
        // Always generate product-hero image with fallback prompt (when no RAG image)
        requests.push({
          id: `product-hero-${block.id}`,
          blockId: block.id,
          prompt: decision?.prompt || blockContent.imagePrompt || `Vitamix ${blockContent.productName || 'blender'} product shot on neutral gray background`,
          aspectRatio: '1:1',
          size: 'card',
        });
        break;
      }

      case 'feature-highlights':
        if (blockContent.features && Array.isArray(blockContent.features)) {
          blockContent.features.forEach((feature: any, i: number) => {
            if (feature) {
              // Always generate feature highlight images with fallback prompt
              requests.push({
                id: `feature-highlights-${block.id}-${i}`,
                blockId: block.id,
                prompt: feature.imagePrompt || decision?.prompt || `Vitamix feature: ${feature.title || feature.headline || 'blender capability'}`,
                aspectRatio: '3:2',
                size: 'card',
              });
            }
          });
        }
        break;

      case 'included-accessories':
        if (blockContent.accessories && Array.isArray(blockContent.accessories)) {
          blockContent.accessories.forEach((acc: any, i: number) => {
            if (acc) {
              // Always generate accessory images with fallback prompt
              requests.push({
                id: `included-accessories-${block.id}-${i}`,
                blockId: block.id,
                prompt: acc.imagePrompt || decision?.prompt || `Vitamix accessory: ${acc.name || acc.title || 'blender accessory'} product photo`,
                aspectRatio: '1:1',
                size: 'thumbnail',
              });
            }
          });
        }
        break;

      // UI-only blocks that don't have images
      case 'ingredient-search':
      case 'recipe-filter-bar':
      case 'quick-view-modal':
      case 'benefits-grid':
      case 'tips-banner':
      case 'cta':
      case 'text':
      case 'faq':
      case 'support-hero':
      case 'diagnosis-card':
      case 'support-cta':
      case 'comparison-table':
      case 'use-case-cards':
      case 'verdict-card':
      case 'comparison-cta':
      case 'specs-table':
      case 'product-cta':
      case 'ingredients-list':
      case 'nutrition-facts':
      case 'recipe-tips':
      case 'countdown-timer':
      case 'timeline':
        // No images needed for these blocks
        break;

      case 'recipe-hero':
      case 'recipe-hero-detail':
        // Always generate recipe hero images with fallback prompt
        requests.push({
          id: `recipe-hero-${block.id}`,
          blockId: block.id,
          prompt: blockContent.imagePrompt || decision?.prompt || `Appetizing ${blockContent.title || blockContent.recipeName || 'finished dish'} food photography`,
          aspectRatio: '16:9',
          size: 'hero',
        });
        break;

      case 'recipe-steps':
        if (blockContent.steps) {
          blockContent.steps.forEach((step: any, i: number) => {
            // Always generate recipe step images with fallback prompt
            requests.push({
              id: `recipe-step-${block.id}-${i}`,
              blockId: block.id,
              prompt: step.imagePrompt || decision?.prompt || `Recipe step ${i + 1}: ${step.title || step.instruction?.substring(0, 50) || 'cooking process'}`,
              aspectRatio: '4:3',
              size: 'card',
            });
          });
        }
        break;

      case 'testimonials':
        if (blockContent.testimonials) {
          blockContent.testimonials.forEach((testimonial: any, i: number) => {
            // Always generate testimonial images with fallback prompt
            requests.push({
              id: `testimonial-${block.id}-${i}`,
              blockId: block.id,
              prompt: testimonial.imagePrompt || decision?.prompt || `Professional headshot portrait of ${testimonial.name || testimonial.author || 'satisfied customer'}`,
              aspectRatio: '1:1',
              size: 'card',
            });
          });
        }
        break;

      case 'team-cards':
        if (blockContent.members) {
          blockContent.members.forEach((member: any, i: number) => {
            // Always generate team member images with fallback prompt
            requests.push({
              id: `team-${block.id}-${i}`,
              blockId: block.id,
              prompt: member.imagePrompt || decision?.prompt || `Professional corporate headshot of ${member.name || 'team member'}`,
              aspectRatio: '1:1',
              size: 'card',
            });
          });
        }
        break;

      default:
        // Other block types - always generate with fallback prompt
        const imagePrompt = extractImagePrompt(blockContent);
        requests.push({
          id: `${block.type}-${block.id}`,
          blockId: block.id,
          prompt: decision?.prompt || imagePrompt || `Image for ${block.type} block`,
          aspectRatio: getAspectRatioForBlock(block.type),
          size: getSizeForBlock(block.type),
        });
        break;
    }
  }

  return requests;
}

/**
 * Extract image prompt from block content
 */
function extractImagePrompt(content: any): string {
  if ('imagePrompt' in content) {
    return content.imagePrompt;
  }

  if ('cards' in content && content.cards[0]?.imagePrompt) {
    return content.cards[0].imagePrompt;
  }

  if ('columns' in content && content.columns[0]?.imagePrompt) {
    return content.columns[0].imagePrompt;
  }

  return '';
}

/**
 * Get aspect ratio for block type
 */
function getAspectRatioForBlock(blockType: string): string {
  switch (blockType) {
    case 'hero':
      return '5:2';
    case 'cards':
      return '4:3';
    case 'columns':
      return '3:2';
    default:
      return '4:3';
  }
}

/**
 * Get size category for block type
 */
function getSizeForBlock(blockType: string): 'hero' | 'card' | 'column' | 'thumbnail' {
  switch (blockType) {
    case 'hero':
      return 'hero';
    case 'cards':
      return 'card';
    case 'columns':
      return 'column';
    default:
      return 'card';
  }
}

/**
 * Stream block content events
 */
async function streamBlockContent(
  content: GeneratedContent,
  layout: LayoutDecision,
  slug: string,
  onEvent: SSECallback,
  ragContext?: RAGContext,
  resolvedImages?: Map<string, ResolvedImage | null>
): Promise<void> {
  for (let i = 0; i < layout.blocks.length; i++) {
    const layoutBlock = layout.blocks[i];
    const contentBlock = content.blocks[layoutBlock.contentIndex];

    if (!contentBlock) continue;

    // Signal block start
    onEvent({
      event: 'block-start',
      data: {
        blockId: contentBlock.id,
        blockType: contentBlock.type,
        position: i,
      },
    });

    // Build HTML for this block with resolved image URLs
    const blockHtml = buildBlockHTML(contentBlock, layoutBlock, slug, ragContext, resolvedImages);

    // Send block content with section style
    onEvent({
      event: 'block-content',
      data: {
        blockId: contentBlock.id,
        html: blockHtml,
        partial: false,
        sectionStyle: layoutBlock.sectionStyle,
      },
    });

    // Signal block complete
    onEvent({
      event: 'block-complete',
      data: { blockId: contentBlock.id },
    });
  }
}

/**
 * Get image URL from resolved images map, with fallback placeholder
 */
function getResolvedImageUrl(
  imageId: string,
  resolvedImages?: Map<string, ResolvedImage | null>
): string | null {
  if (!resolvedImages) return null;
  const resolved = resolvedImages.get(imageId);
  return resolved?.url || null;
}

/**
 * Get full resolved image info including cropNeeded flag
 */
function getResolvedImage(
  imageId: string,
  resolvedImages?: Map<string, ResolvedImage | null>
): ResolvedImage | null {
  if (!resolvedImages) return null;
  return resolvedImages.get(imageId) || null;
}

/**
 * Build HTML for a single block
 */
function buildBlockHTML(
  block: GeneratedContent['blocks'][0],
  layoutBlock: LayoutDecision['blocks'][0],
  slug: string,
  ragContext?: RAGContext,
  resolvedImages?: Map<string, ResolvedImage | null>
): string {
  const content = block.content;
  const variant = layoutBlock.variant;

  switch (block.type) {
    case 'hero': {
      const heroImage = getResolvedImage('hero', resolvedImages);
      return buildHeroHTML(content as any, variant, heroImage?.url || null, heroImage?.cropNeeded);
    }
    case 'cards':
      return buildCardsHTML(content as any, variant, resolvedImages);
    case 'product-cards':
      return buildProductCardsHTML(content as any, variant, block.id, resolvedImages);
    case 'columns':
      return buildColumnsHTML(content as any, variant, resolvedImages);
    case 'text':
      return buildTextHTML(content as any, variant);
    case 'cta':
      return buildCTAHTML(content as any, variant);
    case 'faq':
      return buildFAQHTML(content as any, variant);
    case 'split-content':
      return buildSplitContentHTML(content as any, variant, block.id, resolvedImages);
    case 'benefits-grid':
      return buildBenefitsGridHTML(content as any, variant);
    case 'recipe-cards':
      return buildRecipeCardsHTML(content as any, variant, resolvedImages);
    case 'product-recommendation':
      return buildProductRecommendationHTML(content as any, variant, block.id, resolvedImages);
    case 'tips-banner':
      return buildTipsBannerHTML(content as any, variant);
    case 'ingredient-search':
      return buildIngredientSearchHTML(content as any, variant);
    case 'recipe-filter-bar':
      return buildRecipeFilterBarHTML(content as any, variant);
    case 'recipe-grid':
      return buildRecipeGridHTML(content as any, variant, resolvedImages);
    case 'quick-view-modal':
      return buildQuickViewModalHTML(content as any, variant);
    case 'technique-spotlight':
      return buildTechniqueSpotlightHTML(content as any, variant, block.id, resolvedImages);
    case 'support-hero':
      return buildSupportHeroHTML(content as any, variant);
    case 'diagnosis-card':
      return buildDiagnosisCardHTML(content as any, variant);
    case 'troubleshooting-steps':
      return buildTroubleshootingStepsHTML(content as any, variant, slug, block.id);
    case 'support-cta':
      return buildSupportCTAHTML(content as any, variant);
    case 'comparison-table':
      return buildComparisonTableHTML(content as any, variant);
    case 'use-case-cards':
      return buildUseCaseCardsHTML(content as any, variant);
    case 'verdict-card':
      return buildVerdictCardHTML(content as any, variant);
    case 'comparison-cta':
      return buildComparisonCTAHTML(content as any, variant);
    case 'product-hero': {
      const imageId = `product-hero-${block.id}`;
      return buildProductHeroHTML(content as any, variant, block.id, getResolvedImageUrl(imageId, resolvedImages));
    }
    case 'specs-table':
      return buildSpecsTableHTML(content as any, variant);
    case 'feature-highlights':
      return buildFeatureHighlightsHTML(content as any, variant, block.id, resolvedImages);
    case 'included-accessories':
      return buildIncludedAccessoriesHTML(content as any, variant, block.id, resolvedImages);
    case 'product-cta':
      return buildProductCTAHTML(content as any, variant);
    // Single Recipe blocks
    case 'recipe-hero':
      return buildRecipeHeroHTML(content as any, variant, block.id, resolvedImages);
    case 'ingredients-list':
      return buildIngredientsListHTML(content as any, variant);
    case 'recipe-steps':
      return buildRecipeStepsHTML(content as any, variant, slug, block.id, resolvedImages);
    case 'nutrition-facts':
      return buildNutritionFactsHTML(content as any, variant);
    case 'recipe-tips':
      return buildRecipeTipsHTML(content as any, variant);
    // Single Recipe Detail blocks (vitamix.com style)
    case 'recipe-hero-detail':
      return buildRecipeHeroDetailHTML(content as any, variant, block.id, resolvedImages);
    case 'recipe-tabs':
      return buildRecipeTabsHTML(content as any, variant);
    case 'recipe-sidebar':
      return buildRecipeSidebarHTML(content as any, variant);
    case 'recipe-directions':
      return buildRecipeDirectionsHTML(content as any, variant);
    // Campaign Landing blocks
    case 'countdown-timer':
      return buildCountdownTimerHTML(content as any, variant);
    case 'testimonials':
      return buildTestimonialsHTML(content as any, variant, block.id, resolvedImages);
    // About/Story blocks
    case 'timeline':
      return buildTimelineHTML(content as any, variant);
    case 'team-cards':
      return buildTeamCardsHTML(content as any, variant, block.id, resolvedImages);
    default:
      return '';
  }
}

/**
 * Build Comparison Table block HTML
 *
 * Comparison Table is authored as a table block in DA:
 * | Comparison Table |                |                |                |
 * |------------------|----------------|----------------|----------------|
 * |                  | A3500          | A2500          | E310           |
 * | **Price**        | $649           | $549           | $349 ✓         |
 * | **Motor**        | 2.2 HP         | 2.2 HP         | 2.0 HP         |
 *
 * HTML structure:
 * <div class="comparison-table">
 *   <div><div></div><div>A3500</div><div>A2500</div><div>E310</div></div>
 *   <div><div><strong>Price</strong></div><div>$649</div><div>$549</div><div>$349 ✓</div></div>
 *   ...
 * </div>
 */
function buildComparisonTableHTML(content: any, variant: string): string {
  const products = content.products || [];
  const specs = content.specs || [];

  if (products.length === 0) {
    return `<div class="comparison-table${variant !== 'default' ? ` ${variant}` : ''}"></div>`;
  }

  let rowsHtml = '';

  // Header row: empty cell + product names
  const headerCells = ['<div></div>'].concat(
    products.map((p: string) => `<div><strong>${escapeHTML(p)}</strong></div>`)
  ).join('');
  rowsHtml += `<div>${headerCells}</div>`;

  // Spec rows
  for (const spec of specs) {
    const specCells = [`<div><strong>${escapeHTML(spec.name)}</strong></div>`].concat(
      (spec.values || []).map((v: string) => `<div>${escapeHTML(v)}</div>`)
    ).join('');
    rowsHtml += `<div>${specCells}</div>`;
  }

  return `
    <div class="comparison-table${variant !== 'default' ? ` ${variant}` : ''}">
      ${rowsHtml}
    </div>
  `.trim();
}

/**
 * Build Use Case Cards block HTML
 *
 * Use Case Cards is authored as a table block in DA:
 * | Use Case Cards |
 * |----------------|
 * | **POWER USER** |
 * | ### A3500 |
 * | Best for tech-savvy cooks... |
 * | [Shop A3500](/products/a3500) |
 *
 * HTML structure:
 * <div class="use-case-cards">
 *   <div><div>
 *     <p><strong>POWER USER</strong></p>
 *     <h3>A3500</h3>
 *     <p>Description...</p>
 *     <p><a href="...">Shop A3500</a></p>
 *   </div></div>
 *   ...
 * </div>
 */
function buildUseCaseCardsHTML(content: any, variant: string): string {
  const cards = content.cards || [];

  if (cards.length === 0) {
    return `<div class="use-case-cards${variant !== 'default' ? ` ${variant}` : ''}"></div>`;
  }

  const cardsHtml = cards.map((card: any) => `
    <div><div>
      <p><strong>${escapeHTML(card.persona || '')}</strong></p>
      <h3>${escapeHTML(card.product || '')}</h3>
      <p>${escapeHTML(card.description || '')}</p>
      ${card.ctaText ? `<p><a href="${escapeHTML(card.ctaUrl || '#')}">${escapeHTML(card.ctaText)}</a></p>` : ''}
    </div></div>
  `).join('');

  return `
    <div class="use-case-cards${variant !== 'default' ? ` ${variant}` : ''}">
      ${cardsHtml}
    </div>
  `.trim();
}

/**
 * Build Verdict Card block HTML
 *
 * Verdict Card is authored as a table block in DA:
 * | Verdict Card |
 * |--------------|
 * | ## The Verdict |
 * | For most people, we recommend the **A2500**... |
 * | - **Choose A3500 if:** You want touchscreen... |
 * | - **Choose A2500 if:** You want great value... |
 *
 * HTML structure:
 * <div class="verdict-card">
 *   <div><div>
 *     <h2>The Verdict</h2>
 *     <p>For most people...</p>
 *     <ul>
 *       <li><strong>Choose A3500 if:</strong> ...</li>
 *       ...
 *     </ul>
 *     <p>Closing statement</p>
 *   </div></div>
 * </div>
 */
function buildVerdictCardHTML(content: any, variant: string): string {
  let innerHtml = '';

  // Headline
  if (content.headline) {
    innerHtml += `<h2>${escapeHTML(content.headline)}</h2>`;
  }

  // Main recommendation
  if (content.mainRecommendation) {
    innerHtml += `<p>${escapeHTML(content.mainRecommendation)}</p>`;
  }

  // Per-product recommendations as list
  if (content.recommendations && content.recommendations.length > 0) {
    const listItems = content.recommendations.map((rec: any) =>
      `<li><strong>Choose ${escapeHTML(rec.product)} if:</strong> ${escapeHTML(rec.condition)}</li>`
    ).join('');
    innerHtml += `<ul>${listItems}</ul>`;
  }

  // Closing statement
  if (content.closingStatement) {
    innerHtml += `<p>${escapeHTML(content.closingStatement)}</p>`;
  }

  return `
    <div class="verdict-card${variant !== 'default' ? ` ${variant}` : ''}">
      <div><div>
        ${innerHtml}
      </div></div>
    </div>
  `.trim();
}

/**
 * Build Comparison CTA block HTML
 *
 * Comparison CTA is authored as a table block in DA:
 * | Comparison CTA |                     |                     |
 * |----------------|---------------------|---------------------|
 * | ### A3500      | ### A2500           | ### E310            |
 * | $649           | $549                | $349                |
 * | [Shop Now](/p) | [Shop Now](/p)      | [Shop Now](/p)      |
 * | All models include free shipping                          |
 *
 * HTML structure:
 * <div class="comparison-cta">
 *   <div><div><h3>A3500</h3></div><div><h3>A2500</h3></div>...</div>
 *   <div><div>$649</div><div>$549</div>...</div>
 *   <div><div><a>Shop</a></div>...</div>
 *   <div><div>Footer message</div></div>
 * </div>
 */
function buildComparisonCTAHTML(content: any, variant: string): string {
  const products = content.products || [];

  if (products.length === 0) {
    return `<div class="comparison-cta${variant !== 'default' ? ` ${variant}` : ''}"></div>`;
  }

  // Row 1: Product names
  const namesRow = products.map((p: any) =>
    `<div><h3>${escapeHTML(p.name || '')}</h3></div>`
  ).join('');

  // Row 2: Prices
  const pricesRow = products.map((p: any) =>
    `<div><p>${escapeHTML(p.price || '')}</p></div>`
  ).join('');

  // Row 3: CTA buttons
  const ctasRow = products.map((p: any) =>
    `<div><p><a href="${escapeHTML(p.ctaUrl || '#')}">${escapeHTML(p.ctaText || 'Shop Now')}</a></p></div>`
  ).join('');

  // Row 4: Footer message
  const footerRow = content.footerMessage
    ? `<div><div><p>${escapeHTML(content.footerMessage)}</p></div></div>`
    : '';

  return `
    <div class="comparison-cta${variant !== 'default' ? ` ${variant}` : ''}">
      <div>${namesRow}</div>
      <div>${pricesRow}</div>
      <div>${ctasRow}</div>
      ${footerRow}
    </div>
  `.trim();
}

/**
 * Build Hero block HTML
 *
 * Hero is authored as a table block in DA:
 * | Hero                |                    |
 * |---------------------|-------------------|
 * | [image]             | Headline          |
 * |                     | Subheadline       |
 * |                     | [CTA button]      |
 *
 * This produces the following HTML structure after EDS processing:
 * <div class="hero">
 *   <div>                              <!-- row -->
 *     <div><picture>...</picture></div> <!-- image cell -->
 *     <div>                             <!-- content cell -->
 *       <h1>Headline</h1>
 *       <p>Subheadline</p>
 *       <p><a class="button">CTA</a></p>
 *     </div>
 *   </div>
 * </div>
 */
function buildHeroHTML(content: any, variant: string, imageUrl: string | null, cropNeeded?: boolean): string {
  // Determine CTA type for hero button
  let ctaHtml = '';
  if (content.ctaText) {
    const buttonText = (content.ctaText || '').toLowerCase();
    const buttonUrl = content.ctaUrl || '/discover/products/blenders';

    // Infer if this should be an explore CTA
    let ctaType = content.ctaType;
    if (!ctaType) {
      if (buttonUrl.startsWith('http') && !buttonUrl.includes('vitamix.com')) {
        ctaType = 'external';
      } else if (/shop|buy|cart|order|add to/i.test(buttonText)) {
        ctaType = 'shop';
      } else if (/learn|see|explore|discover|browse|view|find\s+recipes?|get\s+recipes?|try|recipes/i.test(buttonText)) {
        ctaType = 'explore';
      } else {
        ctaType = 'shop'; // Default for hero CTAs
      }
    }

    const isExplore = ctaType === 'explore';
    // Generate a contextual hint from the hero's content if not explicitly provided
    const contextualHint = content.generationHint || generateContextualHint({
      headline: content.headline,
      description: content.subheadline,
      eyebrow: content.eyebrow,
      blockType: 'hero',
    });
    const exploreAttrs = isExplore
      ? ` data-cta-type="explore" data-generation-hint="${escapeHTML(contextualHint)}"`
      : '';

    ctaHtml = `<p><a href="${escapeHTML(buttonUrl)}" class="button"${exploreAttrs}>${escapeHTML(content.ctaText)}</a></p>`;
  }

  // Build image HTML with data-gen-image for progressive loading
  // When imageUrl is null, use placeholder with shimmer effect (CSS handles animation)
  // Add data-crop="true" if image needs CSS cropping (non-ideal aspect ratio)
  const cropAttr = cropNeeded ? ' data-crop="true"' : '';
  const imageSrc = imageUrl || PLACEHOLDER_IMAGE;
  const genImageAttr = ' data-gen-image="hero"'; // Always include for SSE updates
  const imageHtml = `<div><picture><img src="${imageSrc}" alt="${escapeHTML(content.headline)}" loading="lazy"${cropAttr}${genImageAttr}></picture></div>`;

  return `
    <div class="hero${variant !== 'default' ? ` ${variant}` : ''}">
      <div>
        ${imageHtml}
        <div>
          <h1>${escapeHTML(content.headline)}</h1>
          ${content.subheadline ? `<p>${escapeHTML(content.subheadline)}</p>` : ''}
          ${ctaHtml}
        </div>
      </div>
    </div>
  `.trim();
}

/**
 * Build Cards block HTML
 *
 * Cards is authored as a table block in DA:
 * | Cards                    |                         |
 * |--------------------------|-------------------------|
 * | [image]                  | **Title 1**             |
 * |                          | Description text        |
 * |                          | [Link](url)             |
 * |--------------------------|-------------------------|
 * | [image]                  | **Title 2**             |
 * |                          | Description             |
 *
 * Each row = one card. Each row has 2 cells: image + body.
 *
 * HTML structure after EDS processing:
 * <div class="cards">
 *   <div>                                  <!-- card row -->
 *     <div><picture>...</picture></div>    <!-- image cell -->
 *     <div>                                <!-- body cell -->
 *       <p><strong>Title</strong></p>
 *       <p>Description</p>
 *       <p><a href="...">Link</a></p>
 *     </div>
 *   </div>
 *   ...
 * </div>
 *
 * The cards.js decorator transforms this to ul/li structure.
 */
function buildCardsHTML(content: any, variant: string, resolvedImages?: Map<string, ResolvedImage | null>): string {
  const cardsHtml = content.cards.map((card: any, i: number) => {
    const imageId = `card-${i}`;
    const imageUrl = getResolvedImageUrl(imageId, resolvedImages);
    // Use placeholder with data-gen-image for progressive loading
    const imageSrc = imageUrl || PLACEHOLDER_IMAGE;
    const imageHtml = `<div><picture><img src="${imageSrc}" alt="${escapeHTML(card.title)}" loading="lazy" data-gen-image="${imageId}"></picture></div>`;

    return `
      <div>
        ${imageHtml}
        <div>
          <p><strong>${escapeHTML(card.title)}</strong></p>
          <p>${escapeHTML(card.description)}</p>
          ${card.linkText ? `<p><a href="${escapeHTML(card.linkUrl || '#')}">${escapeHTML(card.linkText)}</a></p>` : ''}
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="cards${variant !== 'default' ? ` ${variant}` : ''}">
      ${cardsHtml}
    </div>
  `.trim();
}

/**
 * Build Columns block HTML
 *
 * Columns is authored as a table block in DA:
 * | Columns (highlight)    |                    |                    |
 * |------------------------|--------------------|--------------------|
 * | **Title 1**            | **Title 2**        | **Title 3**        |
 * | Description 1          | Description 2      | Description 3      |
 *
 * Block options in parentheses become CSS classes.
 * Each row = one row of content. Cells in a row = columns.
 * For text-only columns, put all content in one row with N cells.
 *
 * HTML structure after EDS processing:
 * <div class="columns highlight">
 *   <div>                              <!-- row -->
 *     <div><h3>Title 1</h3><p>Text</p></div>  <!-- column 1 -->
 *     <div><h3>Title 2</h3><p>Text</p></div>  <!-- column 2 -->
 *     <div><h3>Title 3</h3><p>Text</p></div>  <!-- column 3 -->
 *   </div>
 * </div>
 *
 * The columns.js decorator adds columns-N-cols class.
 */
function buildColumnsHTML(content: any, variant: string, resolvedImages?: Map<string, ResolvedImage | null>): string {
  // Build all columns as cells within a single row
  const columnsHtml = content.columns.map((col: any, i: number) => {
    let colContent = '';

    // Always include image with data-gen-image for progressive loading
    const imageId = `col-${i}`;
    const imageUrl = getResolvedImageUrl(imageId, resolvedImages);
    const imageSrc = imageUrl || PLACEHOLDER_IMAGE;
    colContent += `
      <picture>
        <img src="${imageSrc}" alt="${escapeHTML(col.headline || '')}" loading="lazy" data-gen-image="${imageId}">
      </picture>
    `;

    if (col.headline) {
      colContent += `<h3>${escapeHTML(col.headline)}</h3>`;
    }

    colContent += `<p>${escapeHTML(col.text)}</p>`;

    return `<div>${colContent}</div>`;
  }).join('');

  // Wrap all columns in a single row div
  return `
    <div class="columns${variant !== 'default' ? ` ${variant}` : ''}">
      <div>${columnsHtml}</div>
    </div>
  `.trim();
}

/**
 * Build Text block HTML
 *
 * Text is authored as a simple table block in DA:
 * | Text                              |
 * |-----------------------------------|
 * | ## Headline                       |
 * | Body paragraph text               |
 *
 * HTML structure after EDS processing:
 * <div class="text">
 *   <div><div>
 *     <h2>Headline</h2>
 *     <p>Body text</p>
 *   </div></div>
 * </div>
 */
function buildTextHTML(content: any, variant: string): string {
  return `
    <div class="text${variant !== 'default' ? ` ${variant}` : ''}">
      <div><div>
        ${content.headline ? `<h2>${escapeHTML(content.headline)}</h2>` : ''}
        ${content.body.split('\n\n').map((p: string) => `<p>${escapeHTML(p)}</p>`).join('')}
      </div></div>
    </div>
  `.trim();
}

/**
 * Build CTA block HTML
 *
 * CTA is authored as a table block in DA:
 * | CTA                                    |
 * |----------------------------------------|
 * | ## Headline                            |
 * | Supporting text                        |
 * | [Button text](url)                     |
 *
 * HTML structure:
 * <div class="cta">
 *   <div><div>
 *     <h2>Headline</h2>
 *     <p>Supporting text</p>
 *     <p><a class="button">Button</a></p>
 *   </div></div>
 * </div>
 */
function buildCTAHTML(content: any, variant: string): string {
  // Determine CTA type with inference if not explicitly set
  let ctaType = content.ctaType;
  if (!ctaType) {
    const buttonText = (content.buttonText || '').toLowerCase();
    const buttonUrl = content.buttonUrl || '';

    if (buttonUrl.startsWith('http') && !buttonUrl.includes('vitamix.com')) {
      ctaType = 'external';
    } else if (/shop|buy|cart|order|add to/i.test(buttonText)) {
      ctaType = 'shop';
    } else if (/learn|see|explore|discover|browse|view|find\s+recipes?/i.test(buttonText)) {
      ctaType = 'explore';
    } else if (buttonUrl.match(/^\/discover\//)) {
      ctaType = 'explore';
    } else {
      ctaType = 'shop'; // Default to shop for safety
    }
  }

  const isExplore = ctaType === 'explore';
  // Generate a contextual hint from the CTA block's content if not explicitly provided
  const contextualHint = content.generationHint || generateContextualHint({
    headline: content.headline,
    description: content.text,
    blockType: 'cta',
  });

  return `
    <div class="cta${variant !== 'default' ? ` ${variant}` : ''}${isExplore ? ' contextual-cta' : ''}">
      <div><div>
        <h2>${escapeHTML(content.headline)}</h2>
        ${content.text ? `<p>${escapeHTML(content.text)}</p>` : ''}
        <p>
          <a href="${escapeHTML(content.buttonUrl)}" class="button primary"
             ${isExplore ? `data-cta-type="explore" data-generation-hint="${escapeHTML(contextualHint)}"` : ''}>
            ${escapeHTML(content.buttonText)}
          </a>
        </p>
      </div></div>
    </div>
  `.trim();
}

/**
 * Build FAQ block HTML
 *
 * FAQ is authored as a table block in DA:
 * | FAQ                           |                              |
 * |-------------------------------|------------------------------|
 * | Question 1?                   | Answer 1                     |
 * | Question 2?                   | Answer 2                     |
 *
 * Each row = one Q&A pair. Cell 1 = question, Cell 2 = answer.
 *
 * HTML structure:
 * <div class="faq">
 *   <div>
 *     <div>Question?</div>
 *     <div>Answer</div>
 *   </div>
 * </div>
 */
function buildFAQHTML(content: any, variant: string): string {
  const faqHtml = content.items.map((item: any) => `
    <div>
      <div>${escapeHTML(item.question)}</div>
      <div>${escapeHTML(item.answer)}</div>
    </div>
  `).join('');

  return `
    <div class="faq${variant !== 'default' ? ` ${variant}` : ''}">
      ${faqHtml}
    </div>
  `.trim();
}

/**
 * Build Split-Content block HTML
 *
 * Split-Content is authored as a table block in DA:
 * | Split Content (reverse)   |                              |
 * |-----------------------------|------------------------------|
 * | [feature-image.jpg]       | EYEBROW TEXT                 |
 * |                           | ## Section Headline          |
 * |                           | Body text paragraph here.    |
 * |                           | **$449.95** • 10-Year Warranty |
 * |                           | [[Shop Now]] [[Compare]]     |
 *
 * Variants:
 * - reverse: Image on right side
 * - dark: Dark background
 *
 * HTML structure after EDS processing:
 * <div class="split-content reverse">
 *   <div>                                  <!-- row -->
 *     <div><picture>...</picture></div>    <!-- image cell -->
 *     <div>                                <!-- content cell -->
 *       <p>EYEBROW</p>
 *       <h2>Headline</h2>
 *       <p>Body text</p>
 *       <p><strong>$449.95</strong> • Note</p>
 *       <p><a href="...">CTA</a> <a href="...">Secondary</a></p>
 *     </div>
 *   </div>
 * </div>
 */
function buildSplitContentHTML(content: any, variant: string, blockId: string, resolvedImages?: Map<string, ResolvedImage | null>): string {
  // Get resolved image URL
  const imageId = `split-content-${blockId}`;
  const imageUrl = getResolvedImageUrl(imageId, resolvedImages);

  // Build content cell
  let contentHtml = '';

  // Eyebrow (optional)
  if (content.eyebrow) {
    contentHtml += `<p>${escapeHTML(content.eyebrow)}</p>`;
  }

  // Headline
  contentHtml += `<h2>${escapeHTML(content.headline)}</h2>`;

  // Body text
  contentHtml += `<p>${escapeHTML(content.body)}</p>`;

  // Price + note (optional)
  if (content.price) {
    const priceNote = content.priceNote ? ` • ${escapeHTML(content.priceNote)}` : '';
    contentHtml += `<p><strong>${escapeHTML(content.price)}</strong>${priceNote}</p>`;
  }

  // CTAs - detect explore CTAs and add generation hints
  let ctaHtml = '';

  // Helper to determine if a CTA should be an explore type
  const isExploreCta = (text: string, url: string): boolean => {
    const t = (text || '').toLowerCase();
    const u = (url || '').toLowerCase();
    // Shop/buy CTAs are not explore
    if (/shop|buy|cart|order|add to/i.test(t)) return false;
    // External URLs are not explore
    if (u.startsWith('http') && !u.includes('vitamix.com')) return false;
    // Learn/explore/view CTAs are explore
    if (/learn|see|explore|discover|browse|view|compare|details/i.test(t)) return true;
    // Relative paths with /discover/ prefix are explore
    if (u.match(/^\/discover\//)) return true;
    return false;
  };

  // Generate contextual hint for explore CTAs from block content
  const contextualHint = generateContextualHint({
    headline: content.headline,
    description: content.body,
    eyebrow: content.eyebrow,
    blockType: 'split-content',
  });

  if (content.primaryCtaText) {
    const isPrimaryExplore = isExploreCta(content.primaryCtaText, content.primaryCtaUrl);
    const primaryAttrs = isPrimaryExplore
      ? ` data-cta-type="explore" data-generation-hint="${escapeHTML(contextualHint)}"`
      : '';
    ctaHtml += `<a href="${escapeHTML(content.primaryCtaUrl || '#')}"${primaryAttrs}>${escapeHTML(content.primaryCtaText)}</a>`;
  }
  if (content.secondaryCtaText) {
    const isSecondaryExplore = isExploreCta(content.secondaryCtaText, content.secondaryCtaUrl);
    const secondaryAttrs = isSecondaryExplore
      ? ` data-cta-type="explore" data-generation-hint="${escapeHTML(contextualHint)}"`
      : '';
    ctaHtml += ` <a href="${escapeHTML(content.secondaryCtaUrl || '#')}"${secondaryAttrs}>${escapeHTML(content.secondaryCtaText)}</a>`;
  }
  if (ctaHtml) {
    contentHtml += `<p>${ctaHtml}</p>`;
  }

  // Build image HTML with data-gen-image for progressive loading
  const imageSrc = imageUrl || PLACEHOLDER_IMAGE;
  const imageHtml = `<div><picture><img src="${imageSrc}" alt="${escapeHTML(content.headline)}" loading="lazy" data-gen-image="${imageId}"></picture></div>`;

  return `
    <div class="split-content${variant !== 'default' ? ` ${variant}` : ''}">
      <div>
        ${imageHtml}
        <div>
          ${contentHtml}
        </div>
      </div>
    </div>
  `.trim();
}

/**
 * Build Benefits Grid block HTML
 *
 * Benefits Grid is authored as a table block in DA:
 * | Benefits Grid              |                    |                    |
 * |----------------------------|--------------------|--------------------|
 * | :icon-clock:               | :icon-heart:       | :icon-leaf:        |
 * | **Quick & Easy**           | **Heart Healthy**  | **Whole Foods**    |
 * | Ready in under 5 minutes   | Nutrient-rich...   | Use whole fruits...|
 *
 * HTML structure:
 * <div class="benefits-grid">
 *   <div>                                    <!-- row for all items -->
 *     <div>                                   <!-- item 1 -->
 *       <span class="icon icon-clock"></span>
 *       <p><strong>Title</strong></p>
 *       <p>Description</p>
 *     </div>
 *     ...
 *   </div>
 * </div>
 */
function buildBenefitsGridHTML(content: any, variant: string): string {
  const itemsHtml = content.items.map((item: any) => {
    const iconClass = item.icon ? `icon icon-${item.icon}` : '';
    return `
      <div>
        ${item.icon ? `<p><span class="${iconClass}"></span></p>` : ''}
        <p><strong>${escapeHTML(item.headline)}</strong></p>
        <p>${escapeHTML(item.description)}</p>
      </div>
    `;
  }).join('');

  return `
    <div class="benefits-grid${variant !== 'default' ? ` ${variant}` : ''}">
      <div>${itemsHtml}</div>
    </div>
  `.trim();
}

/**
 * Build Recipe Cards block HTML
 *
 * Recipe Cards is authored as a table block in DA:
 * | Recipe Cards                |                    |                    |
 * |-----------------------------|--------------------|--------------------|
 * | [smoothie.jpg]              | [soup.jpg]         | [sauce.jpg]        |
 * | **Green Smoothie**          | **Tomato Soup**    | **Pesto Sauce**    |
 * | Simple • 5 min              | Easy • 20 min      | Simple • 10 min    |
 *
 * HTML structure:
 * <div class="recipe-cards">
 *   <div>                                     <!-- card row -->
 *     <div><picture>...</picture></div>       <!-- image -->
 *     <div>                                   <!-- body -->
 *       <p><strong>Title</strong></p>
 *       <p>Simple • 5 min</p>
 *     </div>
 *   </div>
 *   ...
 * </div>
 */
function buildRecipeCardsHTML(content: any, variant: string, resolvedImages?: Map<string, ResolvedImage | null>): string {
  // Build DA table structure: each row contains one attribute, columns are cards
  // Row 1: Header (section title) - single cell spanning all
  // Row 2: Images (one per card)
  // Row 3: Titles (one per card)
  // Row 4: Meta (one per card)
  // Row 5: Links (one per card) - optional

  const recipes = content.recipes || [];
  if (recipes.length === 0) {
    return `<div class="recipe-cards${variant !== 'default' ? ` ${variant}` : ''}"></div>`;
  }

  let rowsHtml = '';

  // Section title row (single cell)
  if (content.sectionTitle) {
    rowsHtml += `<div><div><h2>${escapeHTML(content.sectionTitle)}</h2></div></div>`;
  }

  // Row 1: Images - each cell is one card's image (with data-gen-image for progressive loading)
  const imagesRow = recipes.map((recipe: any, i: number) => {
    const imageId = `recipe-${i}`;
    const imageUrl = getResolvedImageUrl(imageId, resolvedImages);
    const imageSrc = imageUrl || PLACEHOLDER_IMAGE;
    return `<div><picture><img src="${imageSrc}" alt="${escapeHTML(recipe.title)}" loading="lazy" data-gen-image="${imageId}"></picture></div>`;
  }).join('');
  rowsHtml += `<div>${imagesRow}</div>`;

  // Row 2: Titles - each cell is one card's title
  const titlesRow = recipes.map((recipe: any) => {
    return `<div><p><strong>${escapeHTML(recipe.title)}</strong></p></div>`;
  }).join('');
  rowsHtml += `<div>${titlesRow}</div>`;

  // Row 3: Meta (difficulty • time) - each cell is one card's meta
  const metaRow = recipes.map((recipe: any) => {
    const meta = `${recipe.difficulty || 'Easy'} • ${recipe.time || '10 min'}`;
    return `<div><p>${escapeHTML(meta)}</p></div>`;
  }).join('');
  rowsHtml += `<div>${metaRow}</div>`;

  // Row 4: Links (optional) - each cell is one card's link
  const hasLinks = recipes.some((r: any) => r.linkUrl);
  if (hasLinks) {
    const linksRow = recipes.map((recipe: any) => {
      if (recipe.linkUrl) {
        return `<div><p><a href="${escapeHTML(recipe.linkUrl)}">View Recipe</a></p></div>`;
      }
      return `<div></div>`;
    }).join('');
    rowsHtml += `<div>${linksRow}</div>`;
  }

  return `
    <div class="recipe-cards${variant !== 'default' ? ` ${variant}` : ''}">
      ${rowsHtml}
    </div>
  `.trim();
}

/**
 * Build Product Cards block HTML
 *
 * Product grid with images, names, ratings, prices, and CTAs.
 *
 * DA Table Structure (row-based - each product is a row of cells):
 * | Product Cards             |
 * |---------------------------|
 * | [product-image.jpg]       |
 * | **Vitamix A3500**         |
 * | ★★★★★ (1,234)             |
 * | $649.95                   |
 * | [[Shop Now]]              |
 */
function buildProductCardsHTML(content: any, variant: string, blockId: string, resolvedImages?: Map<string, ResolvedImage | null>): string {
  const products = content.products || [];
  if (products.length === 0) {
    return `<div class="product-cards${variant !== 'default' ? ` ${variant}` : ''}"></div>`;
  }

  // Each product becomes a row of cells
  const rowsHtml = products.map((product: any, i: number) => {
    const imageId = `product-card-${blockId}-${i}`;
    const imageUrl = getResolvedImageUrl(imageId, resolvedImages);
    const imageSrc = imageUrl || PLACEHOLDER_IMAGE;

    const cells: string[] = [];

    // Cell 1: Image with data-gen-image for progressive loading
    cells.push(`<div><picture><img src="${imageSrc}" alt="${escapeHTML(product.name)}" loading="lazy" data-gen-image="${imageId}"></picture></div>`);

    // Cell 2: Product name (bold)
    cells.push(`<div><p><strong>${escapeHTML(product.name)}</strong></p></div>`);

    // Cell 3: Rating
    const stars = '★★★★★';
    const reviewCount = product.reviewCount || '1,234';
    cells.push(`<div><p>${stars} (${escapeHTML(reviewCount)})</p></div>`);

    // Cell 4: Price
    cells.push(`<div><p>${escapeHTML(product.price || '$699.95')}</p></div>`);

    // Cell 5: CTA link
    const ctaUrl = product.url || '/shop';
    const ctaText = product.ctaText || 'Shop Now';
    cells.push(`<div><p><a href="${escapeHTML(ctaUrl)}">${escapeHTML(ctaText)}</a></p></div>`);

    return `<div>${cells.join('')}</div>`;
  }).join('');

  return `
    <div class="product-cards${variant !== 'default' ? ` ${variant}` : ''}">
      ${rowsHtml}
    </div>
  `.trim();
}

/**
 * Build Product Recommendation block HTML
 *
 * Similar to Split-Content but specialized for product recommendations.
 *
 * | Product Recommendation (reverse) |                              |
 * |----------------------------------|------------------------------|
 * | [product-image.jpg]              | BEST FOR SMOOTHIES           |
 * |                                  | ## Vitamix A3500             |
 * |                                  | Perfect for daily smoothies. |
 * |                                  | **$649.95** • 10-Year Warranty|
 * |                                  | [[Shop Now]] [[Learn More]]  |
 */
function buildProductRecommendationHTML(content: any, variant: string, blockId: string, resolvedImages?: Map<string, ResolvedImage | null>): string {
  const imageId = `product-rec-${blockId}`;
  const imageUrl = getResolvedImageUrl(imageId, resolvedImages);

  let contentHtml = '';

  // Eyebrow
  if (content.eyebrow) {
    contentHtml += `<p>${escapeHTML(content.eyebrow)}</p>`;
  }

  // Headline (product name)
  contentHtml += `<h2>${escapeHTML(content.headline)}</h2>`;

  // Body text
  contentHtml += `<p>${escapeHTML(content.body)}</p>`;

  // Price + note
  if (content.price) {
    const priceNote = content.priceNote ? ` • ${escapeHTML(content.priceNote)}` : '';
    contentHtml += `<p><strong>${escapeHTML(content.price)}</strong>${priceNote}</p>`;
  }

  // CTAs - detect explore CTAs and add generation hints
  let ctaHtml = '';

  // Helper to determine if a CTA should be an explore type
  const isExploreCta = (text: string, url: string): boolean => {
    const t = (text || '').toLowerCase();
    const u = (url || '').toLowerCase();
    // Shop/buy CTAs are not explore
    if (/shop|buy|cart|order|add to/i.test(t)) return false;
    // External URLs are not explore
    if (u.startsWith('http') && !u.includes('vitamix.com')) return false;
    // Learn/explore/view CTAs are explore
    if (/learn|see|explore|discover|browse|view|compare|details/i.test(t)) return true;
    // Relative paths with /discover/ prefix are explore
    if (u.match(/^\/discover\//)) return true;
    return false;
  };

  // Generate contextual hint for explore CTAs from block content
  const contextualHint = generateContextualHint({
    headline: content.headline,
    description: content.body,
    eyebrow: content.eyebrow,
    blockType: 'product-recommendation',
  });

  if (content.primaryCtaText) {
    const isPrimaryExplore = isExploreCta(content.primaryCtaText, content.primaryCtaUrl);
    const primaryAttrs = isPrimaryExplore
      ? ` data-cta-type="explore" data-generation-hint="${escapeHTML(contextualHint)}"`
      : '';
    ctaHtml += `<a href="${escapeHTML(content.primaryCtaUrl || '#')}"${primaryAttrs}>${escapeHTML(content.primaryCtaText)}</a>`;
  }
  if (content.secondaryCtaText) {
    const isSecondaryExplore = isExploreCta(content.secondaryCtaText, content.secondaryCtaUrl);
    const secondaryAttrs = isSecondaryExplore
      ? ` data-cta-type="explore" data-generation-hint="${escapeHTML(contextualHint)}"`
      : '';
    ctaHtml += ` <a href="${escapeHTML(content.secondaryCtaUrl || '#')}"${secondaryAttrs}>${escapeHTML(content.secondaryCtaText)}</a>`;
  }
  if (ctaHtml) {
    contentHtml += `<p>${ctaHtml}</p>`;
  }

  // Build image HTML with data-gen-image for progressive loading
  const imageSrc = imageUrl || PLACEHOLDER_IMAGE;
  const imageHtml = `<div><picture><img src="${imageSrc}" alt="${escapeHTML(content.headline)}" loading="lazy" data-gen-image="${imageId}"></picture></div>`;

  return `
    <div class="product-recommendation${variant !== 'default' ? ` ${variant}` : ''}">
      <div>
        ${imageHtml}
        <div>
          ${contentHtml}
        </div>
      </div>
    </div>
  `.trim();
}

/**
 * Build Tips Banner block HTML
 *
 * Tips Banner is authored as a table block in DA:
 * | Tips Banner                 |                    |                    |
 * |-----------------------------|--------------------|--------------------|
 * | **Prep Ingredients**        | **Use Frozen Fruit**| **Start Slow**    |
 * | Cut fruits into chunks...   | Frozen adds chill..| Begin on low...   |
 *
 * HTML structure:
 * <div class="tips-banner">
 *   <div>
 *     <div>                                   <!-- tip 1 -->
 *       <p><strong>Title</strong></p>
 *       <p>Description</p>
 *     </div>
 *     ...
 *   </div>
 * </div>
 */
function buildTipsBannerHTML(content: any, variant: string): string {
  // Section title if present
  let headerHtml = '';
  if (content.sectionTitle) {
    headerHtml = `<div><div><h2>${escapeHTML(content.sectionTitle)}</h2></div></div>`;
  }

  const tipsHtml = content.tips.map((tip: any) => `
    <div>
      <p><strong>${escapeHTML(tip.headline)}</strong></p>
      <p>${escapeHTML(tip.description)}</p>
    </div>
  `).join('');

  return `
    <div class="tips-banner${variant !== 'default' ? ` ${variant}` : ''}">
      ${headerHtml}
      <div>${tipsHtml}</div>
    </div>
  `.trim();
}

/**
 * Build Ingredient Search block HTML
 *
 * Ingredient Search is authored as a table block in DA:
 * | Ingredient Search            |
 * |------------------------------|
 * | **Find Recipes by Ingredient** |
 * | Enter ingredients you have   |
 * | banana | spinach | berries   |
 *
 * The block JS handles all interactivity (tag input, search, results).
 * HTML structure:
 * <div class="ingredient-search">
 *   <div>
 *     <div><h2>Title</h2></div>
 *   </div>
 *   <div>
 *     <div><p>Subtitle</p></div>
 *   </div>
 *   <div>
 *     <div>suggestion1</div>
 *     <div>suggestion2</div>
 *   </div>
 * </div>
 */
function buildIngredientSearchHTML(content: any, variant: string): string {
  // Title row
  const titleHtml = content.title
    ? `<div><div><h2>${escapeHTML(content.title)}</h2></div></div>`
    : '';

  // Subtitle row
  const subtitleHtml = content.subtitle
    ? `<div><div><p>${escapeHTML(content.subtitle)}</p></div></div>`
    : '';

  // Suggestions row (each suggestion in a cell)
  let suggestionsHtml = '';
  if (content.suggestions && content.suggestions.length > 0) {
    const cells = content.suggestions.map((s: string) => `<div>${escapeHTML(s)}</div>`).join('');
    suggestionsHtml = `<div>${cells}</div>`;
  }

  return `
    <div class="ingredient-search${variant !== 'default' ? ` ${variant}` : ''}">
      ${titleHtml}
      ${subtitleHtml}
      ${suggestionsHtml}
    </div>
  `.trim();
}

/**
 * Build Recipe Filter Bar block HTML
 *
 * Recipe Filter Bar is authored as a table block in DA:
 * | Recipe Filter Bar            |
 * |------------------------------|
 * | Difficulty                   |
 * | All | Quick | Medium | Long  |
 *
 * The block JS generates all the interactive UI.
 * HTML structure:
 * <div class="recipe-filter-bar">
 *   <div><div>Difficulty</div></div>
 *   <div><div>All</div><div>Quick</div>...</div>
 * </div>
 */
function buildRecipeFilterBarHTML(content: any, variant: string): string {
  // The block JS generates the full UI, we just need the container
  return `
    <div class="recipe-filter-bar${variant !== 'default' ? ` ${variant}` : ''}">
      <div><div>Difficulty</div></div>
      <div><div>All</div><div>Quick</div><div>Medium</div><div>Long</div></div>
    </div>
  `.trim();
}

/**
 * Build Recipe Grid block HTML
 *
 * Recipe Grid is authored as a table block in DA:
 * | Recipe Grid                    |                       |                       |
 * |--------------------------------|-----------------------|-----------------------|
 * | [smoothie.jpg]                 | [soup.jpg]            | [bowl.jpg]            |
 * | **Green Power Smoothie**       | **Tomato Basil Soup** | **Acai Bowl**         |
 * | Easy • 5 min                   | Medium • 20 min       | Easy • 10 min         |
 * | 1                              | 3                     | 2                     |
 * | banana,spinach,milk            | tomato,basil,garlic   | acai,banana,berries   |
 * | /recipes/green-smoothie        | /recipes/tomato-soup  | /recipes/acai-bowl    |
 *
 * Row structure: images, titles, meta, difficulty level (1-5), ingredients, links
 *
 * HTML structure:
 * <div class="recipe-grid">
 *   <div><div>[img1]</div><div>[img2]</div>...</div>
 *   <div><div>Title1</div><div>Title2</div>...</div>
 *   ...
 * </div>
 */
function buildRecipeGridHTML(content: any, variant: string, resolvedImages?: Map<string, ResolvedImage | null>): string {
  const recipes = content.recipes || [];
  if (recipes.length === 0) {
    return `<div class="recipe-grid${variant !== 'default' ? ` ${variant}` : ''}"></div>`;
  }

  let rowsHtml = '';

  // Row 1: Images
  const imagesRow = recipes.map((recipe: any, i: number) => {
    const imageUrl = getResolvedImageUrl(`grid-recipe-${i}`, resolvedImages);
    return imageUrl
      ? `<div><picture><img src="${imageUrl}" alt="${escapeHTML(recipe.title)}" loading="lazy"></picture></div>`
      : '<div></div>';
  }).join('');
  rowsHtml += `<div>${imagesRow}</div>`;

  // Row 2: Titles
  const titlesRow = recipes.map((recipe: any) => {
    return `<div><p><strong>${escapeHTML(recipe.title)}</strong></p></div>`;
  }).join('');
  rowsHtml += `<div>${titlesRow}</div>`;

  // Row 3: Meta (difficulty • time)
  const metaRow = recipes.map((recipe: any) => {
    const meta = `${recipe.difficulty || 'Easy'} • ${recipe.time || '10 min'}`;
    return `<div><p>${escapeHTML(meta)}</p></div>`;
  }).join('');
  rowsHtml += `<div>${metaRow}</div>`;

  // Row 4: Difficulty levels (1-5)
  const difficultyRow = recipes.map((recipe: any) => {
    return `<div><p>${recipe.difficultyLevel || 1}</p></div>`;
  }).join('');
  rowsHtml += `<div>${difficultyRow}</div>`;

  // Row 5: Ingredients (comma-separated)
  const ingredientsRow = recipes.map((recipe: any) => {
    const ingredients = (recipe.ingredients || []).join(',');
    return `<div><p>${escapeHTML(ingredients)}</p></div>`;
  }).join('');
  rowsHtml += `<div>${ingredientsRow}</div>`;

  // Row 6: Links
  const linksRow = recipes.map((recipe: any) => {
    return `<div><p><a href="${escapeHTML(recipe.linkUrl || '/recipes')}">${escapeHTML(recipe.linkUrl || '/recipes')}</a></p></div>`;
  }).join('');
  rowsHtml += `<div>${linksRow}</div>`;

  return `
    <div class="recipe-grid${variant !== 'default' ? ` ${variant}` : ''}">
      ${rowsHtml}
    </div>
  `.trim();
}

/**
 * Build Quick View Modal block HTML
 *
 * Quick View Modal is a container that listens for recipe-quick-view events.
 * It doesn't need authored content - the block JS creates the UI.
 *
 * | Quick View Modal |
 * |------------------|
 * | enabled          |
 *
 * HTML structure:
 * <div class="quick-view-modal">
 *   <div><div>enabled</div></div>
 * </div>
 */
function buildQuickViewModalHTML(content: any, variant: string): string {
  return `
    <div class="quick-view-modal${variant !== 'default' ? ` ${variant}` : ''}">
      <div><div>enabled</div></div>
    </div>
  `.trim();
}

/**
 * Build Technique Spotlight block HTML
 *
 * Technique Spotlight is authored as a table block in DA:
 * | Technique Spotlight                                           |
 * |---------------------------------------------------------------|
 * | [technique-image.jpg]                                         |
 * | **Layering Technique**                                        |
 * | Master the art of layering ingredients for perfect blends.    |
 * | Liquid first • Soft ingredients • Frozen on top               |
 * | Start slow, increase speed                                    |
 * | Blend for 60 seconds                                          |
 * | /learn/layering-technique                                     |
 *
 * HTML structure:
 * <div class="technique-spotlight">
 *   <div><div>[image]</div></div>
 *   <div><div><strong>Title</strong></div></div>
 *   <div><div>Description</div></div>
 *   <div><div>tip1 • tip2 • tip3</div></div>
 *   <div><div>tip4</div></div>
 *   <div><div>tip5</div></div>
 *   <div><div><a href="...">link</a></div></div>
 * </div>
 */
function buildTechniqueSpotlightHTML(content: any, variant: string, blockId: string, resolvedImages?: Map<string, ResolvedImage | null>): string {
  const imageId = `technique-${blockId}`;
  const imageUrl = getResolvedImageUrl(imageId, resolvedImages);

  let rowsHtml = '';

  // Row 1: Image/Video (use image if video URL is invalid/placeholder)
  if (isValidVideoUrl(content.videoUrl)) {
    rowsHtml += `<div><div><a href="${escapeHTML(content.videoUrl)}">${escapeHTML(content.videoUrl)}</a></div></div>`;
  } else if (imageUrl) {
    rowsHtml += `<div><div><picture><img src="${imageUrl}" alt="${escapeHTML(content.title || 'Technique')}" loading="lazy"></picture></div></div>`;
  }

  // Row 2: Title
  if (content.title) {
    rowsHtml += `<div><div><p><strong>${escapeHTML(content.title)}</strong></p></div></div>`;
  }

  // Row 3: Description
  if (content.description) {
    rowsHtml += `<div><div><p>${escapeHTML(content.description)}</p></div></div>`;
  }

  // Row 4+: Tips (each tip as bullet points or separate rows)
  if (content.tips && content.tips.length > 0) {
    // First tip row with bullet points
    if (content.tips.length >= 3) {
      const firstThree = content.tips.slice(0, 3).join(' • ');
      rowsHtml += `<div><div><p>${escapeHTML(firstThree)}</p></div></div>`;
    }
    // Remaining tips as separate rows
    for (let i = 3; i < content.tips.length; i++) {
      rowsHtml += `<div><div><p>${escapeHTML(content.tips[i])}</p></div></div>`;
    }
  }

  // Link row
  if (content.linkUrl) {
    rowsHtml += `<div><div><p><a href="${escapeHTML(content.linkUrl)}">${escapeHTML(content.linkUrl)}</a></p></div></div>`;
  }

  return `
    <div class="technique-spotlight${variant !== 'default' ? ` ${variant}` : ''}">
      ${rowsHtml}
    </div>
  `.trim();
}

/**
 * Build Support Hero block HTML
 *
 * Support Hero is authored as a table block in DA:
 * | Support Hero                                    |
 * |-------------------------------------------------|
 * | :icon-warning:                                  |
 * | Troubleshooting: Grinding Noise                 |
 * | Let's get your Vitamix back to peak performance |
 *
 * HTML structure:
 * <div class="support-hero">
 *   <div><div>:icon-warning:</div></div>
 *   <div><div>Title</div></div>
 *   <div><div>Subtitle</div></div>
 * </div>
 */
function buildSupportHeroHTML(content: any, variant: string): string {
  let rowsHtml = '';

  // Row 1: Icon
  if (content.icon) {
    rowsHtml += `<div><div><span class="icon icon-${escapeHTML(content.icon)}"></span></div></div>`;
  }

  // Row 2: Title
  if (content.title) {
    rowsHtml += `<div><div>${escapeHTML(content.title)}</div></div>`;
  }

  // Row 3: Subtitle
  if (content.subtitle) {
    rowsHtml += `<div><div>${escapeHTML(content.subtitle)}</div></div>`;
  }

  return `
    <div class="support-hero${variant !== 'default' ? ` ${variant}` : ''}">
      ${rowsHtml}
    </div>
  `.trim();
}

/**
 * Build Diagnosis Card block HTML
 *
 * Diagnosis Card is authored as a table block in DA:
 * | Diagnosis Card                |                        |                      |
 * |-------------------------------|------------------------|----------------------|
 * | minor                         | moderate               | serious              |
 * | Ice or frozen ingredients     | Blade wear or buildup  | Motor issue          |
 * | Normal during hard blending   | May need cleaning      | Requires service     |
 *
 * HTML structure:
 * <div class="diagnosis-card">
 *   <div><div>minor</div><div>moderate</div><div>serious</div></div>
 *   <div><div>cause1</div><div>cause2</div><div>cause3</div></div>
 *   <div><div>impl1</div><div>impl2</div><div>impl3</div></div>
 * </div>
 */
function buildDiagnosisCardHTML(content: any, variant: string): string {
  const items = content.items || [];
  if (items.length === 0) {
    return `<div class="diagnosis-card${variant !== 'default' ? ` ${variant}` : ''}"></div>`;
  }

  // Row 1: Severity levels
  const severityRow = items.map((item: any) => `<div>${escapeHTML(item.severity || 'minor')}</div>`).join('');

  // Row 2: Causes
  const causeRow = items.map((item: any) => `<div>${escapeHTML(item.cause || '')}</div>`).join('');

  // Row 3: Implications
  const implicationRow = items.map((item: any) => `<div>${escapeHTML(item.implication || '')}</div>`).join('');

  return `
    <div class="diagnosis-card${variant !== 'default' ? ` ${variant}` : ''}">
      <div>${severityRow}</div>
      <div>${causeRow}</div>
      <div>${implicationRow}</div>
    </div>
  `.trim();
}

/**
 * Build Troubleshooting Steps block HTML
 *
 * Troubleshooting Steps is authored as a table block in DA:
 * | Troubleshooting Steps                                            |
 * |------------------------------------------------------------------|
 * | 1                                                                |
 * | Check for trapped ingredients                                    |
 * | Unplug your blender and remove the container. Look under...      |
 * |------------------------------------------------------------------|
 * | 2                                                                |
 * | Inspect the blade assembly                                       |
 * | With the container removed, check for any visible damage...      |
 *
 * HTML structure:
 * <div class="troubleshooting-steps">
 *   <div><div>1</div></div>
 *   <div><div>Title</div></div>
 *   <div><div>Instructions</div></div>
 *   <div><div>2</div></div>
 *   ...
 * </div>
 */
function buildTroubleshootingStepsHTML(content: any, variant: string, slug: string, blockId: string): string {
  const steps = content.steps || [];
  if (steps.length === 0) {
    return `<div class="troubleshooting-steps${variant !== 'default' ? ` ${variant}` : ''}"></div>`;
  }

  let rowsHtml = '';

  steps.forEach((step: any, index: number) => {
    // Each step is ONE row with cells: | number | title | instructions | safety? |
    const title = step.title || '';
    // Use instructions field - provide a minimal fallback if not generated
    const instructions = step.instructions || 'Refer to your Owner\'s Manual or contact customer service for detailed guidance.';
    const instructionsContent = escapeHTML(instructions);

    // Build the row with all cells for this step
    rowsHtml += `
      <div>
        <div>${step.stepNumber || index + 1}</div>
        <div>${escapeHTML(title)}</div>
        <div>${instructionsContent}</div>
        ${step.safetyNote ? `<div>safety:${escapeHTML(step.safetyNote)}</div>` : ''}
      </div>
    `;
  });

  return `
    <div class="troubleshooting-steps${variant !== 'default' ? ` ${variant}` : ''}">
      ${rowsHtml}
    </div>
  `.trim();
}

/**
 * Build Support CTA block HTML
 *
 * Support CTA is authored as a table block in DA:
 * | Support CTA                   |                              |
 * |-------------------------------|------------------------------|
 * | Contact Support               | Order Parts                  |
 * | Still need help? We're here.  | Replacement blades & more    |
 * | /support/contact              | /shop/parts                  |
 * | primary                       | secondary                    |
 *
 * HTML structure:
 * <div class="support-cta">
 *   <div><div>Title1</div><div>Title2</div></div>
 *   <div><div>Desc1</div><div>Desc2</div></div>
 *   <div><div>url1</div><div>url2</div></div>
 *   <div><div>primary</div><div>secondary</div></div>
 * </div>
 */
function buildSupportCTAHTML(content: any, variant: string): string {
  const ctas = content.ctas || [];
  if (ctas.length === 0) {
    return `<div class="support-cta${variant !== 'default' ? ` ${variant}` : ''}"></div>`;
  }

  // Row 1: Titles
  const titlesRow = ctas.map((cta: any) => `<div>${escapeHTML(cta.title || '')}</div>`).join('');

  // Row 2: Descriptions
  const descRow = ctas.map((cta: any) => `<div>${escapeHTML(cta.description || '')}</div>`).join('');

  // Row 3: URLs
  const urlRow = ctas.map((cta: any) => `<div>${escapeHTML(cta.url || '#')}</div>`).join('');

  // Row 4: Styles
  const styleRow = ctas.map((cta: any) => `<div>${escapeHTML(cta.style || 'secondary')}</div>`).join('');

  return `
    <div class="support-cta${variant !== 'default' ? ` ${variant}` : ''}">
      <div>${titlesRow}</div>
      <div>${descRow}</div>
      <div>${urlRow}</div>
      <div>${styleRow}</div>
    </div>
  `.trim();
}

/**
 * Build Product Hero block HTML
 *
 * Product Hero is authored as a table block in DA:
 * | Product Hero                    |                              |
 * |---------------------------------|------------------------------|
 * | Ascent Series                   | [product-image.jpg]          |
 * | ## Vitamix A3500                |                              |
 * | Brushed Stainless               |                              |
 * | #8B8B8B | #1a1a1a | #d4af37     |                              |
 * | [[Find Locally]] [[Compare]]   |                              |
 *
 * HTML structure:
 * <div class="product-hero">
 *   <div>
 *     <div><!-- details cell: series, name, swatches, buttons --></div>
 *     <div><picture>...</picture></div>
 *   </div>
 * </div>
 */
function buildProductHeroHTML(content: any, variant: string, blockId: string, imageUrl: string | null): string {
  const productName = content.productName || '';
  const description = content.description || '';
  const price = content.price || '';
  const specs = content.specs || '';
  // Ensure compareUrl uses explore-friendly path
  let compareUrl = content.compareUrl || '/compare';
  if (compareUrl.includes('/us/en_us/')) {
    // Fix legacy paths to explore-friendly format
    compareUrl = `/compare/${productName.toLowerCase().replace(/\s+/g, '-')}`;
  }
  // Default generation hint if not provided
  const compareHint = content.compareGenerationHint || `compare ${productName} with similar Vitamix models`;

  // Build image HTML with data-gen-image for progressive loading
  const imageId = `product-hero-${blockId}`;
  const imageSrc = imageUrl || PLACEHOLDER_IMAGE;
  const imageHtml = `<div><picture><img loading="lazy" alt="${escapeHTML(productName)}" src="${imageSrc}" data-gen-image="${imageId}"></picture></div>`;

  return `
    <div class="product-hero${variant !== 'default' ? ` ${variant}` : ''}">
      <div>
        <div>
          <h1>${escapeHTML(productName)}</h1>
          ${description ? `<p>${escapeHTML(description)}</p>` : ''}
          ${price ? `<p><strong>${escapeHTML(price)}</strong></p>` : ''}
          ${specs ? `<p>${escapeHTML(specs)}</p>` : ''}
          <p><a href="${escapeHTML(compareUrl)}" data-cta-type="explore" data-generation-hint="${escapeHTML(compareHint)}">Compare Models</a></p>
        </div>
        ${imageHtml}
      </div>
    </div>
  `.trim();
}

/**
 * Build Specs Table block HTML
 *
 * Two-row grid layout showing product specifications
 * Each row contains 4 spec cards with label/value pairs
 *
 * HTML structure:
 * <div class="specs-table">
 *   <div>
 *     <div><p><strong>Label</strong></p><p>Value</p></div>
 *     ...4 specs per row...
 *   </div>
 *   <div>...second row of 4 specs...</div>
 * </div>
 */
function buildSpecsTableHTML(content: any, variant: string): string {
  const specs = content.specs || [];

  // Each spec becomes a row with label | value
  const rowsHtml = specs.map((spec: any) => `
        <div>
          <div>${escapeHTML(spec.label || '')}</div>
          <div>${escapeHTML(spec.value || '')}</div>
        </div>`).join('');

  return `
    <div class="specs-table${variant !== 'default' ? ` ${variant}` : ''}">${rowsHtml}
    </div>
  `.trim();
}

/**
 * Build Feature Highlights block HTML
 *
 * Feature cards with image + title + description
 *
 * HTML structure:
 * <div class="feature-highlights">
 *   <div>
 *     <div><picture><img></picture></div>
 *     <div><h3>Title</h3><p>Description</p></div>
 *   </div>
 *   ...more features...
 * </div>
 */
function buildFeatureHighlightsHTML(content: any, variant: string, blockId: string, resolvedImages?: Map<string, ResolvedImage | null>): string {
  const features = content.features || [];

  const featuresHtml = features.filter((f: any) => f && f.title).map((feature: any, idx: number) => {
    const imageId = `feature-highlights-${blockId}-${idx}`;
    const imageUrl = getResolvedImageUrl(imageId, resolvedImages);
    const title = feature.title || 'Feature';
    const description = feature.description || '';

    const imageHtml = imageUrl
      ? `<div><picture><img loading="lazy" alt="${escapeHTML(title)}" src="${imageUrl}"></picture></div>`
      : '<div></div>';

    return `
        <div>
          ${imageHtml}
          <div>
            <h3>${escapeHTML(title)}</h3>
            <p>${escapeHTML(description)}</p>
          </div>
        </div>`;
  }).join('');

  return `
    <div class="feature-highlights${variant !== 'default' ? ` ${variant}` : ''}">${featuresHtml}
    </div>
  `.trim();
}

/**
 * Build Included Accessories block HTML
 *
 * Accessory cards with image + title + description
 *
 * HTML structure:
 * <div class="included-accessories">
 *   <div>
 *     <div><picture><img></picture></div>
 *     <div><p><strong>Title</strong></p><p>Description</p></div>
 *   </div>
 *   ...more accessories...
 * </div>
 */
function buildIncludedAccessoriesHTML(content: any, variant: string, blockId: string, resolvedImages?: Map<string, ResolvedImage | null>): string {
  const accessories = content.accessories || [];

  const accessoriesHtml = accessories.filter((acc: any) => acc && acc.title).map((accessory: any, idx: number) => {
    const imageId = `included-accessories-${blockId}-${idx}`;
    const imageUrl = getResolvedImageUrl(imageId, resolvedImages);
    const title = accessory.title || 'Accessory';
    const description = accessory.description || '';

    // Skip image div if no image resolved
    const imageHtml = imageUrl ? `
          <div>
            <picture>
              <img loading="lazy" alt="${escapeHTML(title)}" src="${imageUrl}">
            </picture>
          </div>` : '';

    return `
        <div>${imageHtml}
          <div>
            <p><strong>${escapeHTML(title)}</strong></p>
            <p>${escapeHTML(description)}</p>
          </div>
        </div>`;
  }).join('');

  return `
    <div class="included-accessories${variant !== 'default' ? ` ${variant}` : ''}">${accessoriesHtml}
    </div>
  `.trim();
}

/**
 * Build Product CTA block HTML
 *
 * Call-to-action section with headline, description, and multiple CTAs
 *
 * HTML structure:
 * <div class="product-cta">
 *   <div>
 *     <div>
 *       <h2>Headline</h2>
 *       <p>Description</p>
 *       <p><a href="...">Primary CTA</a></p>
 *       <p><a href="...">Secondary CTA</a></p>
 *       <p><a href="...">Tertiary CTA</a></p>
 *     </div>
 *   </div>
 * </div>
 */
function buildProductCTAHTML(content: any, variant: string): string {
  let ctasHtml = '';

  if (content.primaryCta) {
    ctasHtml += `<p><a href="${escapeHTML(content.primaryCta.url)}">${escapeHTML(content.primaryCta.text)}</a></p>`;
  }
  if (content.secondaryCta) {
    ctasHtml += `<p><a href="${escapeHTML(content.secondaryCta.url)}">${escapeHTML(content.secondaryCta.text)}</a></p>`;
  }
  if (content.tertiaryCta) {
    ctasHtml += `<p><a href="${escapeHTML(content.tertiaryCta.url)}">${escapeHTML(content.tertiaryCta.text)}</a></p>`;
  }

  return `
    <div class="product-cta${variant !== 'default' ? ` ${variant}` : ''}">
      <div>
        <div>
          <h2>${escapeHTML(content.headline || '')}</h2>
          ${content.description ? `<p>${escapeHTML(content.description)}</p>` : ''}
          ${ctasHtml}
        </div>
      </div>
    </div>
  `.trim();
}

/**
 * Build complete EDS-compatible HTML
 * Images already have predictable URLs built into the block HTML
 *
 * EDS Section Structure Rules:
 * 1. Each section is a <div> directly inside <main>
 * 2. NO <hr> separators - sections are defined by the wrapping divs
 * 3. section-metadata block must be INSIDE the same div as the content block
 *    (not in a separate wrapper div)
 *
 * Correct structure:
 * <main>
 *   <div>                                    <!-- section 1 -->
 *     <div class="block-name">...</div>      <!-- block content -->
 *     <div class="section-metadata">...</div> <!-- metadata inside same section -->
 *   </div>
 *   <div>                                    <!-- section 2 -->
 *     <div class="block-name">...</div>
 *   </div>
 * </main>
 */
function buildEDSHTML(
  content: GeneratedContent,
  layout: LayoutDecision,
  slug: string,
  ragContext?: RAGContext
): string {
  // Build blocks HTML (images have predictable URLs based on slug)
  const blocksHtml = layout.blocks.map((layoutBlock) => {
    const contentBlock = content.blocks[layoutBlock.contentIndex];
    if (!contentBlock) return '';

    const blockHtml = buildBlockHTML(contentBlock, layoutBlock, slug, ragContext);

    // Build section-metadata if section has a style
    let sectionMetadataHtml = '';
    if (layoutBlock.sectionStyle && layoutBlock.sectionStyle !== 'default') {
      sectionMetadataHtml = `
      <div class="section-metadata">
        <div>
          <div>style</div>
          <div>${layoutBlock.sectionStyle}</div>
        </div>
      </div>`;
    }

    // Return section with block + section-metadata inside the same div
    // NO <hr> separator - sections are defined by the wrapping divs
    return `
    <div>
      ${blockHtml}${sectionMetadataHtml}
    </div>`;
  }).join('\n');

  return `
<!DOCTYPE html>
<html>
<head>
  <title>${escapeHTML(content.meta.title)}</title>
  <meta name="description" content="${escapeHTML(content.meta.description)}">
  <meta name="template" content="generative">
  <meta name="generation-query" content="${escapeHTML(content.headline)}">
</head>
<body>
  <header></header>
  <main>
    ${blocksHtml}
  </main>
  <footer></footer>
</body>
</html>
  `.trim();
}

/**
 * Extract full text from content for validation
 */
function extractFullText(content: GeneratedContent): string {
  const parts = [content.headline, content.subheadline];

  for (const block of content.blocks) {
    const c = block.content as any;

    if (c.headline) parts.push(c.headline);
    if (c.subheadline) parts.push(c.subheadline);
    if (c.text) parts.push(c.text);
    if (c.body) parts.push(c.body);
    if (c.description) parts.push(c.description);

    if (c.cards) {
      for (const card of c.cards) {
        if (card.title) parts.push(card.title);
        if (card.description) parts.push(card.description);
      }
    }

    if (c.columns) {
      for (const col of c.columns) {
        if (col.headline) parts.push(col.headline);
        if (col.text) parts.push(col.text);
      }
    }

    if (c.items) {
      for (const item of c.items) {
        if (item.question) parts.push(item.question);
        if (item.answer) parts.push(item.answer);
      }
    }
  }

  return parts.filter(Boolean).join(' ');
}

/**
 * Log blocked content to KV for monitoring
 * Stores details about why content was blocked for later analysis
 */
async function logBlockedContent(
  env: Env,
  query: string,
  safetyResult: ContentSafetyResult
): Promise<void> {
  const log = {
    timestamp: new Date().toISOString(),
    query,
    reason: safetyResult.reason || 'safety_violation',
    scores: safetyResult.scores,
    flags: safetyResult.flags,
    timing: safetyResult.timing,
  };

  const key = `blocked:${Date.now()}`;
  await env.CACHE.put(key, JSON.stringify(log), {
    expirationTtl: 86400 * 30, // Keep for 30 days
  });
}

// ============================================================
// Single Recipe Layout Blocks
// ============================================================

/**
 * Build Recipe Hero block HTML
 *
 * Large hero image with recipe title, description, and meta info
 */
function buildRecipeHeroHTML(content: any, variant: string, blockId: string, resolvedImages?: Map<string, ResolvedImage | null>): string {
  const imageId = `recipe-hero-${blockId}`;
  const resolved = getResolvedImage(imageId, resolvedImages);
  const imageUrl = resolved?.url;
  const cropNeeded = resolved?.cropNeeded;

  const title = content.title || 'Delicious Recipe';
  const description = content.description || '';
  const prepTime = content.prepTime || '10 min';
  const cookTime = content.cookTime || '20 min';
  const servings = content.servings || '4 servings';
  const difficulty = content.difficulty || 'Easy';

  // Image div only if resolved, with crop attr if needed
  const cropAttr = cropNeeded ? ' data-crop="true"' : '';
  const imageHtml = imageUrl ? `
        <div>
          <picture>
            <img src="${imageUrl}" alt="${escapeHTML(title)}" loading="lazy"${cropAttr}>
          </picture>
        </div>` : '';

  return `
    <div class="recipe-hero${variant !== 'default' ? ` ${variant}` : ''}${!imageUrl ? ' text-only' : ''}">
      <div>${imageHtml}
        <div>
          <h1>${escapeHTML(title)}</h1>
          ${description ? `<p>${escapeHTML(description)}</p>` : ''}
          <p>${escapeHTML(prepTime)} prep • ${escapeHTML(cookTime)} cook • ${escapeHTML(servings)} • ${escapeHTML(difficulty)}</p>
        </div>
      </div>
    </div>
  `.trim();
}

/**
 * Build Ingredients List block HTML
 *
 * List of ingredients with quantities
 */
function buildIngredientsListHTML(content: any, variant: string): string {
  const title = content.title || 'Ingredients';
  const sections = content.sections || [];
  const servingsNote = content.servingsNote || '';

  // Build items from all sections
  let itemsHtml = '';
  for (const section of sections) {
    if (section.name) {
      itemsHtml += `
        <div>
          <div><strong>${escapeHTML(section.name)}</strong></div>
        </div>`;
    }
    const items = section.items || [];
    for (const ing of items) {
      itemsHtml += `
        <div>
          <div>${escapeHTML(ing.amount)}</div>
          <div>${escapeHTML(ing.item)}${ing.note ? `, ${escapeHTML(ing.note)}` : ''}</div>
        </div>`;
    }
  }

  return `
    <div class="ingredients-list${variant !== 'default' ? ` ${variant}` : ''}">
      <div>
        <div><h2>${escapeHTML(title)}</h2></div>
        ${servingsNote ? `<div><p>${escapeHTML(servingsNote)}</p></div>` : ''}
      </div>${itemsHtml}
    </div>
  `.trim();
}

/**
 * Build Recipe Steps block HTML
 *
 * Numbered steps with optional images
 */
function buildRecipeStepsHTML(content: any, variant: string, slug: string, blockId: string, resolvedImages?: Map<string, ResolvedImage | null>): string {
  const title = content.title || 'Instructions';
  const steps = content.steps || [];

  const stepsHtml = steps.map((step: any, i: number) => {
    const imageId = `recipe-step-${blockId}-${i}`;
    const imageUrl = getResolvedImageUrl(imageId, resolvedImages);
    // Only add image placeholder if step has an imagePrompt (indicates image expected)
    const imageSrc = imageUrl || PLACEHOLDER_IMAGE;
    const imageHtml = step.imagePrompt
      ? `<div><picture><img src="${imageSrc}" alt="Step ${i + 1}" loading="lazy" data-gen-image="${imageId}"></picture></div>`
      : '';

    return `
        <div>
          <div><p><strong>Step ${i + 1}</strong></p></div>
          <div><p>${escapeHTML(step.instruction || '')}</p></div>
          ${imageHtml}
        </div>`;
  }).join('');

  return `
    <div class="recipe-steps${variant !== 'default' ? ` ${variant}` : ''}">
      <div>
        <div><h2>${escapeHTML(title)}</h2></div>
      </div>${stepsHtml}
    </div>
  `.trim();
}

/**
 * Build Nutrition Facts block HTML
 *
 * Grid of nutritional information
 */
function buildNutritionFactsHTML(content: any, variant: string): string {
  const title = content.title || 'Nutrition Facts';
  const servingSize = content.servingSize || 'Per serving';
  const facts = content.facts || [];

  const factsHtml = facts.map((fact: any) => `
          <div>${escapeHTML(fact.label || '')}</div>
          <div>${escapeHTML(fact.value || '')}</div>`).join('');

  return `
    <div class="nutrition-facts${variant !== 'default' ? ` ${variant}` : ''}">
      <div>
        <div><h3>${escapeHTML(title)}</h3></div>
        <div><p>${escapeHTML(servingSize)}</p></div>
      </div>
      <div>${factsHtml}
      </div>
    </div>
  `.trim();
}

/**
 * Build Recipe Tips block HTML
 *
 * Tips and notes for the recipe
 */
function buildRecipeTipsHTML(content: any, variant: string): string {
  const title = content.title || 'Pro Tips';
  const tips = content.tips || [];
  const variations = content.variations || [];

  const tipsHtml = tips.map((tip: any) => `
        <div>
          <div><p><strong>${escapeHTML(tip.title)}</strong></p></div>
          <div><p>${escapeHTML(tip.description)}</p></div>
        </div>`).join('');

  const variationsHtml = variations.length > 0 ? `
      <div>
        <div><h3>Variations</h3></div>
      </div>` + variations.map((v: any) => `
        <div>
          <div><p><strong>${escapeHTML(v.name)}</strong></p></div>
          <div><p>${escapeHTML(v.description)}</p></div>
        </div>`).join('') : '';

  return `
    <div class="recipe-tips${variant !== 'default' ? ` ${variant}` : ''}">
      <div>
        <div><h2>${escapeHTML(title)}</h2></div>
      </div>${tipsHtml}${variationsHtml}
    </div>
  `.trim();
}

// ============================================================
// Single Recipe Detail Layout Blocks (vitamix.com style)
// ============================================================

/**
 * Build Recipe Hero Detail block HTML
 *
 * Split hero with image left, title/rating/metadata/dietary right
 * Matches vitamix.com single recipe page design.
 */
function buildRecipeHeroDetailHTML(content: any, variant: string, blockId: string, resolvedImages?: Map<string, ResolvedImage | null>): string {
  const imageId = `recipe-hero-${blockId}`;
  const resolved = getResolvedImage(imageId, resolvedImages);
  const imageUrl = resolved?.url;
  const cropNeeded = resolved?.cropNeeded;

  const title = content.title || 'Delicious Recipe';
  const description = content.description || '';
  const totalTime = content.totalTime || '30 Minutes';
  const yieldText = content.yield || '2 servings';
  const difficulty = content.difficulty || 'Easy';

  // Image div only if resolved, with crop attr if needed
  const cropAttr = cropNeeded ? ' data-crop="true"' : '';
  const imageHtml = imageUrl ? `
        <div>
          <picture>
            <img src="${imageUrl}" alt="${escapeHTML(title)}" loading="lazy"${cropAttr}>
          </picture>
        </div>` : '';

  return `
    <div class="recipe-hero-detail${variant !== 'default' ? ` ${variant}` : ''}${!imageUrl ? ' text-only' : ''}">
      <div>${imageHtml}
        <div>
          <h1>${escapeHTML(title)}</h1>
          ${description ? `<p>${escapeHTML(description)}</p>` : ''}
          <p>${escapeHTML(totalTime)}|${escapeHTML(yieldText)}|${escapeHTML(difficulty)}</p>
        </div>
      </div>
    </div>
  `.trim();
}

/**
 * Build Recipe Tabs block HTML
 *
 * Tab navigation bar for recipe sections.
 */
function buildRecipeTabsHTML(content: any, variant: string): string {
  const tabs = content.tabs || ['THE RECIPE', 'NUTRITIONAL FACTS', 'RELATED RECIPES'];

  const tabsHtml = tabs.map((tab: string) => `<div>${escapeHTML(tab)}</div>`).join('');

  return `
    <div class="recipe-tabs${variant !== 'default' ? ` ${variant}` : ''}">
      <div>${tabsHtml}</div>
    </div>
  `.trim();
}

/**
 * Build Recipe Sidebar block HTML
 *
 * Left sidebar with nutrition facts only.
 */
function buildRecipeSidebarHTML(content: any, variant: string): string {
  const servingSize = content.servingSize || '1 serving (542 g)';
  const nutrition = content.nutrition || {
    calories: '240',
    totalFat: '7G',
    totalCarbohydrate: '44G',
    dietaryFiber: '12G',
    sugars: '8G',
    protein: '4G',
    cholesterol: '0MG',
    sodium: '300MG',
    saturatedFat: '1G',
  };

  const nutritionRows = [
    { label: 'CALORIES', value: nutrition.calories },
    { label: 'TOTAL FAT', value: nutrition.totalFat },
    { label: 'TOTAL CARBOHYDRATE', value: nutrition.totalCarbohydrate },
    { label: 'DIETARY FIBER', value: nutrition.dietaryFiber },
    { label: 'SUGARS', value: nutrition.sugars },
    { label: 'PROTEIN', value: nutrition.protein },
    { label: 'CHOLESTEROL', value: nutrition.cholesterol },
    { label: 'SODIUM', value: nutrition.sodium },
    { label: 'SATURATED FAT', value: nutrition.saturatedFat },
  ].filter((row) => row.value);

  const nutritionHtml = nutritionRows.map((row) => `
        <div>
          <div>${escapeHTML(row.label)}</div>
          <div>${escapeHTML(row.value)}</div>
        </div>`).join('');

  return `
    <div class="recipe-sidebar${variant !== 'default' ? ` ${variant}` : ''}">
      <div>
        <div>servingSize</div>
        <div>${escapeHTML(servingSize)}</div>
      </div>${nutritionHtml}
    </div>
  `.trim();
}

/**
 * Build Recipe Directions block HTML
 *
 * Numbered step-by-step recipe directions.
 */
function buildRecipeDirectionsHTML(content: any, variant: string): string {
  const title = content.title || 'Directions';
  const steps = content.steps || [];

  const stepsHtml = steps.map((step: any, i: number) => `
        <div>
          <div>Step ${i + 1}</div>
          <div>${escapeHTML(step.instruction || step)}</div>
        </div>`).join('');

  return `
    <div class="recipe-directions${variant !== 'default' ? ` ${variant}` : ''}">
      <div>
        <div><h2>${escapeHTML(title)}</h2></div>
      </div>${stepsHtml}
    </div>
  `.trim();
}

// ============================================================
// Campaign Landing Layout Blocks
// ============================================================

/**
 * Build Countdown Timer block HTML
 *
 * Countdown to campaign end date
 */
function buildCountdownTimerHTML(content: any, variant: string): string {
  const headline = content.headline || 'Limited Time Offer';
  const subheadline = content.subheadline || 'Don\'t miss out!';
  const endDate = content.endDate || '';

  return `
    <div class="countdown-timer${variant !== 'default' ? ` ${variant}` : ''}">
      <div>
        <div>
          <h2>${escapeHTML(headline)}</h2>
          <p>${escapeHTML(subheadline)}</p>
          <div class="timer" data-end-date="${escapeHTML(endDate)}">
            <div><span class="days">00</span><span>Days</span></div>
            <div><span class="hours">00</span><span>Hours</span></div>
            <div><span class="minutes">00</span><span>Minutes</span></div>
            <div><span class="seconds">00</span><span>Seconds</span></div>
          </div>
        </div>
      </div>
    </div>
  `.trim();
}

/**
 * Build Testimonials block HTML
 *
 * Customer testimonials with photos
 */
function buildTestimonialsHTML(content: any, variant: string, blockId: string, resolvedImages?: Map<string, ResolvedImage | null>): string {
  const title = content.title || 'What Our Customers Say';
  const testimonials = content.testimonials || [];

  const testimonialsHtml = testimonials.map((t: any, i: number) => {
    const imageId = `testimonial-${blockId}-${i}`;
    const imageUrl = getResolvedImageUrl(imageId, resolvedImages);
    const stars = t.rating ? '★'.repeat(t.rating) + '☆'.repeat(5 - t.rating) : '';

    return `
        <div>
          ${imageUrl ? `<div><picture><img src="${imageUrl}" alt="${escapeHTML(t.author)}" loading="lazy"></picture></div>` : ''}
          <div>
            ${stars ? `<p>${stars}</p>` : ''}
            <p>"${escapeHTML(t.quote)}"</p>
            <p><strong>${escapeHTML(t.author)}</strong>${t.location ? `, ${escapeHTML(t.location)}` : ''}</p>
            ${t.product ? `<p>Purchased: ${escapeHTML(t.product)}</p>` : ''}
          </div>
        </div>`;
  }).join('');

  return `
    <div class="testimonials${variant !== 'default' ? ` ${variant}` : ''}">
      <div>
        <div><h2>${escapeHTML(title)}</h2></div>
      </div>${testimonialsHtml}
    </div>
  `.trim();
}

// ============================================================
// About/Story Layout Blocks
// ============================================================

/**
 * Build Timeline block HTML
 *
 * Company history timeline
 */
function buildTimelineHTML(content: any, variant: string): string {
  const title = content.title || 'Our Story';
  const events = content.events || [];

  const eventsHtml = events.map((event: any) => `
        <div>
          <div><p><strong>${escapeHTML(event.year || '')}</strong></p></div>
          <div>
            <p><strong>${escapeHTML(event.title || '')}</strong></p>
            <p>${escapeHTML(event.description || '')}</p>
          </div>
        </div>`).join('');

  return `
    <div class="timeline${variant !== 'default' ? ` ${variant}` : ''}">
      <div>
        <div><h2>${escapeHTML(title)}</h2></div>
      </div>${eventsHtml}
    </div>
  `.trim();
}

/**
 * Build Team Cards block HTML
 *
 * Team member cards with photos
 */
function buildTeamCardsHTML(content: any, variant: string, blockId: string, resolvedImages?: Map<string, ResolvedImage | null>): string {
  const title = content.title || 'Our Team';
  const members = content.members || [];

  const membersHtml = members.map((member: any, i: number) => {
    const imageId = `team-${blockId}-${i}`;
    const imageUrl = getResolvedImageUrl(imageId, resolvedImages);

    return `
        <div>
          ${imageUrl ? `<div><picture><img src="${imageUrl}" alt="${escapeHTML(member.name || '')}" loading="lazy"></picture></div>` : ''}
          <div>
            <p><strong>${escapeHTML(member.name || '')}</strong></p>
            <p>${escapeHTML(member.role || '')}</p>
            ${member.bio ? `<p>${escapeHTML(member.bio)}</p>` : ''}
          </div>
        </div>`;
  }).join('');

  return `
    <div class="team-cards${variant !== 'default' ? ` ${variant}` : ''}">
      <div>
        <div><h2>${escapeHTML(title)}</h2></div>
      </div>${membersHtml}
    </div>
  `.trim();
}

/**
 * Escape HTML entities
 */
function escapeHTML(str: string | undefined | null): string {
  if (str == null) return '';
  const s = String(str);
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Generate a contextual hint for explore CTAs based on block content.
 * This prevents generic button text like "Learn More" from becoming the query.
 *
 * The hint describes what content should be generated when the user clicks,
 * based on the actual content of the block they're viewing.
 */
function generateContextualHint(context: {
  headline?: string;
  description?: string;
  eyebrow?: string;
  blockType?: string;
}): string {
  const { headline, description, eyebrow, blockType } = context;

  // Build a meaningful hint from available content
  const parts: string[] = [];

  // Eyebrow often contains category info (e.g., "BEST FOR SMOOTHIES")
  if (eyebrow) {
    parts.push(eyebrow.toLowerCase().replace(/^best for\s*/i, ''));
  }

  // Headline is the primary content descriptor
  if (headline) {
    parts.push(headline);
  }

  // Description adds context
  if (description && description.length < 150) {
    parts.push(description);
  }

  // If we have meaningful content, combine it
  if (parts.length > 0) {
    const combined = parts.join(' - ');
    // Prefix with action phrase to make it a query-like hint
    if (blockType === 'hero') {
      return `more about ${combined}`;
    } else if (blockType === 'product-recommendation' || blockType === 'split-content') {
      return `details about ${combined}`;
    } else {
      return `learn more about ${combined}`;
    }
  }

  // Fallback if no content available
  return 'explore related content';
}
