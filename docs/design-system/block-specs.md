# Vitamix Block Specifications

Detailed specifications for implementing Vitamix-aligned EDS blocks. Each block includes content model (authoring structure), HTML output, CSS styling, and JavaScript decoration.

## Reference Files
- Design tokens: `/docs/design-system/tokens.json`
- Pattern documentation: `/docs/design-system/patterns.md`
- Screenshots: `/docs/design-system/screenshots/`

---

## Existing Blocks (Enhancements Needed)

### Hero Block Variants
**Current:** Basic hero with image and content
**Needed:** Full-width dark overlay, light theme, split layout variants

#### Variant: hero (full-width, dark)
```
| Hero (full-width)           |
|-----------------------------|
| [background-image.jpg]      |
| EYEBROW TEXT                |
| # Main Headline             |
| Supporting paragraph text   |
| [[CTA Button Text]]         |
```

**CSS Additions:**
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
  z-index: 1;
}

.hero.full-width .hero-image {
  position: absolute;
  inset: 0;
}

.hero.full-width .hero-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.hero.full-width .hero-content {
  position: relative;
  z-index: 2;
  color: #fff;
  max-width: 600px;
  padding: 0 5%;
}

.hero.full-width .hero-content p:first-child {
  /* Eyebrow */
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: #C41230;
  margin-bottom: 1rem;
}

.hero.full-width .hero-content h1 {
  font-size: 4.5rem;
  font-weight: 300;
  letter-spacing: -0.025em;
  margin-bottom: 1.5rem;
}
```

#### Variant: hero (light)
For shop pages, recipe pages with light backgrounds.

```css
.hero.light {
  background: #fff;
}

.hero.light .hero-content {
  color: #1A1A1A;
}

.hero.light .hero-content h1 {
  color: #1A1A1A;
}
```

#### Variant: hero (split)
50/50 image and text layout.

```css
.hero.split {
  display: grid;
  grid-template-columns: 1fr 1fr;
  min-height: 600px;
}

.hero.split .hero-image {
  order: 2;
}

.hero.split .hero-content {
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 4rem;
}

@media (max-width: 768px) {
  .hero.split {
    grid-template-columns: 1fr;
  }

  .hero.split .hero-image {
    order: 0;
    min-height: 300px;
  }
}
```

---

### Cards Block Variants
**Current:** Generic cards with image and body
**Needed:** Product cards, recipe cards, article cards, category cards

---

## New Blocks Required

### 1. Product Cards Block
**Purpose:** Display product listings with pricing, ratings, and actions

#### Content Model (DA Table)
```
| Product Cards               |                    |                    |
|-----------------------------|--------------------|--------------------|
| [product-image.jpg]         | [product-image.jpg]| [product-image.jpg]|
| **Vitamix A3500**           | **Ascent A2300**   | **E310**           |
| ★★★★★ (1,234)               | ★★★★☆ (892)        | ★★★★★ (2,341)      |
| $649.95                     | $449.95            | $349.95            |
| [[Add to Cart]]             | [[Add to Cart]]    | [[Add to Cart]]    |
```

#### HTML Output (after decoration)
```html
<div class="product-cards">
  <ul>
    <li class="product-card">
      <div class="product-card-image">
        <picture>...</picture>
        <div class="color-swatches">
          <button class="swatch active" style="background:#333"></button>
          <button class="swatch" style="background:#C41230"></button>
        </div>
      </div>
      <div class="product-card-body">
        <h3 class="product-name">Vitamix A3500</h3>
        <div class="product-rating">
          <span class="stars" aria-label="5 out of 5 stars">★★★★★</span>
          <span class="review-count">(1,234)</span>
        </div>
        <div class="product-price">
          <span class="current-price">$649.95</span>
        </div>
        <button class="product-cta">Add to Cart</button>
      </div>
    </li>
  </ul>
</div>
```

#### CSS
```css
.product-cards {
  padding: var(--spacing-section-md) var(--spacing-lg);
  max-width: 1400px;
  margin: 0 auto;
}

.product-cards > ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--spacing-xl);
}

.product-card {
  background: #fff;
  text-align: center;
  transition: box-shadow 0.2s ease;
}

.product-card:hover {
  box-shadow: 0 4px 20px rgba(0,0,0,0.1);
}

.product-card-image {
  position: relative;
  background: #f5f5f5;
  padding: var(--spacing-lg);
}

.product-card-image img {
  width: 100%;
  aspect-ratio: 1;
  object-fit: contain;
}

.color-swatches {
  display: flex;
  justify-content: center;
  gap: var(--spacing-xs);
  margin-top: var(--spacing-sm);
}

.swatch {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
}

.swatch.active {
  border-color: #1A1A1A;
}

.product-card-body {
  padding: var(--spacing-lg);
}

.product-name {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--color-brand-dark);
  margin-bottom: var(--spacing-sm);
}

.product-rating {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-xs);
  margin-bottom: var(--spacing-sm);
}

.stars {
  color: #FFD700;
  font-size: 0.875rem;
}

.review-count {
  color: var(--color-dark-gray);
  font-size: 0.875rem;
}

.product-price {
  margin-bottom: var(--spacing-md);
}

.current-price {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--color-brand-dark);
}

/* Sale variant */
.product-card.sale .original-price {
  text-decoration: line-through;
  color: var(--color-medium-gray);
  font-size: 0.875rem;
}

.product-card.sale .sale-price {
  color: var(--color-brand-red);
  font-weight: 700;
}

.product-card.sale .savings {
  font-size: 0.75rem;
  color: var(--color-brand-red);
}

.product-cta {
  background: var(--color-brand-red);
  color: #fff;
  border: none;
  padding: 0.75rem 2rem;
  font-size: 0.875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  cursor: pointer;
  transition: background 0.2s ease;
}

.product-cta:hover {
  background: #a30f28;
}
```

#### JavaScript Decoration
```javascript
export default function decorate(block) {
  const ul = document.createElement('ul');

  [...block.children].forEach((row) => {
    const li = document.createElement('li');
    li.className = 'product-card';

    const [imageCell, ...contentCells] = [...row.children];

    // Image
    const imageDiv = document.createElement('div');
    imageDiv.className = 'product-card-image';
    const pic = imageCell.querySelector('picture');
    if (pic) imageDiv.appendChild(pic);
    li.appendChild(imageDiv);

    // Body
    const bodyDiv = document.createElement('div');
    bodyDiv.className = 'product-card-body';

    contentCells.forEach((cell, i) => {
      const content = cell.textContent.trim();

      if (cell.querySelector('strong')) {
        // Product name
        const h3 = document.createElement('h3');
        h3.className = 'product-name';
        h3.textContent = cell.textContent.replace(/\*\*/g, '');
        bodyDiv.appendChild(h3);
      } else if (content.includes('★')) {
        // Rating
        const ratingDiv = document.createElement('div');
        ratingDiv.className = 'product-rating';
        const stars = content.match(/[★☆]+/)?.[0] || '';
        const count = content.match(/\([\d,]+\)/)?.[0] || '';
        ratingDiv.innerHTML = `
          <span class="stars">${stars}</span>
          <span class="review-count">${count}</span>
        `;
        bodyDiv.appendChild(ratingDiv);
      } else if (content.startsWith('$')) {
        // Price
        const priceDiv = document.createElement('div');
        priceDiv.className = 'product-price';
        priceDiv.innerHTML = `<span class="current-price">${content}</span>`;
        bodyDiv.appendChild(priceDiv);
      } else if (cell.querySelector('a')) {
        // CTA
        const link = cell.querySelector('a');
        const btn = document.createElement('button');
        btn.className = 'product-cta';
        btn.textContent = link.textContent;
        btn.onclick = () => window.location.href = link.href;
        bodyDiv.appendChild(btn);
      }
    });

    li.appendChild(bodyDiv);
    ul.appendChild(li);
  });

  block.textContent = '';
  block.appendChild(ul);
}
```

---

### 2. Recipe Cards Block
**Purpose:** Display recipes with metadata (time, difficulty)

#### Content Model
```
| Recipe Cards                |                    |                    |
|-----------------------------|--------------------|--------------------|
| [smoothie.jpg]              | [soup.jpg]         | [sauce.jpg]        |
| **Green Smoothie**          | **Tomato Soup**    | **Pesto Sauce**    |
| Simple • 5 min              | Easy • 20 min      | Simple • 10 min    |
```

#### HTML Output
```html
<div class="recipe-cards">
  <ul>
    <li class="recipe-card">
      <a href="/recipes/green-smoothie">
        <div class="recipe-card-image">
          <picture>...</picture>
        </div>
        <div class="recipe-card-body">
          <h3 class="recipe-title">Green Smoothie</h3>
          <div class="recipe-meta">
            <span class="difficulty">
              <svg>...</svg> Simple
            </span>
            <span class="time">
              <svg>...</svg> 5 min
            </span>
          </div>
        </div>
      </a>
    </li>
  </ul>
</div>
```

#### CSS
```css
.recipe-cards {
  padding: var(--spacing-section-md) var(--spacing-lg);
  max-width: 1400px;
  margin: 0 auto;
}

.recipe-cards > ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: var(--spacing-xl);
}

.recipe-card {
  border-radius: 8px;
  overflow: hidden;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.recipe-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(0,0,0,0.12);
}

.recipe-card a {
  text-decoration: none;
  color: inherit;
  display: block;
}

.recipe-card-image {
  position: relative;
  overflow: hidden;
}

.recipe-card-image img {
  width: 100%;
  aspect-ratio: 4/3;
  object-fit: cover;
  transition: transform 0.3s ease;
}

.recipe-card:hover .recipe-card-image img {
  transform: scale(1.05);
}

.recipe-card-body {
  padding: var(--spacing-lg);
  background: #fff;
}

.recipe-title {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--color-brand-dark);
  margin-bottom: var(--spacing-sm);
}

.recipe-meta {
  display: flex;
  gap: var(--spacing-lg);
  font-size: 0.875rem;
  color: var(--color-dark-gray);
}

.recipe-meta span {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
}

.recipe-meta svg {
  width: 16px;
  height: 16px;
}
```

---

### 3. Category Cards Block
**Purpose:** Display product/content categories with images

#### Content Model
```
| Category Cards              |                    |                    |                    |
|-----------------------------|--------------------|--------------------|--------------------|
| [blenders.jpg]              | [containers.jpg]   | [immersion.jpg]    | [processing.jpg]   |
| **Blenders**                | **Containers**     | **Immersion**      | **Food Processing**|
| /shop/blenders              | /shop/containers   | /shop/immersion    | /shop/processing   |
```

#### CSS
```css
.category-cards {
  padding: var(--spacing-section-md) var(--spacing-lg);
  max-width: 1400px;
  margin: 0 auto;
}

.category-cards > ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--spacing-lg);
}

.category-card {
  text-align: center;
  padding: var(--spacing-lg);
  border: 1px solid var(--color-light-gray);
  transition: all 0.2s ease;
  cursor: pointer;
}

.category-card:hover {
  border-color: var(--color-brand-dark);
  box-shadow: 0 4px 12px rgba(0,0,0,0.08);
}

.category-card-image img {
  width: 100%;
  max-width: 180px;
  aspect-ratio: 1;
  object-fit: contain;
  margin: 0 auto var(--spacing-md);
}

.category-card-title {
  font-size: 0.875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-brand-dark);
}
```

---

### 4. Split Content Block
**Purpose:** 50/50 or 60/40 image and text layouts

#### Content Model
```
| Split Content (reverse)     |                              |
|-----------------------------|------------------------------|
| [feature-image.jpg]         | EYEBROW TEXT                 |
|                             | ## Section Headline          |
|                             | Body text paragraph here.    |
|                             | [[Learn More]]               |
```

Variants:
- `reverse` - image on right
- `dark` - dark background with white text
- `60-40` - 60% image, 40% content

#### CSS
```css
.split-content {
  display: grid;
  grid-template-columns: 1fr 1fr;
  min-height: 500px;
}

.split-content > div:first-child {
  display: contents;
}

.split-content-image {
  position: relative;
  overflow: hidden;
}

.split-content-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.split-content-body {
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: var(--spacing-section-sm) var(--spacing-section-sm);
}

.split-content-body p:first-child {
  /* Eyebrow */
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--color-brand-red);
  margin-bottom: var(--spacing-md);
}

.split-content-body h2 {
  font-size: 2.25rem;
  font-weight: 300;
  color: var(--color-brand-dark);
  margin-bottom: var(--spacing-lg);
}

.split-content-body p {
  font-size: 1rem;
  line-height: 1.7;
  color: var(--color-charcoal);
  margin-bottom: var(--spacing-lg);
}

.split-content-body a.button {
  align-self: flex-start;
}

/* Reverse variant */
.split-content.reverse .split-content-image {
  order: 2;
}

/* Dark variant */
.split-content.dark {
  background: var(--color-brand-dark);
}

.split-content.dark .split-content-body {
  color: #fff;
}

.split-content.dark .split-content-body h2,
.split-content.dark .split-content-body p {
  color: #fff;
}

/* 60-40 variant */
.split-content.ratio-60-40 {
  grid-template-columns: 60% 40%;
}

@media (max-width: 768px) {
  .split-content {
    grid-template-columns: 1fr;
  }

  .split-content-image {
    min-height: 300px;
  }

  .split-content.reverse .split-content-image {
    order: 0;
  }
}
```

---

### 5. Feature Grid Block
**Purpose:** Icon-based feature highlights

#### Content Model
```
| Feature Grid                |                    |                    |
|-----------------------------|--------------------|--------------------|
| :icon-phone:                | :icon-email:       | :icon-chat:        |
| **Phone Support**           | **Email Us**       | **Live Chat**      |
| Call 1-800-VITAMIX          | support@vitamix    | Available 24/7     |
| [[Contact]]                 | [[Send Email]]     | [[Start Chat]]     |
```

#### CSS
```css
.feature-grid {
  padding: var(--spacing-section-md) var(--spacing-lg);
  max-width: 1200px;
  margin: 0 auto;
}

.feature-grid > div {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: var(--spacing-xl);
}

.feature-item {
  text-align: center;
  padding: var(--spacing-xl);
}

.feature-icon {
  width: 48px;
  height: 48px;
  margin: 0 auto var(--spacing-lg);
  color: var(--color-brand-red);
}

.feature-item h3 {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--color-brand-dark);
  margin-bottom: var(--spacing-sm);
}

.feature-item p {
  font-size: 0.9375rem;
  color: var(--color-dark-gray);
  line-height: 1.6;
  margin-bottom: var(--spacing-md);
}

.feature-item a {
  color: var(--color-brand-red);
  font-weight: 600;
  text-decoration: none;
}

.feature-item a:hover {
  text-decoration: underline;
}

/* Clickable card variant */
.feature-grid.clickable .feature-item {
  border: 1px solid var(--color-light-gray);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.feature-grid.clickable .feature-item:hover {
  border-color: var(--color-brand-red);
  box-shadow: 0 4px 16px rgba(0,0,0,0.08);
}
```

---

### 6. Tabbed Content Block
**Purpose:** Vertical or horizontal tabs for feature sections

#### Content Model
```
| Tabbed Content              |                              |
|-----------------------------|------------------------------|
| ## Tab 1 Title              | Tab 1 content here with      |
|                             | description and details.     |
|-----------------------------|------------------------------|
| ## Tab 2 Title              | Tab 2 content here.          |
|-----------------------------|------------------------------|
| ## Tab 3 Title              | Tab 3 content here.          |
```

#### CSS
```css
.tabbed-content {
  background: var(--color-brand-dark);
  min-height: 600px;
  display: grid;
  grid-template-columns: 1fr 300px;
}

.tabbed-content-main {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-section-sm);
}

.tabbed-content-panel {
  display: none;
  color: #fff;
  max-width: 500px;
}

.tabbed-content-panel.active {
  display: block;
}

.tabbed-content-panel h3 {
  font-size: 2.5rem;
  font-weight: 300;
  margin-bottom: var(--spacing-lg);
}

.tabbed-content-panel p {
  font-size: 1rem;
  line-height: 1.7;
  margin-bottom: var(--spacing-xl);
}

.tabbed-content-tabs {
  display: flex;
  flex-direction: column;
  justify-content: center;
  background: rgba(0,0,0,0.3);
  padding: var(--spacing-xl);
}

.tab-button {
  background: transparent;
  border: none;
  color: rgba(255,255,255,0.6);
  font-size: 1rem;
  padding: var(--spacing-md) var(--spacing-lg);
  text-align: left;
  cursor: pointer;
  border-left: 3px solid transparent;
  transition: all 0.2s ease;
}

.tab-button:hover {
  color: #fff;
}

.tab-button.active {
  color: #fff;
  border-left-color: var(--color-brand-red);
  background: rgba(255,255,255,0.1);
}

@media (max-width: 768px) {
  .tabbed-content {
    grid-template-columns: 1fr;
  }

  .tabbed-content-tabs {
    flex-direction: row;
    overflow-x: auto;
    order: -1;
  }

  .tab-button {
    border-left: none;
    border-bottom: 3px solid transparent;
    white-space: nowrap;
  }

  .tab-button.active {
    border-bottom-color: var(--color-brand-red);
  }
}
```

---

### 7. Newsletter Block
**Purpose:** Email signup with incentive

#### Content Model
```
| Newsletter                  |
|-----------------------------|
| ## Sign up & get $25 off    |
| Plus free shipping on your first order |
| email@placeholder.com       |
| [[Subscribe]]               |
| *Terms and conditions apply |
```

#### CSS
```css
.newsletter {
  background: var(--color-off-white);
  padding: var(--spacing-section-md) var(--spacing-lg);
  text-align: center;
}

.newsletter-inner {
  max-width: 500px;
  margin: 0 auto;
}

.newsletter h2 {
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--color-brand-dark);
  margin-bottom: var(--spacing-sm);
}

.newsletter p {
  color: var(--color-dark-gray);
  margin-bottom: var(--spacing-lg);
}

.newsletter-form {
  display: flex;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-md);
}

.newsletter-form input {
  flex: 1;
  padding: 0.875rem 1rem;
  border: 1px solid var(--color-light-gray);
  font-size: 1rem;
}

.newsletter-form input:focus {
  outline: none;
  border-color: var(--color-brand-dark);
}

.newsletter-form button {
  background: var(--color-brand-red);
  color: #fff;
  border: none;
  padding: 0.875rem 2rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  cursor: pointer;
}

.newsletter-form button:hover {
  background: #a30f28;
}

.newsletter-legal {
  font-size: 0.75rem;
  color: var(--color-medium-gray);
}

@media (max-width: 480px) {
  .newsletter-form {
    flex-direction: column;
  }
}
```

---

### 8. Rating Snapshot Block
**Purpose:** Display aggregate product ratings

#### Content Model
```
| Rating Snapshot             |
|-----------------------------|
| 4.8                         |
| ★★★★★                       |
| 1,234 Reviews               |
| 5 stars: 85%                |
| 4 stars: 10%                |
| 3 stars: 3%                 |
| 2 stars: 1%                 |
| 1 star: 1%                  |
```

#### CSS
```css
.rating-snapshot {
  padding: var(--spacing-xl);
  max-width: 400px;
}

.rating-main {
  display: flex;
  align-items: center;
  gap: var(--spacing-lg);
  margin-bottom: var(--spacing-xl);
}

.rating-score {
  font-size: 3.5rem;
  font-weight: 300;
  color: var(--color-brand-dark);
}

.rating-summary .stars {
  font-size: 1.25rem;
  color: #FFD700;
}

.rating-summary .review-count {
  font-size: 0.875rem;
  color: var(--color-dark-gray);
}

.rating-bars {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.rating-bar {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
}

.rating-bar-label {
  font-size: 0.875rem;
  color: var(--color-dark-gray);
  min-width: 60px;
}

.rating-bar-track {
  flex: 1;
  height: 8px;
  background: var(--color-light-gray);
  border-radius: 4px;
  overflow: hidden;
}

.rating-bar-fill {
  height: 100%;
  background: #FFD700;
  border-radius: 4px;
}

.rating-bar-percent {
  font-size: 0.75rem;
  color: var(--color-medium-gray);
  min-width: 40px;
  text-align: right;
}
```

---

### 9. Specs Table Block
**Purpose:** Product specifications with tabbed interface

#### Content Model
```
| Specs Table                 |
|-----------------------------|
| Overview | Specifications | Reviews |
|-----------------------------|
| **Motor**                   | 2.2 HP              |
| **Container**               | 64 oz               |
| **Dimensions**              | 17.5" x 8.5" x 11"  |
| **Weight**                  | 12.5 lbs            |
| **Warranty**                | 10 years            |
```

#### CSS
```css
.specs-table {
  max-width: 800px;
  margin: 0 auto;
  padding: var(--spacing-xl);
}

.specs-tabs {
  display: flex;
  border-bottom: 1px solid var(--color-light-gray);
  margin-bottom: var(--spacing-xl);
}

.specs-tab {
  background: none;
  border: none;
  padding: var(--spacing-md) var(--spacing-xl);
  font-size: 0.9375rem;
  color: var(--color-dark-gray);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
}

.specs-tab.active {
  color: var(--color-brand-dark);
  border-bottom-color: var(--color-brand-red);
}

.specs-content table {
  width: 100%;
  border-collapse: collapse;
}

.specs-content tr {
  border-bottom: 1px solid var(--color-light-gray);
}

.specs-content tr:last-child {
  border-bottom: none;
}

.specs-content td {
  padding: var(--spacing-md) 0;
}

.specs-content td:first-child {
  color: var(--color-dark-gray);
  font-size: 0.9375rem;
  width: 40%;
}

.specs-content td:last-child {
  font-weight: 600;
  color: var(--color-brand-dark);
}
```

---

### 10. Accordion/FAQ Block Enhancement
**Current:** Basic accordion functionality
**Needed:** Vitamix styling alignment

#### CSS Updates
```css
.faq {
  max-width: 800px;
  margin: 0 auto;
  padding: var(--spacing-section-sm) var(--spacing-lg);
}

.faq-item {
  border-bottom: 1px solid var(--color-light-gray);
}

.faq-question {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  background: none;
  border: none;
  padding: var(--spacing-lg) 0;
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-brand-dark);
  text-align: left;
  cursor: pointer;
}

.faq-question:hover {
  color: var(--color-brand-red);
}

.faq-icon {
  font-size: 1.5rem;
  transition: transform 0.3s ease;
}

.faq-item.open .faq-icon {
  transform: rotate(45deg);
}

.faq-answer {
  max-height: 0;
  overflow: hidden;
  transition: max-height 0.3s ease;
}

.faq-item.open .faq-answer {
  max-height: 500px;
}

.faq-answer-inner {
  padding: 0 0 var(--spacing-lg);
  color: var(--color-charcoal);
  line-height: 1.7;
}
```

---

## Carousel/Slider Block
**Purpose:** Horizontal scrolling for recipes, products, or content

#### Content Model
```
| Carousel                    |
|-----------------------------|
| ## Section Title            |
| [[View All Link]]           |
|-----------------------------|
| [slide1.jpg]                |
| **Slide 1 Title**           |
|-----------------------------|
| [slide2.jpg]                |
| **Slide 2 Title**           |
```

#### CSS
```css
.carousel {
  padding: var(--spacing-section-md) 0;
}

.carousel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 var(--spacing-lg);
  margin-bottom: var(--spacing-xl);
  max-width: 1400px;
  margin-left: auto;
  margin-right: auto;
}

.carousel-header h2 {
  font-size: 2rem;
  font-weight: 300;
  color: var(--color-brand-dark);
}

.carousel-header a {
  color: var(--color-brand-red);
  font-weight: 600;
  text-decoration: none;
}

.carousel-track-container {
  position: relative;
}

.carousel-track {
  display: flex;
  gap: var(--spacing-lg);
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  scroll-behavior: smooth;
  padding: 0 var(--spacing-lg);
  -webkit-overflow-scrolling: touch;
}

.carousel-track::-webkit-scrollbar {
  display: none;
}

.carousel-slide {
  flex: 0 0 300px;
  scroll-snap-align: start;
}

.carousel-nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 48px;
  height: 48px;
  background: #fff;
  border: 1px solid var(--color-light-gray);
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.carousel-nav:hover {
  border-color: var(--color-brand-dark);
}

.carousel-nav.prev {
  left: var(--spacing-md);
}

.carousel-nav.next {
  right: var(--spacing-md);
}

@media (max-width: 768px) {
  .carousel-nav {
    display: none;
  }

  .carousel-slide {
    flex: 0 0 85%;
  }
}
```

---

## Block Priority for Implementation

### Phase 1 - Core Blocks (Needed for all layouts)
1. Hero variants (full-width, light, split)
2. Product Cards
3. Category Cards
4. Split Content

### Phase 2 - Enhanced Content
5. Recipe Cards
6. Feature Grid
7. Carousel

### Phase 3 - Detailed Components
8. Rating Snapshot
9. Specs Table
10. Newsletter
11. Tabbed Content
12. FAQ Enhancement

---

## CSS Variables Reference

All blocks should use these CSS custom properties from tokens.json:

```css
:root {
  /* Colors */
  --color-brand-red: #C41230;
  --color-brand-dark: #1A1A1A;
  --color-charcoal: #333333;
  --color-dark-gray: #666666;
  --color-medium-gray: #999999;
  --color-light-gray: #E5E5E5;
  --color-off-white: #F5F5F5;

  /* Spacing */
  --spacing-xs: 0.25rem;
  --spacing-sm: 0.5rem;
  --spacing-md: 1rem;
  --spacing-lg: 1.5rem;
  --spacing-xl: 2rem;
  --spacing-2xl: 3rem;
  --spacing-section-sm: 3rem;
  --spacing-section-md: 5rem;
  --spacing-section-lg: 8rem;

  /* Typography */
  --font-family: 'proxima-nova', 'Helvetica Neue', Helvetica, Arial, sans-serif;
  --font-size-hero: 4.5rem;
  --font-size-5xl: 3rem;
  --font-size-4xl: 2.25rem;
  --font-size-3xl: 1.875rem;
  --font-size-2xl: 1.5rem;
  --font-size-xl: 1.25rem;
  --font-size-lg: 1.125rem;
  --font-size-base: 1rem;
  --font-size-sm: 0.875rem;
  --font-size-xs: 0.75rem;
}
```
