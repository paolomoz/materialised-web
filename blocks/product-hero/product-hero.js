/**
 * Product Hero Block
 *
 * Split hero with product details on left, product image on right.
 * Expects a two-column structure: image | content
 *
 * Content Model:
 * | Product Hero |
 * | [image] | <h1>Title</h1><p>Desc</p><p><strong>Price</strong></p><p>Specs</p><p><a>CTA</a></p> |
 */
export default function decorate(block) {
  const row = block.children[0];
  if (!row) return;

  const cols = [...row.children];
  const col1 = cols[0];
  const col2 = cols[1];

  // Determine which column has the image
  let imageCol = col1;
  let contentCol = col2;

  // Check if image is in col2 instead
  if (col2?.querySelector('picture, img') && !col1?.querySelector('picture, img')) {
    imageCol = col2;
    contentCol = col1;
  }

  // Extract image
  const picture = imageCol?.querySelector('picture');
  const img = imageCol?.querySelector('img');

  // Extract content elements
  const h1 = contentCol?.querySelector('h1');
  const paragraphs = contentCol?.querySelectorAll('p') || [];

  // Parse paragraphs into: description, price, specs, ctas
  let description = '';
  let price = '';
  let specs = '';
  const ctas = [];

  paragraphs.forEach((p) => {
    const link = p.querySelector('a');
    const strong = p.querySelector('strong');

    if (link) {
      ctas.push({
        text: link.textContent.trim(),
        href: link.href,
        ctaType: link.getAttribute('data-cta-type'),
        generationHint: link.getAttribute('data-generation-hint'),
      });
    } else if (strong) {
      price = strong.textContent.trim();
    } else {
      const text = p.textContent.trim();
      if (text.includes('|')) {
        specs = text;
      } else if (!description) {
        description = text;
      }
    }
  });

  // Build new structure
  block.innerHTML = '';

  // Left side - details
  const detailsDiv = document.createElement('div');
  detailsDiv.className = 'product-hero-details';

  if (h1) {
    const titleEl = document.createElement('h1');
    titleEl.className = 'product-hero-title';
    titleEl.textContent = h1.textContent.trim();
    detailsDiv.appendChild(titleEl);
  }

  if (description) {
    const descEl = document.createElement('p');
    descEl.className = 'product-hero-description';
    descEl.textContent = description;
    detailsDiv.appendChild(descEl);
  }

  if (price) {
    const priceEl = document.createElement('p');
    priceEl.className = 'product-hero-price';
    priceEl.textContent = price;
    detailsDiv.appendChild(priceEl);
  }

  if (specs) {
    const specsEl = document.createElement('p');
    specsEl.className = 'product-hero-specs';
    specsEl.textContent = specs;
    detailsDiv.appendChild(specsEl);
  }

  // Add CTA buttons
  ctas.forEach((cta, index) => {
    const btn = document.createElement('a');
    btn.href = cta.href;
    btn.textContent = cta.text;
    btn.className = index === 0 ? 'product-hero-cta primary' : 'product-hero-cta secondary';
    // Preserve explore CTA attributes for contextual navigation
    if (cta.ctaType) {
      btn.setAttribute('data-cta-type', cta.ctaType);
    }
    if (cta.generationHint) {
      btn.setAttribute('data-generation-hint', cta.generationHint);
    }
    detailsDiv.appendChild(btn);
  });

  // Right side - image
  const imageDiv = document.createElement('div');
  imageDiv.className = 'product-hero-image';
  if (picture) {
    imageDiv.appendChild(picture.cloneNode(true));
  } else if (img) {
    imageDiv.appendChild(img.cloneNode(true));
  }

  block.appendChild(detailsDiv);
  block.appendChild(imageDiv);
}
