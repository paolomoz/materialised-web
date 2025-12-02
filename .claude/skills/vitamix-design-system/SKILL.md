---
name: Vitamix Design System
description: Design specifications and patterns for Vitamix.com block generation. Use when styling blocks, creating CSS, or making design decisions for the Vitamix generative website. Contains brand colors, typography, spacing, and component patterns.
---

# Vitamix Design System

Design specifications and patterns for Vitamix.com block generation.

## Brand Colors

```css
:root {
  /* Primary */
  --color-brand-red: #C41230;
  --color-brand-red-dark: #a30f28;
  --color-brand-dark: #1A1A1A;

  /* Neutrals */
  --color-charcoal: #333333;
  --color-dark-gray: #666666;
  --color-medium-gray: #999999;
  --color-light-gray: #E5E5E5;
  --color-off-white: #F5F5F5;
  --color-white: #FFFFFF;

  /* Accent */
  --color-star-gold: #FFD700;
}
```

### Color Usage:
- **Brand Red (#C41230)**: CTAs, links, accents, eyebrows
- **Brand Dark (#1A1A1A)**: Headlines, primary text
- **Charcoal (#333)**: Body text, secondary headlines
- **Dark Gray (#666)**: Meta text, descriptions
- **Light Gray (#E5E5E5)**: Borders, dividers
- **Off-white (#F5F5F5)**: Highlight sections, card backgrounds

## Typography

```css
:root {
  --font-family-primary: 'proxima-nova', 'Helvetica Neue', Helvetica, Arial, sans-serif;

  /* Sizes */
  --font-size-hero: 4.5rem;    /* 72px - Hero headlines */
  --font-size-5xl: 3rem;       /* 48px - Page titles */
  --font-size-4xl: 2.25rem;    /* 36px - Section headers */
  --font-size-3xl: 1.875rem;   /* 30px - Card titles */
  --font-size-2xl: 1.5rem;     /* 24px - Subheadings */
  --font-size-xl: 1.25rem;     /* 20px - Large body */
  --font-size-lg: 1.125rem;    /* 18px - Body emphasis */
  --font-size-base: 1rem;      /* 16px - Body text */
  --font-size-sm: 0.875rem;    /* 14px - Small text, buttons */
  --font-size-xs: 0.75rem;     /* 12px - Eyebrows, labels */

  /* Weights - MAXIMUM 500 */
  --font-weight-light: 300;    /* Hero headlines */
  --font-weight-normal: 400;   /* Body text */
  --font-weight-medium: 500;   /* Emphasis, buttons, headings */
  --font-weight-semibold: 500; /* Same as medium - no heavier weights */
  --font-weight-bold: 500;     /* Same as medium - no heavier weights */
}
```

**IMPORTANT: Maximum font-weight is 500. Never use 600, 700, or bold.**

### Typography Patterns:

**Eyebrow Text:**
```css
.eyebrow {
  font-size: 0.75rem;
  font-weight: 500;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--color-brand-red);
}
```

**Hero Headlines:**
```css
.hero h1 {
  font-size: 4.5rem;
  font-weight: 300;
  letter-spacing: -0.025em;
  line-height: 1.1;
}
```

**Section Headlines:**
```css
h2 {
  font-size: 2.25rem;
  font-weight: 300;
  color: var(--color-brand-dark);
}
```

**Button Text:**
```css
.button {
  font-size: 0.875rem;
  font-weight: 500;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
```

## Spacing

```css
:root {
  --spacing-xs: 0.25rem;   /* 4px */
  --spacing-sm: 0.5rem;    /* 8px */
  --spacing-md: 1rem;      /* 16px */
  --spacing-lg: 1.5rem;    /* 24px */
  --spacing-xl: 2rem;      /* 32px */
  --spacing-2xl: 3rem;     /* 48px */

  /* Section spacing */
  --spacing-section-sm: 3rem;   /* 48px */
  --spacing-section-md: 5rem;   /* 80px */
  --spacing-section-lg: 8rem;   /* 128px */
}
```

## Buttons

### Primary Button (Red)
```css
.button.primary {
  background-color: var(--color-brand-red);
  color: var(--color-white);
  border: none;
  padding: 0.75rem 2rem;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-radius: 0;  /* Vitamix uses square corners */
}

.button.primary:hover {
  background-color: var(--color-brand-red-dark);
}
```

### Secondary Button (Outlined)
```css
.button.secondary {
  background-color: transparent;
  border: 1px solid var(--color-brand-dark);
  color: var(--color-brand-dark);
}

.button.secondary:hover {
  background-color: var(--color-brand-dark);
  color: var(--color-white);
}
```

### Ghost Button (Text link style)
```css
.button.ghost {
  background: transparent;
  color: var(--color-brand-red);
  text-decoration: underline;
  padding: 0.5rem 0;
}
```

## Cards

### Product Card
```css
.product-card {
  background: var(--color-white);
  text-align: center;
  transition: box-shadow 0.2s ease;
}

.product-card:hover {
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
}

.product-card-image {
  background: var(--color-off-white);
  padding: var(--spacing-lg);
}

.product-card-body {
  padding: var(--spacing-lg);
}
```

### Recipe Card
```css
.recipe-card {
  border-radius: 8px;
  overflow: hidden;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.recipe-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}

.recipe-card-image img {
  aspect-ratio: 4/3;
  object-fit: cover;
}
```

## Section Styles

### Default Section
```css
.section-default {
  background: var(--color-white);
  padding: var(--spacing-section-md) 0;
}
```

### Highlight Section
```css
.section-highlight {
  background: var(--color-off-white);
  padding: var(--spacing-section-md) 0;
}
```

### Dark Section
```css
.section-dark {
  background: var(--color-brand-dark);
  color: var(--color-white);
  padding: var(--spacing-section-md) 0;
}

.section-dark h2,
.section-dark p {
  color: var(--color-white);
}
```

## Hero Variants

### Full-Width Hero (Dark Overlay)
```css
.hero.full-width {
  position: relative;
  min-height: 80vh;
  display: flex;
  align-items: center;
}

.hero.full-width::before {
  content: '';
  position: absolute;
  inset: 0;
  background: rgba(26, 26, 26, 0.7);
}

.hero.full-width .hero-content {
  position: relative;
  z-index: 2;
  color: var(--color-white);
  max-width: 600px;
}
```

### Light Hero (No Image)
```css
.hero.light {
  background: var(--color-white);
  padding: var(--spacing-section-md) var(--spacing-lg);
}

.hero.light h1 {
  color: var(--color-brand-dark);
}
```

### Split Hero (50/50)
```css
.hero.split {
  display: grid;
  grid-template-columns: 1fr 1fr;
  min-height: 600px;
}
```

## Icons

Vitamix uses simple line icons. Use inline SVGs with:
```css
svg {
  width: 24px;
  height: 24px;
  stroke: currentColor;
  stroke-width: 2;
  fill: none;
}
```

Common icons needed:
- Clock (time/duration)
- Lightning bolt (difficulty)
- Heart (favorites)
- Search
- Close (X)
- Chevron (accordion expand)
- Check (success)
- Warning (alerts)

## Shadows

```css
:root {
  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.08);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.1);
  --shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.12);
  --shadow-xl: 0 12px 32px rgba(0, 0, 0, 0.15);
}
```

## Transitions

```css
:root {
  --transition-fast: 0.15s ease;
  --transition-normal: 0.2s ease;
  --transition-slow: 0.3s ease;
}
```

Standard hover transitions:
- Buttons: background-color
- Cards: transform, box-shadow
- Links: color
- Images: transform (scale)

## Layout Constraints

```css
:root {
  --max-width-content: 1200px;
  --max-width-wide: 1400px;
  --nav-height: 64px;
}
```

## Responsive Breakpoints

```css
/* Mobile first approach */
@media (width >= 600px) {  /* Tablet */
}

@media (width >= 768px) {  /* Tablet landscape */
}

@media (width >= 900px) {  /* Desktop */
}

@media (width >= 1200px) { /* Large desktop */
}
```

## File Locations

- Global styles: `styles/styles.css`
- Block styles: `blocks/block-name/block-name.css`

## Related Skills

- **gen-layout-definition** - How to define layouts
- **gen-block-implementation** - How to build blocks
