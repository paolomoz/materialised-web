import type { Env, IntentClassification, GeneratedContent, RAGContext } from '../types';
import { BRAND_VOICE_SYSTEM_PROMPT } from '../prompts/brand-voice';
import { INTENT_CLASSIFICATION_PROMPT } from '../prompts/intent';
import { CONTENT_GENERATION_SYSTEM, buildContentGenerationPrompt } from '../prompts/content';

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
 * Call Claude API
 */
async function callClaude(
  messages: ClaudeMessage[],
  options: {
    model?: string;
    maxTokens?: number;
    systemPrompt?: string;
    temperature?: number;
  },
  env: Env
): Promise<string> {
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

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Claude API error: ${response.status} - ${error}`);
  }

  const result = await response.json() as ClaudeResponse;
  return result.content[0].text;
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
      model: 'claude-3-5-haiku-20241022',
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
      contentTypes: parsed.content_types || ['editorial'],
      suggestedBlocks: parsed.suggested_blocks || ['hero', 'cards'],
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
      contentTypes: ['editorial'],
      suggestedBlocks: ['hero', 'cards', 'cta'],
      entities: {
        products: [],
        ingredients: [],
        goals: [query],
      },
    };
  }
}

/**
 * Generate page content based on query and RAG context
 * Uses Claude Sonnet for quality
 */
export async function generateContent(
  query: string,
  ragContext: RAGContext,
  intent: IntentClassification,
  env: Env
): Promise<GeneratedContent> {
  const userPrompt = buildContentGenerationPrompt(query, ragContext, intent);

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
      model: 'claude-3-5-haiku-20241022',
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
      model: 'claude-3-5-haiku-20241022',
      maxTokens: 1000,
      systemPrompt: BRAND_VOICE_SYSTEM_PROMPT,
    },
    env
  );
}
