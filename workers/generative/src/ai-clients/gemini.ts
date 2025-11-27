import type { Env, LayoutDecision, IntentClassification, GeneratedContent, BlockType } from '../types';
import { LAYOUT_GENERATION_PROMPT } from '../prompts/layout';

/**
 * Gemini API client for layout generation
 */

interface GeminiResponse {
  candidates: Array<{
    content: {
      parts: Array<{
        text: string;
      }>;
    };
    finishReason: string;
  }>;
}

/**
 * Call Gemini API
 */
async function callGemini(
  prompt: string,
  options: {
    model?: string;
    maxTokens?: number;
    temperature?: number;
  },
  env: Env
): Promise<string> {
  const model = options.model || 'gemini-2.0-flash';

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GOOGLE_API_KEY}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          maxOutputTokens: options.maxTokens || 2048,
          temperature: options.temperature ?? 0.7,
        },
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${error}`);
  }

  const result = await response.json() as GeminiResponse;

  if (!result.candidates || result.candidates.length === 0) {
    throw new Error('No candidates in Gemini response');
  }

  return result.candidates[0].content.parts[0].text;
}

/**
 * Generate optimal page layout based on content and intent
 */
export async function generateLayout(
  content: GeneratedContent,
  intent: IntentClassification,
  env: Env
): Promise<LayoutDecision> {
  // Build prompt with content summary
  const contentSummary = content.blocks.map((block, i) => ({
    index: i,
    type: block.type,
    hasImage: 'imagePrompt' in block.content,
    preview: getContentPreview(block.content),
  }));

  const prompt = `
${LAYOUT_GENERATION_PROMPT}

## Content Blocks Available
${JSON.stringify(contentSummary, null, 2)}

## User Intent
Type: ${intent.intentType}
Goals: ${intent.entities.goals.join(', ') || 'general exploration'}
Suggested blocks: ${intent.suggestedBlocks.join(', ')}

## Task
Determine the optimal layout for this page. Consider:
1. Visual hierarchy and flow
2. Content type appropriateness
3. User intent and goals
4. Conversion opportunities

Return JSON:
{
  "blocks": [
    {
      "blockType": "hero" | "cards" | "columns" | "text" | "cta" | "faq",
      "contentIndex": 0,
      "variant": "default" | "highlight" | "dark",
      "width": "full" | "contained"
    }
  ],
  "reasoning": "Brief explanation"
}
`;

  const response = await callGemini(
    prompt,
    {
      model: 'gemini-2.0-flash',
      maxTokens: 1000,
      temperature: 0.5,
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

    return {
      blocks: parsed.blocks || getDefaultLayout(intent),
      reasoning: parsed.reasoning || 'Default layout applied',
    };
  } catch {
    console.error('Failed to parse layout decision:', response);
    // Return default layout
    return {
      blocks: getDefaultLayout(intent),
      reasoning: 'Fallback to default layout',
    };
  }
}

/**
 * Get a preview of block content for layout decisions
 */
function getContentPreview(content: any): string {
  if ('headline' in content) {
    return content.headline.slice(0, 50);
  }
  if ('cards' in content) {
    return `${content.cards.length} cards`;
  }
  if ('columns' in content) {
    return `${content.columns.length} columns`;
  }
  if ('items' in content) {
    return `${content.items.length} FAQ items`;
  }
  if ('body' in content) {
    return content.body.slice(0, 50);
  }
  return 'content';
}

/**
 * Get default layout based on intent
 */
function getDefaultLayout(intent: IntentClassification): LayoutDecision['blocks'] {
  const baseLayout: LayoutDecision['blocks'] = [
    { blockType: 'hero', contentIndex: 0, variant: 'default', width: 'full' },
  ];

  switch (intent.intentType) {
    case 'product_info':
      return [
        ...baseLayout,
        { blockType: 'columns', contentIndex: 1, variant: 'default', width: 'contained' },
        { blockType: 'cards', contentIndex: 2, variant: 'default', width: 'contained' },
        { blockType: 'cta', contentIndex: 3, variant: 'highlight', width: 'contained' },
      ];

    case 'recipe':
      return [
        ...baseLayout,
        { blockType: 'columns', contentIndex: 1, variant: 'default', width: 'contained' },
        { blockType: 'text', contentIndex: 2, variant: 'default', width: 'contained' },
        { blockType: 'cards', contentIndex: 3, variant: 'default', width: 'contained' },
      ];

    case 'comparison':
      return [
        ...baseLayout,
        { blockType: 'columns', contentIndex: 1, variant: 'default', width: 'contained' },
        { blockType: 'cards', contentIndex: 2, variant: 'default', width: 'contained' },
        { blockType: 'faq', contentIndex: 3, variant: 'default', width: 'contained' },
        { blockType: 'cta', contentIndex: 4, variant: 'highlight', width: 'contained' },
      ];

    case 'support':
      return [
        ...baseLayout,
        { blockType: 'faq', contentIndex: 1, variant: 'default', width: 'contained' },
        { blockType: 'text', contentIndex: 2, variant: 'default', width: 'contained' },
        { blockType: 'cta', contentIndex: 3, variant: 'default', width: 'contained' },
      ];

    default:
      return [
        ...baseLayout,
        { blockType: 'cards', contentIndex: 1, variant: 'default', width: 'contained' },
        { blockType: 'cta', contentIndex: 2, variant: 'highlight', width: 'contained' },
      ];
  }
}

/**
 * Analyze query to extract structured information
 * Uses Gemini for entity extraction
 */
export async function analyzeQuery(
  query: string,
  env: Env
): Promise<{
  products: string[];
  ingredients: string[];
  goals: string[];
  keywords: string[];
}> {
  const prompt = `
Analyze this user query for a Vitamix website and extract key information.

Query: "${query}"

Return JSON:
{
  "products": ["any Vitamix products mentioned"],
  "ingredients": ["any food ingredients mentioned"],
  "goals": ["user's apparent goals or needs"],
  "keywords": ["important search keywords"]
}
`;

  const response = await callGemini(
    prompt,
    {
      model: 'gemini-2.0-flash',
      maxTokens: 500,
      temperature: 0.3,
    },
    env
  );

  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch {
    // Return empty on parse error
  }

  return {
    products: [],
    ingredients: [],
    goals: [query],
    keywords: query.split(' ').filter(w => w.length > 3),
  };
}
