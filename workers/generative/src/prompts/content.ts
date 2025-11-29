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
      "type": "hero" | "cards" | "columns" | "split-content" | "text" | "cta" | "faq",
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
