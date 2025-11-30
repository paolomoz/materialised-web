import type { Env, IntentClassification, GeneratedContent, RAGContext } from '../types';
import { BRAND_VOICE_SYSTEM_PROMPT } from '../prompts/brand-voice';
import { INTENT_CLASSIFICATION_PROMPT } from '../prompts/intent';
import { CONTENT_GENERATION_SYSTEM, buildContentGenerationPrompt } from '../prompts/content';
import type { LayoutTemplate } from '../prompts/layouts';

/**
 * Claude API client for text generation
 */

interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ClaudeResponse {
  id: string;
  content: Array<{
    type: 'text';
    text: string;
  }>;
  model: string;
  stop_reason: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Call Claude API with retry logic for transient errors (429, 529)
 */
async function callClaude(
  messages: ClaudeMessage[],
  options: {
    model?: string;
    maxTokens?: number;
    systemPrompt?: string;
    temperature?: number;
  },
  env: Env,
  retries = 3
): Promise<string> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: options.model || 'claude-sonnet-4-5-20250929',
          max_tokens: options.maxTokens || 4096,
          system: options.systemPrompt,
          messages,
          temperature: options.temperature ?? 0.7,
        }),
      });

      // Retry on overload (529) or rate limit (429)
      if (response.status === 529 || response.status === 429) {
        const waitTime = Math.pow(2, attempt) * 1000 + Math.random() * 1000; // Exponential backoff with jitter
        console.log(`[Claude] ${response.status} error, retrying in ${Math.round(waitTime)}ms (attempt ${attempt + 1}/${retries})`);
        await sleep(waitTime);
        continue;
      }

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Claude API error: ${response.status} - ${error}`);
      }

      const result = await response.json() as ClaudeResponse;
      return result.content[0].text;
    } catch (error) {
      lastError = error as Error;
      // Only retry on network errors, not on other errors
      if (attempt < retries - 1 && (error as Error).message?.includes('fetch')) {
        const waitTime = Math.pow(2, attempt) * 1000;
        console.log(`[Claude] Network error, retrying in ${waitTime}ms (attempt ${attempt + 1}/${retries})`);
        await sleep(waitTime);
        continue;
      }
      throw error;
    }
  }

  throw lastError || new Error('Claude API call failed after retries');
}

/**
 * Classify the intent of a user query
 * Uses Claude Haiku for speed
 */
export async function classifyIntent(
  query: string,
  env: Env
): Promise<IntentClassification> {
  const response = await callClaude(
    [{ role: 'user', content: `${INTENT_CLASSIFICATION_PROMPT}\n\nUser Query: "${query}"` }],
    {
      model: 'claude-haiku-4-5-20251001',
      maxTokens: 500,
      temperature: 0.3,
    },
    env
  );

  try {
    // Extract JSON from response (might be wrapped in markdown)
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      intentType: parsed.intent_type || 'general',
      confidence: parsed.confidence || 0.5,
      layoutId: parsed.layout_id || 'lifestyle',
      contentTypes: parsed.content_types || ['editorial'],
      entities: {
        products: parsed.entities?.products || [],
        ingredients: parsed.entities?.ingredients || [],
        goals: parsed.entities?.goals || [],
      },
    };
  } catch {
    // Return default classification on parse error
    console.error('Failed to parse intent classification:', response);
    return {
      intentType: 'general',
      confidence: 0.3,
      layoutId: 'lifestyle',
      contentTypes: ['editorial'],
      entities: {
        products: [],
        ingredients: [],
        goals: [query],
      },
    };
  }
}

/**
 * Generate page content based on query, RAG context, and layout template
 * Uses Claude Sonnet for quality
 */
export async function generateContent(
  query: string,
  ragContext: RAGContext,
  intent: IntentClassification,
  layout: LayoutTemplate,
  env: Env
): Promise<GeneratedContent> {
  const userPrompt = buildContentGenerationPrompt(query, ragContext, intent, layout);

  const response = await callClaude(
    [{ role: 'user', content: userPrompt }],
    {
      model: 'claude-sonnet-4-5-20250929',
      maxTokens: 4096,
      systemPrompt: CONTENT_GENERATION_SYSTEM,
      temperature: 0.7,
    },
    env
  );

  try {
    // Extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Map the response to our structure
    return {
      headline: parsed.headline || 'Discover Something New',
      subheadline: parsed.subheadline || '',
      blocks: (parsed.blocks || []).map((block: any, index: number) => ({
        id: `block-${index}`,
        type: block.type,
        variant: block.variant,
        sectionStyle: block.sectionStyle,
        content: block.content,
      })),
      meta: {
        title: parsed.meta?.title || parsed.headline || query,
        description: parsed.meta?.description || parsed.subheadline || '',
      },
      citations: (parsed.citations || []).map((c: any) => ({
        text: c.text,
        sourceUrl: c.source_url || c.sourceUrl,
        sourceTitle: c.source_title || c.sourceTitle,
      })),
    };
  } catch (error) {
    console.error('Failed to parse generated content:', response);
    throw new Error('Failed to generate valid content');
  }
}

/**
 * Validate content against brand guidelines
 * Uses Claude Haiku for quick validation
 */
export async function validateBrandCompliance(
  content: string,
  env: Env
): Promise<{ isCompliant: boolean; score: number; issues: string[] }> {
  const prompt = `
You are a brand compliance checker for Vitamix. Analyze this content against brand guidelines.

Brand Guidelines:
- Professional yet accessible tone
- Confident without being boastful
- Premium positioning (avoid discount language)
- Empowering and inspiring
- Banned words: cheap, budget, just, simply, hack, revolutionary

Content to analyze:
${content}

Return JSON:
{
  "isCompliant": boolean,
  "score": 0-100,
  "issues": ["list of specific issues found"]
}
`;

  const response = await callClaude(
    [{ role: 'user', content: prompt }],
    {
      model: 'claude-haiku-4-5-20251001',
      maxTokens: 300,
      temperature: 0.2,
    },
    env
  );

  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch {
    // Default to passing if we can't parse
  }

  return { isCompliant: true, score: 85, issues: [] };
}

/**
 * Generate text for a specific block (streaming support)
 */
export async function generateBlockContent(
  blockType: string,
  context: string,
  env: Env
): Promise<string> {
  const prompt = `
Generate content for a ${blockType} block on a Vitamix page.

Context:
${context}

Generate the content in the appropriate format for this block type.
Use Vitamix brand voice: professional, empowering, premium.
`;

  return callClaude(
    [{ role: 'user', content: prompt }],
    {
      model: 'claude-haiku-4-5-20251001',
      maxTokens: 1000,
      systemPrompt: BRAND_VOICE_SYSTEM_PROMPT,
    },
    env
  );
}

/**
 * Phase 1 output structure for two-phase generation
 */
export interface HeroContextOutput {
  headline: string;
  subheadline: string;
  theme: string;
  heroBlock: {
    id: string;
    type: string;
    variant: string;
    sectionStyle: string;
    content: any;
  };
  meta: {
    title: string;
    description: string;
  };
}

/**
 * Phase 1: Generate hero block and page context
 * Uses Claude Haiku for speed (~2-3 seconds)
 *
 * This generates:
 * - Page headline/subheadline
 * - Page theme (for coherence in Phase 2)
 * - Complete hero block content
 * - SEO meta
 */
export async function generateHeroAndContext(
  query: string,
  ragContext: RAGContext,
  intent: IntentClassification,
  layout: LayoutTemplate,
  env: Env
): Promise<HeroContextOutput> {
  // Find the first block in layout (typically hero)
  const firstSection = layout.sections[0];
  const firstBlock = firstSection?.blocks[0];

  if (!firstBlock) {
    throw new Error('Layout has no blocks');
  }

  // Format RAG context (condensed for Phase 1)
  const ragSection = ragContext.chunks.length > 0
    ? ragContext.chunks.slice(0, 3).map((chunk, i) => `
### Source ${i + 1}: ${chunk.metadata.page_title}
URL: ${chunk.metadata.source_url}
${chunk.text.slice(0, 500)}...
`).join('\n---\n')
    : 'Use general Vitamix brand knowledge.';

  const systemPrompt = `${BRAND_VOICE_SYSTEM_PROMPT}

## Your Task

Generate the HERO BLOCK and page context for a Vitamix page. This is Phase 1 of a two-phase generation.

Return JSON with this EXACT structure:
{
  "headline": "Main page headline (compelling, benefit-focused)",
  "subheadline": "Supporting text (expand on headline)",
  "theme": "2-3 word theme description for content coherence (e.g., 'energizing morning rituals', 'troubleshooting support', 'healthy family meals')",
  "heroBlock": {
    "type": "${firstBlock.type}",
    "variant": "${firstBlock.variant || 'default'}",
    "sectionStyle": "${firstSection.style || 'default'}",
    "content": { /* block-specific content - see schema below */ }
  },
  "meta": {
    "title": "SEO title (50-60 chars)",
    "description": "SEO meta description (150-160 chars)"
  }
}

## Block Content Schema for ${firstBlock.type}

${getBlockSchema(firstBlock.type)}

## Critical Instructions

1. Generate ONLY the hero block - other blocks will follow in Phase 2
2. The "theme" field is critical - it will guide Phase 2 generation for consistency
3. Use RAG context for factual information
4. Follow Vitamix brand voice strictly
5. Image prompts should describe professional, appetizing visuals`;

  const userPrompt = `
## User Query
"${query}"

## Intent
- Type: ${intent.intentType}
- Content focus: ${intent.contentTypes.join(', ')}
- Products: ${intent.entities.products.join(', ') || 'none'}
- Ingredients: ${intent.entities.ingredients.join(', ') || 'none'}
- Goals: ${intent.entities.goals.join(', ') || 'general'}

## RAG Context
${ragSection}

Generate the hero block and page context. Return valid JSON only.`;

  const response = await callClaude(
    [{ role: 'user', content: userPrompt }],
    {
      model: 'claude-haiku-4-5-20251001',
      maxTokens: 1000,
      systemPrompt,
      temperature: 0.7,
    },
    env
  );

  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in Phase 1 response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      headline: parsed.headline || 'Discover Something New',
      subheadline: parsed.subheadline || '',
      theme: parsed.theme || 'vitamix lifestyle',
      heroBlock: {
        id: 'block-0',
        type: parsed.heroBlock?.type || firstBlock.type,
        variant: parsed.heroBlock?.variant || firstBlock.variant || 'default',
        sectionStyle: parsed.heroBlock?.sectionStyle || firstSection.style || 'default',
        content: parsed.heroBlock?.content || {},
      },
      meta: {
        title: parsed.meta?.title || parsed.headline || query,
        description: parsed.meta?.description || parsed.subheadline || '',
      },
    };
  } catch (error) {
    console.error('Failed to parse Phase 1 response:', response);
    throw new Error('Failed to generate hero content');
  }
}

/**
 * Phase 2: Generate remaining blocks with hero context
 * Uses Claude Sonnet for quality
 *
 * This generates all blocks AFTER the hero, with awareness of:
 * - Page headline/subheadline
 * - Page theme
 * - Hero block content (to avoid repetition)
 */
export async function generateRemainingBlocks(
  query: string,
  ragContext: RAGContext,
  intent: IntentClassification,
  layout: LayoutTemplate,
  heroContext: HeroContextOutput,
  env: Env
): Promise<{
  blocks: Array<{
    id: string;
    type: string;
    variant: string;
    sectionStyle: string;
    content: any;
  }>;
  citations: Array<{
    text: string;
    sourceUrl: string;
    sourceTitle: string;
  }>;
}> {
  // Get remaining blocks (skip first one which is hero)
  const remainingBlocks: Array<{ type: string; variant: string; sectionStyle: string; purpose: string }> = [];
  let blockIndex = 0;

  for (const section of layout.sections) {
    for (const block of section.blocks) {
      if (blockIndex > 0) {
        remainingBlocks.push({
          type: block.type,
          variant: block.variant || 'default',
          sectionStyle: section.style || 'default',
          purpose: block.purpose || '',
        });
      }
      blockIndex++;
    }
  }

  if (remainingBlocks.length === 0) {
    return { blocks: [], citations: [] };
  }

  // Format RAG context
  const ragSection = ragContext.chunks.length > 0
    ? ragContext.chunks.map((chunk, i) => `
### Source ${i + 1}: ${chunk.metadata.page_title}
URL: ${chunk.metadata.source_url}
Type: ${chunk.metadata.content_type}
${chunk.text}
`).join('\n---\n')
    : 'Use general Vitamix brand knowledge.';

  // Format remaining blocks for prompt
  const blocksSpec = remainingBlocks.map((b, i) => `
${i + 1}. ${b.type} (variant: ${b.variant}, section: ${b.sectionStyle})
   Purpose: ${b.purpose}`).join('\n');

  const systemPrompt = `${BRAND_VOICE_SYSTEM_PROMPT}

## Your Task

Generate the REMAINING BLOCKS for a Vitamix page. The hero block is already complete.

## Page Context (Already Generated)
- Headline: "${heroContext.headline}"
- Subheadline: "${heroContext.subheadline}"
- Theme: "${heroContext.theme}"

## Hero Block Content (DO NOT REPEAT)
${JSON.stringify(heroContext.heroBlock.content, null, 2)}

## Blocks to Generate
${blocksSpec}

## Output Format

Return JSON with this EXACT structure:
{
  "blocks": [
    {
      "type": "block-type",
      "variant": "variant-name",
      "sectionStyle": "default|highlight|dark",
      "content": { /* block-specific content */ }
    }
  ],
  "citations": [
    {
      "text": "Quoted text",
      "source_url": "https://...",
      "source_title": "Page title"
    }
  ]
}

## Block Schemas

${remainingBlocks.map(b => `### ${b.type}\n${getBlockSchema(b.type)}`).join('\n\n')}

## Critical Instructions

1. Generate EXACTLY ${remainingBlocks.length} blocks in the order specified
2. Flow naturally from the hero - DO NOT repeat hero content
3. Maintain the "${heroContext.theme}" theme throughout
4. Use RAG context for all factual information
5. Follow Vitamix brand voice strictly`;

  const userPrompt = `
## User Query
"${query}"

## Intent
- Type: ${intent.intentType}
- Content focus: ${intent.contentTypes.join(', ')}
- Products: ${intent.entities.products.join(', ') || 'none'}
- Ingredients: ${intent.entities.ingredients.join(', ') || 'none'}
- Goals: ${intent.entities.goals.join(', ') || 'general'}

## RAG Context
${ragSection}

Generate the ${remainingBlocks.length} remaining blocks. Return valid JSON only.`;

  const response = await callClaude(
    [{ role: 'user', content: userPrompt }],
    {
      model: 'claude-sonnet-4-5-20250929',
      maxTokens: 3500,
      systemPrompt,
      temperature: 0.7,
    },
    env
  );

  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in Phase 2 response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      blocks: (parsed.blocks || []).map((block: any, index: number) => ({
        id: `block-${index + 1}`,
        type: block.type,
        variant: block.variant || 'default',
        sectionStyle: block.sectionStyle || 'default',
        content: block.content,
      })),
      citations: (parsed.citations || []).map((c: any) => ({
        text: c.text,
        sourceUrl: c.source_url || c.sourceUrl,
        sourceTitle: c.source_title || c.sourceTitle,
      })),
    };
  } catch (error) {
    console.error('Failed to parse Phase 2 response:', response);
    throw new Error('Failed to generate remaining content');
  }
}

/**
 * Get block schema for a given block type
 * Used in prompts to guide content generation
 */
function getBlockSchema(blockType: string): string {
  const schemas: Record<string, string> = {
    hero: `{
  "eyebrow": "string (optional, short category text)",
  "headline": "string",
  "subheadline": "string",
  "ctaText": "string (optional)",
  "ctaUrl": "string (optional)",
  "imagePrompt": "string (describe ideal image)"
}`,
    cards: `{
  "sectionTitle": "string (optional)",
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
}`,
    columns: `{
  "sectionTitle": "string (optional)",
  "columns": [
    {
      "headline": "string",
      "text": "string",
      "imagePrompt": "string (optional)"
    }
  ]
}`,
    text: `{
  "headline": "string (optional)",
  "body": "string (can include \\n\\n for paragraphs)"
}`,
    cta: `{
  "headline": "string",
  "text": "string (optional)",
  "buttonText": "string",
  "buttonUrl": "string"
}`,
    faq: `{
  "items": [
    { "question": "string", "answer": "string" }
  ]
}`,
    'benefits-grid': `{
  "items": [
    {
      "icon": "string (clock, heart, leaf, bolt, star)",
      "headline": "string (3-5 words)",
      "description": "string (1-2 sentences)"
    }
  ]
}`,
    'recipe-cards': `{
  "sectionTitle": "string (optional)",
  "recipes": [
    {
      "title": "string",
      "imagePrompt": "string",
      "difficulty": "Simple|Easy|Intermediate|Advanced",
      "time": "string (like '5 min')",
      "linkUrl": "string (optional)"
    }
  ]
}`,
    'split-content': `{
  "eyebrow": "string (optional)",
  "headline": "string",
  "body": "string",
  "price": "string (optional)",
  "priceNote": "string (optional)",
  "primaryCtaText": "string",
  "primaryCtaUrl": "string",
  "imagePrompt": "string"
}`,
    'product-recommendation': `{
  "eyebrow": "string",
  "headline": "string (product name)",
  "body": "string",
  "price": "string",
  "priceNote": "string (optional)",
  "primaryCtaText": "string",
  "primaryCtaUrl": "string",
  "imagePrompt": "string"
}`,
    'tips-banner': `{
  "sectionTitle": "string (optional)",
  "tips": [
    { "headline": "string (3-5 words)", "description": "string (1-2 sentences)" }
  ]
}`,
    'support-hero': `{
  "icon": "string (warning, info, tool)",
  "title": "string (Troubleshooting: ...)",
  "subtitle": "string (empathetic message)"
}`,
    'diagnosis-card': `{
  "items": [
    { "severity": "minor|moderate|serious", "cause": "string", "implication": "string" }
  ]
}`,
    'troubleshooting-steps': `{
  "steps": [
    {
      "stepNumber": number,
      "title": "string",
      "instructions": "string",
      "safetyNote": "string (optional)",
      "imagePrompt": "string (optional)"
    }
  ]
}`,
    'support-cta': `{
  "ctas": [
    { "title": "string", "description": "string", "url": "string", "style": "primary|secondary" }
  ]
}`,
  };

  return schemas[blockType] || '{ /* see full documentation */ }';
}
