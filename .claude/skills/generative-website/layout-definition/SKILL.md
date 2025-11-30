# Skill: Layout Definition

Guidelines for defining page layouts that map user intent to structured page experiences.

## What is a Layout?

A layout is a predefined page structure that:
1. Maps to specific user intents (queries/needs)
2. Defines the exact sequence of blocks
3. Specifies section styles and block variants
4. Ensures consistent, on-point page generation

## Layout Structure

Each layout is defined in `workers/generative/src/prompts/layouts.ts` as a `LayoutTemplate`:

```typescript
export const LAYOUT_NAME: LayoutTemplate = {
  id: 'layout-id',           // Unique identifier (kebab-case)
  name: 'Layout Display Name',
  description: 'What this layout is for',
  useCases: [                // Example queries that trigger this layout
    'User query example 1',
    'User query example 2',
  ],
  sections: [
    {
      // Section 1
      style: 'default',      // Optional: 'default' | 'highlight' | 'dark'
      blocks: [
        { type: 'block-name', variant: 'variant-name', config: { ... } },
      ],
    },
    {
      // Section 2
      style: 'highlight',
      blocks: [
        { type: 'another-block', config: { itemCount: 3 } },
      ],
    },
  ],
};
```

## Design Principles

### 1. Intent-First Design
- Start with the user's goal, not the blocks
- Ask: "What does the user need to accomplish?"
- Design the flow to guide them to success

### 2. Progressive Disclosure
- Most important content first (hero)
- Supporting content in middle sections
- Call-to-action at the end

### 3. Visual Rhythm
- Alternate section styles for visual interest
- Use `highlight` for emphasis, `dark` for contrast
- Group related blocks in the same section

### 4. Block Specialization
- Prefer specialized blocks over generic ones
- `recipe-cards` > `cards` for recipes
- `support-hero` > `hero` for troubleshooting
- Specialized blocks = better UX + better AI content

## Layout Categories

### Transactional Layouts
Goal: Help user make a purchase decision
- Product Detail
- Product Comparison
- Category Browse

### Informational Layouts
Goal: Help user learn or solve a problem
- Support/Troubleshooting
- Educational/How-To
- Quick Answer

### Inspirational Layouts
Goal: Engage user with content
- Recipe Collection
- Lifestyle/Inspiration
- Use Case Landing

### Promotional Layouts
Goal: Drive specific actions
- Promotional
- Campaign Landing

## Creating a New Layout

1. **Identify the Intent**
   - What queries will trigger this layout?
   - What is the user's end goal?

2. **Map the Journey**
   - What do they need to see first?
   - What information builds confidence?
   - What action should they take?

3. **Select Blocks**
   - Choose specialized blocks when available
   - Define variants for each block
   - Set configuration (itemCount, hasImage, etc.)

4. **Define Sections**
   - Group related blocks
   - Apply appropriate section styles
   - Ensure visual flow

5. **Document Use Cases**
   - Add example queries
   - Test with real prompts
   - Refine based on generated content

## Section Styles

| Style | Use For | Visual |
|-------|---------|--------|
| `default` | Standard content | White background |
| `highlight` | Emphasis, CTAs | Light gray/off-white background |
| `dark` | Contrast, premium feel | Dark background, white text |

## Block Configuration

Common config options:
- `hasImage: boolean` - Whether block includes images
- `itemCount: number` - Number of items (cards, steps, etc.)
- `variant: string` - Block variant name

## File Location

Layout templates: `workers/generative/src/prompts/layouts.ts`

## Related Skills

- **block-implementation.md** - How to build blocks
- **vitamix-design-system.md** - Vitamix-specific styling
