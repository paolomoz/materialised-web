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
import { generateLayout, analyzeQuery } from '../ai-clients/gemini';
import { generateImages, decideImageStrategy, createPlaceholderSVG } from '../ai-clients/imagen';
import { retrieveContext, expandQuery } from './rag';

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

    // Stage 3: Content Generation (main LLM call)
    ctx.content = await generateContent(query, ragContext, ctx.intent, env);

    // Send layout preview
    onEvent({
      event: 'layout',
      data: { blocks: ctx.intent.suggestedBlocks },
    });

    // Stage 4: Parallel - Layout generation + Image decisions
    const [layout, imageDecisions] = await Promise.all([
      generateLayout(ctx.content, ctx.intent, env),
      decideImagesForContent(ctx.content, ragContext, env),
    ]);

    ctx.layout = layout;

    // Stream block content as we have it
    await streamBlockContent(ctx.content, layout, onEvent);

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
    ctx.images = await generateImages(imageRequests, env);

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

    // Build final HTML
    const html = buildEDSHTML(ctx.content, ctx.layout, ctx.images);

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

    // Build HTML for this block
    const blockHtml = buildBlockHTML(contentBlock, layoutBlock);

    // Send block content
    onEvent({
      event: 'block-content',
      data: {
        blockId: contentBlock.id,
        html: blockHtml,
        partial: false,
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
  layoutBlock: LayoutDecision['blocks'][0]
): string {
  const content = block.content;
  const variant = layoutBlock.variant;

  switch (block.type) {
    case 'hero':
      return buildHeroHTML(content as any, variant);
    case 'cards':
      return buildCardsHTML(content as any, variant);
    case 'columns':
      return buildColumnsHTML(content as any, variant);
    case 'text':
      return buildTextHTML(content as any, variant);
    case 'cta':
      return buildCTAHTML(content as any, variant);
    case 'faq':
      return buildFAQHTML(content as any, variant);
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
function buildHeroHTML(content: any, variant: string): string {
  const placeholder = createPlaceholderSVG(2000, 800, 'Hero Image');

  return `
    <div class="hero${variant !== 'default' ? ` ${variant}` : ''}">
      <div>
        <div>
          <picture>
            <img src="${placeholder}" alt="${escapeHTML(content.headline)}" data-gen-image="hero" loading="lazy">
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
function buildCardsHTML(content: any, variant: string): string {
  const cardsHtml = content.cards.map((card: any, i: number) => {
    const placeholder = createPlaceholderSVG(750, 562, 'Card Image');

    return `
      <div>
        <div>
          <picture>
            <img src="${placeholder}" alt="${escapeHTML(card.title)}" data-gen-image="card-${i}" loading="lazy">
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
function buildColumnsHTML(content: any, variant: string): string {
  // Build all columns as cells within a single row
  const columnsHtml = content.columns.map((col: any, i: number) => {
    let colContent = '';

    if (col.imagePrompt) {
      const placeholder = createPlaceholderSVG(600, 400, 'Column Image');
      colContent += `
        <picture>
          <img src="${placeholder}" alt="${escapeHTML(col.headline || '')}" data-gen-image="col-${i}" loading="lazy">
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
 * Build complete EDS-compatible HTML
 */
function buildEDSHTML(
  content: GeneratedContent,
  layout: LayoutDecision,
  images: GeneratedImage[]
): string {
  // Build blocks HTML
  const blocksHtml = layout.blocks.map((layoutBlock, i) => {
    const contentBlock = content.blocks[layoutBlock.contentIndex];
    if (!contentBlock) return '';

    const blockHtml = buildBlockHTML(contentBlock, layoutBlock);
    const width = layoutBlock.width === 'full' ? '' : 'contained';

    return `
    <div${width ? ` class="${width}"` : ''}>
      ${blockHtml}
    </div>
    <hr>
    `;
  }).join('\n');

  // Replace image placeholders with actual URLs
  let finalHtml = blocksHtml;
  for (const image of images) {
    // Find and replace placeholder for this image
    const placeholderPattern = new RegExp(`data-gen-image="${image.id.replace('img-', '')}"[^>]*src="[^"]*"`, 'g');
    finalHtml = finalHtml.replace(placeholderPattern, `src="${image.url}"`);
  }

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
    ${finalHtml}
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
