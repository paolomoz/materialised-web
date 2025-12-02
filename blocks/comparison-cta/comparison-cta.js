/**
 * Comparison CTA Block
 *
 * Multi-product CTA section with side-by-side purchase options.
 *
 * Content Model (DA Table):
 * | Comparison CTA |
 * |----------------|
 * | A3500 | $649 | [Shop Now](/products/a3500) | A2500 | $549 | [Shop Now](/products/a2500) |
 * | All models include free shipping |
 */
export default function decorate(block) {
  const rows = [...block.children];
  const container = document.createElement('div');
  container.className = 'comparison-cta-inner';

  // First row contains products
  const productsRow = rows[0];
  if (productsRow) {
    const productsGrid = document.createElement('div');
    productsGrid.className = 'comparison-cta-products';

    const cells = [...productsRow.children];
    cells.forEach((cell) => {
      const productCard = document.createElement('div');
      productCard.className = 'comparison-cta-product';

      // Extract elements
      const heading = cell.querySelector('h3');
      const paragraphs = cell.querySelectorAll('p');
      const link = cell.querySelector('a');

      // Product name
      if (heading) {
        const name = document.createElement('div');
        name.className = 'comparison-cta-name';
        name.textContent = heading.textContent;
        productCard.appendChild(name);
      }

      // Price (find paragraph without link that looks like price)
      paragraphs.forEach((p) => {
        const text = p.textContent.trim();
        if (text.startsWith('$') && !p.querySelector('a')) {
          const price = document.createElement('div');
          price.className = 'comparison-cta-price';
          price.textContent = text;
          productCard.appendChild(price);
        }
      });

      // CTA button
      if (link) {
        const cta = document.createElement('a');
        cta.className = 'comparison-cta-button';
        cta.href = link.href;
        cta.textContent = link.textContent;
        productCard.appendChild(cta);
      }

      if (productCard.children.length > 0) {
        productsGrid.appendChild(productCard);
      }
    });

    container.appendChild(productsGrid);
  }

  // Second row is the footer message
  if (rows[1]) {
    const footer = document.createElement('div');
    footer.className = 'comparison-cta-footer';
    const content = rows[1].querySelector('p');
    if (content) {
      footer.textContent = content.textContent;
    }
    container.appendChild(footer);
  }

  block.textContent = '';
  block.appendChild(container);
}
