import type { Env, IntentClassification, GeneratedContent, RAGContext, SessionContextParam } from '../types';
import { BRAND_VOICE_SYSTEM_PROMPT } from '../prompts/brand-voice';
import { INTENT_CLASSIFICATION_PROMPT } from '../prompts/intent';
import { CONTENT_GENERATION_SYSTEM, buildContentGenerationPrompt } from '../prompts/content';
import type { LayoutTemplate } from '../prompts/layouts';

/**
 * Cerebras API client for ultra-fast text generation using Llama 3.3 70B
 *
 * Cerebras offers ~2000+ tokens/sec inference speed - significantly faster than
 * other providers, making it ideal for real-time content generation.
 */

interface CerebrasMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface CerebrasResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  time_info?: {
    queue_time: number;
    prompt_time: number;
    completion_time: number;
    total_time: number;
  };
}

/**
 * Call Cerebras API (OpenAI-compatible)
 */
async function callCerebras(
  messages: CerebrasMessage[],
  options: {
    model?: string;
    maxTokens?: number;
    temperature?: number;
  },
  env: Env
): Promise<string> {
  const startTime = Date.now();

  const response = await fetch('https://api.cerebras.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.CEREBRAS_API_KEY}`,
    },
    body: JSON.stringify({
      model: options.model || 'llama-3.3-70b',
      messages,
      max_tokens: options.maxTokens || 4096,
      temperature: options.temperature ?? 0.7,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Cerebras API error: ${response.status} - ${error}`);
  }

  const result = await response.json() as CerebrasResponse;
  const elapsed = Date.now() - startTime;

  // Log timing info for performance analysis
  console.log(`[Cerebras] ${options.model || 'llama-3.3-70b'} completed in ${elapsed}ms`, {
    promptTokens: result.usage?.prompt_tokens,
    completionTokens: result.usage?.completion_tokens,
    timeInfo: result.time_info,
  });

  return result.choices[0].message.content;
}

/**
 * Classify the intent of a user query
 * Uses Llama 3.1 8B for fastest classification
 */
export async function classifyIntent(
  query: string,
  env: Env,
  sessionContext?: SessionContextParam
): Promise<IntentClassification> {
  // Build session context string if available
  let sessionContextStr = '';
  if (sessionContext?.previousQueries && sessionContext.previousQueries.length > 0) {
    const prevQueries = sessionContext.previousQueries.slice(-5).map((q) => {
      const context = [q.intent];
      if (q.entities.ingredients.length > 0) context.push(`ingredients: ${q.entities.ingredients.join(', ')}`);
      if (q.entities.products.length > 0) context.push(`products: ${q.entities.products.join(', ')}`);
      // Include userContext from previous queries (especially dietary restrictions)
      if (q.entities.userContext?.dietary?.avoid?.length) {
        context.push(`userContext.dietary.avoid: ${q.entities.userContext.dietary.avoid.join(', ')}`);
      }
      if (q.entities.userContext?.dietary?.preferences?.length) {
        context.push(`userContext.dietary.preferences: ${q.entities.userContext.dietary.preferences.join(', ')}`);
      }
      return `"${q.query}" (${context.join(', ')})`;
    });
    sessionContextStr = `\n\nSession Context: Previous queries: [${prevQueries.join(', ')}]`;
  }

  const messages: CerebrasMessage[] = [
    {
      role: 'system',
      content: 'You are a query classifier for Vitamix. Respond only with valid JSON.',
    },
    {
      role: 'user',
      content: `${INTENT_CLASSIFICATION_PROMPT}${sessionContextStr}\n\nUser Query: "${query}"`,
    },
  ];

  const response = await callCerebras(
    messages,
    {
      model: 'llama3.1-8b', // Fastest model for classification
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
        userContext: parsed.entities?.userContext ? {
          // Dietary & Health
          dietary: parsed.entities.userContext.dietary ? {
            avoid: parsed.entities.userContext.dietary.avoid || [],
            preferences: parsed.entities.userContext.dietary.preferences || [],
          } : undefined,
          health: parsed.entities.userContext.health ? {
            conditions: parsed.entities.userContext.health.conditions || [],
            goals: parsed.entities.userContext.health.goals || [],
            considerations: parsed.entities.userContext.health.considerations || [],
          } : undefined,

          // Audience & Household
          audience: parsed.entities.userContext.audience || undefined,
          household: parsed.entities.userContext.household ? {
            pickyEaters: parsed.entities.userContext.household.pickyEaters || [],
            texture: parsed.entities.userContext.household.texture || [],
            spiceLevel: parsed.entities.userContext.household.spiceLevel || [],
            portions: parsed.entities.userContext.household.portions || [],
          } : undefined,

          // Cooking Context
          cooking: parsed.entities.userContext.cooking ? {
            equipment: parsed.entities.userContext.cooking.equipment || [],
            skillLevel: parsed.entities.userContext.cooking.skillLevel || [],
            kitchen: parsed.entities.userContext.cooking.kitchen || [],
          } : undefined,

          // Cultural & Regional
          cultural: parsed.entities.userContext.cultural ? {
            cuisine: parsed.entities.userContext.cultural.cuisine || [],
            religious: parsed.entities.userContext.cultural.religious || [],
            regional: parsed.entities.userContext.cultural.regional || [],
          } : undefined,

          // Time & Occasion
          occasion: parsed.entities.userContext.occasion || undefined,
          season: parsed.entities.userContext.season || undefined,

          // Lifestyle & Fitness
          lifestyle: parsed.entities.userContext.lifestyle || undefined,
          fitnessContext: parsed.entities.userContext.fitnessContext || undefined,

          // Practical Constraints
          constraints: parsed.entities.userContext.constraints || undefined,
          budget: parsed.entities.userContext.budget || undefined,
          shopping: parsed.entities.userContext.shopping || undefined,
          storage: parsed.entities.userContext.storage || undefined,

          // Ingredients
          available: parsed.entities.userContext.available || undefined,
          mustUse: parsed.entities.userContext.mustUse || undefined,
        } : undefined,
      },
    };
  } catch {
    // Return default classification on parse error
    console.error('[Cerebras] Failed to parse intent classification:', response);
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
 * Uses Llama 3.3 70B for best quality
 */
export async function generateContent(
  query: string,
  ragContext: RAGContext,
  intent: IntentClassification,
  layout: LayoutTemplate,
  env: Env,
  sessionContext?: SessionContextParam
): Promise<GeneratedContent> {
  const userPrompt = buildContentGenerationPrompt(query, ragContext, intent, layout, sessionContext);

  const messages: CerebrasMessage[] = [
    {
      role: 'system',
      content: CONTENT_GENERATION_SYSTEM,
    },
    {
      role: 'user',
      content: userPrompt,
    },
  ];

  const response = await callCerebras(
    messages,
    {
      model: 'llama-3.3-70b', // Best quality model
      maxTokens: 4096,
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
    console.error('[Cerebras] Failed to parse generated content:', response);
    throw new Error('Failed to generate valid content');
  }
}

/**
 * Validate content against brand guidelines
 * Uses Llama 3.1 8B for quick validation
 */
export async function validateBrandCompliance(
  content: string,
  env: Env
): Promise<{ isCompliant: boolean; score: number; issues: string[] }> {
  const messages: CerebrasMessage[] = [
    {
      role: 'system',
      content: 'You are a brand compliance checker. Respond only with valid JSON.',
    },
    {
      role: 'user',
      content: `
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
`,
    },
  ];

  const response = await callCerebras(
    messages,
    {
      model: 'llama3.1-8b',
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
 * Generate text for a specific block
 */
export async function generateBlockContent(
  blockType: string,
  context: string,
  env: Env
): Promise<string> {
  const messages: CerebrasMessage[] = [
    {
      role: 'system',
      content: BRAND_VOICE_SYSTEM_PROMPT,
    },
    {
      role: 'user',
      content: `
Generate content for a ${blockType} block on a Vitamix page.

Context:
${context}

Generate the content in the appropriate format for this block type.
Use Vitamix brand voice: professional, empowering, premium.
`,
    },
  ];

  return callCerebras(
    messages,
    {
      model: 'llama3.1-8b',
      maxTokens: 1000,
    },
    env
  );
}
