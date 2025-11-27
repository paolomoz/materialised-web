import type { RAGContext, IntentClassification } from '../types';
import { BRAND_VOICE_SYSTEM_PROMPT } from './brand-voice';

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

## Output Format

Return a JSON object with this structure:

{
  "headline": "Main page headline (compelling, benefit-focused)",
  "subheadline": "Supporting text (expand on headline)",
  "blocks": [
    {
      "type": "hero" | "cards" | "columns" | "text" | "cta" | "faq",
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
  "content": {
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
    "cards": [
      {
        "title": "string",
        "description": "string (2-3 sentences)",
        "imagePrompt": "string",
        "linkText": "string (optional)",
        "linkUrl": "string (optional, can be /discover/... for generative links)"
      }
    ]
  }
}

### Columns Block
{
  "type": "columns",
  "content": {
    "columns": [
      {
        "headline": "string (optional)",
        "text": "string",
        "imagePrompt": "string (optional)"
      }
    ]
  }
}

### Text Block
{
  "type": "text",
  "content": {
    "headline": "string (optional)",
    "body": "string (can be multiple paragraphs)"
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
    "isGenerative": boolean (true if links to another generatable page),
    "generationHint": "string (query hint for generation if isGenerative)"
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

1. **USE RAG CONTEXT**: Base all factual claims on the provided context. Do not invent:
   - Product features or specifications
   - Prices or discounts
   - Warranty details
   - Ingredient amounts or nutritional facts

2. **CITE SOURCES**: When using specific facts from RAG, include in citations array.

3. **STAY ON BRAND**: Follow Vitamix brand voice guidelines strictly.

4. **BE HELPFUL**: Answer the user's actual question. Don't just promote products.

5. **IMAGE PROMPTS**: Write descriptive prompts for any images needed. Focus on:
   - Vitamix products in lifestyle settings
   - Fresh, colorful ingredients
   - Clean, modern kitchen environments
   - Professional photography style
   - DO NOT describe text overlays or UI elements

6. **GENERATIVE LINKS**: For "Learn more" or related topic CTAs, you can link to
   /discover/{topic-slug} which will generate a new page. Include generationHint.

7. **APPROPRIATE LENGTH**:
   - Hero: 1 headline + 1-2 sentence subheadline
   - Cards: 3-4 cards with 2-3 sentence descriptions
   - Columns: 2-3 columns
   - FAQ: 3-6 questions
`;

/**
 * Build the user prompt for content generation
 */
export function buildContentGenerationPrompt(
  query: string,
  ragContext: RAGContext,
  intent: IntentClassification
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

  return `
## User Query
"${query}"

## Intent Classification
- Type: ${intent.intentType}
- Confidence: ${(intent.confidence * 100).toFixed(0)}%
- Content focus: ${intent.contentTypes.join(', ')}
- Suggested blocks: ${intent.suggestedBlocks.join(', ')}
- Products mentioned: ${intent.entities.products.join(', ') || 'none'}
- Ingredients mentioned: ${intent.entities.ingredients.join(', ') || 'none'}
- User goals: ${intent.entities.goals.join(', ') || 'general exploration'}

## RAG Context (from vitamix.com)
${ragSection}

## Task
Generate a complete page responding to this query:
1. Create a compelling headline that addresses the user's goal
2. Structure content with appropriate blocks
3. Use RAG context for all factual information
4. Follow brand guidelines strictly
5. Include image prompts for visual blocks
6. Add CTAs that link to related generatable pages where appropriate

Return valid JSON only.
`;
}
