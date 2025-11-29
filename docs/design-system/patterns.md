# Vitamix Design System Patterns

Reference documentation for implementing Vitamix-aligned EDS blocks based on 49 screenshots captured from vitamix.com.

## Table of Contents
1. [Heroes](#heroes)
2. [Navigation](#navigation)
3. [Product Cards](#product-cards)
4. [Recipe Cards](#recipe-cards)
5. [Feature Sections](#feature-sections)
6. [Forms & CTAs](#forms--ctas)
7. [Content Layouts](#content-layouts)
8. [Reviews & Ratings](#reviews--ratings)
9. [Accordions & FAQs](#accordions--faqs)

---

## Heroes

### Full-Width Hero with Overlay Text
**Screenshots:** `homepage-hero.png`, `learn-page-hero-nav.png`, `commercial-page-hero.png`

**Pattern:**
- Full-bleed background image
- Semi-transparent dark overlay (rgba(26, 26, 26, 0.7))
- Centered or left-aligned text content
- Eyebrow text (uppercase, letter-spacing: 0.15em, brand-red)
- Large headline (hero font size: 4.5rem, font-weight: 300)
- Supporting paragraph (1rem-1.125rem, medium-gray or white)
- Primary CTA button

**Variants:**
- **Light theme:** White background, dark text (shop-hero, recipes-hero)
- **Dark theme:** Dark overlay on image, white text (commercial, why-vitamix)
- **Split layout:** 50/50 image and text columns

### Hero with Sticky Anchor Navigation
**Screenshot:** `learn-page-hero-nav.png`

**Pattern:**
- Hero section followed by horizontal nav bar
- Nav items: text links with uppercase styling
- Sticky behavior on scroll
- Links anchor to page sections

---

## Navigation

### Mega Menu
**Screenshot:** `mega-menu-navigation.png`

**Pattern:**
- 3-column layout within dropdown
- Column headers: bold, uppercase
- Thumbnail images with product names
- Grouped by category (Blenders, Containers, Kitchen Systems)
- White background, subtle shadow

### Sidebar Navigation
**Screenshot:** `about-us-sidebar-layout.png`

**Pattern:**
- Left sidebar with nested links
- Current page highlighted
- Expandable/collapsible sections
- Main content area on right (70-75% width)

---

## Product Cards

### Standard Product Card
**Screenshots:** `product-grid-cards.png`, `accessories-product-grid.png`, `sale-page-product-grid.png`

**Pattern:**
- Vertical layout
- Product image (square, white background)
- Color swatch indicators (small circles)
- Product name (font-weight: 600)
- Star rating (gold/yellow stars)
- Price display

**Price Variants:**
- **Regular:** Single price
- **Sale:** "Now $X" in bold, "Save $X | Was $X" strikethrough

**Actions:**
- "Add to Cart" button (brand-red background)
- "Compare" checkbox/button

### Product Category Card
**Screenshots:** `learn-page-shop-categories.png`, `commercial-page-hero.png`

**Pattern:**
- Vertical card with image above text
- Category image (product grouping)
- Category name (uppercase, centered)
- Subtle border or shadow
- Hover state: slight lift/shadow increase

---

## Recipe Cards

### Recipe Card with Metadata
**Screenshots:** `recipes-hero.png`, `learn-page-feature-icons.png`

**Pattern:**
- Food image (square or 4:3 ratio)
- Recipe title (font-weight: 600)
- Metadata row with icons:
  - Difficulty icon + label (Simple/Intermediate)
  - Clock icon + time (e.g., "10 Minutes")
- Hover: subtle scale and shadow

### Recipe Carousel
**Screenshot:** `recipe-carousel-slider.png`

**Pattern:**
- Horizontal scrolling container
- Previous/Next arrow buttons
- 3-4 visible cards at desktop
- Card format: image + title

---

## Feature Sections

### Split Image/Text Section
**Screenshots:** `learn-page-social-gallery.png`, `blender-recommender-content.png`

**Pattern:**
- 50/50 or 60/40 split
- Image on one side (full height)
- Text content on other side with padding
- Eyebrow text (red, uppercase)
- Headline (2xl-3xl)
- Body paragraph
- CTA button or link

### Feature Icons Grid
**Screenshot:** `support-page-icon-grid.png`

**Pattern:**
- 2-3 column grid
- Icon (line style, blue/gray)
- Feature title (bold, link style)
- Short description
- Clickable entire card

### Tabbed Feature Section
**Screenshots:** `learn-page-precision-section.png`, `learn-page-feature-icons.png`

**Pattern:**
- Dark background section
- Large background image with overlay
- Vertical text tabs on right (Chopping, Grinding, Pureeing, etc.)
- Active tab shows corresponding content
- CTA button at bottom

---

## Forms & CTAs

### Newsletter Signup
**Screenshot:** `footer-newsletter.png`, `contact-form-page.png`

**Pattern:**
- Headline: "Sign up & get $25 off + free shipping*"
- Email input field
- Optional mobile input
- SMS opt-in checkbox
- Legal text (small, gray)
- Submit button (brand-red)

### Contact Form
**Screenshot:** `contact-form-page.png`

**Pattern:**
- Two-column layout
- Left: Contact info (phone, email, social)
- Right: Form with fields
- Required field indicators (*)
- Dropdown for "Reason for Contact"
- Radio buttons for request type

### CTA Banner
**Screenshots:** `commercial-page-cta-links.png`, `blender-recommender-cta.png`

**Pattern:**
- Dark or colored background
- Centered text
- Multiple CTA buttons in row
- Underlined link style or button style

---

## Content Layouts

### Article Cards
**Screenshot:** `learn-page-ugc-gallery.png`

**Pattern:**
- Large image (16:9 or 4:3)
- Category label (red, uppercase)
- Article title (bold)
- Short excerpt
- "Learn More" link

### Social Media Gallery (UGC)
**Screenshots:** `learn-page-precision-section.png`

**Pattern:**
- "Get Inspired" header with hashtag
- Grid of user-submitted images
- Instagram-style square thumbnails
- Play button overlay for videos
- "Add Your Photo" / "Follow on Instagram" CTAs
- Powered by Emplifi attribution

### 404 / Error Page
**Screenshot:** `404-page-with-recommendations.png`

**Pattern:**
- Friendly headline: "We're sorry that page is missing"
- Search bar
- Product recommendations grid
- "Products for your Home" / "Products for your Business" sections

---

## Reviews & Ratings

### Rating Snapshot
**Screenshot:** `pdp-reviews-rating-snapshot.png`

**Pattern:**
- Large average score (e.g., "4.8")
- Star display
- "X Reviews" count
- Rating distribution bars (5-star to 1-star)
- Percentage or count per rating level

### Review Card
**Screenshot:** `pdp-review-cards.png`

**Pattern:**
- Star rating at top
- Review title (bold)
- Review date
- Review body text
- "Helpful?" Yes/No buttons with counts
- Verified purchase badge

---

## Accordions & FAQs

### FAQ Accordion
**Screenshots:** `faq-accordion-page.png`, `faq-accordion-expanded.png`

**Pattern:**
- Question as clickable header
- Plus/minus or chevron icon
- Expanded state shows answer
- Subtle border between items
- Smooth open/close animation

---

## Specification Tables

### Product Specs Table
**Screenshot:** `pdp-specifications-table.png`

**Pattern:**
- Tab navigation (Overview, Specifications, etc.)
- Two-column table layout
- Spec name on left (gray)
- Spec value on right (bold)
- Zebra striping optional
- Collapsible sections

---

## Color Usage Summary

| Context | Color | Token |
|---------|-------|-------|
| Primary CTA | #C41230 | brand-red |
| Headlines | #1A1A1A | brand-dark |
| Body text | #333333 | charcoal |
| Secondary text | #666666 | dark-gray |
| Backgrounds | #FFFFFF, #F5F5F5 | white, off-white |
| Footer | #333333 | footer |
| Links | #C41230 | brand-red |
| Stars | #FFD700 (gold) | -- |
| Sale price | #C41230 | brand-red |

---

## Typography Summary

| Element | Size | Weight | Tracking |
|---------|------|--------|----------|
| Hero headline | 4.5rem | 300 | -0.025em |
| Section headline | 2.25rem-3rem | 300-400 | normal |
| Card title | 1.125rem | 600 | normal |
| Body | 1rem | 400 | normal |
| Eyebrow | 0.75rem | 600 | 0.15em |
| Button | 0.875rem | 600 | 0.05em |
| Small/Legal | 0.75rem | 400 | normal |

---

## Button Styles

### Primary Button
- Background: brand-red (#C41230)
- Text: white
- Padding: 0.75rem 2rem
- Font: 600 weight, uppercase
- Border-radius: 0 (square corners)
- Hover: darken 10%

### Secondary Button
- Background: transparent
- Border: 1px solid brand-dark
- Text: brand-dark
- Padding: 0.75rem 2rem
- Hover: background fills with brand-dark, text white

### Ghost/Link Button
- Background: transparent
- Text: brand-red with underline
- Hover: underline thickens

---

## Responsive Breakpoints

| Breakpoint | Width | Columns |
|------------|-------|---------|
| Mobile | < 640px | 1 |
| Tablet | 640-1024px | 2 |
| Desktop | 1024-1280px | 3-4 |
| Large | > 1280px | 4-6 |
