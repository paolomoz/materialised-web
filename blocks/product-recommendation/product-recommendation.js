/**
 * Product Recommendation Block
 *
 * 50/50 split layout featuring a recommended product with image, details, and CTAs.
 * Used in use-case landing pages to recommend a specific product for the use case.
 *
 * Content Model (DA Table):
 * | Product Recommendation (reverse) |                              |
 * |----------------------------------|------------------------------|
 * | [product-image.jpg]              | BEST FOR SMOOTHIES           |
 * |                                  | ## Vitamix A3500             |
 * |                                  | Perfect for daily smoothies. |
 * |                                  | $649.95                      |
 * |                                  | 10-Year Warranty             |
 * |                                  | [[Shop Now]]                 |
 * |                                  | [[Learn More]]               |
 */
export default function decorate(block) {
  const rows = [...block.children];
  if (rows.length === 0) return;

  // Build structure
  const imageDiv = document.createElement('div');
  imageDiv.className = 'product-recommendation-image';

  const contentDiv = document.createElement('div');
  contentDiv.className = 'product-recommendation-content';

  // Process rows
  rows.forEach((row) => {
    const cells = [...row.children];
    cells.forEach((cell) => {
      const picture = cell.querySelector('picture');

      if (picture) {
        // Image cell
        imageDiv.appendChild(picture.cloneNode(true));
      } else {
        // Content cell - parse different elements
        const children = [...cell.children];

        children.forEach((child) => {
          // Check for eyebrow (uppercase short text, no heading)
          if (child.tagName === 'P') {
            const text = child.textContent.trim();

            // Eyebrow: uppercase, short
            if (text === text.toUpperCase() && text.length < 50 && !text.startsWith('$')) {
              const eyebrow = document.createElement('p');
              eyebrow.className = 'product-recommendation-eyebrow';
              eyebrow.textContent = text;
              contentDiv.appendChild(eyebrow);
            } else if (text.startsWith('$')) {
              // Price
              const priceDiv = document.createElement('div');
              priceDiv.className = 'product-recommendation-price';
              priceDiv.innerHTML = `<span class="price">${text}</span>`;
              contentDiv.appendChild(priceDiv);
            } else if (text.includes('Warranty') || text.includes('warranty')) {
              // Price note (warranty info)
              const existingPrice = contentDiv.querySelector('.product-recommendation-price');
              if (existingPrice) {
                const note = document.createElement('span');
                note.className = 'price-note';
                note.textContent = text;
                existingPrice.appendChild(note);
              }
            } else if (!child.querySelector('a')) {
              // Body text
              const body = document.createElement('p');
              body.className = 'product-recommendation-body';
              body.textContent = text;
              contentDiv.appendChild(body);
            }
          } else if (child.tagName === 'H2') {
            // Headline
            const headline = document.createElement('h2');
            headline.className = 'product-recommendation-headline';
            headline.textContent = child.textContent;
            contentDiv.appendChild(headline);
          }

          // CTA buttons
          const links = child.querySelectorAll('a');
          if (links.length > 0) {
            let ctaContainer = contentDiv.querySelector('.product-recommendation-ctas');
            if (!ctaContainer) {
              ctaContainer = document.createElement('div');
              ctaContainer.className = 'product-recommendation-ctas';
              contentDiv.appendChild(ctaContainer);
            }

            links.forEach((link, idx) => {
              const btn = link.cloneNode(true);
              btn.className = idx === 0 ? 'button primary' : 'button secondary';
              ctaContainer.appendChild(btn);
            });
          }
        });
      }
    });
  });

  // Clear and rebuild
  block.textContent = '';
  block.appendChild(imageDiv);
  block.appendChild(contentDiv);
}
