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
      "type": "hero" | "cards" | "columns" | "split-content" | "text" | "cta" | "faq" | "benefits-grid" | "recipe-cards" | "product-recommendation" | "tips-banner" | "ingredient-search" | "recipe-filter-bar" | "recipe-grid" | "quick-view-modal" | "technique-spotlight" | "support-hero" | "diagnosis-card" | "troubleshooting-steps" | "support-cta" | "comparison-table" | "use-case-cards" | "verdict-card" | "comparison-cta" | "product-hero" | "specs-table" | "feature-highlights" | "included-accessories" | "product-cta",
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

### Support Hero Block (Support/Troubleshooting pages)
{
  "type": "support-hero",
  "content": {
    "icon": "string (icon name like 'warning', 'info', 'tool')",
    "title": "string (issue-specific headline like 'Troubleshooting: Grinding Noise')",
    "subtitle": "string (empathetic message like 'Let's get your Vitamix back to peak performance')"
  }
}

**Support Hero Notes:**
- Empathetic, text-focused hero for troubleshooting pages
- No image - uses icon to acknowledge the issue
- Title should include "Troubleshooting:" prefix for clarity
- Subtitle should be reassuring and solution-oriented

### Diagnosis Card Block (Support/Troubleshooting pages)
{
  "type": "diagnosis-card",
  "content": {
    "items": [
      {
        "severity": "string (minor | moderate | serious)",
        "cause": "string (likely cause of the issue)",
        "implication": "string (what this means for the user)"
      }
    ]
  }
}

**Diagnosis Card Notes:**
- Always provide exactly 3 items: minor, moderate, serious
- Color-coded display: green (minor), yellow (moderate), red (serious)
- Cause should be concise (3-5 words)
- Implication should explain next steps or urgency

### Troubleshooting Steps Block (Support/Troubleshooting pages)
{
  "type": "troubleshooting-steps",
  "content": {
    "steps": [
      {
        "stepNumber": number (1, 2, 3...),
        "title": "string (action title like 'Check for trapped ingredients')",
        "instructions": "string (detailed step instructions)",
        "safetyNote": "string (optional, safety warning like 'Always unplug first')",
        "imagePrompt": "string (optional, describe illustration for this step)"
      }
    ]
  }
}

**Troubleshooting Steps Notes:**
- Provide 3-5 steps in logical order (easiest fixes first)
- Always start with safety-related steps (unplug, etc.)
- Include safetyNote for steps involving blades or electrical components
- Instructions should be detailed but actionable
- imagePrompt optional - use for steps that benefit from visual guidance

### Support CTA Block (Support/Troubleshooting pages)
{
  "type": "support-cta",
  "content": {
    "ctas": [
      {
        "title": "string (button title like 'Contact Support')",
        "description": "string (supporting text like 'Still need help? We're here.')",
        "url": "string (destination URL)",
        "style": "string (primary | secondary)"
      }
    ]
  }
}

**Support CTA Notes:**
- Always provide exactly 2 CTAs: one primary (contact), one secondary (parts/resources)
- Primary should be for human support escalation
- Secondary should be for self-service (parts, warranty, etc.)
- Descriptions should be encouraging and helpful

### Comparison Table Block (Product Comparison pages)
{
  "type": "comparison-table",
  "content": {
    "products": ["string (product names like 'A3500', 'A2500', 'E310')"],
    "specs": [
      {
        "name": "string (spec name like 'Price', 'Motor', 'Container')",
        "values": ["string (value per product, use ✓ for winner, ✗ for missing)"]
      }
    ]
  }
}

**Comparison Table Notes:**
- Support 2-4 products in the comparison
- Include 6-10 spec rows (Price, Motor, Container, Controls, Programs, Self-Detect, Warranty, Noise Level, WiFi/App)
- Use ✓ to mark winner in category, ✗ for missing features
- Values array must match products array length
- Use RAG context for accurate specs - don't invent features

### Use Case Cards Block (Product Comparison pages)
{
  "type": "use-case-cards",
  "content": {
    "cards": [
      {
        "persona": "string (like 'POWER USER', 'MOST POPULAR', 'BEST VALUE')",
        "product": "string (product name like 'A3500')",
        "description": "string (why this product fits this persona)",
        "ctaText": "string (like 'Shop A3500')",
        "ctaUrl": "string (product page URL)"
      }
    ]
  }
}

**Use Case Cards Notes:**
- Generate exactly 3 cards matching the number of products compared
- Personas should be distinct: tech-savvy, balanced, budget-conscious
- Description should explain WHY this product fits the persona
- Keep descriptions concise (1-2 sentences)

### Verdict Card Block (Product Comparison pages)
{
  "type": "verdict-card",
  "content": {
    "headline": "string (like 'The Verdict')",
    "mainRecommendation": "string (e.g., 'For most people, we recommend the A2500...')",
    "recommendations": [
      {
        "product": "string (product name)",
        "condition": "string (when to choose this, e.g., 'You want touchscreen and WiFi')"
      }
    ],
    "closingStatement": "string (optional, e.g., 'All three deliver legendary Vitamix performance')"
  }
}

**Verdict Card Notes:**
- Main recommendation should be objective and helpful
- Include one recommendation per product compared
- Conditions should be clear differentiators
- Closing statement reassures all options are good

### Comparison CTA Block (Product Comparison pages)
{
  "type": "comparison-cta",
  "content": {
    "products": [
      {
        "name": "string (product name)",
        "price": "string (like '$649')",
        "ctaText": "string (like 'Shop Now')",
        "ctaUrl": "string (product page URL)"
      }
    ],
    "footerMessage": "string (like 'All models include free shipping')"
  }
}

**Comparison CTA Notes:**
- Include all products from the comparison
- Prices should match RAG context
- Footer message should include trust signals (free shipping, warranty)

### Product Hero Block (Product Detail pages)
{
  "type": "product-hero",
  "content": {
    "productName": "string (product name like 'Ascent Series A3500')",
    "description": "string (brief product description)",
    "price": "string (like '$649.95')",
    "specs": "string (key specs like '2.2 HP Motor | 64 oz Container | 10-Year Warranty')",
    "imagePrompt": "string (product image description)",
    "addToCartUrl": "string (add to cart URL)",
    "compareUrl": "string (comparison page URL)"
  }
}

**Product Hero Notes:**
- Split layout with image on left, details on right
- Include price and key specs summary
- Two CTAs: Add to Cart and Compare Models

### Specs Table Block (Product Detail pages)
{
  "type": "specs-table",
  "content": {
    "specs": [
      {
        "label": "string (spec name like 'Motor')",
        "value": "string (spec value like '2.2 HP Peak')"
      }
    ]
  }
}

**Specs Table Notes:**
- Grid layout showing key specifications
- Use RAG context for accurate specifications
- Include 6-8 specs: Motor, Container, Programs, Warranty, Controls, Speed, Dimensions, Weight

### Feature Highlights Block (Product Detail pages)
{
  "type": "feature-highlights",
  "content": {
    "features": [
      {
        "title": "string (feature name like 'Touchscreen Controls')",
        "description": "string (feature explanation)",
        "imagePrompt": "string (image showing the feature)"
      }
    ]
  }
}

**Feature Highlights Notes:**
- Card layout with image + text for each feature
- Include 3 key features
- Images should show the feature in action

### Included Accessories Block (Product Detail pages)
{
  "type": "included-accessories",
  "content": {
    "accessories": [
      {
        "title": "string (accessory name like '64 oz Low-Profile Container')",
        "description": "string (brief description)",
        "imagePrompt": "string (accessory image)"
      }
    ]
  }
}

**Included Accessories Notes:**
- Card layout showing what's in the box
- Include 3-4 accessories
- Each has image, title, and brief description

### Product CTA Block (Product Detail pages)
{
  "type": "product-cta",
  "content": {
    "headline": "string (like 'Ready to Transform Your Kitchen?')",
    "description": "string (motivational message)",
    "primaryCtaText": "string (like 'Add to Cart - $649.95')",
    "primaryCtaUrl": "string (add to cart URL)",
    "secondaryCtaText": "string (like 'Find a Retailer')",
    "secondaryCtaUrl": "string (retailer locator URL)",
    "tertiaryCtaText": "string (optional, like 'Compare All Models')",
    "tertiaryCtaUrl": "string (optional)"
  }
}

**Product CTA Notes:**
- Dark background with white text
- Primary CTA should include price
- Secondary and tertiary CTAs for additional actions

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

/** User context for implicit recommendations */
interface UserContext {
  isImplicitRecommendation: boolean;
  contextType: 'family' | 'lifestyle' | 'experience' | 'budget' | 'capacity' | 'general' | null;
  contextDescription: string | null;
}

/** Session context from previous queries */
interface SessionContextParam {
  previousQueries?: Array<{
    query: string;
    layout?: string;
  }>;
}

/**
 * Build the user prompt for content generation
 */
export function buildContentGenerationPrompt(
  query: string,
  ragContext: RAGContext,
  intent: IntentClassification,
  layout: LayoutTemplate,
  sessionContext?: SessionContextParam,
  userContext?: UserContext
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

  // Build user context section for implicit recommendations
  let userContextSection = '';
  if (userContext?.isImplicitRecommendation) {
    const contextTypeDescriptions: Record<string, string> = {
      family: 'The user mentioned family size or number of children. Focus on capacity, batch cooking ability, ease of cleaning, and family-friendly features. Explain how the recommended products handle larger quantities and daily family use.',
      lifestyle: 'The user mentioned a busy lifestyle. Focus on speed, convenience, preset programs, and time-saving features. Explain how the products fit into a hectic schedule.',
      experience: 'The user is new to blending or Vitamix. Focus on ease of use, learning curve, preset programs, and support resources. Recommend beginner-friendly options with good value.',
      budget: 'The user mentioned budget considerations. Focus on value, essential features vs premium, and long-term investment. Compare price points honestly while highlighting what matters most.',
      capacity: 'The user needs to make large batches. Focus on container sizes, motor power for sustained use, and durability. Explain capacity differences between models.',
      general: 'The user is seeking a product recommendation. Help them understand the differences between models and which might suit their needs best.',
    };

    const contextGuidance = userContext.contextType
      ? contextTypeDescriptions[userContext.contextType]
      : contextTypeDescriptions.general;

    userContextSection = `

## IMPORTANT: User Context for Personalized Recommendations
The user's query "${query}" indicates they are: **${userContext.contextDescription}**

This is an IMPLICIT recommendation request. The user didn't explicitly ask "which should I buy?" but their personal situation suggests they need help choosing.

**Content Guidance:**
${contextGuidance}

**Hero/Introduction Requirements:**
- The hero headline and subheadline MUST acknowledge the user's situation
- Example for "I have 4 kids": "Finding the Right Vitamix for Your Growing Family" NOT generic "Compare Vitamix Blenders"
- Explain WHY they're seeing this comparison: "With a family of 6, you need a blender that handles large batches efficiently..."

**Comparison Focus:**
- Tailor the comparison criteria to their context (e.g., for families: focus on capacity, durability, ease of cleaning)
- The verdict should specifically address their stated situation
- Avoid generic "about us" or company history content - this is a PRODUCT RECOMMENDATION page`;
  }

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
${userContextSection}

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
${userContext?.isImplicitRecommendation ? '7. Personalize ALL content to the user\'s stated situation - DO NOT generate generic "about us" or company history content' : ''}

Return valid JSON only.
`;
}
