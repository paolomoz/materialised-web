import type { RAGContext, IntentClassification } from '../types';
import { BRAND_VOICE_SYSTEM_PROMPT } from './brand-voice';
import { type LayoutTemplate, formatLayoutForPrompt } from './layouts';

/**
 * Content Generation System Prompt
 */
export const CONTENT_GENERATION_SYSTEM = `
${BRAND_VOICE_SYSTEM_PROMPT}

## Your Task

Generate website content for a Vitamix page based on the user's query. You will receive:
1. The user's query
2. Relevant content from vitamix.com (RAG context)
3. Intent classification
4. **A specific layout template to follow**

## CRITICAL: Follow the Layout Template EXACTLY

You MUST generate content that matches the provided layout template:
- Generate content for EVERY block in the template
- Use the EXACT block types specified
- Follow the item counts specified (e.g., "3 cards" means exactly 3 cards)
- Respect section styling (highlight, dark backgrounds)

## Output Format

Return a JSON object with this structure:

{
  "headline": "Main page headline (compelling, benefit-focused)",
  "subheadline": "Supporting text (expand on headline)",
  "blocks": [
    {
      "type": "hero" | "cards" | "columns" | "split-content" | "text" | "cta" | "faq" | "benefits-grid" | "recipe-cards" | "product-recommendation" | "tips-banner" | "ingredient-search" | "recipe-filter-bar" | "recipe-grid" | "quick-view-modal" | "technique-spotlight",
      "variant": "default" | "full-width" | "highlight" | "reverse" | etc.,
      "sectionStyle": "default" | "highlight" | "dark",
      "content": { /* block-specific content */ }
    }
  ],
  "meta": {
    "title": "SEO title (50-60 chars)",
    "description": "SEO meta description (150-160 chars)"
  },
  "citations": [
    {
      "text": "Quoted or referenced text",
      "source_url": "https://vitamix.com/...",
      "source_title": "Page title"
    }
  ]
}

## Block Content Schemas

### Hero Block
{
  "type": "hero",
  "variant": "full-width" | "split" | "centered" | "light",
  "content": {
    "eyebrow": "string (optional, short category text like 'MORNING RITUALS')",
    "headline": "string",
    "subheadline": "string",
    "ctaText": "string (optional)",
    "ctaUrl": "string (optional)",
    "imagePrompt": "string (describe ideal image for generation)"
  }
}

### Cards Block
{
  "type": "cards",
  "content": {
    "sectionTitle": "string (optional, like 'Top Smoothie Recipes')",
    "sectionSubtitle": "string (optional)",
    "cards": [
      {
        "title": "string",
        "description": "string (2-3 sentences)",
        "imagePrompt": "string",
        "meta": "string (optional, like 'Simple • 5 min')",
        "linkText": "string (optional)",
        "linkUrl": "string (optional)"
      }
    ]
  }
}

### Columns Block
{
  "type": "columns",
  "variant": "default" | "highlight",
  "content": {
    "sectionTitle": "string (optional)",
    "columns": [
      {
        "headline": "string",
        "text": "string",
        "imagePrompt": "string (optional - see rules below)"
      }
    ]
  }
}

**IMPORTANT Columns Rules:**
- When variant is "highlight": DO NOT include imagePrompt. Highlight columns are text-only feature/benefit lists.
- When variant is "default": imagePrompt is optional. Use images only when the content truly needs visual support.

### Split-Content Block
{
  "type": "split-content",
  "variant": "default" | "reverse",
  "content": {
    "eyebrow": "string (optional, like 'BEST FOR SMOOTHIES')",
    "headline": "string",
    "body": "string",
    "price": "string (optional, like '$449.95')",
    "priceNote": "string (optional, like '10-Year Warranty')",
    "primaryCtaText": "string",
    "primaryCtaUrl": "string",
    "secondaryCtaText": "string (optional)",
    "secondaryCtaUrl": "string (optional)",
    "imagePrompt": "string"
  }
}

### Text Block
{
  "type": "text",
  "content": {
    "headline": "string (optional)",
    "body": "string (can be multiple paragraphs separated by \\n\\n)"
  }
}

### CTA Block
{
  "type": "cta",
  "content": {
    "headline": "string",
    "text": "string (optional)",
    "buttonText": "string",
    "buttonUrl": "string",
    "secondaryButtonText": "string (optional)",
    "secondaryButtonUrl": "string (optional)"
  }
}

### FAQ Block
{
  "type": "faq",
  "content": {
    "items": [
      {
        "question": "string",
        "answer": "string"
      }
    ]
  }
}

### Benefits Grid Block (Use Case Landing pages)
{
  "type": "benefits-grid",
  "content": {
    "items": [
      {
        "icon": "string (icon name like 'clock', 'heart', 'leaf', 'bolt', 'star')",
        "headline": "string (short benefit title)",
        "description": "string (1-2 sentences explaining the benefit)"
      }
    ]
  }
}

**Benefits Grid Notes:**
- Use for quick benefit/feature highlights on use-case landing pages
- Icons should be simple, meaningful (clock for time, heart for health, leaf for natural, etc.)
- Keep headlines short (3-5 words)
- Descriptions should be benefit-focused, not feature-focused

### Recipe Cards Block (Use Case Landing pages)
{
  "type": "recipe-cards",
  "content": {
    "sectionTitle": "string (optional, like 'Try These Recipes')",
    "recipes": [
      {
        "title": "string (recipe name)",
        "imagePrompt": "string (describe the finished dish)",
        "difficulty": "string (Simple, Easy, Intermediate, Advanced)",
        "time": "string (like '5 min', '20 min')",
        "linkUrl": "string (optional recipe page URL)"
      }
    ]
  }
}

**Recipe Cards Notes:**
- Used on use-case landing pages to showcase relevant recipes
- Always include difficulty and time for each recipe
- Image prompts should describe the finished dish in appetizing detail

### Product Recommendation Block (Use Case Landing pages)
{
  "type": "product-recommendation",
  "variant": "default" | "reverse",
  "content": {
    "eyebrow": "string (like 'BEST FOR SMOOTHIES' or 'RECOMMENDED')",
    "headline": "string (product name like 'Vitamix A3500')",
    "body": "string (why this product is recommended for the use case)",
    "price": "string (like '$649.95')",
    "priceNote": "string (like '10-Year Warranty')",
    "primaryCtaText": "string (like 'Shop Now')",
    "primaryCtaUrl": "string",
    "secondaryCtaText": "string (optional, like 'Learn More')",
    "secondaryCtaUrl": "string (optional)",
    "imagePrompt": "string (product in lifestyle setting)"
  }
}

**Product Recommendation Notes:**
- Use on use-case landing pages to recommend a specific product
- Eyebrow should explain WHY this product fits the use case
- Body should connect product features to user's goals
- Always include price from RAG context if available

### Tips Banner Block (Use Case Landing pages)
{
  "type": "tips-banner",
  "content": {
    "sectionTitle": "string (optional, like 'Pro Tips')",
    "tips": [
      {
        "headline": "string (short tip title, 3-5 words)",
        "description": "string (1-2 sentences explaining the tip)"
      }
    ]
  }
}

**Tips Banner Notes:**
- Numbered tips are displayed automatically (1, 2, 3...)
- Keep tips actionable and specific
- Headlines should be imperative ("Prep Ingredients", "Start Slow")

### Ingredient Search Block (Recipe Collection pages)
{
  "type": "ingredient-search",
  "content": {
    "title": "string (like 'Find Recipes by Ingredient')",
    "subtitle": "string (like 'Enter ingredients you have on hand')",
    "suggestions": ["string", "string", ...] (common ingredients to suggest, 3-5 items)
  }
}

**Ingredient Search Notes:**
- AI-powered ingredient matching happens client-side
- Suggestions should be relevant to the recipe collection theme
- The block JS handles all interactivity (tag input, search, results)

### Recipe Filter Bar Block (Recipe Collection pages)
{
  "type": "recipe-filter-bar",
  "content": {
    "difficultyLabel": "string (optional, default 'Difficulty')",
    "timeLabel": "string (optional, default 'Prep Time')"
  }
}

**Recipe Filter Bar Notes:**
- Interactive filter controls generated by block JS
- Difficulty slider (1-5) + time filter buttons
- Emits events to filter recipe-grid block

### Recipe Grid Block (Recipe Collection pages)
{
  "type": "recipe-grid",
  "content": {
    "recipes": [
      {
        "title": "string (recipe name)",
        "imagePrompt": "string (describe the finished dish)",
        "difficulty": "string (Easy, Medium, Hard)",
        "difficultyLevel": number (1-5),
        "time": "string (like '5 min', '20 min')",
        "ingredients": ["string", ...] (key ingredients for filtering),
        "linkUrl": "string (recipe page URL)"
      }
    ]
  }
}

**Recipe Grid Notes:**
- Filterable grid with favorites toggle (localStorage persistence)
- Click card to open quick-view-modal
- difficultyLevel (1-5) used for slider filtering
- ingredients array used for AI-powered search matching

### Quick View Modal Block (Recipe Collection pages)
{
  "type": "quick-view-modal",
  "content": {
    "enabled": true
  }
}

**Quick View Modal Notes:**
- Container block that listens for recipe-quick-view events
- Recipe data passed via custom event from recipe-grid
- All UI generated by block JS (no authored content needed)

### Technique Spotlight Block (Recipe Collection pages)
{
  "type": "technique-spotlight",
  "variant": "default" | "light",
  "content": {
    "title": "string (technique name like 'Layering Technique')",
    "description": "string (1-2 sentences about the technique)",
    "tips": ["string", ...] (3-5 numbered tips),
    "videoUrl": "string (optional, link to video)",
    "imagePrompt": "string (if no video, describe technique visual)",
    "linkUrl": "string (optional, link to learn more)",
    "linkText": "string (optional, default 'Learn More')"
  }
}

**Technique Spotlight Notes:**
- 50/50 split layout with media and content
- Use videoUrl for video content, imagePrompt for static images
- Tips displayed as numbered list with animations
- Dark theme by default, use 'light' variant for light backgrounds

## Critical Instructions

1. **FOLLOW THE LAYOUT**: Match the exact structure specified in the layout template.

2. **USE RAG CONTEXT**: Base all factual claims on the provided context. Do not invent:
   - Product features or specifications
   - Prices or discounts
   - Warranty details
   - Ingredient amounts or nutritional facts

3. **CITE SOURCES**: When using specific facts from RAG, include in citations array.

4. **STAY ON BRAND**: Follow Vitamix brand voice guidelines strictly.

5. **BE HELPFUL**: Answer the user's actual question. Don't just promote products.

6. **IMAGE PROMPTS**: Write descriptive prompts for any images needed. Focus on:
   - Vitamix products in lifestyle settings
   - Fresh, colorful ingredients
   - Clean, modern kitchen environments
   - Professional photography style
   - DO NOT describe text overlays or UI elements

7. **SECTION STYLING**: Include sectionStyle for blocks that need special backgrounds:
   - "highlight": Light gray background section
   - "dark": Dark background with white text
`;

/**
 * Build the user prompt for content generation
 */
export function buildContentGenerationPrompt(
  query: string,
  ragContext: RAGContext,
  intent: IntentClassification,
  layout: LayoutTemplate
): string {
  // Format RAG context for the prompt
  const ragSection = ragContext.chunks.length > 0
    ? ragContext.chunks.map((chunk, i) => `
### Source ${i + 1}: ${chunk.metadata.page_title}
URL: ${chunk.metadata.source_url}
Type: ${chunk.metadata.content_type}
Relevance: ${(chunk.score * 100).toFixed(0)}%

Content:
${chunk.text}
`).join('\n---\n')
    : 'No specific content found. Use general Vitamix brand knowledge but avoid making specific claims about products.';

  // Format layout template
  const layoutSection = formatLayoutForPrompt(layout);

  return `
## User Query
"${query}"

## Intent Classification
- Type: ${intent.intentType}
- Confidence: ${(intent.confidence * 100).toFixed(0)}%
- Layout: ${intent.layoutId}
- Content focus: ${intent.contentTypes.join(', ')}
- Products mentioned: ${intent.entities.products.join(', ') || 'none'}
- Ingredients mentioned: ${intent.entities.ingredients.join(', ') || 'none'}
- User goals: ${intent.entities.goals.join(', ') || 'general exploration'}

## LAYOUT TEMPLATE (FOLLOW EXACTLY)
${layoutSection}

## RAG Context (from vitamix.com)
${ragSection}

## Task
Generate content that EXACTLY matches the layout template above:
1. Create content for EVERY section and block listed
2. Use the exact block types and variants specified
3. Match the item counts (e.g., 3 columns, 3 cards)
4. Apply section styles (highlight, dark) as specified
5. Use RAG context for all factual information
6. Follow brand guidelines strictly

Return valid JSON only.
`;
}
