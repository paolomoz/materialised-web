import type {
  Env,
  IntentClassification,
  RAGContext,
  GeneratedContent,
  LayoutDecision,
  ImageRequest,
  GeneratedImage,
  SSEEvent,
} from '../types';
import { classifyIntent, generateHeroAndContext, generateRemainingBlocks, validateBrandCompliance, type HeroContextOutput } from '../ai-clients/claude';
import { analyzeQuery } from '../ai-clients/gemini';
import { generateImages, decideImageStrategy } from '../ai-clients/imagen';
import { retrieveContext, expandQuery } from './rag';
import { getLayoutForIntent, templateToLayoutDecision, type LayoutTemplate } from '../prompts/layouts';

// Worker base URL for image serving
const WORKER_URL = 'https://vitamix-generative-fast.paolo-moz.workers.dev';

/**
 * Build predictable image URL for a given slug and image ID
 */
function buildImageUrl(slug: string, imageId: string): string {
  return `${WORKER_URL}/images/${slug}/${imageId}.png`;
}

/**
 * Orchestration context for two-phase generation
 */
interface TwoPhaseContext {
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
  layout?: LayoutTemplate;
  heroContext?: HeroContextOutput;
  remainingBlocks?: Array<{
    id: string;
    type: string;
    variant: string;
    sectionStyle: string;
    content: any;
  }>;
  images?: GeneratedImage[];
}

/**
 * Callback for streaming SSE events
 */
type SSECallback = (event: SSEEvent) => void;

/**
 * Two-Phase Orchestration
 *
 * Phase 1 (Fast): Generate hero block + page context with Haiku (~2-3 sec)
 *   → Stream hero to client immediately
 *
 * Phase 2 (Quality): Generate remaining blocks with Sonnet (~12-18 sec)
 *   → Stream blocks as they complete
 *
 * Total time similar to single-phase, but user sees content in ~3 seconds
 */
export async function orchestrateTwoPhase(
  query: string,
  slug: string,
  env: Env,
  onEvent: SSECallback
): Promise<{
  content: GeneratedContent;
  layout: LayoutDecision;
  images: GeneratedImage[];
  html: string;
}> {
  const ctx: TwoPhaseContext = { query, slug };
  const startTime = Date.now();

  try {
    // =========================================================================
    // STAGE 1: Intent + RAG (parallel) - ~1-2 seconds
    // =========================================================================
    console.log('[TwoPhase] Starting Stage 1: Intent + RAG');

    const [intent, ragAndEntities] = await Promise.all([
      classifyIntent(query, env),
      (async () => {
        const [ragContext, entities] = await Promise.all([
          retrieveContext(expandQuery(query), env, { contentTypes: [] }),
          analyzeQuery(query, env),
        ]);
        return { ragContext, entities };
      })(),
    ]);

    ctx.intent = intent;
    ctx.ragContext = ragAndEntities.ragContext;
    ctx.entities = ragAndEntities.entities;

    // Get layout template
    ctx.layout = getLayoutForIntent(
      intent.intentType,
      intent.contentTypes,
      intent.entities
    );

    console.log('[TwoPhase] Stage 1 complete:', {
      intentType: intent.intentType,
      layoutId: ctx.layout.id,
      ragChunks: ctx.ragContext.chunks.length,
      timeMs: Date.now() - startTime,
    });

    // Send layout preview
    const blockTypes = ctx.layout.sections.flatMap(
      section => section.blocks.map(block => block.type)
    );
    onEvent({
      event: 'layout',
      data: { blocks: blockTypes, totalBlocks: blockTypes.length },
    });

    // =========================================================================
    // STAGE 2: Phase 1 - Hero generation with Haiku (~2-3 seconds)
    // =========================================================================
    console.log('[TwoPhase] Starting Stage 2: Hero generation (Haiku)');
    const phase1Start = Date.now();

    ctx.heroContext = await generateHeroAndContext(
      query,
      ctx.ragContext,
      intent,
      ctx.layout,
      env
    );

    console.log('[TwoPhase] Stage 2 complete:', {
      headline: ctx.heroContext.headline,
      theme: ctx.heroContext.theme,
      heroType: ctx.heroContext.heroBlock.type,
      timeMs: Date.now() - phase1Start,
    });

    // =========================================================================
    // STREAM HERO IMMEDIATELY
    // =========================================================================
    const heroLayoutBlock = {
      blockType: ctx.heroContext.heroBlock.type,
      variant: ctx.heroContext.heroBlock.variant,
      sectionStyle: ctx.heroContext.heroBlock.sectionStyle,
      contentIndex: 0,
      width: 'full' as const,
    };

    // Signal hero block start
    onEvent({
      event: 'block-start',
      data: {
        blockId: ctx.heroContext.heroBlock.id,
        blockType: ctx.heroContext.heroBlock.type,
        position: 0,
      },
    });

    // Build and send hero HTML
    const heroHtml = buildBlockHTML(ctx.heroContext.heroBlock, heroLayoutBlock, slug);
    onEvent({
      event: 'block-content',
      data: {
        blockId: ctx.heroContext.heroBlock.id,
        html: heroHtml,
        partial: false,
        sectionStyle: ctx.heroContext.heroBlock.sectionStyle,
      },
    });

    onEvent({
      event: 'block-complete',
      data: { blockId: ctx.heroContext.heroBlock.id },
    });

    console.log('[TwoPhase] Hero streamed to client:', {
      timeFromStart: Date.now() - startTime,
    });

    // =========================================================================
    // STAGE 3: Phase 2 - Remaining blocks with Sonnet (~12-18 seconds)
    // =========================================================================
    console.log('[TwoPhase] Starting Stage 3: Remaining blocks (Sonnet)');
    const phase2Start = Date.now();

    const phase2Result = await generateRemainingBlocks(
      query,
      ctx.ragContext,
      intent,
      ctx.layout,
      ctx.heroContext,
      env
    );

    ctx.remainingBlocks = phase2Result.blocks;

    console.log('[TwoPhase] Stage 3 complete:', {
      blocksGenerated: phase2Result.blocks.length,
      timeMs: Date.now() - phase2Start,
    });

    // =========================================================================
    // STREAM REMAINING BLOCKS
    // =========================================================================
    const layout = templateToLayoutDecision(ctx.layout);

    for (let i = 0; i < phase2Result.blocks.length; i++) {
      const block = phase2Result.blocks[i];
      const layoutBlockIndex = i + 1; // +1 because hero is index 0
      const layoutBlock = layout.blocks[layoutBlockIndex] || {
        blockType: block.type,
        variant: block.variant,
        sectionStyle: block.sectionStyle,
        contentIndex: layoutBlockIndex,
        width: 'full' as const,
      };

      onEvent({
        event: 'block-start',
        data: {
          blockId: block.id,
          blockType: block.type,
          position: layoutBlockIndex,
        },
      });

      const blockHtml = buildBlockHTML(block, layoutBlock, slug);
      onEvent({
        event: 'block-content',
        data: {
          blockId: block.id,
          html: blockHtml,
          partial: false,
          sectionStyle: block.sectionStyle,
        },
      });

      onEvent({
        event: 'block-complete',
        data: { blockId: block.id },
      });
    }

    // =========================================================================
    // STAGE 4: Image generation (parallel, after content streamed)
    // =========================================================================
    console.log('[TwoPhase] Starting Stage 4: Image generation');

    // Combine all blocks for image decisions
    const allBlocks = [ctx.heroContext.heroBlock, ...phase2Result.blocks];
    const imageDecisions = await decideImagesForContent(allBlocks, ctx.ragContext, env);
    const imageRequests = buildImageRequests(allBlocks, imageDecisions);

    // Send image placeholders
    for (const request of imageRequests) {
      onEvent({
        event: 'image-placeholder',
        data: { imageId: request.id, blockId: request.blockId },
      });
    }

    // Generate images
    ctx.images = await generateImages(imageRequests, slug, env);

    // Send image ready events
    for (const image of ctx.images) {
      onEvent({
        event: 'image-ready',
        data: { imageId: image.id, url: image.url },
      });
    }

    // =========================================================================
    // STAGE 5: Validation and completion
    // =========================================================================
    const fullText = extractFullText(ctx.heroContext, phase2Result.blocks);
    const compliance = await validateBrandCompliance(fullText, env);

    if (!compliance.isCompliant && compliance.score < 70) {
      console.warn('[TwoPhase] Brand compliance issues:', compliance.issues);
    }

    // Build final content structure
    const content: GeneratedContent = {
      headline: ctx.heroContext.headline,
      subheadline: ctx.heroContext.subheadline,
      blocks: allBlocks,
      meta: ctx.heroContext.meta,
      citations: phase2Result.citations,
    };

    const html = buildEDSHTML(content, layout, slug);

    // Signal completion
    onEvent({
      event: 'generation-complete',
      data: {
        pageUrl: `/discover/${slug}`,
        totalTime: Date.now() - startTime,
        heroTime: phase1Start - startTime + (Date.now() - phase1Start),
      },
    });

    console.log('[TwoPhase] Complete:', {
      totalTimeMs: Date.now() - startTime,
      blocksGenerated: allBlocks.length,
      imagesGenerated: ctx.images.length,
    });

    return {
      content,
      layout,
      images: ctx.images,
      html,
    };

  } catch (error) {
    console.error('[TwoPhase] Error:', error);
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
 * Decide image strategy for all content blocks
 */
async function decideImagesForContent(
  blocks: Array<{ id: string; type: string; content: any }>,
  ragContext: RAGContext,
  env: Env
): Promise<Map<string, { useExisting: boolean; url?: string; prompt?: string }>> {
  const decisions = new Map();

  for (const block of blocks) {
    const decision = await decideImageStrategy(block.content, ragContext, env);
    decisions.set(block.id, {
      useExisting: decision.useExisting,
      url: decision.existingUrl,
      prompt: decision.generationPrompt,
    });
  }

  return decisions;
}

/**
 * Build image generation requests
 */
function buildImageRequests(
  blocks: Array<{ id: string; type: string; content: any }>,
  decisions: Map<string, { useExisting: boolean; url?: string; prompt?: string }>
): ImageRequest[] {
  const requests: ImageRequest[] = [];

  for (const block of blocks) {
    const decision = decisions.get(block.id);
    if (decision?.useExisting) continue;

    const blockContent = block.content as any;

    switch (block.type) {
      case 'hero':
        if (blockContent.imagePrompt || decision?.prompt) {
          requests.push({
            id: 'hero',
            blockId: block.id,
            prompt: decision?.prompt || blockContent.imagePrompt,
            aspectRatio: '5:2',
            size: 'hero',
          });
        }
        break;

      case 'cards':
        if (blockContent.cards) {
          blockContent.cards.forEach((card: any, i: number) => {
            if (card.imagePrompt || decision?.prompt) {
              requests.push({
                id: `card-${i}`,
                blockId: block.id,
                prompt: card.imagePrompt || decision?.prompt || `Image for ${card.title}`,
                aspectRatio: '4:3',
                size: 'card',
              });
            }
          });
        }
        break;

      case 'split-content':
      case 'product-recommendation':
        if (blockContent.imagePrompt || decision?.prompt) {
          requests.push({
            id: `${block.type}-${block.id}`,
            blockId: block.id,
            prompt: decision?.prompt || blockContent.imagePrompt,
            aspectRatio: '4:3',
            size: 'card',
          });
        }
        break;

      case 'recipe-cards':
        if (blockContent.recipes) {
          blockContent.recipes.forEach((recipe: any, i: number) => {
            if (recipe.imagePrompt || decision?.prompt) {
              requests.push({
                id: `recipe-${i}`,
                blockId: block.id,
                prompt: recipe.imagePrompt || decision?.prompt || `Appetizing ${recipe.title}`,
                aspectRatio: '4:3',
                size: 'card',
              });
            }
          });
        }
        break;

      case 'recipe-grid':
        if (blockContent.recipes) {
          blockContent.recipes.forEach((recipe: any, i: number) => {
            if (recipe.imagePrompt || decision?.prompt) {
              requests.push({
                id: `grid-recipe-${i}`,
                blockId: block.id,
                prompt: recipe.imagePrompt || decision?.prompt || `Appetizing ${recipe.title}`,
                aspectRatio: '4:3',
                size: 'card',
              });
            }
          });
        }
        break;

      case 'technique-spotlight':
        // technique-spotlight uses `technique-${blockId}` as image ID
        if (blockContent.imagePrompt || decision?.prompt) {
          requests.push({
            id: `technique-${block.id}`,
            blockId: block.id,
            prompt: decision?.prompt || blockContent.imagePrompt || `Blending technique: ${blockContent.title || 'Vitamix technique'}`,
            aspectRatio: '4:3',
            size: 'card',
          });
        }
        break;

      default:
        // Generic handling for other block types
        if (blockContent.imagePrompt || decision?.prompt) {
          requests.push({
            id: `${block.type}-${block.id}`,
            blockId: block.id,
            prompt: decision?.prompt || blockContent.imagePrompt,
            aspectRatio: '4:3',
            size: 'card',
          });
        }
        break;
    }
  }

  return requests;
}

/**
 * Build HTML for a single block
 * Imports the block HTML builders from the main orchestrator
 */
function buildBlockHTML(
  block: { id: string; type: string; variant: string; sectionStyle: string; content: any },
  layoutBlock: { variant?: string; sectionStyle?: string },
  slug: string
): string {
  const content = block.content;
  const variant = layoutBlock.variant || block.variant || 'default';

  // Import block builders - these are the same as in orchestrator.ts
  // For now, inline simplified versions
  switch (block.type) {
    case 'hero':
      return buildHeroHTML(content, variant, slug);
    case 'cards':
      return buildCardsHTML(content, variant, slug);
    case 'columns':
      return buildColumnsHTML(content, variant, slug);
    case 'text':
      return buildTextHTML(content, variant);
    case 'cta':
      return buildCTAHTML(content, variant);
    case 'faq':
      return buildFAQHTML(content, variant);
    case 'split-content':
      return buildSplitContentHTML(content, variant, slug, block.id);
    case 'benefits-grid':
      return buildBenefitsGridHTML(content, variant);
    case 'recipe-cards':
      return buildRecipeCardsHTML(content, variant, slug);
    case 'product-recommendation':
      return buildProductRecommendationHTML(content, variant, slug, block.id);
    case 'tips-banner':
      return buildTipsBannerHTML(content, variant);
    case 'support-hero':
      return buildSupportHeroHTML(content, variant);
    case 'diagnosis-card':
      return buildDiagnosisCardHTML(content, variant);
    case 'troubleshooting-steps':
      return buildTroubleshootingStepsHTML(content, variant, slug, block.id);
    case 'support-cta':
      return buildSupportCTAHTML(content, variant);
    case 'recipe-grid':
      return buildRecipeGridHTML(content, variant, slug);
    case 'ingredient-search':
      return buildIngredientSearchHTML(content, variant);
    case 'recipe-filter-bar':
      return buildRecipeFilterBarHTML(content, variant);
    case 'quick-view-modal':
      return buildQuickViewModalHTML(content, variant);
    case 'technique-spotlight':
      return buildTechniqueSpotlightHTML(content, variant, slug, block.id);
    default:
      return `<div class="${block.type}">${JSON.stringify(content)}</div>`;
  }
}

// ============================================================================
// Block HTML Builders (same as orchestrator.ts)
// ============================================================================

function buildHeroHTML(content: any, variant: string, slug: string): string {
  const imageUrl = buildImageUrl(slug, 'hero');
  return `
    <div class="hero${variant !== 'default' ? ` ${variant}` : ''}">
      <div>
        <div>
          <picture>
            <img src="${imageUrl}" alt="${escapeHTML(content.headline || '')}" data-gen-image="hero" loading="lazy">
          </picture>
        </div>
        <div>
          ${content.eyebrow ? `<p>${escapeHTML(content.eyebrow)}</p>` : ''}
          <h1>${escapeHTML(content.headline || '')}</h1>
          ${content.subheadline ? `<p>${escapeHTML(content.subheadline)}</p>` : ''}
          ${content.ctaText ? `<p><a href="${escapeHTML(content.ctaUrl || '/products/blenders')}" class="button">${escapeHTML(content.ctaText)}</a></p>` : ''}
        </div>
      </div>
    </div>
  `.trim();
}

function buildCardsHTML(content: any, variant: string, slug: string): string {
  const cards = content.cards || [];
  const cardsHtml = cards.map((card: any, i: number) => {
    const imageUrl = buildImageUrl(slug, `card-${i}`);
    return `
      <div>
        <div>
          <picture>
            <img src="${imageUrl}" alt="${escapeHTML(card.title || '')}" data-gen-image="card-${i}" loading="lazy">
          </picture>
        </div>
        <div>
          <p><strong>${escapeHTML(card.title || '')}</strong></p>
          <p>${escapeHTML(card.description || '')}</p>
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

function buildColumnsHTML(content: any, variant: string, slug: string): string {
  const columns = content.columns || [];
  const columnsHtml = columns.map((col: any, i: number) => {
    let colContent = '';
    if (col.imagePrompt) {
      const imageUrl = buildImageUrl(slug, `col-${i}`);
      colContent += `<picture><img src="${imageUrl}" alt="${escapeHTML(col.headline || '')}" data-gen-image="col-${i}" loading="lazy"></picture>`;
    }
    if (col.headline) {
      colContent += `<h3>${escapeHTML(col.headline)}</h3>`;
    }
    colContent += `<p>${escapeHTML(col.text || '')}</p>`;
    return `<div>${colContent}</div>`;
  }).join('');

  return `
    <div class="columns${variant !== 'default' ? ` ${variant}` : ''}">
      <div>${columnsHtml}</div>
    </div>
  `.trim();
}

function buildTextHTML(content: any, variant: string): string {
  const body = content.body || '';
  return `
    <div class="text${variant !== 'default' ? ` ${variant}` : ''}">
      <div><div>
        ${content.headline ? `<h2>${escapeHTML(content.headline)}</h2>` : ''}
        ${body.split('\n\n').map((p: string) => `<p>${escapeHTML(p)}</p>`).join('')}
      </div></div>
    </div>
  `.trim();
}

function buildCTAHTML(content: any, variant: string): string {
  return `
    <div class="cta${variant !== 'default' ? ` ${variant}` : ''}">
      <div><div>
        <h2>${escapeHTML(content.headline || '')}</h2>
        ${content.text ? `<p>${escapeHTML(content.text)}</p>` : ''}
        <p><a href="${escapeHTML(content.buttonUrl || '#')}" class="button primary">${escapeHTML(content.buttonText || 'Learn More')}</a></p>
      </div></div>
    </div>
  `.trim();
}

function buildFAQHTML(content: any, variant: string): string {
  const items = content.items || [];
  const faqHtml = items.map((item: any) => `
    <div>
      <div>${escapeHTML(item.question || '')}</div>
      <div>${escapeHTML(item.answer || '')}</div>
    </div>
  `).join('');

  return `
    <div class="faq${variant !== 'default' ? ` ${variant}` : ''}">
      ${faqHtml}
    </div>
  `.trim();
}

function buildSplitContentHTML(content: any, variant: string, slug: string, blockId: string): string {
  const imageId = `split-content-${blockId}`;
  const imageUrl = buildImageUrl(slug, imageId);

  let contentHtml = '';
  if (content.eyebrow) contentHtml += `<p>${escapeHTML(content.eyebrow)}</p>`;
  contentHtml += `<h2>${escapeHTML(content.headline || '')}</h2>`;
  contentHtml += `<p>${escapeHTML(content.body || '')}</p>`;
  if (content.price) {
    const priceNote = content.priceNote ? ` • ${escapeHTML(content.priceNote)}` : '';
    contentHtml += `<p><strong>${escapeHTML(content.price)}</strong>${priceNote}</p>`;
  }
  if (content.primaryCtaText) {
    contentHtml += `<p><a href="${escapeHTML(content.primaryCtaUrl || '#')}">${escapeHTML(content.primaryCtaText)}</a></p>`;
  }

  return `
    <div class="split-content${variant !== 'default' ? ` ${variant}` : ''}">
      <div>
        <div>
          <picture>
            <img src="${imageUrl}" alt="${escapeHTML(content.headline || '')}" data-gen-image="${imageId}" loading="lazy">
          </picture>
        </div>
        <div>${contentHtml}</div>
      </div>
    </div>
  `.trim();
}

function buildBenefitsGridHTML(content: any, variant: string): string {
  const items = content.items || [];
  const itemsHtml = items.map((item: any) => {
    const iconClass = item.icon ? `icon icon-${item.icon}` : '';
    return `
      <div>
        ${item.icon ? `<p><span class="${iconClass}"></span></p>` : ''}
        <p><strong>${escapeHTML(item.headline || '')}</strong></p>
        <p>${escapeHTML(item.description || '')}</p>
      </div>
    `;
  }).join('');

  return `
    <div class="benefits-grid${variant !== 'default' ? ` ${variant}` : ''}">
      <div>${itemsHtml}</div>
    </div>
  `.trim();
}

function buildRecipeCardsHTML(content: any, variant: string, slug: string): string {
  const recipes = content.recipes || [];
  if (recipes.length === 0) return `<div class="recipe-cards${variant !== 'default' ? ` ${variant}` : ''}"></div>`;

  let rowsHtml = '';
  if (content.sectionTitle) {
    rowsHtml += `<div><div><h2>${escapeHTML(content.sectionTitle)}</h2></div></div>`;
  }

  const imagesRow = recipes.map((r: any, i: number) => {
    const imageUrl = buildImageUrl(slug, `recipe-${i}`);
    return `<div><picture><img src="${imageUrl}" alt="${escapeHTML(r.title || '')}" data-gen-image="recipe-${i}" loading="lazy"></picture></div>`;
  }).join('');
  rowsHtml += `<div>${imagesRow}</div>`;

  const titlesRow = recipes.map((r: any) => `<div><p><strong>${escapeHTML(r.title || '')}</strong></p></div>`).join('');
  rowsHtml += `<div>${titlesRow}</div>`;

  const metaRow = recipes.map((r: any) => `<div><p>${escapeHTML(r.difficulty || 'Easy')} • ${escapeHTML(r.time || '10 min')}</p></div>`).join('');
  rowsHtml += `<div>${metaRow}</div>`;

  return `
    <div class="recipe-cards${variant !== 'default' ? ` ${variant}` : ''}">
      ${rowsHtml}
    </div>
  `.trim();
}

function buildProductRecommendationHTML(content: any, variant: string, slug: string, blockId: string): string {
  const imageId = `product-rec-${blockId}`;
  const imageUrl = buildImageUrl(slug, imageId);

  let contentHtml = '';
  if (content.eyebrow) contentHtml += `<p>${escapeHTML(content.eyebrow)}</p>`;
  contentHtml += `<h2>${escapeHTML(content.headline || '')}</h2>`;
  contentHtml += `<p>${escapeHTML(content.body || '')}</p>`;
  if (content.price) {
    const priceNote = content.priceNote ? ` • ${escapeHTML(content.priceNote)}` : '';
    contentHtml += `<p><strong>${escapeHTML(content.price)}</strong>${priceNote}</p>`;
  }
  if (content.primaryCtaText) {
    contentHtml += `<p><a href="${escapeHTML(content.primaryCtaUrl || '#')}">${escapeHTML(content.primaryCtaText)}</a></p>`;
  }

  return `
    <div class="product-recommendation${variant !== 'default' ? ` ${variant}` : ''}">
      <div>
        <div>
          <picture>
            <img src="${imageUrl}" alt="${escapeHTML(content.headline || '')}" data-gen-image="${imageId}" loading="lazy">
          </picture>
        </div>
        <div>${contentHtml}</div>
      </div>
    </div>
  `.trim();
}

function buildTipsBannerHTML(content: any, variant: string): string {
  let headerHtml = '';
  if (content.sectionTitle) {
    headerHtml = `<div><div><h2>${escapeHTML(content.sectionTitle)}</h2></div></div>`;
  }

  const tips = content.tips || [];
  const tipsHtml = tips.map((tip: any) => `
    <div>
      <p><strong>${escapeHTML(tip.headline || '')}</strong></p>
      <p>${escapeHTML(tip.description || '')}</p>
    </div>
  `).join('');

  return `
    <div class="tips-banner${variant !== 'default' ? ` ${variant}` : ''}">
      ${headerHtml}
      <div>${tipsHtml}</div>
    </div>
  `.trim();
}

function buildSupportHeroHTML(content: any, variant: string): string {
  let rowsHtml = '';
  if (content.icon) {
    rowsHtml += `<div><div><span class="icon icon-${escapeHTML(content.icon)}"></span></div></div>`;
  }
  if (content.title) {
    rowsHtml += `<div><div>${escapeHTML(content.title)}</div></div>`;
  }
  if (content.subtitle) {
    rowsHtml += `<div><div>${escapeHTML(content.subtitle)}</div></div>`;
  }

  return `
    <div class="support-hero${variant !== 'default' ? ` ${variant}` : ''}">
      ${rowsHtml}
    </div>
  `.trim();
}

function buildDiagnosisCardHTML(content: any, variant: string): string {
  const items = content.items || [];
  if (items.length === 0) return `<div class="diagnosis-card${variant !== 'default' ? ` ${variant}` : ''}"></div>`;

  const severityRow = items.map((item: any) => `<div>${escapeHTML(item.severity || 'minor')}</div>`).join('');
  const causeRow = items.map((item: any) => `<div>${escapeHTML(item.cause || '')}</div>`).join('');
  const implicationRow = items.map((item: any) => `<div>${escapeHTML(item.implication || '')}</div>`).join('');

  return `
    <div class="diagnosis-card${variant !== 'default' ? ` ${variant}` : ''}">
      <div>${severityRow}</div>
      <div>${causeRow}</div>
      <div>${implicationRow}</div>
    </div>
  `.trim();
}

function buildTroubleshootingStepsHTML(content: any, variant: string, slug: string, blockId: string): string {
  const steps = content.steps || [];
  if (steps.length === 0) return `<div class="troubleshooting-steps${variant !== 'default' ? ` ${variant}` : ''}"></div>`;

  let rowsHtml = '';
  steps.forEach((step: any, index: number) => {
    let instructionsContent = escapeHTML(step.instructions || '');
    if (step.imagePrompt) {
      const imageId = `step-${blockId}-${index}`;
      const imageUrl = buildImageUrl(slug, imageId);
      instructionsContent += `<br><picture><img src="${imageUrl}" alt="${escapeHTML(step.title || '')}" data-gen-image="${imageId}" loading="lazy"></picture>`;
    }

    rowsHtml += `
      <div>
        <div>${step.stepNumber || index + 1}</div>
        <div>${escapeHTML(step.title || '')}</div>
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

function buildSupportCTAHTML(content: any, variant: string): string {
  const ctas = content.ctas || [];
  if (ctas.length === 0) return `<div class="support-cta${variant !== 'default' ? ` ${variant}` : ''}"></div>`;

  const titlesRow = ctas.map((cta: any) => `<div>${escapeHTML(cta.title || '')}</div>`).join('');
  const descRow = ctas.map((cta: any) => `<div>${escapeHTML(cta.description || '')}</div>`).join('');
  const urlRow = ctas.map((cta: any) => `<div>${escapeHTML(cta.url || '#')}</div>`).join('');
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

function buildRecipeGridHTML(content: any, variant: string, slug: string): string {
  const recipes = content.recipes || [];
  if (recipes.length === 0) {
    return `<div class="recipe-grid${variant !== 'default' ? ` ${variant}` : ''}"></div>`;
  }

  let rowsHtml = '';

  // Row 1: Images
  const imagesRow = recipes.map((recipe: any, i: number) => {
    const imageUrl = buildImageUrl(slug, `grid-recipe-${i}`);
    return `<div><picture><img src="${imageUrl}" alt="${escapeHTML(recipe.title)}" data-gen-image="grid-recipe-${i}" loading="lazy"></picture></div>`;
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

function buildRecipeFilterBarHTML(content: any, variant: string): string {
  // The block JS generates the full UI, we just need the container
  return `
    <div class="recipe-filter-bar${variant !== 'default' ? ` ${variant}` : ''}">
      <div><div>Difficulty</div></div>
      <div><div>All</div><div>Quick</div><div>Medium</div><div>Long</div></div>
    </div>
  `.trim();
}

function buildQuickViewModalHTML(content: any, variant: string): string {
  return `
    <div class="quick-view-modal${variant !== 'default' ? ` ${variant}` : ''}">
      <div><div>enabled</div></div>
    </div>
  `.trim();
}

function buildTechniqueSpotlightHTML(content: any, variant: string, slug: string, blockId: string): string {
  const imageId = `technique-${blockId}`;
  const imageUrl = buildImageUrl(slug, imageId);

  let rowsHtml = '';

  // Row 1: Image/Video
  if (content.videoUrl) {
    rowsHtml += `<div><div><a href="${escapeHTML(content.videoUrl)}">${escapeHTML(content.videoUrl)}</a></div></div>`;
  } else {
    rowsHtml += `<div><div><picture><img src="${imageUrl}" alt="${escapeHTML(content.title || 'Technique')}" data-gen-image="${imageId}" loading="lazy"></picture></div></div>`;
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

// ============================================================================
// Utility functions
// ============================================================================

function buildEDSHTML(
  content: GeneratedContent,
  layout: LayoutDecision,
  slug: string
): string {
  const blocksHtml = content.blocks.map((block, index) => {
    const layoutBlock = layout.blocks[index] || {
      blockType: block.type,
      variant: block.variant,
      sectionStyle: block.sectionStyle,
      contentIndex: index,
      width: 'full' as const,
    };

    const blockHtml = buildBlockHTML(block as any, layoutBlock, slug);

    let sectionMetadataHtml = '';
    if (block.sectionStyle && block.sectionStyle !== 'default') {
      sectionMetadataHtml = `
      <div class="section-metadata">
        <div>
          <div>style</div>
          <div>${block.sectionStyle}</div>
        </div>
      </div>`;
    }

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

function extractFullText(heroContext: HeroContextOutput, remainingBlocks: any[]): string {
  const parts = [heroContext.headline, heroContext.subheadline];

  const processContent = (c: any) => {
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
  };

  processContent(heroContext.heroBlock.content);
  for (const block of remainingBlocks) {
    processContent(block.content);
  }

  return parts.filter(Boolean).join(' ');
}

function escapeHTML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
