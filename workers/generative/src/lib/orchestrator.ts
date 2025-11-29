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
import { classifyIntent, generateContent, validateBrandCompliance } from '../ai-clients/claude';
import { analyzeQuery } from '../ai-clients/gemini';
import { generateImages, decideImageStrategy } from '../ai-clients/imagen';
import { retrieveContext, expandQuery } from './rag';
import { getLayoutForIntent, templateToLayoutDecision, type LayoutTemplate } from '../prompts/layouts';

// Worker base URL for image serving
const WORKER_URL = 'https://vitamix-generative.paolo-moz.workers.dev';

/**
 * Build predictable image URL for a given slug and image ID
 * Images are stored at: /images/{slug}/{imageId}.png
 */
function buildImageUrl(slug: string, imageId: string): string {
  return `${WORKER_URL}/images/${slug}/${imageId}.png`;
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
 */
export async function orchestrate(
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
  const ctx: OrchestrationContext = { query, slug };

  try {
    // Stage 1: Intent Classification (fast, blocking)
    ctx.intent = await classifyIntent(query, env);

    // Stage 2: Parallel - RAG retrieval + Query analysis
    const [ragContext, entities] = await Promise.all([
      retrieveContext(expandQuery(query), env, {
        contentTypes: ctx.intent.contentTypes,
      }),
      analyzeQuery(query, env),
    ]);

    ctx.ragContext = ragContext;
    ctx.entities = entities;

    // Get layout template based on intent (needed for content generation)
    const layoutTemplate = getLayoutForIntent(
      ctx.intent.intentType,
      ctx.intent.contentTypes,
      ctx.intent.entities
    );

    console.log('Layout selection:', {
      query,
      intentType: ctx.intent.intentType,
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
    ctx.content = await generateContent(query, ragContext, ctx.intent, layoutTemplate, env);

    // Stage 4: Derive layout from template + Image decisions
    // No Gemini call - we use the predefined layout template directly
    const layout = templateToLayoutDecision(layoutTemplate);
    const imageDecisions = await decideImagesForContent(ctx.content, ragContext, env);

    console.log('Layout decision from template:', {
      layoutId: layoutTemplate.id,
      blocks: layout.blocks.map(b => ({
        type: b.blockType,
        variant: b.variant,
        width: b.width,
      })),
    });

    ctx.layout = layout;

    // Stream block content as we have it (with predictable image URLs)
    await streamBlockContent(ctx.content, layout, ctx.slug, onEvent);

    // Stage 5: Image Generation (conditional)
    const imageRequests = buildImageRequests(ctx.content, imageDecisions);

    // Send image placeholders
    for (const request of imageRequests) {
      onEvent({
        event: 'image-placeholder',
        data: { imageId: request.id, blockId: request.blockId },
      });
    }

    // Generate images (this is slow, but we've already streamed content)
    ctx.images = await generateImages(imageRequests, ctx.slug, env);

    // Send image ready events
    for (const image of ctx.images) {
      onEvent({
        event: 'image-ready',
        data: { imageId: image.id, url: image.url },
      });
    }

    // Stage 6: Quality Validation
    const fullText = extractFullText(ctx.content);
    const compliance = await validateBrandCompliance(fullText, env);

    if (!compliance.isCompliant && compliance.score < 70) {
      console.warn('Brand compliance issues:', compliance.issues);
      // Could trigger regeneration here, but for now just log
    }

    // Build final HTML (images already have predictable URLs based on slug)
    const html = buildEDSHTML(ctx.content, ctx.layout, ctx.slug);

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
 * Decide image strategy for all content blocks
 */
async function decideImagesForContent(
  content: GeneratedContent,
  ragContext: RAGContext,
  env: Env
): Promise<Map<string, { useExisting: boolean; url?: string; prompt?: string }>> {
  const decisions = new Map();

  for (const block of content.blocks) {
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
 * Image IDs match the data-gen-image attributes in the HTML
 */
function buildImageRequests(
  content: GeneratedContent,
  decisions: Map<string, { useExisting: boolean; url?: string; prompt?: string }>
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
        if (blockContent.imagePrompt || decision?.prompt) {
          requests.push({
            id: 'hero',
            blockId: block.id,
            prompt: decision?.prompt || blockContent.imagePrompt,
            aspectRatio: getAspectRatioForBlock(block.type),
            size: getSizeForBlock(block.type),
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
                aspectRatio: getAspectRatioForBlock(block.type),
                size: getSizeForBlock(block.type),
              });
            }
          });
        }
        break;

      case 'columns':
        if (blockContent.columns) {
          blockContent.columns.forEach((col: any, i: number) => {
            if (col.imagePrompt) {
              requests.push({
                id: `col-${i}`,
                blockId: block.id,
                prompt: col.imagePrompt,
                aspectRatio: getAspectRatioForBlock(block.type),
                size: getSizeForBlock(block.type),
              });
            }
          });
        }
        break;

      case 'split-content':
        if (blockContent.imagePrompt || decision?.prompt) {
          requests.push({
            id: `split-content-${block.id}`,
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

      case 'product-recommendation':
        if (blockContent.imagePrompt || decision?.prompt) {
          requests.push({
            id: `product-rec-${block.id}`,
            blockId: block.id,
            prompt: decision?.prompt || blockContent.imagePrompt,
            aspectRatio: '4:3',
            size: 'card',
          });
        }
        break;

      // benefits-grid and tips-banner don't have images

      default:
        // Other block types - use generic image ID
        const imagePrompt = extractImagePrompt(blockContent);
        if (imagePrompt || decision?.prompt) {
          requests.push({
            id: `${block.type}-${block.id}`,
            blockId: block.id,
            prompt: decision?.prompt || imagePrompt,
            aspectRatio: getAspectRatioForBlock(block.type),
            size: getSizeForBlock(block.type),
          });
        }
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
  onEvent: SSECallback
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

    // Build HTML for this block (with predictable image URLs)
    const blockHtml = buildBlockHTML(contentBlock, layoutBlock, slug);

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
 * Build HTML for a single block
 */
function buildBlockHTML(
  block: GeneratedContent['blocks'][0],
  layoutBlock: LayoutDecision['blocks'][0],
  slug: string
): string {
  const content = block.content;
  const variant = layoutBlock.variant;

  switch (block.type) {
    case 'hero':
      return buildHeroHTML(content as any, variant, slug);
    case 'cards':
      return buildCardsHTML(content as any, variant, slug);
    case 'columns':
      return buildColumnsHTML(content as any, variant, slug);
    case 'text':
      return buildTextHTML(content as any, variant);
    case 'cta':
      return buildCTAHTML(content as any, variant);
    case 'faq':
      return buildFAQHTML(content as any, variant);
    case 'split-content':
      return buildSplitContentHTML(content as any, variant, slug, block.id);
    case 'benefits-grid':
      return buildBenefitsGridHTML(content as any, variant);
    case 'recipe-cards':
      return buildRecipeCardsHTML(content as any, variant, slug);
    case 'product-recommendation':
      return buildProductRecommendationHTML(content as any, variant, slug, block.id);
    case 'tips-banner':
      return buildTipsBannerHTML(content as any, variant);
    default:
      return '';
  }
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
function buildHeroHTML(content: any, variant: string, slug: string): string {
  // Use predictable URL - image will be served once generated
  const imageUrl = buildImageUrl(slug, 'hero');

  return `
    <div class="hero${variant !== 'default' ? ` ${variant}` : ''}">
      <div>
        <div>
          <picture>
            <img src="${imageUrl}" alt="${escapeHTML(content.headline)}" data-gen-image="hero" loading="lazy">
          </picture>
        </div>
        <div>
          <h1>${escapeHTML(content.headline)}</h1>
          ${content.subheadline ? `<p>${escapeHTML(content.subheadline)}</p>` : ''}
          ${content.ctaText ? `<p><a href="${escapeHTML(content.ctaUrl || '/products/blenders')}" class="button">${escapeHTML(content.ctaText)}</a></p>` : ''}
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
function buildCardsHTML(content: any, variant: string, slug: string): string {
  const cardsHtml = content.cards.map((card: any, i: number) => {
    // Use predictable URL - image will be served once generated
    const imageUrl = buildImageUrl(slug, `card-${i}`);

    return `
      <div>
        <div>
          <picture>
            <img src="${imageUrl}" alt="${escapeHTML(card.title)}" data-gen-image="card-${i}" loading="lazy">
          </picture>
        </div>
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
function buildColumnsHTML(content: any, variant: string, slug: string): string {
  // Build all columns as cells within a single row
  const columnsHtml = content.columns.map((col: any, i: number) => {
    let colContent = '';

    if (col.imagePrompt) {
      // Use predictable URL - image will be served once generated
      const imageUrl = buildImageUrl(slug, `col-${i}`);
      colContent += `
        <picture>
          <img src="${imageUrl}" alt="${escapeHTML(col.headline || '')}" data-gen-image="col-${i}" loading="lazy">
        </picture>
      `;
    }

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
  const isGenerative = content.isGenerative && content.buttonUrl.startsWith('/discover/');

  return `
    <div class="cta${variant !== 'default' ? ` ${variant}` : ''}${isGenerative ? ' generative-cta' : ''}">
      <div><div>
        <h2>${escapeHTML(content.headline)}</h2>
        ${content.text ? `<p>${escapeHTML(content.text)}</p>` : ''}
        <p>
          <a href="${escapeHTML(content.buttonUrl)}" class="button primary"
             ${isGenerative ? `data-generation-hint="${escapeHTML(content.generationHint || '')}"` : ''}>
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
function buildSplitContentHTML(content: any, variant: string, slug: string, blockId: string): string {
  // Use predictable URL - image will be served once generated
  // blockId comes from the content block (e.g., "block-3") to match image request IDs
  const imageId = `split-content-${blockId}`;
  const imageUrl = buildImageUrl(slug, imageId);

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

  // CTAs
  let ctaHtml = '';
  if (content.primaryCtaText) {
    ctaHtml += `<a href="${escapeHTML(content.primaryCtaUrl || '#')}">${escapeHTML(content.primaryCtaText)}</a>`;
  }
  if (content.secondaryCtaText) {
    ctaHtml += ` <a href="${escapeHTML(content.secondaryCtaUrl || '#')}">${escapeHTML(content.secondaryCtaText)}</a>`;
  }
  if (ctaHtml) {
    contentHtml += `<p>${ctaHtml}</p>`;
  }

  return `
    <div class="split-content${variant !== 'default' ? ` ${variant}` : ''}">
      <div>
        <div>
          <picture>
            <img src="${imageUrl}" alt="${escapeHTML(content.headline)}" data-gen-image="${imageId}" loading="lazy">
          </picture>
        </div>
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
function buildRecipeCardsHTML(content: any, variant: string, slug: string): string {
  // Add section title if present
  let headerHtml = '';
  if (content.sectionTitle) {
    headerHtml = `<div><div><h2>${escapeHTML(content.sectionTitle)}</h2></div></div>`;
  }

  const recipesHtml = content.recipes.map((recipe: any, i: number) => {
    const imageUrl = buildImageUrl(slug, `recipe-${i}`);
    const meta = `${recipe.difficulty} • ${recipe.time}`;

    return `
      <div>
        <div>
          <picture>
            <img src="${imageUrl}" alt="${escapeHTML(recipe.title)}" data-gen-image="recipe-${i}" loading="lazy">
          </picture>
        </div>
        <div>
          <p><strong>${escapeHTML(recipe.title)}</strong></p>
          <p>${escapeHTML(meta)}</p>
          ${recipe.linkUrl ? `<p><a href="${escapeHTML(recipe.linkUrl)}">View Recipe</a></p>` : ''}
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="recipe-cards${variant !== 'default' ? ` ${variant}` : ''}">
      ${headerHtml}
      ${recipesHtml}
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
function buildProductRecommendationHTML(content: any, variant: string, slug: string, blockId: string): string {
  const imageId = `product-rec-${blockId}`;
  const imageUrl = buildImageUrl(slug, imageId);

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

  // CTAs
  let ctaHtml = '';
  if (content.primaryCtaText) {
    ctaHtml += `<a href="${escapeHTML(content.primaryCtaUrl || '#')}">${escapeHTML(content.primaryCtaText)}</a>`;
  }
  if (content.secondaryCtaText) {
    ctaHtml += ` <a href="${escapeHTML(content.secondaryCtaUrl || '#')}">${escapeHTML(content.secondaryCtaText)}</a>`;
  }
  if (ctaHtml) {
    contentHtml += `<p>${ctaHtml}</p>`;
  }

  return `
    <div class="product-recommendation${variant !== 'default' ? ` ${variant}` : ''}">
      <div>
        <div>
          <picture>
            <img src="${imageUrl}" alt="${escapeHTML(content.headline)}" data-gen-image="${imageId}" loading="lazy">
          </picture>
        </div>
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
 * Build complete EDS-compatible HTML
 * Images already have predictable URLs built into the block HTML
 */
function buildEDSHTML(
  content: GeneratedContent,
  layout: LayoutDecision,
  slug: string
): string {
  // Build blocks HTML (images have predictable URLs based on slug)
  const blocksHtml = layout.blocks.map((layoutBlock) => {
    const contentBlock = content.blocks[layoutBlock.contentIndex];
    if (!contentBlock) return '';

    const blockHtml = buildBlockHTML(contentBlock, layoutBlock, slug);
    const width = layoutBlock.width === 'full' ? '' : 'contained';

    return `
    <div${width ? ` class="${width}"` : ''}>
      ${blockHtml}
    </div>
    <hr>
    `;
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
 * Escape HTML entities
 */
function escapeHTML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
