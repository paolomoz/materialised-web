import type { RAGContext, IntentClassification, SessionContextParam, UserContext } from '../types';
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
      "type": "hero" | "cards" | "columns" | "split-content" | "text" | "cta" | "faq" | "benefits-grid" | "recipe-cards" | "product-recommendation" | "tips-banner" | "ingredient-search" | "recipe-filter-bar" | "recipe-grid" | "quick-view-modal" | "technique-spotlight" | "support-hero" | "diagnosis-card" | "troubleshooting-steps" | "support-cta" | "comparison-table" | "use-case-cards" | "verdict-card" | "comparison-cta" | "product-hero" | "specs-table" | "feature-highlights" | "included-accessories" | "product-cta" | "product-cards" | "recipe-hero" | "ingredients-list" | "recipe-steps" | "nutrition-facts" | "recipe-tips" | "countdown-timer" | "testimonials" | "timeline" | "team-cards",
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
    "ctaType": "explore" | "shop" | "external",
    "generationHint": "string (REQUIRED for explore CTAs)",
    "secondaryButtonText": "string (optional)",
    "secondaryButtonUrl": "string (optional)"
  }
}

**CTA Type Rules:**
- "explore": Triggers new page generation (e.g., "See Recipes", "Learn More", "Explore Smoothies")
  - REQUIRES generationHint: a phrase describing what content to generate
  - buttonUrl should be a path like "/recipes/smoothies" (not external URL)
  - Example: ctaType "explore", buttonText "See Energy Smoothies", generationHint "collection of energy-boosting smoothie recipes"
- "shop": Links to vitamix.com shopping/cart (e.g., "Shop Now", "Add to Cart", "Buy Now")
  - buttonUrl should link to vitamix.com product/cart pages
- "external": Links to external sites (e.g., "Find Retailer")
  - buttonUrl is a full external URL

**Default ctaType inference (if not specified):**
- If buttonText contains "Shop", "Buy", "Cart", "Order" → shop
- If buttonText contains "Learn", "See", "Explore", "Discover", "Browse", "View", "Find recipes" → explore
- If buttonUrl starts with "http" and not vitamix.com → external

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

### Product Cards Block (Category Browse pages)
{
  "type": "product-cards",
  "content": {
    "products": [
      {
        "name": "string (product name like 'Vitamix A3500')",
        "price": "string (like '$649.95')",
        "reviewCount": "string (like '1,234')",
        "url": "string (product page URL)",
        "ctaText": "string (like 'Shop Now' or 'Learn More')",
        "imagePrompt": "string (product photo description)"
      }
    ]
  }
}

**Product Cards Notes:**
- Used on category browse pages to display product grids
- Use RAG context for accurate product names, prices, and URLs
- Image prompts should describe clean product photos on neutral backgrounds
- Include 3-6 products per block

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
        "title": "string (short 2-4 word action like 'Check Blade Assembly')",
        "instructions": "string (REQUIRED - user-facing explanation telling them exactly what to do, 1-2 sentences)",
        "safetyNote": "string (optional)"
      }
    ]
  }
}

**Troubleshooting Steps - IMPORTANT:**
- instructions is REQUIRED for every step - this tells the user what to actually do
- DO NOT describe images or photos - write actual user instructions
- Example good instructions: "Remove the container and inspect the blade assembly for wear. Look for cracks, rust, or wobbling in the bearing."
- Example bad instructions: "A photo of a blade assembly" (WRONG - this describes an image, not an instruction)
- Provide 3-5 steps, easiest fixes first
- Include safetyNote for steps involving blades or electrical components

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

### Recipe Hero Block (Single Recipe pages)
{
  "type": "recipe-hero",
  "content": {
    "title": "string (recipe name like 'Classic Tomato Soup')",
    "description": "string (1-2 sentences about the dish)",
    "imagePrompt": "string (describe the finished dish)",
    "prepTime": "string (like '10 min')",
    "cookTime": "string (like '20 min')",
    "totalTime": "string (like '30 min')",
    "servings": "string (like '4 servings')",
    "difficulty": "string (Easy, Medium, Hard)",
    "category": "string (like 'Soups', 'Smoothies', 'Desserts')"
  }
}

**Recipe Hero Notes:**
- Full-width hero with large dish image
- Metadata bar shows prep time, cook time, servings, difficulty
- Description should be appetizing and inviting

### Ingredients List Block (Single Recipe pages)
{
  "type": "ingredients-list",
  "content": {
    "title": "string (optional, default 'Ingredients')",
    "servingsNote": "string (optional, like 'For 4 servings')",
    "sections": [
      {
        "name": "string (optional, group name like 'For the Soup')",
        "items": [
          {
            "amount": "string (like '2 cups', '1 tablespoon')",
            "item": "string (ingredient name like 'fresh tomatoes')",
            "note": "string (optional, like 'diced', 'room temperature')"
          }
        ]
      }
    ]
  }
}

**Ingredients List Notes:**
- Two-column layout for easy reading
- Group ingredients into sections if recipe has multiple components
- Include preparation notes (diced, chopped, etc.)
- Use RAG context for accurate measurements

### Recipe Steps Block (Single Recipe pages)
{
  "type": "recipe-steps",
  "content": {
    "title": "string (optional, default 'Instructions')",
    "steps": [
      {
        "stepNumber": number (1, 2, 3...),
        "title": "string (short step title like 'Blend the Base')",
        "instruction": "string (detailed step instruction)",
        "tip": "string (optional, pro tip for this step)",
        "imagePrompt": "string (optional, describe step illustration)"
      }
    ]
  }
}

**Recipe Steps Notes:**
- Numbered steps with clear titles
- Include detailed instructions for each step
- Optional images for key steps (Vitamix settings, technique)
- Tips should add value (speed settings, timing cues)

### Nutrition Facts Block (Single Recipe pages)
{
  "type": "nutrition-facts",
  "content": {
    "title": "string (optional, default 'Nutrition Facts')",
    "servingSize": "string (like 'Per 1 cup serving')",
    "facts": [
      {
        "label": "string (like 'Calories', 'Protein', 'Fiber')",
        "value": "string (like '120', '5g', '3g')",
        "dailyValue": "string (optional, like '10%')"
      }
    ]
  }
}

**Nutrition Facts Notes:**
- Grid layout showing key nutritional information
- Include 6-8 facts: Calories, Protein, Carbs, Fat, Fiber, Sugar, Sodium
- Only include facts if they're available in RAG context
- Don't invent nutrition data

### Recipe Tips Block (Single Recipe pages)
{
  "type": "recipe-tips",
  "content": {
    "title": "string (optional, default 'Pro Tips')",
    "tips": [
      {
        "title": "string (short tip title)",
        "description": "string (tip explanation)",
        "icon": "string (optional, icon name like 'lightbulb', 'clock', 'star')"
      }
    ],
    "variations": [
      {
        "name": "string (variation name like 'Spicy Version')",
        "description": "string (how to modify the recipe)"
      }
    ]
  }
}

**Recipe Tips Notes:**
- Include 3-5 helpful tips
- Tips should be specific to this recipe
- Variations offer alternative versions (dietary, flavor)

### Countdown Timer Block (Campaign Landing pages)
{
  "type": "countdown-timer",
  "content": {
    "headline": "string (like 'Sale Ends In')",
    "endDate": "string (ISO date like '2024-12-25T23:59:59Z')",
    "expiredMessage": "string (like 'This offer has ended')",
    "urgencyMessage": "string (optional, like 'Limited Time Only!')"
  }
}

**Countdown Timer Notes:**
- Displays days, hours, minutes, seconds
- Use urgencyMessage for additional pressure
- JS handles the countdown animation

### Testimonials Block (Campaign Landing pages)
{
  "type": "testimonials",
  "content": {
    "title": "string (optional, like 'What Our Customers Say')",
    "testimonials": [
      {
        "quote": "string (customer quote)",
        "author": "string (customer name)",
        "location": "string (optional, city/state)",
        "product": "string (optional, product they purchased)",
        "rating": number (optional, 1-5 stars),
        "imagePrompt": "string (optional, customer photo description)"
      }
    ]
  }
}

**Testimonials Notes:**
- Include 3 testimonials
- Quotes should be authentic-sounding
- Include star rating when available
- Use real testimonials from RAG context if available

### Timeline Block (About/Brand Story pages)
{
  "type": "timeline",
  "content": {
    "title": "string (optional, like 'Our Journey')",
    "events": [
      {
        "year": "string (like '1921', '2010s')",
        "title": "string (milestone title)",
        "description": "string (1-2 sentences about the event)",
        "highlight": boolean (optional, emphasize key moments)
      }
    ]
  }
}

**Timeline Notes:**
- Chronological company history
- Include 5-7 key milestones
- Use RAG context for accurate dates and facts
- Highlight 1-2 most important moments

### Team Cards Block (About/Brand Story pages)
{
  "type": "team-cards",
  "content": {
    "title": "string (optional, like 'Our Leadership')",
    "members": [
      {
        "name": "string (full name)",
        "role": "string (job title)",
        "bio": "string (1-2 sentences about them)",
        "imagePrompt": "string (professional headshot description)"
      }
    ]
  }
}

**Team Cards Notes:**
- Grid of leadership team cards
- Include 3-4 team members
- Professional headshot images
- Brief, engaging bios

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
  layout: LayoutTemplate,
  sessionContext?: SessionContextParam
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

  // Build session context section if available
  let sessionSection = '';
  if (sessionContext?.previousQueries && sessionContext.previousQueries.length > 0) {
    const historyLines = sessionContext.previousQueries.slice(-5).map((q) => {
      const entitiesList = [
        ...q.entities.products,
        ...q.entities.ingredients,
        ...q.entities.goals,
      ].filter(Boolean);
      return `- "${q.query}" (${q.intent})${entitiesList.length > 0 ? `: ${entitiesList.join(', ')}` : ''}`;
    }).join('\n');

    // Extract session themes for explicit merging instruction
    const allGoals = sessionContext.previousQueries.flatMap((q) => q.entities.goals).filter(Boolean);
    const allIngredients = sessionContext.previousQueries.flatMap((q) => q.entities.ingredients).filter(Boolean);
    const allProducts = sessionContext.previousQueries.flatMap((q) => q.entities.products).filter(Boolean);
    const sessionThemes = [...new Set([...allGoals, ...allIngredients])].slice(0, 5);
    const sessionProducts = [...new Set(allProducts)].slice(0, 3);

    // Accumulate user context from session (dietary restrictions persist)
    const sessionDietaryAvoid = sessionContext.previousQueries
      .flatMap((q) => q.entities.userContext?.dietary?.avoid || []);
    const sessionDietaryPrefs = sessionContext.previousQueries
      .flatMap((q) => q.entities.userContext?.dietary?.preferences || []);
    const sessionAudience = sessionContext.previousQueries
      .flatMap((q) => q.entities.userContext?.audience || []);
    const sessionOccasion = sessionContext.previousQueries
      .flatMap((q) => q.entities.userContext?.occasion || []);
    const sessionSeason = sessionContext.previousQueries
      .flatMap((q) => q.entities.userContext?.season || []);
    const sessionLifestyle = sessionContext.previousQueries
      .flatMap((q) => q.entities.userContext?.lifestyle || []);
    const sessionConstraints = sessionContext.previousQueries
      .flatMap((q) => q.entities.userContext?.constraints || []);

    sessionSection = `
## Session Context (BLEND with Current Query - ACROSS ALL INTENT TYPES)

Previous queries in this session:
${historyLines}

**Session Themes to MERGE with current query:** ${sessionThemes.length > 0 ? sessionThemes.join(', ') : 'general exploration'}
${sessionProducts.length > 0 ? `**Products from session:** ${sessionProducts.join(', ')}` : ''}

**CRITICAL: Content Blending Instructions (applies to ALL page types):**

1. **COMBINE session themes with current query - even across intent types**:
   - Recipe session + recipe query: "smoothies" + "walnut" → "Walnut Smoothie Recipes"
   - Recipe session + product query: "tropical smoothies" + "best blender" → "Best Blenders for Tropical Smoothies"
   - Product session + recipe query: "A3500" + "soup recipes" → "Soup Recipes for Your A3500"

2. **For PRODUCT pages when session was about recipes/ingredients:**
   - Headlines should reference the use case: "Best Blenders for Tropical Fruit Smoothies" not just "Best Blenders"
   - Product descriptions should explain WHY each product is good for the session use case
   - Comparison criteria should prioritize features relevant to session (e.g., "ice crushing for frozen fruit")
   - Verdict should recommend based on session context ("For your tropical smoothie needs, we recommend...")

3. **For RECIPE pages when session mentioned products:**
   - Reference the product: "Recipes Perfect for Your A3500"
   - Include tips specific to that product's features

4. **For EDUCATIONAL pages (settings, tips, techniques):**
   - Connect to session themes: "creamy soups" session + "baby food settings" → reference smooth textures, similar techniques
   - "You've been exploring creamy soups - the same smooth-blending techniques work great for baby food"
   - If products were compared, reference which settings work on those models
   - Build on accumulated knowledge: session about textures/techniques should inform new technique queries

5. **Headlines MUST reflect the blend**:
   - Session: tropical fruits, smoothies → Product query → "Best Vitamix for Tropical Smoothies"
   - Session: creamy soups, blender comparison → Baby food query → "Baby Food Settings: Smooth Textures Like Your Favorite Soups"
   - NOT just generic headlines

6. **ACCUMULATE context across 3+ queries**:
   - Query 1: soups → Query 2: blenders for soups → Query 3: baby food should reference BOTH soups AND blenders
   - Example: "Using the blenders you compared, here's how to achieve the same creamy texture for baby food"
   - The conversation builds - each page should feel like a continuation, not a fresh start

7. **Don't just acknowledge context - WEAVE it into every piece of content**
`;
  }

  // Compute merged user context (current intent + session history)
  // Helper to merge arrays from current context and session
  const currentContext = intent.entities.userContext;
  type QueryHistoryEntry = NonNullable<SessionContextParam>['previousQueries'][0];
  const mergeArrays = <T>(
    getCurrent: () => T[] | undefined,
    getFromSession: (q: QueryHistoryEntry) => T[] | undefined
  ): T[] => [...new Set([
    ...(getCurrent() || []),
    ...(sessionContext?.previousQueries?.flatMap((q) => getFromSession(q) || []) || []),
  ])];

  const mergedUserContext = {
    // Dietary & Health
    dietaryAvoid: mergeArrays(() => currentContext?.dietary?.avoid, (q) => q.entities.userContext?.dietary?.avoid),
    dietaryPrefs: mergeArrays(() => currentContext?.dietary?.preferences, (q) => q.entities.userContext?.dietary?.preferences),
    healthConditions: mergeArrays(() => currentContext?.health?.conditions, (q) => q.entities.userContext?.health?.conditions),
    healthGoals: mergeArrays(() => currentContext?.health?.goals, (q) => q.entities.userContext?.health?.goals),
    healthConsiderations: mergeArrays(() => currentContext?.health?.considerations, (q) => q.entities.userContext?.health?.considerations),

    // Audience & Household
    audience: mergeArrays(() => currentContext?.audience, (q) => q.entities.userContext?.audience),
    pickyEaters: mergeArrays(() => currentContext?.household?.pickyEaters, (q) => q.entities.userContext?.household?.pickyEaters),
    texture: mergeArrays(() => currentContext?.household?.texture, (q) => q.entities.userContext?.household?.texture),
    spiceLevel: mergeArrays(() => currentContext?.household?.spiceLevel, (q) => q.entities.userContext?.household?.spiceLevel),
    portions: mergeArrays(() => currentContext?.household?.portions, (q) => q.entities.userContext?.household?.portions),

    // Cooking Context
    equipment: mergeArrays(() => currentContext?.cooking?.equipment, (q) => q.entities.userContext?.cooking?.equipment),
    skillLevel: mergeArrays(() => currentContext?.cooking?.skillLevel, (q) => q.entities.userContext?.cooking?.skillLevel),
    kitchen: mergeArrays(() => currentContext?.cooking?.kitchen, (q) => q.entities.userContext?.cooking?.kitchen),

    // Cultural & Regional
    cuisine: mergeArrays(() => currentContext?.cultural?.cuisine, (q) => q.entities.userContext?.cultural?.cuisine),
    religious: mergeArrays(() => currentContext?.cultural?.religious, (q) => q.entities.userContext?.cultural?.religious),
    regional: mergeArrays(() => currentContext?.cultural?.regional, (q) => q.entities.userContext?.cultural?.regional),

    // Time & Occasion
    occasion: mergeArrays(() => currentContext?.occasion, (q) => q.entities.userContext?.occasion),
    season: mergeArrays(() => currentContext?.season, (q) => q.entities.userContext?.season),

    // Lifestyle & Fitness
    lifestyle: mergeArrays(() => currentContext?.lifestyle, (q) => q.entities.userContext?.lifestyle),
    fitnessContext: mergeArrays(() => currentContext?.fitnessContext, (q) => q.entities.userContext?.fitnessContext),

    // Practical Constraints
    constraints: mergeArrays(() => currentContext?.constraints, (q) => q.entities.userContext?.constraints),
    budget: mergeArrays(() => currentContext?.budget, (q) => q.entities.userContext?.budget),
    shopping: mergeArrays(() => currentContext?.shopping, (q) => q.entities.userContext?.shopping),
    storage: mergeArrays(() => currentContext?.storage, (q) => q.entities.userContext?.storage),

    // Ingredients
    available: mergeArrays(() => currentContext?.available, (q) => q.entities.userContext?.available),
    mustUse: mergeArrays(() => currentContext?.mustUse, (q) => q.entities.userContext?.mustUse),
  };

  // Build user context section for the prompt
  const hasUserContext = Object.values(mergedUserContext).some((arr) => arr.length > 0);

  let userContextSection = '';
  if (hasUserContext) {
    const sections: string[] = [];

    // DIETARY & HEALTH (Critical - must follow)
    if (mergedUserContext.dietaryAvoid.length > 0) {
      sections.push(`**🚫 DIETARY RESTRICTIONS (MUST FOLLOW):**
Avoid: ${mergedUserContext.dietaryAvoid.join(', ')}
- NEVER recommend recipes containing these ingredients
- NEVER list these ingredients in recipes
- Acknowledge the restriction naturally in headlines (e.g., "Delicious Carrot-Free Soups...")`);
    }
    if (mergedUserContext.dietaryPrefs.length > 0) {
      sections.push(`**Dietary preferences:** ${mergedUserContext.dietaryPrefs.join(', ')}
- All recipes MUST comply with these preferences
- For "vegan": no animal products. For "gluten-free": no wheat, barley, rye, etc.`);
    }
    if (mergedUserContext.religious.length > 0) {
      sections.push(`**Religious dietary laws:** ${mergedUserContext.religious.join(', ')}
- MUST comply with religious requirements (halal, kosher, etc.)
- This is non-negotiable`);
    }

    // HEALTH
    if (mergedUserContext.healthConditions.length > 0) {
      sections.push(`**Health conditions:** ${mergedUserContext.healthConditions.join(', ')}
- Tailor recipes to be appropriate for these conditions
- For "diabetes": low-sugar, low-glycemic. For "heart-health": low-sodium, healthy fats`);
    }
    if (mergedUserContext.healthGoals.length > 0) {
      sections.push(`**Health goals:** ${mergedUserContext.healthGoals.join(', ')}
- Optimize recipes for these goals
- For "weight-loss": low-calorie, filling. For "muscle-gain": high-protein`);
    }
    if (mergedUserContext.healthConsiderations.length > 0) {
      sections.push(`**Nutritional requirements:** ${mergedUserContext.healthConsiderations.join(', ')}
- Ensure recipes meet these requirements`);
    }

    // AUDIENCE & HOUSEHOLD
    if (mergedUserContext.audience.length > 0) {
      sections.push(`**Audience:** ${mergedUserContext.audience.join(', ')}
- Tailor content for this audience (e.g., "kid-approved", "crowd-pleasing", "family-sized")
- Adjust complexity, portions, and language accordingly`);
    }
    if (mergedUserContext.pickyEaters.length > 0) {
      sections.push(`**Picky eater constraints:** ${mergedUserContext.pickyEaters.join(', ')}
- Work around these preferences (e.g., hide vegetables if needed)`);
    }
    if (mergedUserContext.texture.length > 0) {
      sections.push(`**Texture preference:** ${mergedUserContext.texture.join(', ')}
- Ensure recipes match this texture preference`);
    }
    if (mergedUserContext.spiceLevel.length > 0) {
      sections.push(`**Spice level:** ${mergedUserContext.spiceLevel.join(', ')}
- Adjust spiciness accordingly`);
    }
    if (mergedUserContext.portions.length > 0) {
      sections.push(`**Portions:** ${mergedUserContext.portions.join(', ')}
- Size recipes appropriately`);
    }

    // COOKING CONTEXT
    if (mergedUserContext.equipment.length > 0) {
      sections.push(`**Equipment available:** ${mergedUserContext.equipment.join(', ')}
- Only suggest recipes compatible with this equipment`);
    }
    if (mergedUserContext.skillLevel.length > 0) {
      sections.push(`**Cooking skill level:** ${mergedUserContext.skillLevel.join(', ')}
- Match recipe complexity to skill level`);
    }
    if (mergedUserContext.kitchen.length > 0) {
      sections.push(`**Kitchen constraints:** ${mergedUserContext.kitchen.join(', ')}
- Ensure recipes work in this environment`);
    }

    // CULTURAL
    if (mergedUserContext.cuisine.length > 0) {
      sections.push(`**Cuisine style:** ${mergedUserContext.cuisine.join(', ')}
- Draw from this culinary tradition`);
    }
    if (mergedUserContext.regional.length > 0) {
      sections.push(`**Regional style:** ${mergedUserContext.regional.join(', ')}
- Incorporate regional flavors and ingredients`);
    }

    // TIME & OCCASION
    if (mergedUserContext.occasion.length > 0) {
      sections.push(`**Occasion:** ${mergedUserContext.occasion.join(', ')}
- Content should fit this context
- Reference the occasion in headlines and descriptions`);
    }
    if (mergedUserContext.season.length > 0) {
      sections.push(`**Season:** ${mergedUserContext.season.join(', ')}
- Use seasonal ingredients and themes
- Match the mood (warming for cold weather, refreshing for summer)`);
    }

    // LIFESTYLE & FITNESS
    if (mergedUserContext.lifestyle.length > 0) {
      sections.push(`**Lifestyle:** ${mergedUserContext.lifestyle.join(', ')}
- Address specific lifestyle needs`);
    }
    if (mergedUserContext.fitnessContext.length > 0) {
      sections.push(`**Fitness context:** ${mergedUserContext.fitnessContext.join(', ')}
- Optimize for this fitness context (pre-workout = quick energy, post-workout = protein + recovery)`);
    }

    // PRACTICAL CONSTRAINTS
    if (mergedUserContext.constraints.length > 0) {
      sections.push(`**Constraints:** ${mergedUserContext.constraints.join(', ')}
- Honor these constraints (e.g., "quick" = under 10-15 min)`);
    }
    if (mergedUserContext.budget.length > 0) {
      sections.push(`**Budget:** ${mergedUserContext.budget.join(', ')}
- Use ingredients appropriate for this budget`);
    }
    if (mergedUserContext.shopping.length > 0) {
      sections.push(`**Shopping context:** ${mergedUserContext.shopping.join(', ')}
- Consider where user shops when suggesting ingredients`);
    }
    if (mergedUserContext.storage.length > 0) {
      sections.push(`**Storage needs:** ${mergedUserContext.storage.join(', ')}
- Ensure recipes meet these storage requirements`);
    }

    // INGREDIENTS ON HAND
    if (mergedUserContext.available.length > 0) {
      sections.push(`**Ingredients available:** ${mergedUserContext.available.join(', ')}
- Prioritize recipes using these ingredients`);
    }
    if (mergedUserContext.mustUse.length > 0) {
      sections.push(`**Must use up:** ${mergedUserContext.mustUse.join(', ')}
- PRIORITIZE recipes that use these ingredients (they're about to expire or leftover)`);
    }

    userContextSection = `
## User Context (PERSONALIZE ALL CONTENT)

${sections.join('\n\n')}

**PERSONALIZATION RULE:** Weave this user context throughout the ENTIRE page - headlines, descriptions, tips, and recommendations. Don't just acknowledge it once.
`;
  }

  return `
## User Query
"${query}"
${sessionSection}${userContextSection}
## Intent Classification
- Type: ${intent.intentType}
- Confidence: ${(intent.confidence * 100).toFixed(0)}%
- Layout: ${intent.layoutId}
- Content focus: ${intent.contentTypes.join(', ')}
- Products mentioned: ${intent.entities.products.join(', ') || 'none'}
- Ingredients mentioned: ${intent.entities.ingredients.join(', ') || 'none'}
- User goals: ${intent.entities.goals.join(', ') || 'general exploration'}
${hasUserContext ? `- Dietary: ${mergedUserContext.dietaryAvoid.length ? `AVOID ${mergedUserContext.dietaryAvoid.join(', ')}` : 'none'} | ${mergedUserContext.dietaryPrefs.join(', ') || 'no preferences'}${mergedUserContext.religious.length ? ` | Religious: ${mergedUserContext.religious.join(', ')}` : ''}
- Health: ${mergedUserContext.healthConditions.join(', ') || 'none'} | Goals: ${mergedUserContext.healthGoals.join(', ') || 'none'} | Requirements: ${mergedUserContext.healthConsiderations.join(', ') || 'none'}
- Audience: ${mergedUserContext.audience.join(', ') || 'general'}${mergedUserContext.portions.length ? ` | Portions: ${mergedUserContext.portions.join(', ')}` : ''}
- Household: ${[...mergedUserContext.texture, ...mergedUserContext.spiceLevel, ...mergedUserContext.pickyEaters].join(', ') || 'no preferences'}
- Cooking: Equipment: ${mergedUserContext.equipment.join(', ') || 'any'} | Skill: ${mergedUserContext.skillLevel.join(', ') || 'any'} | Kitchen: ${mergedUserContext.kitchen.join(', ') || 'standard'}
- Cultural: ${[...mergedUserContext.cuisine, ...mergedUserContext.regional].join(', ') || 'no preference'}
- Occasion: ${mergedUserContext.occasion.join(', ') || 'any'} | Season: ${mergedUserContext.season.join(', ') || 'any'}
- Lifestyle: ${[...mergedUserContext.lifestyle, ...mergedUserContext.fitnessContext].join(', ') || 'general'}
- Constraints: ${mergedUserContext.constraints.join(', ') || 'none'} | Budget: ${mergedUserContext.budget.join(', ') || 'any'} | Storage: ${mergedUserContext.storage.join(', ') || 'any'}
- Ingredients: Available: ${mergedUserContext.available.join(', ') || 'not specified'} | Must use: ${mergedUserContext.mustUse.join(', ') || 'none'}` : ''}

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
