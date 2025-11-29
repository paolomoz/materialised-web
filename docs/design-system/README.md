# Vitamix Design System Reference

This folder contains extracted design patterns from vitamix.com to ensure new blocks maintain visual consistency.

## Structure

```
design-system/
├── screenshots/
│   ├── heroes/          # Hero banner patterns
│   ├── cards/           # Product, recipe, feature cards
│   ├── tables/          # Specs tables, comparison grids
│   ├── navigation/      # Tabs, filters, accordions, carousels
│   ├── forms/           # Inputs, buttons, selects
│   ├── typography/      # Headings, body text, labels
│   ├── colors/          # Color usage in context
│   └── layouts/         # Full page layouts
├── block-specs/         # Specification for each new block
├── tokens.json          # Extracted design tokens
└── patterns.md          # Documented design patterns
```

## Usage

When implementing a new block:
1. Check `block-specs/` for the block specification
2. Reference `screenshots/` for visual patterns
3. Use `tokens.json` for colors, spacing, typography
4. Follow `patterns.md` for spacing rules and conventions
